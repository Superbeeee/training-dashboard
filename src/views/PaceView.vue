<script setup lang="ts">
/**
 * 配速計算機。輸入一場成績 → VDOT → 其他距離的等效成績 + 五個訓練區間。
 *
 * 刻意**不預測 12/20 臺北馬**。這裡算的都是「等效」而不是「預測」:
 * 等效講的是「同樣的體能換算到別的距離會是多少」,預測講的是
 * 「那天你會跑多少」—— 後者要考慮天氣、狀態、賽道，這個計算機一個都不知道。
 */
import { ref, computed, watch } from 'vue';
import { vdot, timeFromVdot, riegel, DISTANCES, ZONES, paceForPct } from '../lib/pace';
import { RACES, mmss } from '../lib/races';

const src = ref<number>(42195);
const hh = ref(3), mm = ref(22), ss = ref(7);

const seconds = computed(() => hh.value * 3600 + mm.value * 60 + ss.value);
const v = computed(() => (seconds.value > 60 ? vdot(seconds.value, src.value) : 0));

const hms = (s: number) =>
  `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const equiv = computed(() =>
  DISTANCES.map((d) => ({
    ...d,
    // 兩種算法並列 —— 它們在半馬幾乎一致，越短分歧越大
    vdot: timeFromVdot(v.value, d.m),
    riegel: riegel(seconds.value, src.value, d.m),
  })),
);

const zones = computed(() =>
  ZONES.map((z) => {
    const perKm = paceForPct(v.value, z.pct);
    return { ...z, perKm, per400: perKm * 0.4 };
  }),
);

/** 帶入一場實績。六場都在 races.ts 裡，不用自己敲。 */
const filled = ref<string | null>(null);

function fill(r: typeof RACES[number]) {
  src.value = Math.round(r.km * 1000);
  hh.value = Math.floor(r.finish / 3600);
  mm.value = Math.floor((r.finish % 3600) / 60);
  ss.value = r.finish % 60;
  filled.value = r.slug;
}

// 手動改任何一格就不再算是「帶入實績」
watch([src, hh, mm, ss], () => {
  const r = RACES.find((x) => x.slug === filled.value);
  if (!r) return;
  const t = hh.value * 3600 + mm.value * 60 + ss.value;
  if (t !== r.finish || src.value !== Math.round(r.km * 1000)) filled.value = null;
});
</script>

<template>
  <div class="card">
    <h2 class="card-h">從一場成績算等效配速</h2>

    <div class="flex items-end gap-3 flex-wrap">
      <label class="text-[13px]">
        <span class="block text-dim text-[11px] mb-1">距離（公尺）</span>
        <span class="flex items-center gap-1.5">
          <input v-model.number="src" type="number" min="400" step="5" class="inp w-24 tnum">
          <!-- 帶入實績時是各場的 GPS 實測距離（六場差 660 公尺），
               不會剛好等於標準距離，所以這裡是輸入框不是下拉 -->
          <button
            v-for="d in DISTANCES" :key="d.m"
            class="pill !px-2 text-[11px]"
            :class="{ 'pill-on': src === d.m }"
            @click="src = d.m"
          >{{ d.label }}</button>
        </span>
      </label>
      <label class="text-[13px]">
        <span class="block text-dim text-[11px] mb-1">成績</span>
        <span class="flex items-center gap-1">
          <input v-model.number="hh" type="number" min="0" max="9" class="inp w-14 tnum"> :
          <input v-model.number="mm" type="number" min="0" max="59" class="inp w-14 tnum"> :
          <input v-model.number="ss" type="number" min="0" max="59" class="inp w-14 tnum">
        </span>
      </label>
      <div class="ml-auto text-right">
        <div class="text-dim text-[11px]">VDOT</div>
        <div class="stat !text-[26px] tnum">{{ v.toFixed(1) }}</div>
      </div>
    </div>

    <div class="flex gap-1.5 flex-wrap mt-3 items-center">
      <span class="text-[11px] text-dim mr-1">帶入實績</span>
      <button
        v-for="r in RACES" :key="r.slug" class="pill"
        :class="{ 'pill-on': filled === r.slug }"
        @click="fill(r)"
      >{{ r.name }}</button>
      <span v-if="filled" class="text-[11px] text-dim ml-1">
        用該場 GPS 實測距離 {{ (src / 1000).toFixed(2) }} km
      </span>
    </div>
  </div>

  <div class="grid gap-3.5 mt-3.5 grid-cols-1 lg:grid-cols-2">
    <div class="card">
      <h2 class="card-h">其他距離的等效成績</h2>
      <table class="w-full text-[13px] border-collapse tnum">
        <thead>
          <tr class="text-dim text-[11px] uppercase tracking-wide">
            <th class="text-left py-2 px-2.5 border-b border-line font-semibold">距離</th>
            <th class="text-left py-2 px-2.5 border-b border-line font-semibold">VDOT</th>
            <th class="text-left py-2 px-2.5 border-b border-line font-semibold">Riegel</th>
            <th class="text-left py-2 px-2.5 border-b border-line font-semibold">差</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in equiv" :key="d.m" class="border-b border-[#1d2632] last:border-0">
            <td class="py-2 px-2.5">{{ d.label }}</td>
            <td class="py-2 px-2.5">{{ hms(d.vdot) }}</td>
            <td class="py-2 px-2.5">{{ hms(d.riegel) }}</td>
            <td class="py-2 px-2.5" :class="Math.abs(d.vdot - d.riegel) > 60 ? 'text-warn' : 'text-dim'">
              {{ Math.abs(d.vdot - d.riegel) < 1 ? '—' : mmss(Math.abs(d.vdot - d.riegel)) }}
            </td>
          </tr>
        </tbody>
      </table>
      <div class="note mt-3">
        <b>兩套算法並列，是因為它們會不一致。</b>
        VDOT（Daniels-Gilbert 1979）走生理模型，Riegel（1977）是一條冪次律。
        通常在半馬附近最接近，距離拉得越開分歧越大 —— 差超過一分鐘的會標黃。
      </div>
    </div>

    <div class="card">
      <h2 class="card-h">訓練配速區間</h2>
      <table class="w-full text-[13px] border-collapse tnum">
        <thead>
          <tr class="text-dim text-[11px] uppercase tracking-wide">
            <th class="text-left py-2 px-2.5 border-b border-line font-semibold">區</th>
            <th class="text-left py-2 px-2.5 border-b border-line font-semibold">%VDOT</th>
            <th class="text-left py-2 px-2.5 border-b border-line font-semibold">每公里</th>
            <th class="text-left py-2 px-2.5 border-b border-line font-semibold">每 400m</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="z in zones" :key="z.code" class="border-b border-[#1d2632] last:border-0">
            <td class="py-2 px-2.5"><b>{{ z.code }}</b> <span class="text-dim">{{ z.name }}</span></td>
            <td class="py-2 px-2.5 text-dim">{{ (z.pct * 100).toFixed(0) }}%</td>
            <td class="py-2 px-2.5">{{ mmss(z.perKm) }}</td>
            <td class="py-2 px-2.5">{{ mmss(z.per400) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="note mt-3">
        這是 Daniels 的五區，<b>跟跑班的 1A / 1B 六區不是同一套</b>。
        跑班那兩張表是教練給的，這裡是從成績反推的 —— 兩者可以對照，但不能互換。
      </div>
    </div>
  </div>

  <div class="note note-warn mt-3.5">
    <b>這裡算的是「等效」不是「預測」。</b>
    等效講的是「同樣的體能換算到別的距離會是多少」；預測講的是「那天你會跑多少」。
    後者要考慮天氣、狀態、賽道 —— 這個計算機一個都不知道，
    而六場全馬裡光是氣溫就從 12.2° 到 24.4°。
  </div>
</template>
