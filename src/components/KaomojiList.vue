<script setup lang="ts">
import { computed, ref } from 'vue'
import { Pencil, Plus, Star, Trash2 } from 'lucide-vue-next'
import {
  createKaomojiCategory,
  removeKaomojiCategory,
  renameKaomojiCategory,
  store,
} from '../stores/data'
import { selectKaomojiCategory, ui } from '../stores/ui'
import { showToast } from '../stores/toast'

const FAVORITE_ID = 'favorite'

const categories = computed(() => [...store.kaomojiCategories].sort((a, b) => a.createdAt - b.createdAt))

/** 各分类的颜文字数量 */
const countOf = (catId: string): number =>
  store.kaomojiItems.filter((k) => k.categoryId === catId).length

/** 「常用」数量：使用过的颜文字总数 */
const favoriteCount = computed(() => store.kaomojiItems.filter((k) => k.useCount > 0).length)

function pickCategory(id: string): void {
  selectKaomojiCategory(id)
}

// ---------- 新增分类 ----------
const adding = ref(false)
const newName = ref('')
const addInput = ref<HTMLInputElement | null>(null)

function startAdd(): void {
  adding.value = true
  newName.value = ''
  setTimeout(() => addInput.value?.focus(), 20)
}

function confirmAdd(): void {
  const name = newName.value.trim()
  adding.value = false
  if (!name) return
  const cat = createKaomojiCategory(name)
  selectKaomojiCategory(cat.id)
  showToast('已新增分类')
}

function cancelAdd(): void {
  adding.value = false
  newName.value = ''
}

// ---------- 重命名分类 ----------
const renamingId = ref<string | null>(null)
const renameName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function startRename(id: string, current: string): void {
  renamingId.value = id
  renameName.value = current
  setTimeout(() => renameInput.value?.focus(), 20)
}

function confirmRename(id: string): void {
  const name = renameName.value.trim()
  renamingId.value = null
  if (!name) return
  renameKaomojiCategory(id, name)
}

// ---------- 删除分类（可撤销） ----------
function removeCategory(id: string, name: string): void {
  // 备份该分类下的条目用于撤销
  const itemsInCat = store.kaomojiItems.filter((k) => k.categoryId === id)
  removeKaomojiCategory(id)
  // 若当前选中的是被删分类，切回常用
  if (ui.kaomojiCategoryId === id) selectKaomojiCategory(FAVORITE_ID)
  showToast(`已删除分类「${name}」`, () => {
    // 撤销：重新创建分类并恢复条目
    const restored = createKaomojiCategory(name)
    itemsInCat.forEach((k) => {
      // 直接写回，避免 addKaomoji 重复校验
      store.kaomojiItems.push({ ...k, id: k.id, categoryId: restored.id })
    })
    selectKaomojiCategory(restored.id)
  })
}
</script>

<template>
  <div class="kaomoji-list">
    <div class="list-header">
      <div class="list-title">颜文字</div>
      <button class="icon-btn accent" data-tip="新增分类" data-tip-dir="bottom" @click="startAdd">
        <Plus :size="18" />
      </button>
    </div>

    <div class="list-scroll">
      <!-- 新增分类输入行 -->
      <div v-if="adding" class="item add-row">
        <input
          ref="addInput"
          v-model="newName"
          class="cat-input"
          type="text"
          placeholder="输入分类名，回车确认"
          maxlength="12"
          @keydown.enter="confirmAdd"
          @keydown.esc="cancelAdd"
          @blur="confirmAdd"
        />
      </div>

      <!-- 常用（固定置顶） -->
      <button
        class="item"
        :class="{ selected: ui.kaomojiCategoryId === FAVORITE_ID }"
        @click="pickCategory(FAVORITE_ID)"
      >
        <Star :size="15" class="fav-icon" />
        <span class="cat-name">常用</span>
        <span class="cat-count">{{ favoriteCount }}</span>
      </button>

      <!-- 用户分类 -->
      <button
        v-for="cat in categories"
        :key="cat.id"
        class="item"
        :class="{ selected: ui.kaomojiCategoryId === cat.id }"
        @click="pickCategory(cat.id)"
      >
        <template v-if="renamingId === cat.id">
          <input
            ref="renameInput"
            v-model="renameName"
            class="cat-input"
            type="text"
            maxlength="12"
            @click.stop
            @keydown.enter="confirmRename(cat.id)"
            @keydown.esc="renamingId = null"
            @blur="confirmRename(cat.id)"
          />
        </template>
        <template v-else>
          <span class="cat-name">{{ cat.name }}</span>
          <span class="cat-count">{{ countOf(cat.id) }}</span>
          <span class="item-actions">
            <button
              class="icon-btn subtle"
              data-tip="重命名"
              @click.stop="startRename(cat.id, cat.name)"
            >
              <Pencil :size="13" />
            </button>
            <button
              class="icon-btn subtle danger"
              data-tip="删除分类"
              @click.stop="removeCategory(cat.id, cat.name)"
            >
              <Trash2 :size="13" />
            </button>
          </span>
        </template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.kaomoji-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-list);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.list-title {
  font-size: 14px;
  font-weight: 600;
}

.list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.item {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text);
  text-align: left;
  transition: background 0.15s ease;
  margin-bottom: 2px;
}
.item:hover {
  background: var(--hover);
}
.item.selected {
  background: var(--selected);
}

.cat-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cat-count {
  font-size: 11px;
  color: var(--text-placeholder);
  flex-shrink: 0;
}

.fav-icon {
  color: #f5a623;
  flex-shrink: 0;
}

.item-actions {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.item:hover .item-actions {
  display: flex;
}

.icon-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.icon-btn:hover {
  background: var(--accent-soft);
  color: var(--accent);
}
.icon-btn.accent {
  background: var(--accent);
  color: #fff;
}
.icon-btn.accent:hover {
  background: var(--accent-hover);
  color: #fff;
}
.icon-btn.danger:hover {
  background: rgba(255, 77, 79, 0.1);
  color: var(--red);
}

.cat-input {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  outline: none;
}

.add-row {
  background: var(--accent-soft);
}
</style>
