<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus, Star, Trash2, X } from 'lucide-vue-next'
import { addKaomoji, bumpKaomojiUse, removeKaomoji, store } from '../stores/data'
import { ui } from '../stores/ui'
import { showToast } from '../stores/toast'

const FAVORITE_ID = 'favorite'

const isFavorite = computed(() => ui.kaomojiCategoryId === FAVORITE_ID)

const currentCategory = computed(() =>
  store.kaomojiCategories.find((c) => c.id === ui.kaomojiCategoryId),
)

const title = computed(() => (isFavorite.value ? '常用' : currentCategory.value?.name ?? '颜文字'))

/** 当前分类下的颜文字 */
const items = computed(() => {
  if (isFavorite.value) {
    return store.kaomojiItems
      .filter((k) => k.useCount > 0)
      .sort((a, b) => b.useCount - a.useCount || b.createdAt - a.createdAt)
  }
  return store.kaomojiItems
    .filter((k) => k.categoryId === ui.kaomojiCategoryId)
    .sort((a, b) => a.createdAt - b.createdAt)
})

// ---------- 复制到剪贴板 ----------
async function copyKaomoji(item: { id: string; content: string }): Promise<void> {
  try {
    await navigator.clipboard.writeText(item.content)
    bumpKaomojiUse(item.id)
    showToast(`已复制：${item.content}`)
  } catch {
    showToast('复制失败，请检查剪贴板权限')
  }
}

// ---------- 删除（可撤销） ----------
function removeItem(id: string, content: string): void {
  const idx = store.kaomojiItems.findIndex((k) => k.id === id)
  if (idx < 0) return
  const backup = store.kaomojiItems[idx]
  removeKaomoji(id)
  showToast(`已删除：${content}`, () => {
    // 撤销：原样插回
    store.kaomojiItems.splice(idx, 0, backup)
  })
}

// ---------- 新增颜文字（仅非「常用」分类） ----------
const adding = ref(false)
const newContent = ref('')
const addInput = ref<HTMLInputElement | null>(null)

function startAdd(): void {
  if (isFavorite.value) return
  adding.value = true
  newContent.value = ''
  setTimeout(() => addInput.value?.focus(), 20)
}

function confirmAdd(): void {
  const content = newContent.value.trim()
  adding.value = false
  if (!content) return
  addKaomoji(content, ui.kaomojiCategoryId)
  newContent.value = ''
}

function cancelAdd(): void {
  adding.value = false
  newContent.value = ''
}

// 切换分类时关闭新增输入
watch(() => ui.kaomojiCategoryId, () => cancelAdd())
</script>

<template>
  <div class="kaomoji-grid">
    <div class="grid-header">
      <div class="grid-title">
        <Star v-if="isFavorite" :size="16" class="fav-icon" />
        <span>{{ title }}</span>
        <span class="grid-count">{{ items.length }}</span>
      </div>
      <button
        v-if="!isFavorite"
        class="icon-btn accent"
        data-tip="新增颜文字"
        data-tip-dir="bottom"
        @click="startAdd"
      >
        <Plus :size="18" />
      </button>
    </div>

    <div class="grid-scroll">
      <div v-if="items.length === 0 && !adding" class="empty-hint">
        <template v-if="isFavorite">还没有常用颜文字，去复制几次就会出现在这里</template>
        <template v-else>这个分类还没有颜文字，点右上角「+」添加</template>
      </div>

      <div class="grid">
        <!-- 新增输入格 -->
        <div v-if="adding" class="cell add-cell">
          <input
            ref="addInput"
            v-model="newContent"
            class="add-input"
            type="text"
            placeholder="输入颜文字，回车确认"
            @keydown.enter="confirmAdd"
            @keydown.esc="cancelAdd"
            @blur="confirmAdd"
          />
          <button class="add-cancel" @click="cancelAdd"><X :size="14" /></button>
        </div>

        <!-- 颜文字格子 -->
        <div
          v-for="item in items"
          :key="item.id"
          class="cell"
          :title="`点击复制：${item.content}`"
          @click="copyKaomoji(item)"
        >
          <span class="kao-text">{{ item.content }}</span>
          <button
            class="cell-del"
            data-tip="删除"
            data-tip-dir="top"
            @click.stop="removeItem(item.id, item.content)"
          >
            <Trash2 :size="13" />
          </button>
          <span v-if="isFavorite" class="use-count" :title="`已使用 ${item.useCount} 次`">
            {{ item.useCount }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kaomoji-grid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.grid-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.grid-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}
.grid-count {
  font-size: 12px;
  color: var(--text-placeholder);
  font-weight: 400;
}
.fav-icon {
  color: #f5a623;
}

.grid-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 32px;
}

.empty-hint {
  color: var(--text-placeholder);
  font-size: 13px;
  text-align: center;
  padding: 60px 20px;
  line-height: 1.6;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.cell {
  position: relative;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    transform 0.1s ease;
  text-align: center;
}
.cell:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.cell:active {
  transform: scale(0.97);
}

.kao-text {
  font-size: 15px;
  line-height: 1.25;
  overflow-wrap: anywhere;
  word-break: break-word;
  user-select: none;
}

.cell-del {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-placeholder);
  opacity: 0;
  transition:
    opacity 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}
.cell:hover .cell-del {
  opacity: 1;
}
.cell-del:hover {
  background: rgba(255, 77, 79, 0.12);
  color: var(--red);
}

.use-count {
  position: absolute;
  bottom: 4px;
  right: 6px;
  font-size: 10px;
  color: var(--text-placeholder);
}

/* 新增输入格 */
.add-cell {
  flex-direction: column;
  gap: 6px;
  cursor: default;
  padding: 8px;
}
.add-cell:hover {
  border-color: var(--accent);
  background: var(--bg-card);
}
.add-input {
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: var(--bg);
  color: var(--text);
  font-size: 15px;
  text-align: center;
  outline: none;
}
.add-cancel {
  align-self: flex-end;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}
.add-cancel:hover {
  background: var(--hover);
  color: var(--red);
}

.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.icon-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.icon-btn.accent {
  background: var(--accent);
  color: #fff;
}
.icon-btn.accent:hover {
  background: var(--accent-hover);
  color: #fff;
}
</style>
