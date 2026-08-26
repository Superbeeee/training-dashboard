<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import LineChart from '../components/LineChart.vue';
import Ring from '../components/Ring.vue';
import MenuDropdown from '../components/MenuDropdown.vue';
import { RACE_DAY, loadSeries, weeklyVolume } from '../data/fixtures';
import {
  loadSessions, loadWeighings, weekView, daysSince, latestInterval,
  PACE_UNITS, paceOver, METRIC_COLS, DEFAULT_COLS, KIND_META, KINDS,
  type Session, type Weighing, type PaceUnit,
} from '../lib/training';

const daysToRace = Math.ceil((RACE_DAY.getTime() - Date.now()) / 86400000);
const last = loadSeries[loadSeries.length - 1];
const tick = (arr: { date: string }[], i: number) => arr[i].date.slice(5);

// 真實資料：由 parse_logs.py 產生、launchd 每天 07:00 更新
const sessions = ref<Session[]>([]);
const weighings = ref<Weighing[]>([]);
const loadError = ref<string | null>(null);

// 0 是本週，-1 是上週。往未來翻沒有意義，所以上限是 0
const weekOffset = ref(0);
const week = computed(() => weekView(sessions.value, weekOffset.value));
const staleDays = computed(() => daysSince(sessions.value));

const interval = computed(() => latestInterval(sessions.value));
const latestWeight = computed(() => weighings.value[0] ?? null);
// weights.json 是新到舊，畫圖要反過來
const weightChart = computed(() => [...weighings.value].reverse());

// 質量課表表格的兩個選單：配速換算基準、要顯示哪些欄位
const paceUnit = ref<PaceUnit>(400);
const paceLabel = computed(
  () => PACE_UNITS.find((u) => u.meters === paceUnit.value)!.label,
);

const visible = ref<string[]>([...DEFAULT_COLS]);
const cols = computed(() => METRIC_COLS.filter((c) => visible.value.includes(c.key)));
function toggleCol(key: string) {
  const i = visible.value.indexOf(key);
  if (i >= 0) visible.value.splice(i, 1);
  else visible.value = METRIC_COLS.filter((c) => c.key === key || visible.value.includes(c.key))
    .map((c) => c.key); // 依 METRIC_COLS 的順序插回去，不要照點擊順序排
}

onMounted(async () => {
  try {
    [sessions.value, weighings.value] = await Promise.all([loadSessions(), loadWeighings()]);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
});
</script>

<template>
  <div class="grid gap-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
    <div class="card">
      <h2 class="card-h">臺北馬倒數</h2>
      <div class="stat">{{ daysToRace }}<span class="stat-u">天</span></div>
      <div class="sub">2026-12-20 06:30 起跑</div>
    </div>
    <div class="card">
      <h2 class="card-h">本週跑量</h2>
      <div class="stat">
        {{ weeklyVolume.actualKm }}<span class="stat-u">/ {{ weeklyVolume.targetKm }} km</span>
      </div>
      <div class="sub">
        還差 {{ (weeklyVolume.targetKm - weeklyVolume.actualKm).toFixed(1) }} km
        <span class="text-warn">· 示意</span>
      </div>
    </div>
    <div class="card">
      <h2 class="card-h">體重</h2>
      <div v-if="latestWeight">
        <div class="stat">{{ latestWeight.weight_kg }}<span class="stat-u">kg</span></div>
        <div class="sub">{{ latestWeight.at }}｜阻抗 {{ latestWeight.impedance }} Ω</div>
      </div>
      <div v-else class="sub py-3">尚無讀數</div>
    </div>
    <div class="card">
      <h2 class="card-h">訓練狀態 TSB</h2>
      <div class="stat" :class="last.tsb < -10 ? 'text-warn' : 'text-accent'">
        {{ last.tsb > 0 ? '+' : '' }}{{ last.tsb }}
      </div>
      <div class="sub">
        ATL {{ last.atl }} / CTL {{ last.ctl }}{{ last.tsb < -10 ? '｜疲勞累積中' : '｜狀態可' }}
      </div>
    </div>
  </div>

  <div class="grid gap-3.5 mt-3.5 grid-cols-1 lg:grid-cols-2">
    <div class="card">
      <h2 class="card-h">
        訓練負荷 ATL / CTL / TSB（近 90 天）
        <span class="text-[10px] px-1.5 py-0.5 rounded border text-warn border-[#5c3a1c] ml-2">示意資料</span>
      </h2>
      <LineChart
        :series="[
          { values: loadSeries.map((d) => d.atl), color: '#ff6b8b' },
          { values: loadSeries.map((d) => d.ctl), color: '#23d3a0' },
          { values: loadSeries.map((d) => d.tsb), color: '#7aa2ff' },
        ]"
        :x-ticks="[tick(loadSeries, 0), tick(loadSeries, 44), tick(loadSeries, 89)]"
      />
      <div class="flex gap-3.5 text-xs text-dim mt-2 flex-wrap">
        <span><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 bg-[#ff6b8b]" />ATL 短期疲勞</span>
        <span><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 bg-accent" />CTL 長期體能</span>
        <span><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 bg-[#7aa2ff]" />TSB 狀態</span>
      </div>
      <div class="note note-warn mt-3">
        這條曲線目前是合成的（`fixtures.ts` 裡的正弦波）。TRIMP 需要逐次訓練的
        心率與時長，而 <code>sessions.json</code> 只有四個欄位 —— 要等 Day 17 接上
        FIT 檔的心率資料才會變成真的。
      </div>
    </div>

    <div class="card">
      <h2 class="card-h">體重趨勢</h2>
      <LineChart
        v-if="weightChart.length >= 2"
        :series="[{ values: weightChart.map((d) => d.weight_kg), color: '#23d3a0' }]"
        :x-ticks="[weightChart[0].at.slice(5, 10), weightChart[weightChart.length - 1].at.slice(5, 10)]"
      />
      <div v-else class="sub py-6">讀數還不夠畫成線（目前 {{ weightChart.length }} 筆）。</div>
      <div class="sub mt-2">
        {{ weightChart.length }} 筆真實讀數，全部來自體重機 BLE 直讀。
        點很稀疏是因為量得不夠勤 —— Day 9 的常駐監聽開始跑之後，站上去就會自動多一筆。
      </div>
    </div>
  </div>

  <div class="grid gap-3.5 mt-3.5 grid-cols-1 lg:grid-cols-2">
    <div class="card">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h2 class="card-h !mb-0">訓練紀錄</h2>
        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button" class="wk-nav" :disabled="!week.canGoBack"
            aria-label="上一週" @click="weekOffset--"
          >‹</button>
          <span class="text-xs text-dim tnum min-w-[92px] text-center">{{ week.label }}</span>
          <button
            type="button" class="wk-nav" :disabled="weekOffset >= 0"
            aria-label="下一週" @click="weekOffset++"
          >›</button>
        </div>
      </div>

      <div v-if="loadError" class="note note-warn mb-3">
        讀不到訓練紀錄：{{ loadError }}
      </div>

      <div class="flex gap-5 items-center">
        <!-- 中央顯示天數而非百分比：休息日是刻意的，7 天當分母算不出達成率 -->
        <Ring :pct="week.trainedDays / 7" :label="`${week.trainedDays} 天`" />
        <div class="flex-1">
          <div
            v-for="d in week.days" :key="d.date"
            class="flex items-start gap-3 py-2.5 border-b border-[#1d2632] last:border-0 text-[13px]"
            :class="{ 'opacity-45': !d.items.length }"
          >
            <span class="w-9 text-dim shrink-0 pt-0.5">{{ d.day }}</span>
            <div class="flex-1 min-w-0">
              <!-- 一天可能兩練,所以是清單不是單一列 -->
              <div v-for="s in d.items" :key="s.date + s.summary" class="flex items-start gap-2 mb-1 last:mb-0">
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded border shrink-0"
                  :class="[KIND_META[s.kind].text, KIND_META[s.kind].border]"
                >{{ KIND_META[s.kind].tag }}</span>
                <span class="flex-1 break-words">
                  {{ s.summary }}<span v-if="s.moves" class="text-dim">（{{ s.moves }} 動作）</span>
                </span>
              </div>
              <span v-if="!d.items.length" class="text-dim">{{ d.isFuture ? '—' : '沒有紀錄' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-baseline justify-between gap-3 mt-3 flex-wrap">
        <span class="text-[13px] flex gap-2 flex-wrap">
          <!-- 只列出這週真的有做的類型，零的不佔版面 -->
          <template v-for="k in KINDS" :key="k">
            <span v-if="week.counts[k]" :class="KIND_META[k].text">
              {{ KIND_META[k].name }} {{ week.counts[k] }}
            </span>
          </template>
          <span v-if="!week.trainedDays" class="text-dim">這週沒有紀錄</span>
        </span>
        <span class="sub !mt-0">
          <code>sessions.json</code>（{{ sessions.length }} 筆）· 每天 07:00 重新產生<template
            v-if="staleDays !== null"> · 最新一筆 {{ staleDays }} 天前</template>
        </span>
      </div>
    </div>

    <div class="card">
      <div class="flex items-start justify-between gap-3 mb-3">
        <h2 class="card-h !mb-0 pt-1">
          最近一次質量課表<template v-if="interval"> · {{ interval.date }}</template>
        </h2>
        <div class="flex gap-1.5 shrink-0">
          <MenuDropdown :label="paceLabel">
            <button
              v-for="u in PACE_UNITS" :key="u.meters"
              type="button"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px]
                     cursor-pointer hover:bg-[#243040]"
              :class="paceUnit === u.meters ? 'text-accent' : 'text-fg'"
              @click="paceUnit = u.meters"
            >
              <span class="w-3 text-center">{{ paceUnit === u.meters ? '·' : '' }}</span>
              {{ u.label }}
            </button>
          </MenuDropdown>

          <MenuDropdown :label="`欄位 ${cols.length}`">
            <button
              v-for="c in METRIC_COLS" :key="c.key"
              type="button"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px]"
              :class="!c.ready
                ? 'text-dim opacity-45 cursor-not-allowed'
                : 'text-fg cursor-pointer hover:bg-[#243040]'"
              :disabled="!c.ready"
              :title="c.pending ? `尚無資料，等 ${c.pending} 接上` : undefined"
              @click="c.ready && toggleCol(c.key)"
            >
              <span class="w-3 text-center text-accent">{{ visible.includes(c.key) ? '✓' : '' }}</span>
              <span class="flex-1">{{ c.label }}</span>
              <span v-if="!c.ready" class="text-[10px] text-dim">待 FIT</span>
            </button>
          </MenuDropdown>
        </div>
      </div>

      <div v-if="!interval" class="sub py-6">最近的紀錄裡沒有分組課表。</div>

      <template v-else>
      <div class="sub !mt-0 mb-2.5">{{ interval.summary }}</div>

      <div v-if="!cols.length" class="sub py-6">欄位全關掉了，從右上角挑幾個回來。</div>

      <div v-else class="overflow-x-auto">
      <table class="w-full text-[13px] border-collapse">
        <thead>
          <tr class="text-dim text-[11px] uppercase tracking-wide">
            <th class="text-left py-2 px-2.5 border-b border-line font-semibold">組</th>
            <th
              v-for="c in cols" :key="c.key"
              class="text-left py-2 px-2.5 border-b border-line font-semibold whitespace-nowrap"
            >{{ c.key === 'pace' ? paceLabel : c.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in interval.reps" :key="r.idx" class="border-b border-[#1d2632] last:border-0">
            <td class="py-2.5 px-2.5">{{ r.idx }}</td>
            <td
              v-for="c in cols" :key="c.key"
              class="py-2.5 px-2.5"
              :class="{
                'text-dim': c.key === 'rest',
                'text-accent': c.key === 'pace' && r.hit === true,
                'text-warn': c.key === 'pace' && r.hit === false,
              }"
            >
              <!-- hit 為 null 代表紀錄裡沒寫目標配速，不做判定 -->
              <template v-if="c.key === 'pace'">
                {{ paceOver(r.per400_sec, paceUnit) }}{{ r.hit === false ? ' ▲' : '' }}
              </template>
              <template v-else-if="c.key === 'max_hr'">
                {{ r.max_hr }}{{ (r.max_hr ?? 0) >= 190 ? ' 🔥' : '' }}
              </template>
              <template v-else-if="c.key === 'distance'">{{ r.distance }}</template>
              <template v-else-if="c.key === 'time'">{{ r.time }}</template>
              <template v-else-if="c.key === 'rest'">{{ r.rest }}</template>
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <div class="sub mt-3">
        ▲ 表示比目標配速慢超過 2 秒／400m（教練的四區是 4:00/km ±5 秒，
        換算 400m 約 ±2 秒）。目標配速取自紀錄內文，沒寫的話不判定；
        判定一律以 400m 為基準，切成「{{ paceLabel }}」只是換個看法。
      </div>
      </template>
    </div>
  </div>
</template>
