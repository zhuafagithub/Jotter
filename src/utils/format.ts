const pad = (n: number) => String(n).padStart(2, '0')

/** 列表小字时间：今天显示 HH:mm，今年显示 MM-DD，跨年显示 YYYY-MM-DD */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}-${md}`
}

/** 是否已逾期（且未完成时才展示红色，由调用方判断状态） */
export function isOverdue(dueAt: number | null): boolean {
  return dueAt != null && dueAt < Date.now()
}

/** 截止时间展示：今天/明天 X日 HH:mm */
export function formatDue(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return `今天 ${hhmm}`
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return `明天 ${hhmm}`
  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  return d.getFullYear() === now.getFullYear() ? `${md} ${hhmm}` : `${d.getFullYear()}年${md} ${hhmm}`
}

/** 时间戳 -> date 输入框格式 */
export function toDateInput(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 时间戳 -> time 输入框格式 */
export function toTimeInput(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** date + time 输入框值 -> 时间戳；日期为空返回 null，时间为空默认 09:00 */
export function combineDateTime(date: string, time: string): number | null {
  if (!date) return null
  const t = time || '09:00'
  const ms = new Date(`${date}T${t}`).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * HTML -> 纯文本。
 * @param keepLineBreaks 是否保留块级换行（复制用）；false 时折叠为空格（列表预览用）
 */
export function stripHtml(html: string, keepLineBreaks = false): string {
  if (keepLineBreaks) {
    let text = html
      .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1')
      .replace(/<img[^>]*>/gi, '')
      .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<hr\s*\/?>/gi, '\n——————\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return text
  }
  return html
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, ' $1 ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/blockquote|\/pre)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 预览文案：截取前 30 字 */
export function preview(html: string, limit = 30): string {
  const text = stripHtml(html)
  return text.length > limit ? `${text.slice(0, limit)}…` : text || '空白笔记'
}

/** 启发式判断纯文本是否像 Markdown */
export function looksLikeMarkdown(text: string): boolean {
  if (!text || text.length > 100_000) return false
  const lines = text.split(/\r?\n/)
  let hits = 0
  for (const line of lines.slice(0, 50)) {
    if (/^\s{0,3}#{1,6}\s+\S/.test(line)) hits++ // 标题
    else if (/^\s*[-*+]\s+\S/.test(line)) hits++ // 无序列表
    else if (/^\s*\d+[.)]\s+\S/.test(line)) hits++ // 有序列表
    else if (/^\s*>+\s+\S/.test(line)) hits++ // 引用
    else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) hits++ // 分隔线
    else if (/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\))/.test(line)) hits++ // 粗体/代码/链接
  }
  return hits >= 2 || (hits >= 1 && /(\*\*[^*]+\*\*|^\s*#{1,6}\s)/m.test(text))
}

/** HTML 转义（搜索高亮拼接用） */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 关键字高亮：把文本按关键字切段（纯文本场景） */
export function splitByKeyword(text: string, keyword: string): { text: string; hit: boolean }[] {
  const kw = keyword.trim()
  if (!kw) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const k = kw.toLowerCase()
  const parts: { text: string; hit: boolean }[] = []
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(k, i)
    if (idx === -1) {
      parts.push({ text: text.slice(i), hit: false })
      break
    }
    if (idx > i) parts.push({ text: text.slice(i, idx), hit: false })
    parts.push({ text: text.slice(idx, idx + k.length), hit: true })
    i = idx + k.length
  }
  return parts
}

export function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
