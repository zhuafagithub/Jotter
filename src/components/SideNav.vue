<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import {
  ExternalLink,
  FlaskConical,
  FolderOpen,
  ListTodo,
  Moon,
  NotebookPen,
  Pin,
  RefreshCw,
  Settings,
  Sun,
} from 'lucide-vue-next'
import { setView, ui } from '../stores/ui'
import { flushSave } from '../stores/data'
import { useTheme } from '../composables/useTheme'
import AppLogo from './AppLogo.vue'

const { theme, toggleTheme } = useTheme()

const version = ref('')
const GITHUB_URL = 'https://github.com/zhuafagithub/Jotter'
const showSettings = ref(false)
const dataPath = ref('')

const navItems = [
  { key: 'todo' as const, icon: ListTodo, tip: '待办' },
  { key: 'note' as const, icon: NotebookPen, tip: '笔记' },
  { key: 'test' as const, icon: FlaskConical, tip: '测试功能' },
]

// ---------- 窗口置顶 ----------
const pinned = ref(localStorage.getItem('ui.alwaysOnTop') === '1')

async function togglePin(): Promise<void> {
  pinned.value = !pinned.value
  localStorage.setItem('ui.alwaysOnTop', pinned.value ? '1' : '0')
  try {
    await getCurrentWindow().setAlwaysOnTop(pinned.value)
  } catch {
    /* 忽略：无权限时静默 */
  }
}

// ---------- 联网检查更新 ----------
interface ReleaseInfo {
  version: string
  notes: string
  url: string
  size: number
  page_url: string
}
interface UpdateProgress {
  downloaded: number
  total: number
}

type UpdateState = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'downloaded' | 'error'

const updateState = ref<UpdateState>('idle')
const updateMsg = ref('')
const newVersion = ref('')
const updateNotes = ref('')
const downloadUrl = ref('')
const downloadPath = ref('')
const progress = ref(0)
let unlistenProgress: (() => void) | null = null

/** 语义化版本比较：返回 1 表示 a > b，-1 表示 a < b */
function compareVersion(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split(/[.+-]/).map((v) => Number(v) || 0)
  const pb = b.replace(/^v/i, '').split(/[.+-]/).map((v) => Number(v) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

async function checkUpdate(): Promise<void> {
  if (updateState.value === 'checking' || updateState.value === 'downloading') return
  updateState.value = 'checking'
  updateMsg.value = ''
  try {
    const info = await invoke<ReleaseInfo>('check_update')
    if (compareVersion(info.version, version.value) > 0) {
      newVersion.value = info.version
      updateNotes.value = info.notes.trim()
      downloadUrl.value = info.url
      updateState.value = 'available'
    } else {
      updateState.value = 'latest'
      updateMsg.value = '已是最新版本'
    }
  } catch (err) {
    updateState.value = 'error'
    updateMsg.value = String(err)
  }
}

async function startDownload(): Promise<void> {
  if (updateState.value === 'downloading' || !downloadUrl.value) return
  updateState.value = 'downloading'
  progress.value = 0
  unlistenProgress?.()
  unlistenProgress = await listen<UpdateProgress>('update-progress', (event) => {
    const { downloaded, total } = event.payload
    progress.value = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0
  })
  try {
    downloadPath.value = await invoke<string>('download_update', {
      url: downloadUrl.value,
      version: newVersion.value,
    })
    progress.value = 100
    updateState.value = 'downloaded'
  } catch (err) {
    updateState.value = 'error'
    updateMsg.value = `下载失败：${String(err)}`
  } finally {
    unlistenProgress?.()
    unlistenProgress = null
  }
}

/** 启动安装程序后退出当前应用，由安装包完成覆盖升级 */
async function installUpdate(): Promise<void> {
  if (!downloadPath.value) return
  updateMsg.value = '正在启动安装程序…'
  try {
    await flushSave()
    await invoke('install_update', { path: downloadPath.value })
  } catch (err) {
    updateState.value = 'error'
    updateMsg.value = `安装失败：${String(err)}`
  }
}

async function toggleSettings(): Promise<void> {
  showSettings.value = !showSettings.value
  if (showSettings.value && !dataPath.value) {
    try {
      dataPath.value = await invoke<string>('data_path')
    } catch {
      dataPath.value = ''
    }
  }
  if (showSettings.value && updateState.value === 'idle') void checkUpdate()
}

/** 点击面板外部任意区域时关闭设置弹层 */
function onDocMousedown(e: MouseEvent): void {
  if (!showSettings.value) return
  const target = e.target as HTMLElement
  if (!target.closest('.settings-wrap')) showSettings.value = false
}

onMounted(async () => {
  window.addEventListener('mousedown', onDocMousedown, true)
  try {
    version.value = await getVersion()
  } catch {
    version.value = ''
  }
  // 恢复上次的置顶状态
  if (pinned.value) {
    try {
      await getCurrentWindow().setAlwaysOnTop(true)
    } catch {
      /* 忽略：无权限时静默 */
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onDocMousedown, true)
  unlistenProgress?.()
})

/** 侧边栏空白区域按住左键拖动窗口（按钮、logo、设置面板等交互元素除外） */
async function onNavMousedown(e: MouseEvent): Promise<void> {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('button, .brand, .nav-group, .nav-bottom, .settings-panel')) return
  try {
    await getCurrentWindow().startDragging()
  } catch {
    /* 忽略：无权限时静默 */
  }
}

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
  <aside class="side-nav" @mousedown="onNavMousedown">
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
      <button
        class="nav-btn"
        :class="{ active: pinned }"
        :data-tip="pinned ? '取消窗口置顶' : '窗口置顶'"
        data-tip-dir="left"
        @click="togglePin"
      >
        <Pin :size="20" />
        <span v-if="pinned" class="indicator" />
      </button>

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
            <div class="settings-ver-row">
              <span class="settings-ver">版本 v{{ version || '…' }}</span>
              <button
                class="check-btn"
                :disabled="updateState === 'checking' || updateState === 'downloading'"
                @click="checkUpdate"
              >
                <RefreshCw :size="11" :class="{ spin: updateState === 'checking' }" />
                {{ updateState === 'checking' ? '检查中…' : '检查更新' }}
              </button>
            </div>

            <div v-if="updateState === 'latest'" class="upd-msg ok">已是最新版本</div>
            <div v-else-if="updateState === 'error'" class="upd-msg err">{{ updateMsg }}</div>

            <div v-else-if="updateState === 'available'" class="upd-box">
              <div class="upd-title">发现新版本 v{{ newVersion }}</div>
              <div v-if="updateNotes" class="upd-notes">{{ updateNotes }}</div>
              <div class="upd-actions">
                <button class="upd-btn primary" @click="startDownload">立即更新</button>
                <button class="upd-btn" @click="openGithub">查看详情</button>
              </div>
            </div>

            <div v-else-if="updateState === 'downloading'" class="upd-box">
              <div class="upd-title">正在下载 v{{ newVersion }}… {{ progress }}%</div>
              <div class="upd-bar"><div class="upd-bar-in" :style="{ width: `${progress}%` }" /></div>
            </div>

            <div v-else-if="updateState === 'downloaded'" class="upd-box">
              <div class="upd-title">v{{ newVersion }} 下载完成</div>
              <div class="upd-actions">
                <button class="upd-btn primary" @click="installUpdate">安装并重启</button>
              </div>
            </div>

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
.settings-ver-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}
.settings-ver {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.check-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 11px;
  color: var(--text-secondary);
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background 0.15s ease;
}
.check-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.check-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.upd-msg {
  font-size: 11.5px;
  padding: 4px 0 0;
  word-break: break-word;
}
.upd-msg.ok {
  color: var(--accent);
}
.upd-msg.err {
  color: #d9534f;
}

.upd-box {
  margin-top: 8px;
  padding: 8px 9px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-list);
}

.upd-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.upd-notes {
  margin-top: 5px;
  max-height: 84px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.upd-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.upd-btn {
  flex: 1;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 11.5px;
  color: var(--text-secondary);
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background 0.15s ease;
}
.upd-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.upd-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.upd-btn.primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: #fff;
}

.upd-bar {
  margin-top: 7px;
  height: 4px;
  border-radius: 2px;
  background: var(--border-light);
  overflow: hidden;
}
.upd-bar-in {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 0.2s ease;
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
