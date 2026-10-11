<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Plus, StickyNote, Trash2 } from 'lucide-vue-next'
import { createNote, removeNote, store } from '../stores/data'
import { clearSelection, registerFirstProvider, select, ui } from '../stores/ui'
import { showToast } from '../stores/toast'
import type { NoteItem } from '../types'
import { formatTime, splitByKeyword, stripHtml } from '../utils/format'
import EmptyState from './EmptyState.vue'
import FolderBar from './FolderBar.vue'
import SearchBox from './SearchBox.vue'

const keyword = computed(() => ui.searchNote.trim())

const scoped = computed(() =>
  store.notes.filter((n) => keyword.value || ui.folderNote === null || n.folderId === ui.folderNote),
)

const notes = computed<NoteItem[]>(() => {
  let list = scoped.value
  const kw = keyword.value.toLowerCase()
  if (kw) {
    list = list.filter(
      (n) =>
        n.title.toLowerCase().includes(kw) || stripHtml(n.content).toLowerCase().includes(kw),
    )
  }
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
})

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
      <button class="icon-btn accent" data-tip="新建笔记 (Ctrl+N)" data-tip-dir="bottom" @click="createNote(ui.folderNote)">
        <Plus :size="18" />
      </button>
    </header>

    <SearchBox v-model="ui.searchNote" placeholder="搜索笔记标题与内容…" />
    <FolderBar kind="note" />

    <div class="list-scroll">
      <TransitionGroup name="list">
        <div
          v-for="note in notes"
          :key="note.id"
          class="item"
          :class="{ selected: ui.selectedType === 'note' && ui.selectedId === note.id }"
          @click="select('note', note.id)"
        >
          <div class="item-body">
            <div class="item-top">
              <div class="item-title">
                <template v-for="(part, i) in splitByKeyword(note.title || '无标题', keyword)" :key="i">
                  <mark v-if="part.hit" class="kw">{{ part.text }}</mark>
                  <span v-else :class="{ 'empty-title': !note.title }">{{ part.text }}</span>
                </template>
              </div>
              <div class="item-time">{{ formatTime(note.updatedAt) }}</div>
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
