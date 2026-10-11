<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import type { TodoSort } from '../types'

const props = defineProps<{
  modelValue: TodoSort
  options: { value: TodoSort; label: string }[]
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: TodoSort): void }>()

const open = ref(false)
const current = computed(() => props.options.find((o) => o.value === props.modelValue))

function pick(value: TodoSort): void {
  emit('update:modelValue', value)
  open.value = false
}
</script>

<template>
  <div class="sort-menu">
    <button class="sort-trigger" @click="open = !open">
      <span>{{ current?.label }}</span>
      <ChevronDown :size="13" :class="{ rotated: open }" />
    </button>
    <Transition name="pop">
      <div v-if="open" class="menu-pop">
        <button
          v-for="opt in options"
          :key="opt.value"
          class="menu-item"
          @click="pick(opt.value)"
        >
          <span class="menu-label">{{ opt.label }}</span>
          <Check v-if="opt.value === modelValue" :size="14" class="menu-check" />
        </button>
      </div>
    </Transition>
    <div v-if="open" class="menu-mask" @click="open = false" />
  </div>
</template>

<style scoped>
.sort-menu {
  position: relative;
}

.sort-trigger {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 6px;
  border-radius: 6px;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.sort-trigger:hover {
  background: var(--hover);
  color: var(--text);
}
.sort-trigger :deep(svg) {
  transition: transform 0.18s ease;
}
.sort-trigger :deep(svg.rotated) {
  transform: rotate(180deg);
}

.menu-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.menu-pop {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 128px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
  padding: 4px;
  z-index: 41;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
  transition: background 0.15s ease;
}
.menu-item:hover {
  background: var(--hover);
}

.menu-check {
  color: var(--accent);
  flex-shrink: 0;
}
</style>
