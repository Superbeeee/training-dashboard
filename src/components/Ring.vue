<script setup lang="ts">
/**
 * 進度環。中央文字預設顯示百分比，可用 label 覆蓋。
 *
 * 「本週訓練」那張卡片刻意傳 label='2 天' 而不是讓它顯示 29%——
 * 休息日是刻意安排的，拿 7 天當分母算出來的百分比不代表達成率。
 * 等課表接進來、真的算得出達成率之後再說。
 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{ pct: number; size?: number; label?: string }>(),
  { size: 110 },
);
const r = props.size / 2 - 9;
const c = 2 * Math.PI * r;
// 必須是 computed —— 資料改成非同步載入後,pct 會在掛載之後才變,
// 寫成一般常數的話環圈會永遠停在初始值 0。
const clamped = computed(() => Math.max(0, Math.min(1, props.pct)));
</script>

<template>
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="shrink-0">
    <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="#243040" stroke-width="9" />
    <circle
      :cx="size / 2"
      :cy="size / 2"
      :r="r"
      fill="none"
      stroke="var(--color-accent)"
      stroke-width="9"
      stroke-linecap="round"
      :stroke-dasharray="`${c * clamped} ${c}`"
      :transform="`rotate(-90 ${size / 2} ${size / 2})`"
    />
    <text
      x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
      fill="#e6edf3" font-size="21" font-weight="700"
    >
      {{ label ?? `${Math.round(clamped * 100)}%` }}
    </text>
  </svg>
</template>
