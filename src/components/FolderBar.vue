<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { FolderPlus, Pencil, X } from 'lucide-vue-next'
import { createFolder, removeFolder, renameFolder, store } from '../stores/data'
import { setFolder, ui } from '../stores/ui'

const props = defineProps<{ kind: 'todo' | 'note' }>()

const folders = computed(() => store.folders.filter((f) => f.kind === props.kind))
const activeId = computed(() => (props.kind === 'todo' ? ui.folderTodo : ui.folderNote))

// ---------- 横向滚动：滚轮平移 + 选中项滚入视野 ----------
const scrollEl = ref<HTMLElement | null>(null)

function onWheel(e: WheelEvent): void {
  const el = scrollEl.value
  if (!el) return
  // 仅当内容溢出时拦截纵向滚轮，平移为横向滚动
  if (el.scrollWidth <= el.clientWidth) return
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    el.scrollLeft += e.deltaY
    e.preventDefault()
  }
}

watch(activeId, async () => {
  await nextTick()
  scrollEl.value
    ?.querySelector('.chip.active')
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
})

/** 新建/重命名输入框出现时滚动到最右侧，确保可见 */
async function scrollToInput(): Promise<void> {
  await nextTick()
  const el = scrollEl.value
  if (el) el.scrollLeft = el.scrollWidth
}

function countOf(folderId: string | null): number {
  return props.kind === 'todo'
    ? store.todos.filter((t) => t.folderId === folderId && t.status !== 'done').length
    : store.notes.filter((n) => n.folderId === folderId).length
}

function totalCount(): number {
  return props.kind === 'todo'
    ? store.todos.filter((t) => t.status !== 'done').length
    : store.notes.length
}

// ---------- 新建 / 重命名内联输入 ----------
const adding = ref(false)
const editingId = ref<string | null>(null)
const inputVal = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

async function startAdd(): Promise<void> {
  editingId.value = null
  adding.value = true
  inputVal.value = ''
  await scrollToInput()
  inputEl.value?.focus()
}

async function startRename(id: string, name: string): Promise<void> {
  adding.value = false
  editingId.value = id
  inputVal.value = name
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
}

function commitInput(): Promise<void> | void {
  const name = inputVal.value.trim()
  if (adding.value && name) createFolder(props.kind, name)
  if (editingId.value && name) renameFolder(editingId.value, name)
  cancelInput()
}

function cancelInput(): void {
  adding.value = false
  editingId.value = null
  inputVal.value = ''
}

function onDelete(id: string): void {
  if (activeId.value === id) setFolder(props.kind, null)
  removeFolder(id)
}
</script>

<template>
  <div class="folder-bar">
    <div ref="scrollEl" class="chips-scroll" @wheel="onWheel">
      <button
        class="chip"
        :class="{ active: activeId === null }"
        @click="setFolder(kind, null)"
      >
        全部
        <span class="chip-count">{{ totalCount() }}</span>
      </button>

      <template v-for="folder in folders" :key="folder.id">
        <div
          v-if="editingId === folder.id"
          class="chip editing"
          @click.stop
        >
          <input
            ref="inputEl"
            v-model="inputVal"
            class="chip-input"
            maxlength="12"
            @keydown.enter="commitInput"
            @keydown.esc="cancelInput"
            @blur="commitInput"
          />
        </div>
        <button
          v-else
          class="chip"
          :class="{ active: activeId === folder.id }"
          @click="setFolder(kind, folder.id)"
          @dblclick="startRename(folder.id, folder.name)"
        >
          <span class="chip-name">{{ folder.name }}</span>
          <span class="chip-count">{{ countOf(folder.id) }}</span>
          <span class="chip-ops" @click.stop>
            <Pencil :size="11" class="op" @click="startRename(folder.id, folder.name)" />
            <X :size="12" class="op danger" @click="onDelete(folder.id)" />
          </span>
        </button>
      </template>

      <div v-if="adding" class="chip editing" @click.stop>
        <input
          ref="inputEl"
          v-model="inputVal"
          class="chip-input"
          placeholder="文件夹名"
          maxlength="12"
          @keydown.enter="commitInput"
          @keydown.esc="cancelInput"
          @blur="commitInput"
        />
      </div>

      <button class="chip add" data-tip="新建文件夹" data-tip-dir="bottom" @click="startAdd">
        <FolderPlus :size="13" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.folder-bar {
  flex-shrink: 0;
  padding: 0 12px 8px;
}

.chips-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  padding-bottom: 2px;
}
.chips-scroll::-webkit-scrollbar {
  height: 5px;
}
.chips-scroll::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
}
.chips-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 4px 9px;
  white-space: nowrap;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}
.chip:hover {
  background: var(--hover);
  color: var(--text);
}
.chip.active {
  background: var(--bg-card);
  color: var(--text);
  border-color: var(--border);
  font-weight: 500;
}

.chip-name {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip-count {
  font-size: 11px;
  color: var(--text-placeholder);
}
.chip.active .chip-count {
  color: var(--accent);
}

.chip-ops {
  display: none;
  align-items: center;
  gap: 2px;
}
.chip:hover .chip-count {
  display: none;
}
.chip:hover .chip-ops {
  display: inline-flex;
}

.op {
  border-radius: 3px;
  padding: 1px;
  color: var(--text-placeholder);
}
.op:hover {
  color: var(--text);
}
.op.danger:hover {
  color: var(--red);
}

.chip.add {
  color: var(--text-placeholder);
}
.chip.add:hover {
  color: var(--accent);
}

.chip.editing {
  background: var(--bg-card);
  border-color: var(--accent);
  padding: 2px 6px;
}

.chip-input {
  width: 84px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  color: var(--text);
}
</style>
