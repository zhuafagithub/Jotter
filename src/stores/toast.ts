import { reactive } from 'vue'

/** 轻量 toast（含撤销能力，用于删除操作反馈） */
export const toast = reactive({
  visible: false,
  message: '',
  undo: null as (() => void) | null,
  timer: null as ReturnType<typeof setTimeout> | null,
})

export function showToast(message: string, undo?: () => void): void {
  toast.message = message
  toast.undo = undo ?? null
  toast.visible = true
  if (toast.timer) clearTimeout(toast.timer)
  toast.timer = setTimeout(() => {
    toast.visible = false
    toast.undo = null
  }, 5000)
}

export function undoToast(): void {
  toast.undo?.()
  toast.visible = false
  toast.undo = null
}
