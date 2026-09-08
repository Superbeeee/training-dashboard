<script setup lang="ts">
/** 六場全馬疊圖。橫軸怎麼選是這頁的重點 —— 見 X_AXIS 的三段說明。 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import RaceChart from '../components/RaceChart.vue';
import RaceBands from '../components/RaceBands.vue';
import { useReplay, stateAt, windowAt } from '../lib/replay';
import { RACES, X_AXIS, loadRace, mmss, type Race, type XAxis } from '../lib/races';

/** 這張卡片的實際寬度。**不用 window.innerWidth** —— 儀表板可能被放進
 *  窄欄位裡,那時視窗很寬但容器很窄。圖表的降採樣、清單的欄位隱藏
 *  都是看容器,這裡要跟它們同一個判準。 */
const card = ref<HTMLElement | null>(null);
const cardW = ref(800);
let ro: ResizeObserver | null = null;

const loaded = ref<Race[]>([]);
const error = ref<string | null>(null);
const axis = ref<XAxis>('dist');
/** 色帶或折線。
 *
 *  **窄螢幕預設色帶**:六條線疊在 300px 寬的畫面裡本來就分不開,不管
 *  怎麼平滑、怎麼降採樣都一樣 —— 線與線交錯的地方就是讀不出來。色帶
 *  一場一條、互不遮蔽,而且色階的跳變比線的轉折更容易被眼睛抓到。
 *
 *  桌機空間夠,折線讀得出精確數值,所以維持折線。兩邊都留切換鈕,
 *  預設只是「大部分情況下比較好用的那個」。 */
const mode = ref<'band' | 'line'>('line');
let modeAuto = true;
function setMode(m: 'band' | 'line') {
  mode.value = m;
  modeAuto = false;          // 使用者選過就不再自動切
}
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

  // 卡片在 v-else 裡,資料載完才存在 —— 要等 DOM 更新完才量得到
  await nextTick();
  if (card.value) {
    cardW.value = card.value.clientWidth;
    // 同樣只認寬度 —— 切換色帶/折線會改變卡片高度,不該回頭觸發自己
    ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w !== cardW.value) cardW.value = w;
    });
    ro.observe(card.value);
  }
});

// 窄容器預設只開三場(最快/中間/最慢)。六條線疊在 300px 寬的圖裡本來就
// 分不開 —— 與其給一團看不懂的東西再叫使用者自己關,不如先給看得懂的。
// 只在第一次變窄時套用,之後尊重使用者自己的選擇。
/** 放大檢視。手機直立時六條線擠在 300px 裡本來就讀不了 ——
 *  與其把線一直磨平,不如借用另一個方向的空間。 */
const zoomed = ref(false);
/** 直立時要把內容轉 90 度。不能用 screen.orientation.lock() ——
 *  iOS Safari 不支援,而且那需要先進入 fullscreen。CSS 轉向到處都能用,
 *  使用者真的把手機轉過來時再取消(見 portrait)。 */
const portrait = ref(false);
let mq: MediaQueryList | null = null;

function openZoom() {
  zoomed.value = true;
  document.body.style.overflow = 'hidden';   // 蓋住時別讓底下捲
}
function closeZoom() {
  zoomed.value = false;
  document.body.style.overflow = '';
}

/** 放大後圖的高度。直立轉 90 度的話,可用高度是螢幕的寬度。 */
const zoomH = computed(() => {
  // 直立轉 90 度的話,可用高度是螢幕的「寬度」
  const h = portrait.value ? window.innerWidth : window.innerHeight;
  // 扣掉上方控制列(約 34)、下方圖例(約 40)、內距與間隙(約 46)
  return Math.max(180, h - 120);
});

watch(cardW, (w) => {
  if (!w || !modeAuto) return;
  mode.value = w < 480 ? 'band' : 'line';
});

onMounted(() => {
  mq = matchMedia('(orientation: portrait)');
  portrait.value = mq.matches;
  mq.addEventListener('change', (e) => (portrait.value = e.matches));
});

onBeforeUnmount(() => {
  ro?.disconnect();
  document.body.style.overflow = '';
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

/** 當下心率最高的那一場。標它而不是用絕對門檻 —— 門檻要嘛憑感覺訂,
 *  要嘛得先確定最大心率,而回放要看的本來就是「此刻誰最吃力」。 */
const topHr = computed(() => {
  const withHr = live.value.filter((l) => l.on && l.hr != null);
  if (withHr.length < 2) return null;      // 只有一場就沒有比較的意義
  return withHr.reduce((a, b) => (b.hr! > a.hr! ? b : a)).slug;
});

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
    <div ref="card" class="card">
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
          <button
            v-if="cardW < 480"
            type="button" class="pill !px-2 text-[11px]"
            @click="openZoom"
          >放大</button>
          <span class="flex items-center gap-1.5">
            <span class="text-[11px] text-dim">呈現</span>
            <button
              v-for="m in [{ k: 'band', l: '色帶' }, { k: 'line', l: '折線' }]" :key="m.k"
              class="pill" :class="{ 'pill-on': mode === m.k }"
              @click="setMode(m.k as 'band' | 'line')"
            >{{ m.l }}</button>
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

      <div>
        <RaceBands
          v-if="mode === 'band'"
          :races="shown" :axis="axis" :field="field" :playhead="playhead"
          :height="Math.max(200, shown.length * 44 + 40)"
        />
        <RaceChart
          v-else
          :races="shown" :axis="axis" :field="field" :color-of="colorOf" :playhead="playhead"
        />
      </div>

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
          <!-- 色帶模式下顏色代表配速,不代表哪一場 —— 這裡就不能再用賽事色,
               否則同一個顏色在圖上與清單裡是兩個意思 -->
          <span
            class="w-2.5 h-2.5 rounded-sm shrink-0"
            :style="{ background: !l.on ? 'transparent'
                        : mode === 'band' ? '#8b98a8' : l.color,
                      boxShadow: l.on ? 'none'
                        : `inset 0 0 0 1.5px ${mode === 'band' ? '#8b98a8' : l.color}` }"
          />
          <span class="flex-1 min-w-0 truncate">{{ l.name }}</span>

          <template v-if="replaying && l.on">
            <span class="w-14 text-right">{{ l.dist != null ? (l.dist / 1000).toFixed(2) + 'k' : '—' }}</span>
            <span class="w-16 text-right">{{ l.pace ? mmss(l.pace) : '—' }}</span>
            <span class="w-12 text-right hidden @sm:inline" :class="l.slug === topHr ? 'text-warn' : ''">
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
            {{ replaying ? '距離 · 配速 · 心率（30 秒平均，標黃的是此刻最高）' : '完賽 · 配速 · 氣溫' }}
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

  <!-- 放大檢視:借用另一個方向的空間。
       直立時把整層轉 90 度 —— 手機高度變成圖的寬度,300px 變成 800px。
       使用者自己把手機轉橫的話就不用轉了(portrait 會變 false)。 -->
  <Teleport to="body">
    <div
      v-if="zoomed"
      class="fixed inset-0 z-50 bg-ink"
      :style="portrait
        ? { width: '100vh', height: '100vw',
            transform: 'rotate(90deg) translateY(-100%)', transformOrigin: 'top left' }
        : {}"
    >
      <div class="h-full flex flex-col p-3 gap-2">
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[13px] font-bold">六場全馬</span>
          <span class="flex gap-1">
            <button
              v-for="f in [{ k: 'p', l: '配速' }, { k: 'hr', l: '心率' }]" :key="f.k"
              class="pill !px-2 text-[11px]" :class="{ 'pill-on': field === f.k }"
              @click="field = f.k as 'p' | 'hr'"
            >{{ f.l }}</button>
          </span>
          <span class="flex gap-1">
            <button
              v-for="(v, k) in X_AXIS" :key="k"
              class="pill !px-2 text-[11px]" :class="{ 'pill-on': axis === k }"
              @click="axis = k as XAxis"
            >{{ v.label }}</button>
          </span>
          <button class="pill !px-2 text-[11px] ml-auto" @click="closeZoom">關閉</button>
        </div>

        <div class="flex-1 min-h-0">
          <RaceBands
            v-if="mode === 'band'"
            :races="shown" :axis="axis" :field="field" :playhead="playhead" :height="zoomH"
          />
          <RaceChart
            v-else
            :races="shown" :axis="axis" :field="field"
            :color-of="colorOf" :playhead="playhead" :height="zoomH"
          />
        </div>

        <div class="flex gap-2.5 flex-wrap shrink-0 text-[11px]">
          <button
            v-for="r in RACES" :key="r.slug" type="button"
            class="flex items-center gap-1 cursor-pointer"
            :class="off.has(r.slug) ? 'opacity-35' : ''"
            @click="toggle(r.slug)"
          >
            <span class="w-2 h-2 rounded-sm"
                  :style="{ background: off.has(r.slug) ? 'transparent'
                              : mode === 'band' ? '#8b98a8' : colorOf(r.slug),
                            boxShadow: off.has(r.slug)
                              ? `inset 0 0 0 1.5px ${mode === 'band' ? '#8b98a8' : colorOf(r.slug)}` : 'none' }" />
            {{ r.name }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
