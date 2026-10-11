<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { ChevronDown, Trash2 } from 'lucide-vue-next'
import { common, createLowlight } from 'lowlight'
import { toHtml } from 'hast-util-to-html'
import { escapeHtml } from '../utils/format'

const props = defineProps(nodeViewProps)

/** 折叠状态为本地视图状态，不写入文档 */
const collapsed = ref(false)

const languages = [
  { value: 'text', label: '纯文本' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'bash', label: 'Bash' },
  { value: 'yaml', label: 'YAML' },
]

// ---------- 语法高亮（overlay 层展示，contentDOM 仍由 ProseMirror 管理） ----------
const lowlight = createLowlight(common)
/** highlight.js 语言别名映射：下拉值 -> hljs 注册名 */
const langAlias: Record<string, string> = { html: 'xml' }

const currentLang = computed(() => (props.node.attrs.language as string | null) || 'text')

const highlighted = computed(() => {
  const text = props.node.textContent ?? ''
  if (!text) return ''
  const lang = currentLang.value
  if (lang === 'text') return escapeHtml(text)
  const id = langAlias[lang] ?? lang
  try {
    if (!lowlight.registered(id)) return escapeHtml(text)
    return toHtml(lowlight.highlight(id, text))
  } catch {
    return escapeHtml(text)
  }
})

// ---------- 语言下拉（自绘，替代原生 select 的系统样式弹层） ----------
const langOpen = ref(false)
const currentLabel = computed(
  () => languages.find((l) => l.value === currentLang.value)?.label ?? currentLang.value,
)

function pickLang(value: string): void {
  props.updateAttributes({ language: value === 'text' ? null : value })
  langOpen.value = false
}

/** 弹层滚动到顶/底时拦截滚轮，避免穿透带动外面整篇笔记滚动 */
function onPopWheel(e: WheelEvent): void {
  const el = e.currentTarget as HTMLElement
  const atTop = el.scrollTop <= 0 && e.deltaY < 0
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight && e.deltaY > 0
  if (atTop || atBottom) e.preventDefault()
}

// ---------- overlay 横向滚动同步（长代码时跟随可编辑层滚动） ----------
const bodyComp = ref<ComponentPublicInstance | null>(null)
const overlayEl = ref<HTMLElement | null>(null)

function syncScroll(): void {
  const body = bodyComp.value?.$el as HTMLElement | undefined
  if (body && overlayEl.value) overlayEl.value.scrollLeft = body.scrollLeft
}
</script>

<template>
  <NodeViewWrapper class="cb-wrap" :class="{ collapsed }" as="div">
    <div class="cb-head" contenteditable="false">
      <button
        class="cb-fold"
        :data-tip="collapsed ? '展开代码' : '折叠代码'"
        data-tip-dir="bottom"
        @click="collapsed = !collapsed"
      >
        <ChevronDown :size="14" />
      </button>
      <button
        class="cb-del"
        data-tip="删除代码块"
        data-tip-dir="bottom"
        @click="props.deleteNode()"
      >
        <Trash2 :size="13" />
      </button>
      <div class="cb-lang-wrap">
        <button class="cb-lang-btn" @click.stop="langOpen = !langOpen">
          {{ currentLabel }}
          <ChevronDown :size="11" class="cb-lang-arrow" :class="{ open: langOpen }" />
        </button>
        <Transition name="pop">
          <div v-if="langOpen" class="cb-lang-pop" @wheel="onPopWheel">
            <button
              v-for="l in languages"
              :key="l.value"
              class="cb-lang-item"
              :class="{ on: l.value === currentLang }"
              @click.stop="pickLang(l.value)"
            >
              {{ l.label }}
            </button>
          </div>
        </Transition>
      </div>
    </div>
    <div class="cb-codearea">
      <pre ref="overlayEl" class="cb-overlay" aria-hidden="true"><code v-html="highlighted" /></pre>
      <NodeViewContent ref="bodyComp" as="pre" class="cb-body" @scroll="syncScroll" />
    </div>
    <div v-if="langOpen" class="cb-mask" @click="langOpen = false" />
  </NodeViewWrapper>
</template>
