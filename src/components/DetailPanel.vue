<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Check,
  Circle,
  CircleDot,
  ClipboardCopy,
  Copy,
  FolderInput,
  MoreHorizontal,
  Trash2,
} from 'lucide-vue-next'
import { removeNote, removeTodo, saveStatus, store } from '../stores/data'
import { clearSelection } from '../stores/ui'
import { showToast } from '../stores/toast'
import type { NoteItem, TodoItem, TodoStatus } from '../types'
import RichEditor from './RichEditor.vue'
import DuePicker from './DuePicker.vue'

const props = defineProps<{
  item: TodoItem | NoteItem
  type: 'todo' | 'note'
}>()

const editorRef = ref<InstanceType<typeof RichEditor> | null>(null)

const todoItem = computed(() => (props.type === 'todo' ? (props.item as TodoItem) : null))

const folders = computed(() => store.folders.filter((f) => f.kind === props.type))

const saveStatusText = computed(() => {
  if (saveStatus.value === 'saving') return '保存中…'
  if (saveStatus.value === 'saved') return '已保存'
  return ''
})

const titleProxy = computed({
  get: () => props.item.title,
  set: (value: string) => {
    props.item.title = value
    props.item.updatedAt = Date.now()
  },
})

const contentProxy = computed({
  get: () => props.item.content,
  set: (value: string) => {
    props.item.content = value
    props.item.updatedAt = Date.now()
  },
})

/** 三态循环：未开始 -> 进行中 -> 已完成 -> 未开始 */
function cycleStatus(): void {
  if (!todoItem.value) return
  const s = todoItem.value.status
  todoItem.value.status = s === 'pending' ? 'active' : s === 'active' ? 'done' : 'pending'
  todoItem.value.updatedAt = Date.now()
}

/** 状态选项（详情头部直接点选） */
const statusOptions: { value: TodoStatus; label: string }[] = [
  { value: 'pending', label: '未开始' },
  { value: 'active', label: '进行中' },
  { value: 'done', label: '已完成' },
]

function setStatus(s: TodoStatus): void {
  if (!todoItem.value || todoItem.value.status === s) return
  todoItem.value.status = s
  todoItem.value.updatedAt = Date.now()
}

const statusText = computed(() => {
  const s = todoItem.value?.status
  return s === 'pending' ? '未开始' : s === 'active' ? '进行中' : '已完成'
})

function onDueChange(ts: number | null): void {
  if (!todoItem.value) return
  todoItem.value.dueAt = ts
  todoItem.value.updatedAt = Date.now()
}

async function copyPlain(): Promise<void> {
  editorRef.value?.copyPlain()
  showToast('已复制纯文本（保留换行）')
  moreOpen.value = false
}

async function copyRich(): Promise<void> {
  try {
    await editorRef.value?.copyRich()
    showToast('已完整复制（含格式与图片）')
  } catch {
    showToast('复制失败，请重试')
  }
  moreOpen.value = false
}

function moveTo(folderId: string | null): void {
  props.item.folderId = folderId
  props.item.updatedAt = Date.now()
  moreOpen.value = false
  showToast(folderId == null ? '已移至未分类' : '已移动到文件夹')
}

function onDelete(): void {
  if (props.type === 'todo') {
    const idx = removeTodo(props.item.id)
    showToast('已删除待办', () => {
      store.todos.splice(Math.min(idx, store.todos.length), 0, props.item as TodoItem)
    })
  } else {
    const idx = removeNote(props.item.id)
    showToast('已删除笔记', () => {
      store.notes.splice(Math.min(idx, store.notes.length), 0, props.item as NoteItem)
    })
  }
  clearSelection()
}

const moreOpen = ref(false)
</script>

<template>
  <section class="detail-panel">
    <header class="detail-header">
      <div class="detail-meta">
        <template v-if="todoItem">
          <DuePicker
            :model-value="todoItem.dueAt"
            :done="todoItem.status === 'done'"
            @update:model-value="onDueChange"
          />
          <div class="status-seg">
            <button
              v-for="opt in statusOptions"
              :key="opt.value"
              class="seg-btn"
              :class="[opt.value, { on: todoItem.status === opt.value }]"
              :data-tip="opt.label"
              data-tip-dir="bottom"
              @click="setStatus(opt.value)"
            >
              <Check v-if="opt.value === 'done'" :size="12" :stroke-width="3" />
              <CircleDot v-else-if="opt.value === 'active'" :size="12" />
              <Circle v-else :size="12" />
            </button>
          </div>
        </template>
        <span v-else class="kind-tag">笔记</span>
      </div>

      <div class="detail-actions">
        <Transition name="pop">
          <span v-if="saveStatusText" class="save-status">{{ saveStatusText }}</span>
        </Transition>
        <button class="icon-btn" data-tip="复制纯文本（保留换行）" data-tip-dir="bottom" @click="copyPlain">
          <Copy :size="16" />
        </button>
        <button class="icon-btn" data-tip="完整复制（含格式、图片）" data-tip-dir="bottom" @click="copyRich">
          <ClipboardCopy :size="16" />
        </button>
        <button class="icon-btn danger" data-tip="删除" data-tip-dir="bottom" @click="onDelete">
          <Trash2 :size="16" />
        </button>
        <button
          class="icon-btn"
          :class="{ active: moreOpen }"
          data-tip="更多"
          data-tip-dir="bottom"
          @click="moreOpen = !moreOpen"
        >
          <MoreHorizontal :size="16" />
        </button>
        <Transition name="pop">
          <div v-if="moreOpen" class="more-menu" @mouseleave="moreOpen = false">
            <button v-if="todoItem" class="menu-item" @click="cycleStatus(); moreOpen = false">
              <Check :size="14" />
              切换状态（当前：{{ statusText }}）
            </button>
            <button class="menu-item" @click="copyPlain">
              <Copy :size="14" />
              复制纯文本
            </button>
            <button class="menu-item" @click="copyRich">
              <ClipboardCopy :size="14" />
              完整复制（格式/图片）
            </button>
            <div class="menu-separator" />
            <div class="menu-title">
              <FolderInput :size="13" />
              移动到
            </div>
            <button class="menu-item sub" :class="{ on: item.folderId === null }" @click="moveTo(null)">
              未分类
            </button>
            <button
              v-for="folder in folders"
              :key="folder.id"
              class="menu-item sub"
              :class="{ on: item.folderId === folder.id }"
              @click="moveTo(folder.id)"
            >
              {{ folder.name }}
            </button>
          </div>
        </Transition>
      </div>
    </header>

    <input v-model="titleProxy" class="detail-title" type="text" placeholder="标题" />

    <div class="detail-scroll">
      <div class="detail-content">
        <RichEditor
          ref="editorRef"
          v-model="contentProxy"
          :placeholder="type === 'todo' ? '补充描述，可直接粘贴图片…' : '开始记录，支持粘贴图片…'"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.detail-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px 0;
  flex-shrink: 0;
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* 三态分段控件（时间按钮右侧，颜色明显区分） */
.status-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-list);
  border: 1px solid var(--border);
  border-radius: 8px;
  flex-shrink: 0;
}
.seg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 22px;
  border-radius: 6px;
  color: var(--text-placeholder);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.seg-btn:hover {
  color: var(--text);
}
.seg-btn.on.pending {
  background: var(--bg-card);
  color: var(--text-secondary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.seg-btn.on.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.seg-btn.on.done {
  background: rgba(82, 196, 26, 0.15);
  color: var(--green);
}

.kind-tag {
  font-size: 12px;
  color: var(--text-secondary);
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  position: relative;
  flex-shrink: 0;
}

.save-status {
  font-size: 12px;
  color: var(--text-secondary);
  margin-right: 8px;
  white-space: nowrap;
}

.icon-btn.active {
  background: var(--hover);
  color: var(--text);
}

.more-menu {
  position: absolute;
  top: 34px;
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
  padding: 4px;
  min-width: 210px;
  max-height: 320px;
  overflow-y: auto;
  z-index: 50;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
  transition: background 0.15s ease;
}
.menu-item:hover {
  background: var(--hover);
}
.menu-item.sub {
  padding-left: 30px;
}
.menu-item.on {
  color: var(--accent);
}

.menu-separator {
  height: 1px;
  background: var(--border-light);
  margin: 4px 6px;
}

.menu-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  padding: 6px 10px 2px;
}

.detail-title {
  border: none;
  outline: none;
  background: transparent;
  font-size: 22px;
  font-weight: 600;
  color: var(--text);
  padding: 14px 24px 6px;
  width: 100%;
}
.detail-title::placeholder {
  color: var(--text-placeholder);
}

.detail-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.detail-content {
  max-width: min(1080px, 100%);
  margin: 0 auto;
  padding: 8px 32px 48px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.detail-content > :deep(.rich-editor) {
  flex: 1;
  min-height: 0;
}
</style>
