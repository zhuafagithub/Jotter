/** 待办状态：未开始 / 进行中 / 已完成 */
export type TodoStatus = 'pending' | 'active' | 'done'

/** 待办条目 */
export interface TodoItem {
  id: string
  title: string
  /** 富文本 HTML（TipTap 输出） */
  content: string
  status: TodoStatus
  /** 所属文件夹 id，null 表示未分类 */
  folderId: string | null
  /** 截止 / 提醒时间（毫秒时间戳），null 表示未设置 */
  dueAt: number | null
  /** 自定义排序序号（拖拽排序用，越小越靠前） */
  order: number | null
  createdAt: number
  updatedAt: number
}

/** 笔记条目 */
export interface NoteItem {
  id: string
  title: string
  content: string
  folderId: string | null
  /** 自定义排序序号（拖拽排序用，越小越靠前） */
  order: number | null
  createdAt: number
  updatedAt: number
}

/** 文件夹（待办与笔记各自独立） */
export interface Folder {
  id: string
  name: string
  kind: 'todo' | 'note'
  createdAt: number
}

/** 颜文字分类 */
export interface KaomojiCategory {
  id: string
  name: string
  createdAt: number
}

/** 颜文字条目 */
export interface KaomojiItem {
  id: string
  content: string
  categoryId: string
  /** 复制使用次数，用于「常用」排序 */
  useCount: number
  createdAt: number
}

/** 本地持久化的完整数据结构（data.json） */
export interface AppData {
  todos: TodoItem[]
  notes: NoteItem[]
  folders: Folder[]
  kaomojiCategories: KaomojiCategory[]
  kaomojiItems: KaomojiItem[]
}

/** 左侧导航视图 */
export type ViewKind = 'todo' | 'note' | 'kaomoji' | 'test'

/** 待办排序方式：智能分组 / 按时间 / 按创建 / 按状态 / 自定义（分组保留、组内手动顺序） */
export type TodoSort = 'smart' | 'due' | 'created' | 'status' | 'custom'

/** 笔记排序方式：按修改时间 / 按创建时间 / 自定义（手动拖拽顺序） */
export type NoteSort = 'updated' | 'created' | 'custom'
