/**
 * POC 用資料層。
 *
 * 數值取自 personal-trainer/coach/logs/ 的真實紀錄（2026-07 ~ 08），
 * 手動轉成 JSON 形狀。正式版應由 Day 8 的 schema + Day 9 的排程管線產出，
 * 這裡先固定形狀，之後把來源換掉即可，畫面不用改。
 */

export const RACE_DAY = new Date('2026-12-20T06:30:00+08:00'); // 臺北馬拉松

/** 單次跑步活動（形狀對齊 garmin_sync.py 的 _slim_activity 輸出） */
export interface Activity {
  id: number;
  name: string;
  type: 'track_running' | 'running' | 'strength';
  start: string;
  distance_m: number;
  duration_s: number;
  pace: string;
  avg_hr?: number;
  max_hr?: number;
  laps?: Lap[];
}

export interface Lap {
  distance_m: number;
  duration_s: number;
  pace: string;
  avg_hr?: number;
  max_hr?: number;
}

/** 2026-07-21 中山區田徑 5K（garmin_20260721_211829.json 原始資料） */
export const activity0721: Activity = {
  id: 23676292567,
  name: '中山區 田徑跑步',
  type: 'track_running',
  start: '2026-07-21 19:01:23',
  distance_m: 5000,
  duration_s: 1883.2,
  pace: '6:17/km',
  avg_hr: 143,
  max_hr: 157,
  laps: [
    { distance_m: 470, duration_s: 213.3, pace: '7:34/km', avg_hr: 112, max_hr: 126 },
    { distance_m: 1600, duration_s: 576.8, pace: '6:00/km', avg_hr: 141, max_hr: 155 },
    { distance_m: 1600, duration_s: 591.3, pace: '6:10/km', avg_hr: 150, max_hr: 156 },
    { distance_m: 1330, duration_s: 501.8, pace: '6:16/km', avg_hr: 151, max_hr: 157 },
  ],
};

/** 2026-08-11 間歇課表 1000m×2 + 600m×2（logs/2026-08.md） */
export const intervalSession = {
  date: '2026-08-11',
  title: '1000m*2+600m*2 (r150s) 目標 1:36/400m',
  location: '中山區田徑場',
  targetPacePerKm: '4:00/km',
  totalKm: 6.2,
  reps: [
    { idx: 1, distance_m: 1010, time: '4:00.0', per400: '1:35', pace: '3:58/km', maxHr: 173, restS: 127, hit: true },
    { idx: 2, distance_m: 1000, time: '4:02.6', per400: '1:37', pace: '4:03/km', maxHr: 192, restS: 183, hit: true },
    { idx: 3, distance_m: 610, time: '2:32.9', per400: '1:40', pace: '4:11/km', maxHr: 186, restS: 162, hit: false },
    { idx: 4, distance_m: 600, time: '2:30.4', per400: '1:40', pace: '4:11/km', maxHr: 192, restS: 0, hit: false },
  ],
  effectiveKm: 3.22,
  targetKm: 3.2,
};

/** 體重（logs/weight.md，BLE 直讀）。POC 補上趨勢用的模擬點，最後一筆為真實值。 */
export const weightSeries = (() => {
  const out: { date: string; kg: number }[] = [];
  const end = new Date('2026-07-21');
  for (let i = 89; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    // 從 75.4 緩降到 73.15，加上日常波動
    const base = 75.4 - (89 - i) * (75.4 - 73.15) / 89;
    const noise = Math.sin(i * 1.7) * 0.35 + Math.cos(i * 0.6) * 0.2;
    out.push({ date: d.toISOString().slice(0, 10), kg: +(base + noise).toFixed(2) });
  }
  out[out.length - 1].kg = 73.15; // 真實讀數
  return out;
})();

/** 本週課表 vs 實際（跑步與重訓混排，示範 Day 15 執行監督） */
export interface PlanItem {
  day: string;
  kind: 'run' | 'lift';
  planned: string;
  actual: string | null;
  done: boolean;
}

export const weekPlan: PlanItem[] = [
  { day: '週一', kind: 'lift', planned: '胸 + 側肩', actual: '胸 + 側肩（5 動作）', done: true },
  { day: '週二', kind: 'run', planned: 'E 配速 8K', actual: '8.1K 6:05/km', done: true },
  { day: '週三', kind: 'lift', planned: '背 + 二頭', actual: '背 + 二頭（4 動作）', done: true },
  { day: '週四', kind: 'run', planned: '間歇 1000×2 + 600×2', actual: '6.2K 達標 3.22K', done: true },
  { day: '週五', kind: 'lift', planned: '腿', actual: null, done: false },
  { day: '週六', kind: 'run', planned: 'LSD 22K', actual: null, done: false },
  { day: '週日', kind: 'run', planned: '休息 / 慢跑 5K', actual: null, done: false },
];

/** 訓練負荷 ATL / CTL / TSB（Day 17 模型的示意輸出） */
export const loadSeries = (() => {
  const out: { date: string; atl: number; ctl: number; tsb: number }[] = [];
  const start = new Date('2026-05-18');
  let atl = 42, ctl = 38;
  for (let i = 0; i < 90; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const tss = 45 + Math.sin(i / 3.1) * 30 + Math.sin(i / 11) * 25 + (i % 7 === 5 ? 60 : 0);
    atl += (tss - atl) / 7;   // 7 日指數移動平均
    ctl += (tss - ctl) / 42;  // 42 日指數移動平均
    out.push({
      date: d.toISOString().slice(0, 10),
      atl: +atl.toFixed(1),
      ctl: +ctl.toFixed(1),
      tsb: +(ctl - atl).toFixed(1),
    });
  }
  return out;
})();

export const weeklyVolume = { actualKm: 38.6, targetKm: 52 };
