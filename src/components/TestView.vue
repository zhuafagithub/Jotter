<script setup lang="ts">
import { FlaskConical } from 'lucide-vue-next'
</script>

<template>
  <div class="test-view">
    <div class="test-card">
      <div class="test-icon">
        <FlaskConical :size="26" />
      </div>
      <div class="test-title">测试功能</div>
      <div class="test-sub">预留扩展位，用于后续功能调试与实验</div>
    </div>
  </div>
</template>

<style scoped>
.test-view {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.test-card {
  width: 320px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 32px 24px;
  text-align: center;
}

.test-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 14px;
  border-radius: 14px;
  background: var(--accent-soft);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.test-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.test-sub {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
