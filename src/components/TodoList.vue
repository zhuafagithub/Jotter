<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Check,
  ChevronDown,
  CircleCheck,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-vue-next'
import { createTodo, removeTodo, store } from '../stores/data'
import {
  clearSelection,
  isCollapsed,
  registerFirstProvider,
  select,
  setTodoSort,
  toggleCollapsed,
  ui,
} from '../stores/ui'
import { showToast } from '../stores/toast'
import type { TodoItem, TodoSort, TodoStatus } from '../types'
import { formatDue, isOverdue, splitByKeyword, stripHtml } from '../utils/format'
import EmptyState from './EmptyState.vue'
import FolderBar from './FolderBar.vue'
import SearchBox from './SearchBox.vue'
import SortMenu from './SortMenu.vue'

interface Group {
  key: string
  label: string
  items: TodoItem[]
}

const sortOptions: { value: TodoSort; label: string }[] = [
  { value: 'smart', label: '智能分组' },
  { value: 'custom', label: '自定义' },
  { value: 'due', label: '按时间' },
  { value: 'created', label: '按创建' },
  { value: 'status', label: '按状态' },
]

const keyword = computed(() => ui.searchTodo.trim())

/** 文件夹过滤（搜索时跨全部文件夹） */
const scoped = computed(() =>
  store.todos.filter((t) => keyword.value || ui.folderTodo === null || t.folderId === ui.folderTodo),
)

const searchHits = computed(() => {
  const kw = keyword.value.toLowerCase()
  if (!kw) return null
  return scoped.value.filter(
    (t) =>
      t.title.toLowerCase().includes(kw) ||
      stripHtml(t.content).toLowerCase().includes(kw),
  )
})

const pendingCount = computed(() =>
  store.todos.filter((t) => t.status !== 'done').length,
)

const statusOrder: Record<TodoStatus, number> = { pending: 0, active: 1, done: 2 }

/** 自定义顺序：order 小者在前，未编号的排在已编号之后 */
const orderCmp = (a: TodoItem, b: TodoItem): number =>
  (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
  b.updatedAt - a.updatedAt

/** 按当前排序模式比较 */
function cmpBy(a: TodoItem, b: TodoItem): number {
  switch (ui.todoSort) {
    case 'custom':
      return orderCmp(a, b)
    case 'due':
      return (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY)
    case 'created':
      return b.createdAt - a.createdAt
    case 'status':
      return statusOrder[a.status] - statusOrder[b.status] || b.updatedAt - a.updatedAt
    default:
      return (
        (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY) ||
        b.updatedAt - a.updatedAt
      )
  }
}

function sortList(list: TodoItem[]): TodoItem[] {
  return [...list].sort(cmpBy)
}

/** 自定义模式保留智能分组结构，仅组内顺序手动化 */
const useGroups = computed(() => ui.todoSort === 'smart' || ui.todoSort === 'custom')

/** 分组 + 排序 */
const groups = computed<Group[]>(() => {
  if (searchHits.value) {
    return [{ key: 'search', label: '', items: sortList(searchHits.value) }]
  }
  const source = scoped.value

  if (!useGroups.value) {
    return [{ key: 'all', label: '', items: sortList(source) }]
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const tomorrowStart = now.getTime() + 86_400_000
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + (7 - ((now.getDay() + 6) % 7)))
  const weekEnd = nextMonday.getTime()
  const open = (t: TodoItem) => t.status !== 'done'
  const hasDue = (t: TodoItem): t is TodoItem & { dueAt: number } => t.dueAt != null

  return [
    {
      key: 'today',
      label: '今天',
      items: sortList(source.filter((t) => open(t) && hasDue(t) && t.dueAt < tomorrowStart)),
    },
    {
      key: 'week',
      label: '本周',
      items: sortList(
        source.filter((t) => open(t) && hasDue(t) && t.dueAt >= tomorrowStart && t.dueAt < weekEnd),
      ),
    },
    {
      key: 'later',
      label: '以后',
      items: sortList(source.filter((t) => open(t) && hasDue(t) && t.dueAt >= weekEnd)),
    },
    {
      key: 'someday',
      label: '无日期',
      items: sortList(source.filter((t) => open(t) && t.dueAt == null)),
    },
    { key: 'done', label: '已完成', items: sortList(source.filter((t) => t.status === 'done')) },
  ]
})

// ---------- 组内拖拽排序 ----------
const dragId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)
const dropBefore = ref(false)

function onDragStart(e: DragEvent, todo: TodoItem): void {
  if (keyword.value) {
    e.preventDefault() // 搜索结果不参与拖拽
    return
  }
  dragId.value = todo.id
  e.dataTransfer?.setData('text/plain', todo.id)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // 拖拽视觉跟随整条卡片而非小手柄
    const itemEl = (e.currentTarget as HTMLElement).closest('.item')
    if (itemEl) e.dataTransfer.setDragImage(itemEl, 24, 24)
  }
}

function onDragOver(e: DragEvent, todo: TodoItem): void {
  if (!dragId.value || dragId.value === todo.id) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dropBefore.value = e.clientY < rect.top + rect.height / 2
  dragOverId.value = todo.id
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDragLeave(todo: TodoItem): void {
  if (dragOverId.value === todo.id) dragOverId.value = null
}

/** 落下：组内重排并把顺序写入 order（非自定义模式自动切换） */
function onDrop(e: DragEvent, group: Group, todo: TodoItem): void {
  e.preventDefault()
  const drag = dragId.value
  dragId.value = null
  dragOverId.value = null
  if (!drag || drag === todo.id) return
  const ids = group.items.map((t) => t.id)
  const fromIdx = ids.indexOf(drag)
  if (fromIdx === -1) return
  ids.splice(fromIdx, 1)
  let toIdx = ids.indexOf(todo.id)
  if (!dropBefore.value) toIdx += 1
  ids.splice(toIdx, 0, drag)
  ids.forEach((id, i) => {
    const t = store.todos.find((x) => x.id === id)
    if (t) t.order = i
  })
  if (ui.todoSort !== 'custom') {
    setTodoSort('custom')
    showToast('已切换为自定义排序')
  }
}

function onDragEnd(): void {
  dragId.value = null
  dragOverId.value = null
}

/** 三态循环：未开始 -> 进行中 -> 已完成 -> 未开始 */
function cycleStatus(todo: TodoItem): void {
  todo.status =
    todo.status === 'pending' ? 'active' : todo.status === 'active' ? 'done' : 'pending'
  todo.updatedAt = Date.now()
}

function onDelete(todo: TodoItem): void {
  const idx = removeTodo(todo.id)
  if (ui.selectedType === 'todo' && ui.selectedId === todo.id) clearSelection()
  showToast('已删除待办', () => {
    store.todos.splice(Math.min(idx, store.todos.length), 0, todo)
  })
}

onMounted(() => {
  registerFirstProvider('todo', () => {
    if (searchHits.value) return sortList(searchHits.value)[0]?.id ?? null
    // 按分组顺序取第一个非空分组的头一项（今天 > 本周 > 以后 > 无日期 > 已完成）
    return groups.value.find((g) => g.items.length > 0)?.items[0]?.id ?? null
  })
})
</script>

<template>
  <div class="todo-list">
    <header class="list-header">
      <div class="header-text">
        <h1>待办</h1>
        <span class="count">{{ pendingCount }} 条进行中</span>
      </div>
      <div class="header-actions">
        <SortMenu :model-value="ui.todoSort" :options="sortOptions" @update:model-value="setTodoSort" />
        <button class="icon-btn accent" data-tip="新建待办 (Ctrl+N)" data-tip-dir="bottom" @click="createTodo(ui.folderTodo)">
          <Plus :size="18" />
        </button>
      </div>
    </header>

    <SearchBox v-model="ui.searchTodo" placeholder="搜索待办标题与内容…" />
    <FolderBar kind="todo" />

    <div class="list-scroll" @dragover.prevent @drop.prevent>
      <template v-for="group in groups" :key="group.key">
        <button
          v-if="group.label && group.items.length"
          class="group-label"
          @click="toggleCollapsed(group.key)"
        >
          <ChevronDown :size="12" :class="{ collapsed: isCollapsed(group.key) }" />
          <span>{{ group.label }}</span>
          <span class="group-count">{{ group.items.length }}</span>
        </button>
        <TransitionGroup v-if="!group.label || !isCollapsed(group.key)" name="list">
          <div
            v-for="todo in group.items"
            :key="todo.id"
            class="item"
            :class="{
              selected: ui.selectedType === 'todo' && ui.selectedId === todo.id,
              done: todo.status === 'done',
              dragging: dragId === todo.id,
              'drop-before': dragOverId === todo.id && dropBefore,
              'drop-after': dragOverId === todo.id && !dropBefore,
            }"
            @click="select('todo', todo.id)"
            @dragover="onDragOver($event, todo)"
            @dragleave="onDragLeave(todo)"
            @drop="onDrop($event, group, todo)"
          >
            <button
              class="drag-handle"
              data-tip="按住拖动排序"
              data-tip-dir="top"
              :draggable="!keyword"
              @dragstart="onDragStart($event, todo)"
              @dragend="onDragEnd"
            >
              <GripVertical :size="14" />
            </button>
            <button
              class="checkbox"
              :class="todo.status"
              :data-tip="
                todo.status === 'pending'
                  ? '标记进行中'
                  : todo.status === 'active'
                    ? '标记完成'
                    : '重新打开'
              "
              @click.stop="cycleStatus(todo)"
            >
              <Check v-if="todo.status === 'done'" :size="13" :stroke-width="3" />
              <span v-else-if="todo.status === 'active'" class="dot" />
            </button>
            <div class="item-body">
              <div class="item-title-line">
                <template v-for="(part, i) in splitByKeyword(todo.title || '无标题', keyword)" :key="i">
                  <mark v-if="part.hit" class="kw">{{ part.text }}</mark>
                  <span v-else :class="{ 'empty-title': !todo.title }">{{ part.text }}</span>
                </template>
                <span v-if="todo.status === 'active'" class="badge active">进行中</span>
              </div>
              <div class="item-sub" :class="{ overdue: todo.status !== 'done' && isOverdue(todo.dueAt) }">
                {{ todo.dueAt != null ? formatDue(todo.dueAt) : '无日期' }}
                <template v-if="keyword">
                  <span class="sub-preview">
                    ·
                    <template v-for="(part, i) in splitByKeyword(stripHtml(todo.content) || '无描述', keyword)" :key="i">
                      <mark v-if="part.hit" class="kw">{{ part.text }}</mark>
                      <span v-else>{{ part.text }}</span>
                    </template>
                  </span>
                </template>
              </div>
            </div>
            <button class="icon-btn item-action" data-tip="删除" @click.stop="onDelete(todo)">
              <Trash2 :size="15" />
            </button>
          </div>
        </TransitionGroup>
      </template>

      <EmptyState
        v-if="store.todos.length === 0"
        text="还没有待办"
        sub="点击右上角 + 新建第一条待办"
      >
        <template #icon>
          <CircleCheck :size="26" />
        </template>
      </EmptyState>
      <EmptyState
        v-else-if="groups.every((g) => g.items.length === 0)"
        :text="keyword ? '没有匹配的待办' : '该文件夹中还没有待办'"
      >
        <template #icon>
          <CircleCheck :size="26" />
        </template>
      </EmptyState>
    </div>
  </div>
</template>

<style scoped>
.todo-list {
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 24px;
  position: relative;
}

.group-label {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 14px 10px 4px;
  text-align: left;
}
.group-label:hover {
  color: var(--text);
}
.group-label :deep(svg) {
  transition: transform 0.18s ease;
}
.group-label :deep(svg.collapsed) {
  transform: rotate(-90deg);
}

.group-count {
  font-size: 11px;
  color: var(--text-placeholder);
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 8px 10px;
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
/* 左侧拖拽手柄：悬停整条时显现 */
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

.item-body {
  flex: 1;
  min-width: 0;
}

.item-title-line {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}
.item.done .item-title-line {
  color: var(--text-secondary);
  text-decoration: line-through;
  text-decoration-color: var(--text-placeholder);
}
.empty-title {
  color: var(--text-placeholder);
  font-style: italic;
}

.badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 5px;
}
.badge.active {
  color: var(--accent);
  background: var(--accent-soft);
}

.item-sub {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-sub.overdue {
  color: var(--red);
}

.sub-preview {
  color: var(--text-placeholder);
}

:deep(mark.kw) {
  background: rgba(250, 173, 20, 0.35);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}

/* 三态勾选框 */
.checkbox {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--text-placeholder);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  background: transparent;
  flex-shrink: 0;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;
}
.checkbox:hover {
  border-color: var(--green);
}
.checkbox.pending:hover {
  border-color: var(--accent);
}
.checkbox.active {
  border-color: var(--accent);
}
.checkbox.active .dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
}
.checkbox.done {
  background: var(--green);
  border-color: var(--green);
  color: #fff;
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
