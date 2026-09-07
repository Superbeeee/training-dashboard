<script setup lang="ts">
/** 六場全馬疊圖。橫軸怎麼選是這頁的重點 —— 見 X_AXIS 的三段說明。 */
import { ref, computed, onMounted } from 'vue';
import RaceChart from '../components/RaceChart.vue';
import { useReplay, stateAt, windowAt } from '../lib/replay';
import { RACES, X_AXIS, loadRace, mmss, type Race, type XAxis } from '../lib/races';

const loaded = ref<Race[]>([]);
const error = ref<string | null>(null);
const axis = ref<XAxis>('dist');
const field = ref<'p' | 'hr'>('p');
const off = ref<Set<string>>(new Set());

// 顏色照氣溫排：越熱越紅。文獻說溫度是影響最顯著的環境變數（見 races.ts）
const COLORS = ['#4ea8ff', '#3fc9c0', '#5ecb7a', '#e0c34a', '#ef8f4a', '#ff5c5c'];
const byTemp = [...RACES].sort((a, b) => a.temp - b.temp);
const colorOf = (slug: string) => COLORS[byTemp.findIndex((r) => r.slug === slug)] ?? '#888';

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
const allOn = computed(() => off.value.size === 0);

onMounted(async () => {
  try {
    loaded.value = await Promise.all(RACES.map((r) => loadRace(r.slug)));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
  // 手機上預設只開三場。六條線疊在 300px 寬的圖裡本來就分不開 ——
  // 與其給一團看不懂的東西再叫使用者自己關,不如先給看得懂的,
  // 想比全部再自己開。桌機空間夠,維持六條全開。
  if (window.innerWidth < 480) {
    off.value = new Set(['xinyi24', 'testrace', 'fukuoka']);
  }
});

const total = computed(() => loaded.value.reduce((n, r) => n + r.points.length, 0));

// ── 回放 ────────────────────────────────────────────────
// 最長那場決定總長度,不然台東還沒跑完就停了
const longest = computed(() => Math.max(0, ...shown.value.map((r) => r.points.at(-1)?.t ?? 0)));
const rp = useReplay(() => longest.value);
const SPEEDS = [30, 60, 120, 300];

/** 播放頭在圖上的位置。橫軸是什麼單位,它就要換算成什麼單位。 */
const playhead = computed(() => {
  if (!rp.t.value && !rp.playing.value) return null;
  // 兩條軸都沒有單一對應 —— 六場在同一秒跑到的距離不同。
  // 用「顯示中第一場」的位置當基準,其餘靠圓點各自標示。
  const lead = shown.value[0];
  if (!lead) return null;
  const s = stateAt(lead.points, rp.t.value);
  if (!s) return null;
  return axis.value === 'dist' ? s.d : s.t / (lead.points.at(-1)!.t || 1);
});

/** 六場在當下這一秒的狀態。這份清單同時當圖例、選擇器與即時看板 ——
 *  閒置時顯示成績,播放時換成當下的距離、配速、心率。 */
const live = computed(() =>
  RACES.map((r) => {
    const race = loaded.value.find((x) => x.slug === r.slug);
    const on = !off.value.has(r.slug);
    const s = race && on ? stateAt(race.points, rp.t.value) : null;
    const w = race && on ? windowAt(race.points, rp.t.value) : { pace: null, hr: null };
    return { ...r, on, color: colorOf(r.slug), dist: s?.d ?? null, ...w,
             done: !!race && rp.t.value >= (race.points.at(-1)?.t ?? 0) };
  }),
);

/** 播放中依當下距離排名;沒播放就照氣溫排(跟顏色一致) */
const ranked = computed(() => {
  if (!replaying.value) return live.value;
  return [...live.value].sort((a, b) => (b.dist ?? -1) - (a.dist ?? -1));
});
const replaying = computed(() => rp.t.value > 0);

const clock = (sec: number) =>
  `${Math.floor(sec / 3600)}:${String(Math.floor(sec % 3600 / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
</script>

<template>
  <div v-if="error" class="note note-warn mb-3">讀不到比賽資料：{{ error }}</div>
  <div v-else-if="!loaded.length" class="sub py-6">讀取中⋯</div>

  <template v-else>
    <div class="card">
      <div class="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <h2 class="card-h !mb-0">六場全馬疊圖</h2>
        <div class="flex gap-4 flex-wrap items-center">
          <span class="flex items-center gap-1.5">
            <span class="text-[11px] text-dim">縱軸</span>
            <button
              v-for="f in [{ k: 'p', l: '配速' }, { k: 'hr', l: '心率' }]" :key="f.k"
              class="pill" :class="{ 'pill-on': field === f.k }"
              @click="field = f.k as 'p' | 'hr'"
            >{{ f.l }}</button>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="text-[11px] text-dim">橫軸</span>
            <button
              v-for="(v, k) in X_AXIS" :key="k"
              class="pill" :class="{ 'pill-on': axis === k }"
              :title="v.hint"
              @click="axis = k as XAxis"
            >{{ v.label }}</button>
          </span>
        </div>
      </div>

      <RaceChart :races="shown" :axis="axis" :field="field" :color-of="colorOf" :playhead="playhead" />

      <!-- 回放。資料早就在瀏覽器裡了,這裡只是按時間軸重讀一遍 -->
      <div class="flex items-center gap-2.5 mt-3 flex-wrap">
        <button class="pill pill-on !px-3" @click="rp.toggle()">
          {{ rp.playing.value ? '暫停' : '播放' }}
        </button>
        <span class="tnum text-[13px] w-[72px]">{{ clock(rp.t.value) }}</span>
        <input
          type="range" class="flex-1 min-w-[140px] accent-[#23d3a0]"
          :min="0" :max="longest" :value="rp.t.value"
          @input="rp.seek(+($event.target as HTMLInputElement).value)"
        >
        <span class="flex gap-1">
          <button
            v-for="s in SPEEDS" :key="s" class="pill !px-2 text-[11px]"
            :class="{ 'pill-on': rp.speed.value === s }"
            @click="rp.speed.value = s"
          >{{ s }}×</button>
        </span>
        <button v-if="replaying" class="pill !px-2 text-[11px]" @click="rp.seek(0)">歸零</button>
      </div>

      <!-- 一份清單三個角色:圖例、選擇器、即時看板。
           點一下切換顯示;播放時整列換成當下的距離/配速/心率並依名次重排 -->
      <!-- @container:讓底下的斷點看「這個容器」而不是視窗寬度。
           用 sm: 的話,把儀表板放進窄欄位時 media query 不會觸發 ——
           而 canvas 的降採樣量的是容器寬度,兩邊判準不一致就會對不上 -->
      <div class="@container mt-3 border-t border-line">
        <button
          v-for="(l, i) in ranked" :key="l.slug"
          type="button"
          class="w-full flex items-center gap-2.5 text-[13px] tnum py-2 px-1
                 border-b border-[#1d2632] cursor-pointer text-left
                 hover:bg-[#161f2b] transition-colors"
          :class="l.on ? '' : 'opacity-35'"
          :title="l.on ? '點一下隱藏' : '點一下顯示'"
          @click="toggle(l.slug)"
        >
          <span v-if="replaying && l.on" class="w-4 text-dim text-[11px]">{{ i + 1 }}</span>
          <span
            class="w-2.5 h-2.5 rounded-sm shrink-0"
            :style="{ background: l.on ? l.color : 'transparent',
                      boxShadow: l.on ? 'none' : `inset 0 0 0 1.5px ${l.color}` }"
          />
          <span class="flex-1 min-w-0 truncate">{{ l.name }}</span>

          <template v-if="replaying && l.on">
            <span class="w-14 text-right">{{ l.dist != null ? (l.dist / 1000).toFixed(2) + 'k' : '—' }}</span>
            <span class="w-16 text-right">{{ l.pace ? mmss(l.pace) : '—' }}</span>
            <span class="w-12 text-right hidden @sm:inline" :class="l.hr && l.hr >= 175 ? 'text-warn' : ''">
              {{ l.hr ? l.hr.toFixed(0) : '—' }}
            </span>
            <span class="w-8 text-right text-[11px] text-accent hidden @sm:inline">{{ l.done ? '完賽' : '' }}</span>
          </template>
          <template v-else>
            <span class="w-16 text-right text-dim">{{ hhmm(l.finish) }}</span>
            <!-- 窄螢幕藏掉配速與氣溫,把寬度讓給名稱 ——
                 名稱被截成「臺北⋯」的話,兩場臺北馬就分不出來了 -->
            <span class="w-16 text-right text-dim hidden @sm:inline">{{ pace(l) }}</span>
            <span class="w-12 text-right text-dim hidden @sm:inline">{{ l.temp }}°</span>
            <span class="w-8 hidden @sm:inline" />
          </template>
        </button>

        <div class="flex items-center justify-between pt-2 text-[11px] text-dim">
          <!-- 窄容器藏掉了後面幾欄,說明文字要跟著變,不然會標到看不見的欄位 -->
          <span class="@sm:hidden">{{ replaying ? '距離 · 配速（30 秒平均）' : '完賽時間' }}</span>
          <span class="hidden @sm:inline">
            {{ replaying ? '距離 · 配速 · 心率（30 秒平均）' : '完賽 · 配速 · 氣溫' }}
          </span>
          <button v-if="!allOn" class="pill !px-2 !py-0.5 text-[11px]" @click="off = new Set()">
            全部顯示
          </button>
        </div>
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
      <h2 class="card-h">六場明細</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-[13px] border-collapse tnum">
          <thead>
            <tr class="text-dim text-[11px] uppercase tracking-wide">
              <th v-for="h in ['賽事', '日期', '完賽', '配速', '距離', '氣溫', '露點', '逐秒點數']" :key="h"
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
              <td class="py-2 px-2.5" :class="meta(r.slug).temp >= 22 ? 'text-warn' : ''">{{ meta(r.slug).temp }}°</td>
              <td class="py-2 px-2.5 text-dim">{{ meta(r.slug).dew }}°</td>
              <td class="py-2 px-2.5 text-dim">{{ r.points.length.toLocaleString() }}</td>
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
