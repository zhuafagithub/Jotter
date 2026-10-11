<script setup lang="ts">
/**
 * 小记 Jotter 品牌标识：
 * 字母 J 与对勾融合的连续线条，同时覆盖「笔记」与「待办完成」。
 * variant="card" 白底圆角卡 + 品牌蓝图形（用于应用图标）
 * variant="white" 单色图形（用于侧边栏蓝底 logo 位）
 */
withDefaults(
  defineProps<{
    variant?: 'card' | 'white'
    size?: number
  }>(),
  { variant: 'card', size: 36 },
)
</script>

<template>
  <svg
    v-if="variant === 'card'"
    :width="size"
    :height="size"
    viewBox="0 0 1024 1024"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="96" y="96" width="832" height="832" rx="192" fill="#FFFFFF" />
    <!-- J 竖笔向下、底部圆滑左拐成 U 型钩；长勾自竖笔底部向右上扬起（一体连续） -->
    <path
      d="M512 306 V545 C512 662 470 720 378 720 C318 720 306 690 306 640 V590"
      stroke="#5B8DEF"
      stroke-width="96"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path d="M492 660 L722 455" stroke="#5B8DEF" stroke-width="96" stroke-linecap="round" />
  </svg>

  <svg
    v-else
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- J 竖笔向下、底部圆滑左拐成 U 型钩；长勾自竖笔底部向右上扬起（一体连续） -->
    <path
      d="M32 19.125 V34.0625 C32 41.375 29.375 45 23.625 45 C19.875 45 19.125 43.125 19.125 40 V36.875"
      stroke="currentColor"
      stroke-width="6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path d="M30.75 41.25 L45.125 28.4375" stroke="currentColor" stroke-width="6" stroke-linecap="round" />
  </svg>
</template>
