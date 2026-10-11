import { reactive, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { AppData, Folder, NoteItem, TodoItem, TodoStatus } from '../types'
import { uid } from '../utils/format'
import { select } from './ui'

/** 全量本地数据（内存态），持久化到 appDataDir/data.json */
export const store = reactive<AppData>({ todos: [], notes: [], folders: [] })

/** 保存状态：详情区右上角展示 */
export const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')

let ready = false
let timer: ReturnType<typeof setTimeout> | null = null

/** 旧版本数据迁移：completed 布尔 -> status 三态；补齐 folderId/folders */
function migrate(raw: Partial<AppData>): void {
  const rawTodos = (raw as { todos?: unknown[] }).todos
  const rawNotes = (raw as { notes?: unknown[] }).notes
  const rawFolders = (raw as { folders?: unknown[] }).folders
  store.todos = (rawTodos ?? []).map((value) => {
    const t = value as Record<string, unknown>
    let status: TodoStatus = (t.status as TodoStatus | undefined) ?? 'pending'
    if (status !== 'pending' && status !== 'active' && status !== 'done') status = 'pending'
    if (!t.status && (t as { completed?: boolean }).completed) status = 'done'
    return {
      id: String(t.id ?? uid()),
      title: String(t.title ?? ''),
      content: String(t.content ?? ''),
      status,
      folderId: (t.folderId as string | null) ?? null,
      dueAt: (t.dueAt as number | null) ?? null,
      createdAt: Number(t.createdAt ?? Date.now()),
      updatedAt: Number(t.updatedAt ?? t.createdAt ?? Date.now()),
    }
  })
  store.notes = (rawNotes ?? []).map((value) => {
    const n = value as Record<string, unknown>
    return {
      id: String(n.id ?? uid()),
      title: String(n.title ?? ''),
      content: String(n.content ?? ''),
      folderId: (n.folderId as string | null) ?? null,
      createdAt: Number(n.createdAt ?? Date.now()),
      updatedAt: Number(n.updatedAt ?? n.createdAt ?? Date.now()),
    }
  })
  store.folders = Array.isArray(rawFolders)
    ? (rawFolders as Folder[]).filter(
        (f): f is Folder =>
          !!f &&
          typeof f.id === 'string' &&
          typeof f.name === 'string' &&
          (f.kind === 'todo' || f.kind === 'note'),
      )
    : []
  // 条目引用的文件夹若已删除，回落到未分类
  for (const t of store.todos) {
    if (t.folderId && !store.folders.some((f) => f.id === t.folderId)) t.folderId = null
  }
  for (const n of store.notes) {
    if (n.folderId && !store.folders.some((f) => f.id === n.folderId)) n.folderId = null
  }
}

/** 启动时从本地恢复数据 */
export async function initStore(): Promise<void> {
  try {
    const raw = await invoke<string>('load_data')
    if (raw) migrate(JSON.parse(raw) as Partial<AppData>)
  } catch (err) {
    console.error('读取本地数据失败:', err)
  } finally {
    ready = true
  }
}

function scheduleSave(): void {
  saveStatus.value = 'saving'
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flushSave(), 500)
}

/** 立即落盘（窗口关闭前调用，确保最后编辑不丢失） */
export async function flushSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  try {
    await invoke('save_data', { data: JSON.stringify(store) })
    saveStatus.value = 'saved'
  } catch (err) {
    console.error('保存失败:', err)
    saveStatus.value = 'idle'
  }
}

watch(
  store,
  () => {
    if (ready) scheduleSave()
  },
  { deep: true },
)

// ---------- 待办 / 笔记 CRUD ----------

export function createTodo(folderId: string | null = null): TodoItem {
  const now = Date.now()
  const item: TodoItem = {
    id: uid(),
    title: '',
    content: '',
    status: 'pending',
    folderId,
    dueAt: null,
    createdAt: now,
    updatedAt: now,
  }
  store.todos.unshift(item)
  select('todo', item.id)
  return item
}

export function createNote(folderId: string | null = null): NoteItem {
  const now = Date.now()
  const item: NoteItem = {
    id: uid(),
    title: '',
    content: '',
    folderId,
    createdAt: now,
    updatedAt: now,
  }
  store.notes.unshift(item)
  select('note', item.id)
  return item
}

export function removeTodo(id: string): number {
  const idx = store.todos.findIndex((t) => t.id === id)
  if (idx >= 0) store.todos.splice(idx, 1)
  return idx
}

export function removeNote(id: string): number {
  const idx = store.notes.findIndex((n) => n.id === id)
  if (idx >= 0) store.notes.splice(idx, 1)
  return idx
}

export function getTodo(id: string): TodoItem | undefined {
  return store.todos.find((t) => t.id === id)
}

export function getNote(id: string): NoteItem | undefined {
  return store.notes.find((n) => n.id === id)
}

// ---------- 文件夹 CRUD ----------

export function createFolder(kind: 'todo' | 'note', name: string): Folder {
  const folder: Folder = { id: uid(), name: name.trim() || '新文件夹', kind, createdAt: Date.now() }
  store.folders.push(folder)
  return folder
}

export function renameFolder(id: string, name: string): void {
  const folder = store.folders.find((f) => f.id === id)
  if (folder && name.trim()) folder.name = name.trim()
}

/** 删除文件夹：其中条目回落到未分类 */
export function removeFolder(id: string): void {
  const idx = store.folders.findIndex((f) => f.id === id)
  if (idx >= 0) store.folders.splice(idx, 1)
  for (const t of store.todos) if (t.folderId === id) t.folderId = null
  for (const n of store.notes) if (n.folderId === id) n.folderId = null
}
