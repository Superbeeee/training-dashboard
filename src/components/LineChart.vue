<script setup lang="ts">
import { computed } from 'vue';

/** 輕量 SVG 折線圖。第一張圖的目的是驗證資料對不對，先不引圖表函式庫。 */
const props = withDefaults(
  defineProps<{
    series: { values: number[]; color: string }[];
    height?: number;
    xTicks?: string[];
  }>(),
  { height: 190 }
);

const W = 720;
const pad = { l: 40, r: 10, t: 10, b: 22 };

// 這些一律要 computed。資料是 fetch 來的，元件掛載時 series 還是空陣列 ——
// 算成常數的話 Math.min(...[]) 會得到 Infinity、n - 1 變 -1，路徑全是 NaN，
// 而且資料到了也不會重算。(Ring.vue 踩過同一個坑)
const scale = computed(() => {
  const all = props.series.flatMap((s) => s.values);
  const n = Math.max(0, ...props.series.map((s) => s.values.length));
  if (!all.length) return null;
  const min = Math.min(...all);
  const max = Math.max(...all);
  return { min, max, span: max - min || 1, n };
});

const x = (i: number) => {
  const s = scale.value!;
  // 只有一個點時沒有「第幾分之幾」可言，畫在左端
  return pad.l + (s.n > 1 ? i / (s.n - 1) : 0) * (W - pad.l - pad.r);
};
// Y 軸要反轉：SVG 的 y 往下長，但圖表的值往上長
const y = (v: number) => {
  const s = scale.value!;
  return pad.t + (1 - (v - s.min) / s.span) * (props.height - pad.t - pad.b);
};

const path = (vals: number[]) =>
  vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

const gridVals = computed(() => {
  const s = scale.value;
  return s ? [s.min, s.min + s.span / 2, s.max] : [];
});
</script>

<template>
  <!-- 資料還沒到就別畫。畫一張空的比說「還在載入」更難懂 -->
  <div v-if="!scale" class="sub py-6">讀取中⋯</div>

  <div v-else class="w-full overflow-x-auto">
    <svg :viewBox="`0 0 ${W} ${height}`" width="100%" :height="height">
      <g v-for="(g, i) in gridVals" :key="i">
        <line :x1="pad.l" :x2="W - pad.r" :y1="y(g)" :y2="y(g)" stroke="#243040" />
        <text x="4" :y="y(g) + 4" fill="#8b98a8" font-size="10">
          {{ g.toFixed(g > 100 ? 0 : 1) }}
        </text>
      </g>
      <path
        v-for="(s, i) in series"
        :key="`s${i}`"
        :d="path(s.values)"
        fill="none"
        :stroke="s.color"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <text
        v-for="(t, i) in xTicks"
        :key="`t${i}`"
        :x="x((i / ((xTicks?.length ?? 1) - 1)) * (scale.n - 1))"
        :y="height - 6"
        fill="#8b98a8"
        font-size="10"
        :text-anchor="i === 0 ? 'start' : i === (xTicks?.length ?? 1) - 1 ? 'end' : 'middle'"
      >
        {{ t }}
      </text>
    </svg>
  </div>
</template>
