import { reactive } from 'vue'
import type { TodoSort, ViewKind } from '../types'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function persist(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

/** 智能分组折叠状态：默认折叠「已完成」 */
const collapsedFallback: Record<'todo', string[]> = { todo: ['done'] }

/** 界面状态：当前视图、待办排序、选中条目、文件夹、搜索、折叠 */
export const ui = reactive({
  view: load<ViewKind>('ui.view', 'todo'),
  todoSort: load<TodoSort>('ui.todoSort', 'smart'),
  selectedType: null as 'todo' | 'note' | null,
  selectedId: null as string | null,
  folderTodo: load<string | null>('ui.folderTodo', null),
  folderNote: load<string | null>('ui.folderNote', null),
  searchTodo: '',
  searchNote: '',
  collapsed: load('ui.collapsed', collapsedFallback),
})

export function setView(view: ViewKind): void {
  ui.view = view
  localStorage.setItem('ui.view', view)
  if (view !== 'todo' && view !== 'note') {
    clearSelection()
    return
  }
  if (ui.selectedType !== view) clearSelection()
  selectFirstOfView(view)
}

export function setTodoSort(sort: TodoSort): void {
  ui.todoSort = sort
  localStorage.setItem('ui.todoSort', JSON.stringify(sort))
}

export function select(type: 'todo' | 'note', id: string): void {
  ui.selectedType = type
  ui.selectedId = id
}

export function clearSelection(): void {
  ui.selectedType = null
  ui.selectedId = null
}

export function setFolder(kind: 'todo' | 'note', id: string | null): void {
  if (kind === 'todo') {
    ui.folderTodo = id
    persist('ui.folderTodo', id)
  } else {
    ui.folderNote = id
    persist('ui.folderNote', id)
  }
}

export function toggleCollapsed(groupKey: string): void {
  const set = new Set(ui.collapsed.todo)
  if (set.has(groupKey)) set.delete(groupKey)
  else set.add(groupKey)
  ui.collapsed.todo = [...set]
  persist('ui.collapsed', ui.collapsed)
}

export function isCollapsed(groupKey: string): boolean {
  return ui.collapsed.todo.includes(groupKey)
}

/**
 * 切换到待办/笔记页签时，默认选中第一条。
 * 由列表组件注册各自的「取第一条」函数，避免 store 反向依赖组件过滤逻辑。
 */
const firstProviders: Partial<Record<'todo' | 'note', () => string | null>> = {}

export function registerFirstProvider(kind: 'todo' | 'note', fn: () => string | null): void {
  firstProviders[kind] = fn
}

export function selectFirstOfView(kind: 'todo' | 'note'): void {
  const id = firstProviders[kind]?.() ?? null
  if (id) select(kind, id)
}
