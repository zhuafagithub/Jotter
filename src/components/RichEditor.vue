<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { useEditor, EditorContent, VueNodeViewRenderer } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import CodeBlock from '@tiptap/extension-code-block'
import ImageExtension from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { marked } from 'marked'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  Bold,
  ChevronDown,
  ChevronUp,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  RemoveFormatting,
  Search,
  Strikethrough,
  Check,
  X,
} from 'lucide-vue-next'
import { looksLikeMarkdown, stripHtml } from '../utils/format'
import CodeBlockView from './CodeBlockView.vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// ---------- 剪贴板图片 ----------
async function fileToDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  if (file.type === 'image/gif') return raw
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = raw
  })
  const maxDim = 1280
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  if (scale >= 1) return raw
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

function extractImages(source: DataTransfer | null): File[] {
  return Array.from(source?.files ?? []).filter((f) => f.type.startsWith('image/'))
}

async function insertImageFiles(files: File[]): Promise<void> {
  for (const file of files) {
    const src = await fileToDataUrl(file)
    editor.value?.chain().focus().setImage({ src }).run()
  }
}

// ---------- Markdown 粘贴策略 ----------
type MdMode = 'ask' | 'rich' | 'plain'
const mdMode = ref<MdMode>(
  (localStorage.getItem('ui.mdPaste') as MdMode | null) ?? 'ask',
)
const mdChoiceVisible = ref(false)
const mdRemember = ref(false)
let pendingMdText: string | null = null

function insertAsMarkdown(text: string): void {
  const html = marked.parse(text, { async: false, breaks: true, gfm: true }) as string
  editor.value?.chain().focus().insertContent(html).run()
}

function insertAsPlainText(text: string): void {
  // 按段落插入纯文本（保留换行）
  const paragraphs = text.split(/\r?\n/).map((line) => ({
    type: 'paragraph' as const,
    content: line ? [{ type: 'text' as const, text: line }] : undefined,
  }))
  editor.value?.chain().focus().insertContent(paragraphs).run()
}

function chooseMd(rich: boolean, remember: boolean): void {
  const text = pendingMdText
  mdChoiceVisible.value = false
  pendingMdText = null
  if (text == null) return
  if (remember) {
    mdMode.value = rich ? 'rich' : 'plain'
    localStorage.setItem('ui.mdPaste', mdMode.value)
  }
  if (rich) insertAsMarkdown(text)
  else insertAsPlainText(text)
}

// ---------- 正文内查找（装饰器高亮，不改文档） ----------
const findPluginKey = new PluginKey<DecorationSet>('findHighlights')
const FindHighlight = Extension.create({
  name: 'findHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: findPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, old) => {
            const meta = tr.getMeta(findPluginKey) as DecorationSet | undefined
            if (meta !== undefined) return meta
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return findPluginKey.getState(state)
          },
        },
      }),
    ]
  },
})

interface FindMatch {
  from: number
  to: number
}

const findOpen = ref(false)
const findQuery = ref('')
const findActive = ref(0)
const findTotal = ref(0)
const findInput = ref<HTMLInputElement | null>(null)
let findMatches: FindMatch[] = []
let findTimer: ReturnType<typeof setTimeout> | null = null

function pushFindDecos(): void {
  const ed = editor.value
  if (!ed) return
  const decos: Decoration[] = []
  findMatches.forEach((m, idx) => {
    decos.push(
      Decoration.inline(m.from, m.to, {
        class: idx === findActive.value ? 'find-hit find-hit-active' : 'find-hit',
      }),
    )
  })
  ed.view.dispatch(ed.state.tr.setMeta(findPluginKey, DecorationSet.create(ed.state.doc, decos)))
}

function scanFind(): void {
  const ed = editor.value
  if (!ed) return
  const q = findQuery.value.trim().toLowerCase()
  findMatches = []
  if (q) {
    ed.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      const lower = node.text.toLowerCase()
      let i = 0
      while ((i = lower.indexOf(q, i)) !== -1) {
        findMatches.push({ from: pos + i, to: pos + i + q.length })
        i += q.length
      }
    })
  }
  findTotal.value = findMatches.length
  if (findActive.value >= findTotal.value) findActive.value = 0
  pushFindDecos()
}

function gotoMatch(i: number): void {
  const ed = editor.value
  if (!ed || findMatches.length === 0) return
  const n = findMatches.length
  const idx = ((i % n) + n) % n
  findActive.value = idx
  pushFindDecos()
  const m = findMatches[idx]
  const { state, view } = ed
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, m.from, m.to)))
  // PM 的 scrollIntoView 在编辑器未聚焦时不可靠，改用 DOM 层滚动定位
  const domAt = view.domAtPos(m.from)
  const el = domAt.node instanceof HTMLElement ? domAt.node : domAt.node.parentElement
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function openFind(): void {
  findOpen.value = true
  void nextTickFocusFind()
}

function nextTickFocusFind(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      findInput.value?.focus()
      findInput.value?.select()
      resolve()
    }, 30)
  })
}

function closeFind(): void {
  findOpen.value = false
  findQuery.value = ''
  findTotal.value = 0
  findMatches = []
  const ed = editor.value
  if (ed) ed.view.dispatch(ed.state.tr.setMeta(findPluginKey, DecorationSet.empty))
  ed?.commands.focus()
}

function onFindKeydown(e: KeyboardEvent): void {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    openFind()
  }
}

watch(findQuery, () => {
  if (findTimer) clearTimeout(findTimer)
  findTimer = setTimeout(() => {
    findActive.value = 0
    scanFind()
    if (findMatches.length) gotoMatch(0)
  }, 200)
})

onMounted(() => window.addEventListener('keydown', onFindKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onFindKeydown)
  if (findTimer) clearTimeout(findTimer)
})

const editor = useEditor({
  content: props.modelValue || '',
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5] }, codeBlock: false }),
    // 代码块扩展：language 属性 + 折叠/语言选择 NodeView + 块内全选
    CodeBlock.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          language: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-language'),
            renderHTML: (attrs) => ({ 'data-language': attrs.language }),
          },
        }
      },
      addKeyboardShortcuts() {
        return {
          ...this.parent?.(),
          // 代码块内 Ctrl+A 仅选中本块内容，不波及整篇笔记
          'Mod-a': ({ editor: ed }) => {
            const { state } = ed
            const { $from } = state.selection
            if ($from.parent.type.name !== 'codeBlock') return false
            const start = $from.before($from.depth)
            const end = $from.after($from.depth)
            ed.view.dispatch(
              state.tr.setSelection(TextSelection.create(state.doc, start + 1, end - 1)),
            )
            return true
          },
        }
      },
      addNodeView() {
        return VueNodeViewRenderer(CodeBlockView)
      },
    }),
    ImageExtension.configure({ allowBase64: true }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: null, target: null },
    }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    FindHighlight,
    Placeholder.configure({ placeholder: props.placeholder ?? '开始输入内容…' }),
  ],
  editorProps: {
    handlePaste: (_view, event) => {
      const files = extractImages(event.clipboardData)
      if (files.length > 0) {
        event.preventDefault()
        void insertImageFiles(files)
        return true
      }
      const text = event.clipboardData?.getData('text/plain') ?? ''
      const html = event.clipboardData?.getData('text/html') ?? ''
      // 从代码块复制的内容（自身含 data-language，外部编辑器多为 pre>code 结构）粘贴为纯文本，避免再次生成代码块
      if (/<code[^>]*data-language/i.test(html) || /<pre[^>]*>\s*<code/i.test(html)) {
        event.preventDefault()
        if (text) insertAsPlainText(text)
        return true
      }
      const hasHtml = !!html
      if (!hasHtml && text && looksLikeMarkdown(text)) {
        if (mdMode.value === 'rich') {
          event.preventDefault()
          insertAsMarkdown(text)
          return true
        }
        if (mdMode.value === 'plain') return false
        event.preventDefault()
        pendingMdText = text
        mdChoiceVisible.value = true
        return true
      }
      return false
    },
    handleDrop: (_view, event, _slice, moved) => {
      if (moved) return false
      const files = extractImages(event.dataTransfer)
      if (files.length === 0) return false
      event.preventDefault()
      void insertImageFiles(files)
      return true
    },
    handleClick: (view, _pos, event) => {
      const target = event.target as HTMLElement
      const anchor = target.closest('a')
      if (anchor?.href) {
        void openUrl(anchor.href)
        return true
      }
      // 文档末尾是代码块时，点击代码块下方区域自动补一个段落，让光标可定位继续输入
      const { state } = view
      const last = state.doc.lastChild
      if (last && last.type.name === 'codeBlock') {
        const end = state.doc.content.size
        const nodeDom = view.nodeDOM(end - last.nodeSize) as HTMLElement | null
        const rect = nodeDom?.getBoundingClientRect()
        if (rect && event.clientY > rect.bottom) {
          const tr = state.tr.insert(end, state.schema.nodes.paragraph.create())
          tr.setSelection(TextSelection.atEnd(tr.doc))
          tr.scrollIntoView()
          view.dispatch(tr)
          view.focus()
          return true
        }
      }
      return false
    },
  },
  onUpdate: ({ editor: instance }) => {
    emit('update:modelValue', instance.getHTML())
  },
})

// 点击编辑器内容区之外（如末尾代码块下方的留白，该区域不在 ProseMirror 根内，PM 的 handleClick 不触发）
// 时定位光标：末尾为代码块则自动补一个段落；否则把光标放到文末
function onBodyClick(event: MouseEvent): void {
  const ed = editor.value
  if (!ed) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.ProseMirror')) return
  const { state, view } = ed
  const end = state.doc.content.size
  const last = state.doc.lastChild
  if (!last) return
  const nodeDom = view.nodeDOM(end - last.nodeSize) as HTMLElement | null
  const rect = nodeDom?.getBoundingClientRect()
  if (!rect || event.clientY <= rect.bottom) return
  if (last.type.name === 'codeBlock') {
    const tr = state.tr.insert(end, state.schema.nodes.paragraph.create())
    tr.setSelection(TextSelection.atEnd(tr.doc))
    tr.scrollIntoView()
    view.dispatch(tr)
  } else {
    view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(end))))
  }
  view.focus()
}

// ---------- 超链接 ----------
const linkOpen = ref(false)
const linkUrl = ref('')

function onLinkButton(): void {
  if (!editor.value) return
  if (editor.value.isActive('link')) {
    editor.value.chain().focus().unsetLink().run()
    linkOpen.value = false
    return
  }
  linkUrl.value = 'https://'
  linkOpen.value = true
}

function applyLink(): void {
  if (!editor.value) return
  const url = linkUrl.value.trim()
  linkOpen.value = false
  if (!url || url === 'https://') {
    editor.value.chain().focus().run()
    return
  }
  if (editor.value.state.selection.empty) {
    editor.value.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run()
  } else {
    editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }
}

// ---------- 颜色 / 高亮 ----------
const colorOpen = ref(false)
const hoverLabel = ref('')
const textColors = [
  { label: '默认', value: '' },
  { label: '品牌蓝', value: '#5B8DEF' },
  { label: '红', value: '#FF4D4F' },
  { label: '橙', value: '#FAAD14' },
  { label: '绿', value: '#52C41A' },
  { label: '灰', value: '#8A8A8A' },
]
const highlightColors = [
  { label: '无', value: '' },
  { label: '黄', value: '#FEF3C7' },
  { label: '绿', value: '#D9F7BE' },
  { label: '蓝', value: '#D6E8FF' },
  { label: '红', value: '#FFE0E0' },
  { label: '紫', value: '#EFE1FF' },
]

function setTextColor(value: string): void {
  editor.value?.chain().focus().setColor(value).run()
}

function setHighlight(value: string): void {
  const chain = editor.value?.chain().focus()
  if (!chain) return
  if (!value) chain.unsetHighlight().run()
  else chain.setHighlight({ color: value }).run()
}

function clearFormat(): void {
  editor.value?.chain().focus().unsetAllMarks().clearNodes().run()
}

// ---------- 复制（供详情区头部按钮调用：复制整篇） ----------
function copyPlain(): void {
  void navigator.clipboard.writeText(stripHtml(props.modelValue, true))
}

async function copyRich(): Promise<void> {
  const html = props.modelValue
  const text = stripHtml(html, true)
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ])
  } catch (err) {
    console.error('复制失败:', err)
    throw err
  }
}

defineExpose({ copyPlain, copyRich })
</script>

<template>
  <div class="rich-editor">
    <div v-if="editor" class="toolbar-wrap">
      <div class="editor-toolbar">
        <button
          class="tool-btn"
          :class="{ active: editor.isActive('heading', { level: 1 }) }"
          data-tip="标题 1"
          data-tip-dir="bottom"
          @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
        >
          <Heading1 :size="16" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: editor.isActive('heading', { level: 2 }) }"
          data-tip="标题 2"
          data-tip-dir="bottom"
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
        >
          <Heading2 :size="16" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: editor.isActive('heading', { level: 3 }) }"
          data-tip="标题 3"
          data-tip-dir="bottom"
          @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
        >
          <Heading3 :size="16" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: editor.isActive('heading', { level: 4 }) }"
          data-tip="标题 4"
          data-tip-dir="bottom"
          @click="editor.chain().focus().toggleHeading({ level: 4 }).run()"
        >
          <Heading4 :size="16" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: editor.isActive('heading', { level: 5 }) }"
          data-tip="标题 5"
          data-tip-dir="bottom"
          @click="editor.chain().focus().toggleHeading({ level: 5 }).run()"
        >
          <Heading5 :size="16" />
        </button>

        <span class="tool-divider" />

        <button
          class="tool-btn"
          :class="{ active: editor.isActive('bold') }"
          data-tip="加粗"
          data-tip-dir="bottom"
          @click="editor.chain().focus().toggleBold().run()"
        >
          <Bold :size="16" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: editor.isActive('italic') }"
          data-tip="斜体"
          data-tip-dir="bottom"
          @click="editor.chain().focus().toggleItalic().run()"
        >
          <Italic :size="16" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: editor.isActive('strike') }"
          data-tip="删除线"
          data-tip-dir="bottom"
          @click="editor.chain().focus().toggleStrike().run()"
        >
          <Strikethrough :size="16" />
        </button>

        <span class="tool-divider" />

        <div class="color-wrap">
          <button
            class="tool-btn"
            :class="{ active: colorOpen || editor.isActive('highlight') }"
            data-tip="文字颜色 / 高亮"
            data-tip-dir="bottom"
            @click="colorOpen = !colorOpen"
          >
            <Highlighter :size="16" />
          </button>
          <Transition name="pop">
            <div v-if="colorOpen" class="color-pop" @click.stop>
              <div class="color-title">
                文字颜色
                <span class="color-hover">{{ hoverLabel }}</span>
              </div>
              <div class="color-row">
                <button
                  v-for="c in textColors"
                  :key="c.label"
                  class="color-dot"
                  :style="{
                    background: c.value || 'var(--bg-card)',
                    borderColor: c.value || 'var(--border)',
                  }"
                  @mouseenter="hoverLabel = c.label"
                  @mouseleave="hoverLabel = ''"
                  @click="setTextColor(c.value)"
                />
              </div>
              <div class="color-title">
                背景高亮
                <span class="color-hover">{{ hoverLabel }}</span>
              </div>
              <div class="color-row">
                <button
                  v-for="c in highlightColors"
                  :key="c.label"
                  class="color-dot"
                  :style="{ background: c.value || 'var(--bg-card)' }"
                  :class="{ plain: !c.value }"
                  @mouseenter="hoverLabel = c.label"
                  @mouseleave="hoverLabel = ''"
                  @click="setHighlight(c.value)"
                />
              </div>
            </div>
          </Transition>
        </div>

        <span class="tool-divider" />

        <button
          class="tool-btn"
          :class="{ active: editor.isActive('bulletList') }"
          data-tip="无序列表"
          data-tip-dir="bottom"
          @click="editor.chain().focus().toggleBulletList().run()"
        >
          <List :size="16" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: editor.isActive('orderedList') }"
          data-tip="有序列表"
          data-tip-dir="bottom"
          @click="editor.chain().focus().toggleOrderedList().run()"
        >
          <ListOrdered :size="16" />
        </button>
        <button
          class="tool-btn"
          :class="{ active: editor.isActive('codeBlock') }"
          data-tip="代码块"
          data-tip-dir="bottom"
          @click="editor.chain().focus().toggleCodeBlock().run()"
        >
          <Code2 :size="16" />
        </button>
        <button
          class="tool-btn"
          data-tip="分隔线"
          data-tip-dir="bottom"
          @click="editor.chain().focus().setHorizontalRule().run()"
        >
          <Minus :size="16" />
        </button>

        <span class="tool-divider" />

        <div class="link-wrap">
          <button
            class="tool-btn"
            :class="{ active: editor.isActive('link') || linkOpen }"
            data-tip="超链接"
            data-tip-dir="bottom"
            @click="onLinkButton"
          >
            <Link2 :size="16" />
          </button>
          <Transition name="pop">
            <div v-if="linkOpen" class="link-popover">
              <input
                v-model="linkUrl"
                class="link-input"
                type="text"
                placeholder="输入链接地址，回车确认"
                @keydown.enter.prevent="applyLink"
                @keydown.esc.stop="linkOpen = false"
              />
              <button class="tool-btn confirm" @click="applyLink"><Check :size="15" /></button>
              <button
                v-if="editor.isActive('link')"
                class="tool-btn"
                @click="editor.chain().focus().unsetLink().run(); linkOpen = false"
              >
                <X :size="15" />
              </button>
            </div>
          </Transition>
        </div>

        <button
          class="tool-btn"
          data-tip="清除全部格式"
          data-tip-dir="bottom"
          @click="clearFormat"
        >
          <RemoveFormatting :size="16" />
        </button>

        <button
          class="tool-btn"
          :class="{ active: findOpen }"
          data-tip="正文查找（Ctrl+F）"
          data-tip-dir="bottom"
          @click="openFind"
        >
          <Search :size="16" />
        </button>
      </div>

      <Transition name="pop">
        <div v-if="mdChoiceVisible" class="md-bar">
          <span class="md-text">检测到 Markdown 内容，选择粘贴方式：</span>
          <button class="md-btn rich" @click="chooseMd(true, mdRemember)">转为富文本</button>
          <button class="md-btn" @click="chooseMd(false, mdRemember)">保持纯文本</button>
          <label class="md-remember">
            <input v-model="mdRemember" type="checkbox" />
            不再询问
          </label>
        </div>
      </Transition>

      <!-- 正文查找条 -->
      <Transition name="pop">
        <div v-if="findOpen" class="find-bar">
          <Search :size="13" class="find-icon" />
          <input
            ref="findInput"
            v-model="findQuery"
            class="find-input"
            type="text"
            placeholder="在正文中查找…"
            @keydown.enter.prevent="gotoMatch(findActive + 1)"
            @keydown.esc.prevent="closeFind"
          />
          <span class="find-count">{{ findTotal ? `${findActive + 1}/${findTotal}` : '无结果' }}</span>
          <button class="find-btn" data-tip="上一个" data-tip-dir="bottom" @click="gotoMatch(findActive - 1)">
            <ChevronUp :size="14" />
          </button>
          <button class="find-btn" data-tip="下一个" data-tip-dir="bottom" @click="gotoMatch(findActive + 1)">
            <ChevronDown :size="14" />
          </button>
          <button class="find-btn" data-tip="关闭" data-tip-dir="bottom" @click="closeFind">
            <X :size="14" />
          </button>
        </div>
      </Transition>
      <div v-if="colorOpen || linkOpen" class="pop-mask" @click="colorOpen = false; linkOpen = false" />
    </div>

    <editor-content :editor="editor" class="editor-body" @click="onBodyClick" />
  </div>
</template>

<style scoped>
.rich-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.toolbar-wrap {
  position: relative;
  flex-shrink: 0;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  flex-wrap: wrap;
}

.tool-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.tool-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.tool-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.tool-btn.confirm {
  color: var(--accent);
}

.tool-divider {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
}

.pop-mask {
  position: fixed;
  inset: 0;
  z-index: 30;
}

/* ---------- 颜色弹层 ---------- */
.color-wrap,
.link-wrap {
  position: relative;
}

.color-pop {
  position: absolute;
  top: 36px;
  left: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
  padding: 10px;
  width: 196px;
  z-index: 40;
}

.color-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
  margin: 2px 0 6px;
}
.color-hover {
  color: var(--accent);
  min-height: 1em;
}

/* ---------- 正文查找条 ---------- */
.find-bar {
  position: absolute;
  top: 40px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-pop);
  padding: 5px 8px;
  z-index: 45;
}
.find-icon {
  color: var(--text-placeholder);
  flex-shrink: 0;
}
.find-input {
  width: 150px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12.5px;
  color: var(--text);
}
.find-input::placeholder {
  color: var(--text-placeholder);
}
.find-count {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 40px;
  text-align: center;
}
.find-btn {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.find-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.color-title:not(:first-child) {
  margin-top: 10px;
}

.color-row {
  display: flex;
  gap: 7px;
}

.color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: transform 0.12s ease;
}
.color-dot:hover {
  transform: scale(1.15);
}
.color-dot.plain {
  border: 1.5px dashed var(--border);
  position: relative;
}
.color-dot.plain::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 50%;
  width: 14px;
  height: 1.5px;
  background: var(--red);
  transform: rotate(-45deg);
}

/* ---------- 链接弹层 ---------- */
.link-popover {
  position: absolute;
  top: 36px;
  left: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-pop);
  padding: 6px;
  width: 280px;
  z-index: 40;
}

.link-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  padding: 4px 6px;
}
.link-input::placeholder {
  color: var(--text-placeholder);
}

/* ---------- Markdown 选择条 ---------- */
.md-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 7px 10px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-soft);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text);
}

.md-text {
  color: var(--text-secondary);
}

.md-btn {
  font-size: 12px;
  border-radius: 6px;
  padding: 4px 10px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}
.md-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.md-btn.rich {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.md-btn.rich:hover {
  background: var(--accent-hover);
  color: #fff;
}

.md-remember {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.md-remember input {
  accent-color: var(--accent);
}

.editor-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 4px 48px;
}
</style>
