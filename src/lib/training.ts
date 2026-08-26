/**
 * 讀 Day 8 的 parse_logs.py 產出、Day 9 的排程每天更新的兩份 JSON。
 *
 * schema 對齊的是儀表板要顯示的東西，不是紀錄的複雜度：起初只有四個欄位，
 * 後來為了「最近一次質量課表」那張卡片才長出 reps。
 * 仍算不出跑量與訓練負荷 —— 沒有總距離，也沒有逐秒心率。
 */

export interface Rep {
  idx: number;
  distance: string;      // '1010m' 或 '410m + 820m'
  time: string;
  per400: string;        // '1:37.6'
  per400_sec: number;
  pace: string;          // '4:04/km'
  max_hr: number | null;
  rest: string;
  hit: boolean | null;   // 有目標配速才判定
}

export type Kind = 'run' | 'bike' | 'swim' | 'lift';

/**
 * 各類型的顯示樣式。集中在這裡，標籤與週摘要共用同一份，
 * 之後再多一種運動只要改這裡。
 */
export const KIND_META: Record<Kind, { tag: string; name: string; text: string; border: string }> = {
  run:  { tag: '跑',   name: '跑步', text: 'text-accent',     border: 'border-[#1c5c4a]' },
  bike: { tag: '騎',   name: '騎車', text: 'text-[#ffb454]',  border: 'border-[#5c3a1c]' },
  swim: { tag: '泳',   name: '游泳', text: 'text-[#7aa2ff]',  border: 'border-[#2a3f6b]' },
  lift: { tag: '重訓', name: '重訓', text: 'text-[#9a8cff]',  border: 'border-[#3b3470]' },
};

export const KINDS = Object.keys(KIND_META) as Kind[];

export interface Session {
  date: string;          // YYYY-MM-DD
  kind: Kind;
  summary: string;
  moves: number;         // 動作數，跑步為 0
  reps: Rep[];           // 間歇的分組明細；沒有「組」表就是空陣列
}

export interface Weighing {
  at: string;            // YYYY-MM-DD HH:MM
  weight_kg: number;
  impedance: number;
}

async function getJSON<T>(url: string): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

export const loadSessions = () => getJSON<Session>('/sessions.json');
export const loadWeighings = () => getJSON<Weighing>('/weights.json');

/** 本地時間的 YYYY-MM-DD（不要用 toISOString，那是 UTC，跨日會差一天）。 */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * 某一週（週一起算）的七天日期。
 * offset 0 是本週、-1 是上週，以此類推。
 */
export function weekDates(offset = 0, today = new Date()): string[] {
  const monday = new Date(today);
  // getDay() 週日是 0，要往回推 6 天才是本週一
  monday.setDate(monday.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return ymd(d);
  });
}

const DAY_LABEL = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

export interface DayRow {
  day: string;
  date: string;
  items: Session[];      // 一天可能兩練（如 2026-07-18 早上跑步 + 晚上重訓）
  isFuture: boolean;
}

export interface WeekView {
  days: DayRow[];
  label: string;         // '本週' 或 '8/17–8/23'
  trainedDays: number;   // 有紀錄的天數，環圈用
  counts: Record<Kind, number>;
  canGoBack: boolean;    // 再往前還有沒有資料
}

/** 攤開某一週，每天掛上當天的紀錄。 */
export function weekView(
  sessions: Session[],
  offset = 0,
  today = new Date(),
): WeekView {
  const todayStr = ymd(today);
  const dates = weekDates(offset, today);
  const days: DayRow[] = dates.map((date, i) => ({
    day: DAY_LABEL[i],
    date,
    items: sessions.filter((s) => s.date === date),
    isFuture: date > todayStr,
  }));

  const items = days.flatMap((d) => d.items);
  // 最早一筆紀錄落在哪天，決定 ‹ 能不能再按
  const earliest = sessions.length
    ? sessions.reduce((a, s) => (s.date < a ? s.date : a), sessions[0].date)
    : null;

  return {
    days,
    label: offset === 0
      ? '本週'
      : `${dates[0].slice(5).replace('-', '/')}–${dates[6].slice(5).replace('-', '/')}`,
    trainedDays: days.filter((d) => d.items.length).length,
    counts: Object.fromEntries(
      KINDS.map((k) => [k, items.filter((s) => s.kind === k).length]),
    ) as Record<Kind, number>,
    canGoBack: earliest !== null && earliest < dates[0],
  };
}

/** 最近一次有分組明細的課表 —— sessions 已是新到舊，取第一個有 reps 的。 */
export function latestInterval(sessions: Session[]): Session | null {
  return sessions.find((s) => s.reps?.length) ?? null;
}

/** 最近 n 天內有幾次訓練 —— 用來回答「這份資料有多新」。 */
export function daysSince(sessions: Session[], today = new Date()): number | null {
  if (!sessions.length) return null;
  const latest = sessions.reduce((a, s) => (s.date > a ? s.date : a), sessions[0].date);
  return Math.floor((today.getTime() - new Date(`${latest}T00:00:00`).getTime()) / 86400000);
}

/* ── 表格的兩個選單 ───────────────────────────────────────────── */

/** 配速換算的基準距離。per400_sec 是正規化過的，換算只是等比例放大。 */
export const PACE_UNITS = [
  { meters: 400, label: '每 400m' },
  { meters: 1000, label: '每 1km' },
  { meters: 5000, label: '每 5km' },
] as const;

export type PaceUnit = (typeof PACE_UNITS)[number]['meters'];

/**
 * 把 per400_sec 換算成指定距離的耗時字串。
 * 400m 保留十分位（原始紀錄就有），拉長到 km 級距後小數點沒有意義，四捨五入到秒。
 */
export function paceOver(per400Sec: number, meters: PaceUnit): string {
  const decimals = meters <= 400 ? 1 : 0;
  // 先進位到要顯示的精度再拆分秒 —— 不然 119.7 秒會印成 1:60
  const step = 10 ** decimals;
  const total = Math.round(((per400Sec * meters) / 400) * step) / step;
  const min = Math.floor(total / 60);
  const sec = total - min * 60;
  return `${min}:${sec.toFixed(decimals).padStart(decimals ? 4 : 2, '0')}`;
}

export interface MetricCol {
  key: string;
  label: string;
  /** 目前的 sessions.json 有沒有這個欄位 —— 沒有的在選單裡列出但不可選。 */
  ready: boolean;
  /** 缺資料時說明它要從哪裡來。 */
  pending?: string;
}

/**
 * 表格可選欄位。「組」是列的身分不列在這裡，永遠顯示。
 *
 * 後半段全部來自 FIT 檔的 record 訊息（跑步動態），而 sessions.json 是
 * parse_logs.py 解文字紀錄產生的 —— 文字紀錄裡根本沒有這些數字，
 * 不是解析漏掉，是來源就沒有。要等 FIT 解析接上才會亮。
 */
export const METRIC_COLS: MetricCol[] = [
  { key: 'distance', label: '距離', ready: true },
  { key: 'time', label: '時間', ready: true },
  { key: 'pace', label: '配速', ready: true },
  { key: 'max_hr', label: '最高心率', ready: true },
  { key: 'rest', label: '組休', ready: true },
  { key: 'cadence', label: '步頻', ready: false, pending: 'FIT record.cadence' },
  { key: 'stride', label: '步幅', ready: false, pending: 'FIT record.step_length' },
  { key: 'gct', label: '觸地時間', ready: false, pending: 'FIT record.stance_time' },
  { key: 'vo', label: '垂直振幅', ready: false, pending: 'FIT record.vertical_oscillation' },
];

export const DEFAULT_COLS = METRIC_COLS.filter((c) => c.ready).map((c) => c.key);
