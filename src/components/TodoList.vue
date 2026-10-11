<script setup lang="ts">
import { computed, onMounted } from 'vue'
import {
  Check,
  ChevronDown,
  CircleCheck,
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

/** 分组 + 排序 */
const groups = computed<Group[]>(() => {
  if (searchHits.value) {
    return [{ key: 'search', label: '', items: sortList(searchHits.value) }]
  }
  const source = scoped.value

  const sortBy = (a: TodoItem, b: TodoItem): number => {
    switch (ui.todoSort) {
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
  const sortList2 = (list: TodoItem[]) => [...list].sort(sortBy)

  if (ui.todoSort !== 'smart') {
    return [{ key: 'all', label: '', items: sortList2(source) }]
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
      items: sortList2(source.filter((t) => open(t) && hasDue(t) && t.dueAt < tomorrowStart)),
    },
    {
      key: 'week',
      label: '本周',
      items: sortList2(
        source.filter((t) => open(t) && hasDue(t) && t.dueAt >= tomorrowStart && t.dueAt < weekEnd),
      ),
    },
    {
      key: 'later',
      label: '以后',
      items: sortList2(source.filter((t) => open(t) && hasDue(t) && t.dueAt >= weekEnd)),
    },
    {
      key: 'someday',
      label: '无日期',
      items: sortList2(source.filter((t) => open(t) && t.dueAt == null)),
    },
    { key: 'done', label: '已完成', items: sortList2(source.filter((t) => t.status === 'done')) },
  ]
})

function sortList(list: TodoItem[]): TodoItem[] {
  return [...list].sort(
    (a, b) =>
      (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY) ||
      b.updatedAt - a.updatedAt,
  )
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
    const list = searchHits.value ?? sortList(scoped.value)
    return list[0]?.id ?? null
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

    <div class="list-scroll">
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
            }"
            @click="select('todo', todo.id)"
          >
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
