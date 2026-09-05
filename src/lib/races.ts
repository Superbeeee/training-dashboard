import { lttb } from './downsample';

/** 一場比賽的逐秒點。欄位縮寫是為了檔案大小 —— 六場 77,433 點。 */
export interface RacePoint {
  t: number;            // 起跑後秒數
  d: number;            // 累積距離(公尺)
  hr: number | null;
  p: number | null;     // 配速,秒/km
}

export interface Race {
  slug: string;
  name: string;
  date: string;
  points: RacePoint[];
}

/** 六場全馬。露點取自 Garmin 存的當日天氣（get_activity_weather）。 */
export const RACES = [
  { slug: 'fukuoka',  name: '福岡',       date: '2024-11-10', dew: 12.8, finish: 13044, km: 42.61 },
  { slug: 'xinyi24',  name: '信義區 24',  date: '2024-12-15', dew: 10.6, finish: 12521, km: 42.58 },
  { slug: 'testrace', name: 'TEST RACE', date: '2025-03-09', dew: 11.7, finish: 12879, km: 42.39 },
  { slug: 'xinyi25',  name: '信義區 25',  date: '2025-12-21', dew: 17.2, finish: 12640, km: 42.45 },
  { slug: 'tokyo',    name: '東京馬',     date: '2026-03-01', dew:  1.1, finish: 12127, km: 42.65 },
  { slug: 'taitung',  name: '台東',       date: '2026-04-25', dew: 20.6, finish: 14214, km: 41.99 },
] as const;

/** 秒 → m:ss。
 *  **先取整再拆分**,不然 299.5 秒會印成 4:60 —— 分鐘取整得 4、
 *  餘數 59.5 四捨五入成 60。`parse_logs.py` 的 _fmt() 踩過同一個坑。 */
export function mmss(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 六場長度不一(41.99~42.65 km、12,127~14,214 秒),橫軸要選一個。
 *  這不是技術問題是設計決策 —— 選哪個,決定了圖能回答什麼問題。 */
export type XAxis = 'time' | 'dist' | 'pct';

export const X_AXIS: Record<XAxis, { label: string; hint: string }> = {
  time: { label: '時間', hint: '起跑後秒數。慢的那場會拖出一條尾巴，但「跑到第幾分鐘開始掉」看得最準。' },
  dist: { label: '距離', hint: '累積公尺。起跑點對齊，但 GPS 測到的總距離每場差到 660 公尺。' },
  pct:  { label: '完賽比例', hint: '全部拉齊成 0–100%。適合比形狀，代價是「35K 撞牆」這種絕對位置消失了。' },
};

const xOf = (p: RacePoint, r: Race, axis: XAxis, last: RacePoint) =>
  axis === 'time' ? p.t : axis === 'dist' ? p.d : p.t / (last.t || 1);

/** 取一場的曲線，降採樣到 width 個點左右。
 *  螢幕寬度就那麼多像素，畫一萬兩千個點只是在燒 DOM。 */
export function curve(
  race: Race,
  axis: XAxis,
  field: 'hr' | 'p',
  width = 800,
): { x: number; y: number }[] {
  const last = race.points[race.points.length - 1];
  const pts = race.points.filter((p) => p[field] != null);
  const sampled = lttb(pts, width, (p) => xOf(p, race, axis, last), (p) => p[field] as number);
  return sampled.map((p) => ({ x: xOf(p, race, axis, last), y: p[field] as number }));
}

export async function loadRace(slug: string): Promise<Race> {
  const res = await fetch(`/races/${slug}.json`);
  if (!res.ok) throw new Error(`/races/${slug}.json → HTTP ${res.status}`);
  return { slug, ...(await res.json()) };
}
