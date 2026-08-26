<script setup lang="ts">
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

const all = props.series.flatMap((s) => s.values);
const min = Math.min(...all);
const max = Math.max(...all);
const span = max - min || 1;
const n = Math.max(...props.series.map((s) => s.values.length));

const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
// Y 軸要反轉：SVG 的 y 往下長，但圖表的值往上長
const y = (v: number) =>
  pad.t + (1 - (v - min) / span) * (props.height - pad.t - pad.b);

const path = (vals: number[]) =>
  vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

const gridVals = [min, min + span / 2, max];
</script>

<template>
  <div class="w-full overflow-x-auto">
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
        :x="x((i / ((xTicks?.length ?? 1) - 1)) * (n - 1))"
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
