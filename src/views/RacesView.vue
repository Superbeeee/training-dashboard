<script setup lang="ts">
/** 六場全馬疊圖。橫軸怎麼選是這頁的重點 —— 見 X_AXIS 的三段說明。 */
import { ref, computed, onMounted } from 'vue';
import RaceChart from '../components/RaceChart.vue';
import { RACES, X_AXIS, loadRace, mmss, type Race, type XAxis } from '../lib/races';

const loaded = ref<Race[]>([]);
const error = ref<string | null>(null);
const axis = ref<XAxis>('pct');
const field = ref<'p' | 'hr'>('p');
const off = ref<Set<string>>(new Set());

// 顏色照露點排：越熱越紅。六場的完賽時間差 34 分鐘，而露點差 19.5 度
const COLORS = ['#4ea8ff', '#3fc9c0', '#5ecb7a', '#e0c34a', '#ef8f4a', '#ff5c5c'];
const byDew = [...RACES].sort((a, b) => a.dew - b.dew);
const colorOf = (slug: string) => COLORS[byDew.findIndex((r) => r.slug === slug)] ?? '#888';

const shown = computed(() => loaded.value.filter((r) => !off.value.has(r.slug)));
const meta = (slug: string) => RACES.find((r) => r.slug === slug)!;
const hhmm = (s: number) =>
  `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
// 配速用各場實測距離,不用 42.195 —— 六場 GPS 距離差到 660 公尺
const pace = (r: typeof RACES[number]) => mmss(r.finish / r.km);

function toggle(slug: string) {
  const s = new Set(off.value);
  s.has(slug) ? s.delete(slug) : s.add(slug);
  // 全部關掉的話圖是空的,至少留一場
  if (s.size < RACES.length) off.value = s;
}
/** 只看這一場。六條疊在一起要看單場細節時用。 */
function solo(slug: string) {
  off.value = new Set(RACES.filter((r) => r.slug !== slug).map((r) => r.slug));
}
const allOn = computed(() => off.value.size === 0);
const soloed = computed(() => off.value.size === RACES.length - 1);

onMounted(async () => {
  try {
    loaded.value = await Promise.all(RACES.map((r) => loadRace(r.slug)));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});

const total = computed(() => loaded.value.reduce((n, r) => n + r.points.length, 0));
</script>

<template>
  <div v-if="error" class="note note-warn mb-3">讀不到比賽資料：{{ error }}</div>
  <div v-else-if="!loaded.length" class="sub py-6">讀取中⋯</div>

  <template v-else>
    <div class="card">
      <div class="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <h2 class="card-h !mb-0">六場全馬疊圖</h2>
        <div class="flex gap-1.5 flex-wrap">
          <button
            v-for="f in [{ k: 'p', l: '配速' }, { k: 'hr', l: '心率' }]" :key="f.k"
            class="pill" :class="{ 'pill-on': field === f.k }"
            @click="field = f.k as 'p' | 'hr'"
          >{{ f.l }}</button>
          <span class="w-2" />
          <button
            v-for="(v, k) in X_AXIS" :key="k"
            class="pill" :class="{ 'pill-on': axis === k }"
            @click="axis = k as XAxis"
          >{{ v.label }}</button>
        </div>
      </div>

      <RaceChart :races="shown" :axis="axis" :field="field" :color-of="colorOf" />

      <div class="flex items-center gap-2 flex-wrap mt-3">
        <span class="text-[11px] text-dim uppercase tracking-wide mr-1">顯示</span>
        <button
          v-for="r in RACES" :key="r.slug"
          type="button"
          class="flex items-center gap-1.5 text-[12px] rounded border px-2 py-1 cursor-pointer
                 transition-opacity"
          :class="off.has(r.slug)
            ? 'opacity-40 border-[#243040] text-dim'
            : 'border-[#33465c] text-fg'"
          :title="off.has(r.slug) ? '點一下顯示' : '點一下隱藏'"
          @click="toggle(r.slug)"
        >
          <span class="w-3 text-center" :style="{ color: colorOf(r.slug) }">
            {{ off.has(r.slug) ? '○' : '●' }}
          </span>
          {{ r.name }}
          <span class="text-dim">{{ r.dew }}°</span>
        </button>

        <span class="w-1" />
        <button type="button" class="pill" :disabled="allOn"
                :class="{ 'opacity-40 cursor-not-allowed': allOn }"
                @click="off = new Set()">全部顯示</button>
      </div>

      <div class="sub !mt-2">
        想單看一場，按下面表格那一列的「只看」。
      </div>

      <div class="note mt-3">{{ X_AXIS[axis].hint }}</div>

      <details class="note mt-2">
        <summary class="cursor-pointer">露點是什麼？為什麼不看濕度</summary>
        <p class="mt-2">
          <b>露點</b>是空氣裡的水氣多到會凝結成露水的溫度 —— 越高代表水氣越多。
        </p>
        <p class="mt-2">
          跑步靠流汗散熱，而<b>汗要蒸發掉才帶得走熱</b>。空氣裡水氣越多蒸發越慢，
          散熱就越差，心率被迫拉高、配速掉下來。
        </p>
        <p class="mt-2">
          不看相對濕度是因為它會騙人：福岡 71%、台東 81%，看起來只差 10%，
          但露點差了 <b>7.8 度</b> —— 相對濕度是「相對於當下溫度」，
          同樣 80%，10 度和 25 度的實際水氣量差很多。<b>露點是絕對值。</b>
        </p>
        <p class="mt-2 text-dim">
          這六場的露點從 1.1°（東京馬，乾冷）到 20.6°（台東），跨了 19.5 度。
          數值取自 Garmin 記錄的當日天氣。
        </p>
      </details>
    </div>

    <div class="card mt-3.5">
      <h2 class="card-h">六場對照</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-[13px] border-collapse tnum">
          <thead>
            <tr class="text-dim text-[11px] uppercase tracking-wide">
              <th v-for="h in ['賽事', '日期', '完賽', '配速', '距離', '露點', '逐秒點數', '']" :key="h"
                  class="text-left py-2 px-2.5 border-b border-line font-semibold whitespace-nowrap">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in loaded" :key="r.slug" class="border-b border-[#1d2632] last:border-0">
              <td class="py-2 px-2.5">
                <i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" :style="{ background: colorOf(r.slug) }" />
                {{ meta(r.slug).name }}
              </td>
              <td class="py-2 px-2.5 text-dim">{{ r.date }}</td>
              <td class="py-2 px-2.5">{{ hhmm(meta(r.slug).finish) }}</td>
              <td class="py-2 px-2.5">{{ pace(meta(r.slug)) }}/km</td>
              <td class="py-2 px-2.5 text-dim">{{ meta(r.slug).km }} km</td>
              <td class="py-2 px-2.5" :class="meta(r.slug).dew >= 20 ? 'text-warn' : ''">{{ meta(r.slug).dew }}°</td>
              <td class="py-2 px-2.5 text-dim">{{ r.points.length.toLocaleString() }}</td>
              <td class="py-2 px-2.5">
                <button
                  type="button" class="pill !py-0.5 !px-2 text-[11px]"
                  :class="{ 'pill-on': soloed && !off.has(r.slug) }"
                  @click="soloed && !off.has(r.slug) ? off = new Set() : solo(r.slug)"
                >{{ soloed && !off.has(r.slug) ? '看全部' : '只看' }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="sub mt-3">
        共 {{ total.toLocaleString() }} 個逐秒點。圖上每條線降採樣到 900 點左右（LTTB），
        因為螢幕寬度就那麼多像素 —— 但轉折點會保留，不是每 N 點取一點。
      </div>
    </div>
  </template>
</template>
