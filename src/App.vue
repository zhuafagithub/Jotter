<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Undo2, X } from 'lucide-vue-next'
import {
  createNote,
  createTodo,
  flushSave,
  getNote,
  getTodo,
  initStore,
} from './stores/data'
import { clearSelection, selectFirstOfView, ui } from './stores/ui'
import { toast, undoToast } from './stores/toast'
import { useTheme } from './composables/useTheme'
import SideNav from './components/SideNav.vue'
import TodoList from './components/TodoList.vue'
import NoteList from './components/NoteList.vue'
import TestView from './components/TestView.vue'
import DetailPanel from './components/DetailPanel.vue'

useTheme()

const activeItem = computed(() => {
  if (!ui.selectedType || !ui.selectedId) return null
  return ui.selectedType === 'todo'
    ? (getTodo(ui.selectedId) ?? null)
    : (getNote(ui.selectedId) ?? null)
})

function onKeydown(event: KeyboardEvent): void {
  const mod = event.ctrlKey || event.metaKey
  if (mod && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    if (ui.view === 'todo') createTodo(ui.folderTodo)
    else if (ui.view === 'note') createNote(ui.folderNote)
  } else if (event.key === 'Escape') {
    if (ui.selectedType) clearSelection()
  }
}

let unlistenClose: (() => void) | null = null

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await initStore()
  // 启动恢复后：待办/笔记页签默认选中第一条（需求 1）
  if (!ui.selectedType && (ui.view === 'todo' || ui.view === 'note')) {
    selectFirstOfView(ui.view)
  }
  try {
    unlistenClose = await getCurrentWindow().onCloseRequested(async (event) => {
      // 点击关闭：保存数据后隐藏到系统托盘（真正退出需在托盘右键菜单选择「退出」）
      event.preventDefault()
      await flushSave()
      await getCurrentWindow().hide()
    })
  } catch (err) {
    console.error('注册关闭钩子失败:', err)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  unlistenClose?.()
})
</script>

<template>
  <div class="app-shell">
    <SideNav />

    <main class="main-col">
      <TodoList v-if="ui.view === 'todo'" />
      <NoteList v-else-if="ui.view === 'note'" />
      <TestView v-else />
    </main>

    <Transition name="detail" mode="out-in">
      <DetailPanel
        v-if="activeItem"
        :key="`${ui.selectedType}-${ui.selectedId}`"
        :item="activeItem"
        :type="ui.selectedType!"
      />
    </Transition>

    <Transition name="toast">
      <div v-if="toast.visible" class="toast">
        <span>{{ toast.message }}</span>
        <button v-if="toast.undo" class="toast-undo" @click="undoToast">
          <Undo2 :size="13" />
          撤销
        </button>
        <button class="toast-close" @click="toast.visible = false">
          <X :size="13" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100%;
  display: flex;
  overflow: hidden;
}

.main-col {
  width: 300px;
  flex-shrink: 0;
  background: var(--bg-list);
  border-right: 1px solid var(--border-light);
  min-width: 260px;
  max-width: 340px;
}

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--text);
  color: var(--bg);
  font-size: 13px;
  padding: 9px 14px;
  border-radius: 8px;
  box-shadow: var(--shadow-pop);
  z-index: 100;
}

.toast-undo,
.toast-close {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--bg);
  opacity: 0.75;
  font-size: 12px;
  transition: opacity 0.15s ease;
}
.toast-undo:hover,
.toast-close:hover {
  opacity: 1;
}
</style>
