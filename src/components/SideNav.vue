<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import {
  ExternalLink,
  FlaskConical,
  FolderOpen,
  ListTodo,
  Moon,
  NotebookPen,
  Settings,
  Sun,
} from 'lucide-vue-next'
import { setView, ui } from '../stores/ui'
import { useTheme } from '../composables/useTheme'
import AppLogo from './AppLogo.vue'

const { theme, toggleTheme } = useTheme()

const version = '0.1.0'
const GITHUB_URL = 'https://github.com/zhuafagithub/Jotter'
const showSettings = ref(false)
const dataPath = ref('')

const navItems = [
  { key: 'todo' as const, icon: ListTodo, tip: '待办' },
  { key: 'note' as const, icon: NotebookPen, tip: '笔记' },
  { key: 'test' as const, icon: FlaskConical, tip: '测试功能' },
]

async function toggleSettings(): Promise<void> {
  showSettings.value = !showSettings.value
  if (showSettings.value && !dataPath.value) {
    try {
      dataPath.value = await invoke<string>('data_path')
    } catch {
      dataPath.value = ''
    }
  }
}

/** 点击面板外部任意区域时关闭设置弹层 */
function onDocMousedown(e: MouseEvent): void {
  if (!showSettings.value) return
  const target = e.target as HTMLElement
  if (!target.closest('.settings-wrap')) showSettings.value = false
}

onMounted(() => window.addEventListener('mousedown', onDocMousedown, true))
onBeforeUnmount(() => window.removeEventListener('mousedown', onDocMousedown, true))

function openGithub(): void {
  void openUrl(GITHUB_URL)
}

/** 在资源管理器中定位数据文件（失败则退化为打开其所在目录） */
async function openDataFolder(): Promise<void> {
  const p = dataPath.value
  if (!p) return
  try {
    await revealItemInDir(p)
  } catch {
    const sep = p.includes('\\') ? '\\' : '/'
    const dir = p.slice(0, Math.max(p.lastIndexOf(sep), 0))
    if (dir) {
      try {
        await openPath(dir)
      } catch {
        /* 忽略：用户环境不支持时静默 */
      }
    }
  }
}
</script>

<template>
  <aside class="side-nav">
    <div class="brand" data-tip="小记/Jotter">
      <div class="logo">
        <AppLogo variant="white" :size="20" />
      </div>
      <span class="brand-name">小记/Jotter</span>
    </div>

    <nav class="nav-group">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="nav-btn"
        :class="{ active: ui.view === item.key }"
        :data-tip="item.tip"
        @click="setView(item.key)"
      >
        <component :is="item.icon" :size="20" />
        <span v-if="ui.view === item.key" class="indicator" />
      </button>
    </nav>

    <div class="nav-bottom">
      <div class="settings-wrap">
        <button
          class="nav-btn"
          :class="{ active: showSettings }"
          data-tip="设置"
          data-tip-dir="left"
          @click="toggleSettings"
        >
          <Settings :size="20" />
        </button>
        <Transition name="pop">
          <div v-if="showSettings" class="settings-panel">
            <div class="settings-name">小记 Jotter</div>
            <div class="settings-ver">版本 v{{ version }}</div>

            <div class="settings-divider" />

            <div class="settings-line">作者：万发</div>
            <div class="settings-line">
              <span>GitHub：</span>
              <button class="gh-link" @click="openGithub">
                {{ GITHUB_URL }}
                <ExternalLink :size="11" />
              </button>
            </div>

            <div class="settings-divider" />

            <div class="settings-row">数据仅存储在本机，无需登录、无需联网</div>
            <div class="settings-path-wrap">
              <span class="settings-path" :title="dataPath">{{ dataPath || '读取数据位置…' }}</span>
              <button
                v-if="dataPath"
                class="path-open"
                data-tip="打开所在文件夹"
                data-tip-dir="top"
                @click="openDataFolder"
              >
                <FolderOpen :size="13" />
              </button>
            </div>
          </div>
        </Transition>
      </div>

      <button
        class="nav-btn"
        :data-tip="theme === 'dark' ? '切换为浅色' : '切换为深色'"
        data-tip-dir="left"
        @click="toggleTheme"
      >
        <Sun v-if="theme === 'dark'" :size="20" />
        <Moon v-else :size="20" />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.side-nav {
  width: 64px;
  flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0 14px;
}

.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand-name {
  font-size: 9px;
  line-height: 1;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  letter-spacing: -0.2px;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-btn {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition:
    background 0.16s ease,
    color 0.16s ease;
}
.nav-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.nav-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.indicator {
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 2px;
  background: var(--accent);
}

.nav-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-wrap {
  position: relative;
}

.settings-panel {
  position: absolute;
  left: 48px;
  bottom: 0;
  width: 280px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
  padding: 12px 14px;
  z-index: 60;
}

.settings-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.2px;
  line-height: 1.3;
}
.settings-ver {
  font-size: 11.5px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.settings-divider {
  height: 1px;
  background: var(--border-light);
  margin: 8px 0;
}

.settings-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  font-size: 12.5px;
  color: var(--text);
  padding: 3px 0;
}

.gh-link {
  display: inline;
  font-size: 12px;
  color: var(--accent);
  word-break: break-all;
  text-align: left;
  line-height: 1.5;
  transition: color 0.15s ease;
}
.gh-link:hover {
  color: var(--accent-hover);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.settings-row {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.settings-path-wrap {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.settings-path {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-placeholder);
  word-break: break-all;
  line-height: 1.5;
  max-height: 60px;
  overflow: hidden;
}

.path-open {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  border: 1px solid var(--border);
  background: var(--bg-card);
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}
.path-open:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}
</style>
