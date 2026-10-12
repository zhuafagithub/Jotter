<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { GripVertical, Plus, StickyNote, Trash2 } from 'lucide-vue-next'
import { createNote, removeNote, store } from '../stores/data'
import {
  clearSelection,
  registerFirstProvider,
  select,
  setNoteSort,
  ui,
} from '../stores/ui'
import { showToast } from '../stores/toast'
import type { NoteItem, NoteSort } from '../types'
import { formatTime, splitByKeyword, stripHtml } from '../utils/format'
import EmptyState from './EmptyState.vue'
import FolderBar from './FolderBar.vue'
import SearchBox from './SearchBox.vue'
import SortMenu from './SortMenu.vue'

const sortOptions: { value: NoteSort; label: string }[] = [
  { value: 'updated', label: '按修改时间' },
  { value: 'created', label: '按创建时间' },
  { value: 'custom', label: '自定义' },
]

const keyword = computed(() => ui.searchNote.trim())

const scoped = computed(() =>
  store.notes.filter((n) => keyword.value || ui.folderNote === null || n.folderId === ui.folderNote),
)

/** 自定义顺序：order 小者在前，未编号的排后面 */
const orderCmp = (a: NoteItem, b: NoteItem): number =>
  (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
  b.createdAt - a.createdAt

const notes = computed<NoteItem[]>(() => {
  let list = scoped.value
  const kw = keyword.value.toLowerCase()
  if (kw) {
    list = list.filter(
      (n) =>
        n.title.toLowerCase().includes(kw) || stripHtml(n.content).toLowerCase().includes(kw),
    )
  }
  switch (ui.noteSort) {
    case 'created':
      return [...list].sort((a, b) => b.createdAt - a.createdAt)
    case 'custom':
      return [...list].sort(orderCmp)
    default:
      return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  }
})

// ---------- 拖拽排序（仅自定义模式） ----------
const dragId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)
const dropBefore = ref(false)

const canDrag = computed(() => ui.noteSort === 'custom' && !keyword.value)

function onDragStart(e: DragEvent, note: NoteItem): void {
  if (!canDrag.value) {
    e.preventDefault()
    return
  }
  dragId.value = note.id
  e.dataTransfer?.setData('text/plain', note.id)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // 拖拽视觉跟随整条卡片而非小手柄
    const itemEl = (e.currentTarget as HTMLElement).closest('.item')
    if (itemEl) e.dataTransfer.setDragImage(itemEl, 24, 24)
  }
}

function onDragOver(e: DragEvent, note: NoteItem): void {
  if (!canDrag.value || !dragId.value || dragId.value === note.id) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dropBefore.value = e.clientY < rect.top + rect.height / 2
  dragOverId.value = note.id
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDragLeave(note: NoteItem): void {
  if (dragOverId.value === note.id) dragOverId.value = null
}

function onDrop(e: DragEvent, note: NoteItem): void {
  e.preventDefault()
  const drag = dragId.value
  dragId.value = null
  dragOverId.value = null
  if (!canDrag.value || !drag || drag === note.id) return
  const ids = notes.value.map((n) => n.id)
  const fromIdx = ids.indexOf(drag)
  if (fromIdx === -1) return
  ids.splice(fromIdx, 1)
  let toIdx = ids.indexOf(note.id)
  if (!dropBefore.value) toIdx += 1
  ids.splice(toIdx, 0, drag)
  ids.forEach((id, i) => {
    const n = store.notes.find((x) => x.id === id)
    if (n) n.order = i
  })
}

function onDragEnd(): void {
  dragId.value = null
  dragOverId.value = null
}

function onDelete(note: NoteItem): void {
  const idx = removeNote(note.id)
  if (ui.selectedType === 'note' && ui.selectedId === note.id) clearSelection()
  showToast('已删除笔记', () => {
    store.notes.splice(Math.min(idx, store.notes.length), 0, note)
  })
}

onMounted(() => {
  registerFirstProvider('note', () => notes.value[0]?.id ?? null)
})
</script>

<template>
  <div class="note-list">
    <header class="list-header">
      <div class="header-text">
        <h1>笔记</h1>
        <span class="count">共 {{ store.notes.length }} 篇</span>
      </div>
      <div class="header-actions">
        <SortMenu :model-value="ui.noteSort" :options="sortOptions" @update:model-value="setNoteSort" />
        <button class="icon-btn accent" data-tip="新建笔记 (Ctrl+N)" data-tip-dir="bottom" @click="createNote(ui.folderNote)">
          <Plus :size="18" />
        </button>
      </div>
    </header>

    <SearchBox v-model="ui.searchNote" placeholder="搜索笔记标题与内容…" />
    <FolderBar kind="note" />

    <div class="list-scroll" @dragover.prevent @drop.prevent>
      <TransitionGroup name="list">
        <div
          v-for="note in notes"
          :key="note.id"
          class="item"
          :class="{
              selected: ui.selectedType === 'note' && ui.selectedId === note.id,
              dragging: dragId === note.id,
              'drop-before': dragOverId === note.id && dropBefore,
              'drop-after': dragOverId === note.id && !dropBefore,
            }"
            @click="select('note', note.id)"
            @dragover="onDragOver($event, note)"
            @dragleave="onDragLeave(note)"
            @drop="onDrop($event, note)"
          >
            <button
              v-if="canDrag"
              class="drag-handle"
              data-tip="按住拖动排序"
              data-tip-dir="top"
              :draggable="true"
              @dragstart="onDragStart($event, note)"
              @dragend="onDragEnd"
            >
              <GripVertical :size="14" />
            </button>
            <div class="item-body">
            <div class="item-top">
              <div class="item-title">
                <template v-for="(part, i) in splitByKeyword(note.title || '无标题', keyword)" :key="i">
                  <mark v-if="part.hit" class="kw">{{ part.text }}</mark>
                  <span v-else :class="{ 'empty-title': !note.title }">{{ part.text }}</span>
                </template>
              </div>
              <div class="item-time">
                {{ formatTime(ui.noteSort === 'created' ? note.createdAt : note.updatedAt) }}
              </div>
            </div>
            <div class="item-preview">
              <template v-for="(part, i) in splitByKeyword(stripHtml(note.content) || '空白笔记', keyword)" :key="i">
                <mark v-if="part.hit" class="kw">{{ part.text }}</mark>
                <span v-else>{{ part.text }}</span>
              </template>
            </div>
          </div>
          <button class="icon-btn item-action" data-tip="删除" @click.stop="onDelete(note)">
            <Trash2 :size="15" />
          </button>
        </div>
      </TransitionGroup>

      <EmptyState
        v-if="store.notes.length === 0"
        text="还没有笔记"
        sub="点击右上角 + 新建第一条笔记"
      >
        <template #icon>
          <StickyNote :size="26" />
        </template>
      </EmptyState>
      <EmptyState
        v-else-if="notes.length === 0"
        :text="keyword ? '没有匹配的笔记' : '该文件夹中还没有笔记'"
      >
        <template #icon>
          <StickyNote :size="26" />
        </template>
      </EmptyState>
    </div>
  </div>
</template>

<style scoped>
.note-list {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 16px 10px;
  flex-shrink: 0;
}

.header-text h1 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  line-height: 1.3;
}

.count {
  font-size: 12px;
  color: var(--text-secondary);
}

.list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 24px;
  position: relative;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 60px;
  padding: 10px;
  border-radius: 10px;
  cursor: default;
  position: relative;
  transition: background 0.15s ease;
}
.item:hover {
  background: var(--hover);
}
.item.selected {
  background: var(--selected);
}

/* 拖拽指示线与拖拽中的半透明态 */
.item.dragging {
  opacity: 0.4;
}
/* 左侧拖拽手柄：悬停整条时显现（仅自定义排序模式） */
.drag-handle {
  width: 16px;
  height: 26px;
  margin-right: 2px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-placeholder);
  cursor: grab;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    color 0.15s ease;
}
.drag-handle:active {
  cursor: grabbing;
}
.item:hover .drag-handle {
  opacity: 1;
}
.drag-handle:hover {
  color: var(--text-secondary);
}
.item.drop-before::before,
.item.drop-after::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  height: 2px;
  border-radius: 1px;
  background: var(--accent);
  z-index: 1;
}
.item.drop-before::before {
  top: -1px;
}
.item.drop-after::after {
  bottom: -1px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.item-body {
  flex: 1;
  min-width: 0;
}

.item-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.item-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-title {
  color: var(--text-placeholder);
  font-style: italic;
}

.item-time {
  font-size: 11px;
  color: var(--text-placeholder);
  flex-shrink: 0;
}

.item-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

:deep(mark.kw) {
  background: rgba(250, 173, 20, 0.35);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}

.item-action {
  opacity: 0;
  transition:
    opacity 0.15s ease,
    background 0.16s ease,
    color 0.16s ease;
}
.item:hover .item-action,
.item.selected .item-action {
  opacity: 1;
}
</style>
