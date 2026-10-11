<script setup lang="ts">
defineProps<{
  text: string
  sub?: string
}>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">
      <slot name="icon" />
    </div>
    <div class="empty-text">{{ text }}</div>
    <div v-if="sub" class="empty-sub">{{ sub }}</div>
  </div>
</template>

<style scoped>
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 40px 24px;
  text-align: center;
}

.empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--hover);
  color: var(--text-placeholder);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.empty-text {
  font-size: 14px;
  color: var(--text-secondary);
}

.empty-sub {
  font-size: 12px;
  color: var(--text-placeholder);
}
</style>
