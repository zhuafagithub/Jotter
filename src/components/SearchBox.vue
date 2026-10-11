<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'

defineProps<{ modelValue: string; placeholder?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <div class="search-box">
    <Search :size="14" class="s-icon" />
    <input
      :value="modelValue"
      class="s-input"
      :placeholder="placeholder ?? '搜索…'"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button v-if="modelValue" class="s-clear" @click="emit('update:modelValue', '')">
      <X :size="13" />
    </button>
  </div>
</template>

<style scoped>
.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 12px 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 5px 9px;
  transition: border-color 0.15s ease;
}
.search-box:focus-within {
  border-color: var(--accent);
}

.s-icon {
  color: var(--text-placeholder);
  flex-shrink: 0;
}

.s-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
}
.s-input::placeholder {
  color: var(--text-placeholder);
}

.s-clear {
  color: var(--text-placeholder);
  display: inline-flex;
  border-radius: 4px;
}
.s-clear:hover {
  color: var(--text);
}
</style>
