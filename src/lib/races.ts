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

/** 六場全馬。氣溫與露點取自 Garmin 存的當日天氣（get_activity_weather）。
 *
 *  排序用**氣溫**不用露點。原本用露點，因為跑者圈普遍認為它比相對濕度
 *  更能代表散熱難度；但去查文獻才發現那是社群共識不是研究結論 ——
 *  紐約馬的大樣本研究說露點「only had a slight influence on top
 *  performance levels and did not affect the other performance levels」，
 *  而溫度才是影響最顯著的變數。露點保留為輔助欄位。 */
export const RACES = [
  { slug: 'fukuoka',  name: '福岡馬',   date: '2024-11-10', temp: 18.3, dew: 12.8, rh: 71, finish: 13044, km: 42.61 },
  { slug: 'xinyi24',  name: '臺北馬 24', date: '2024-12-15', temp: 15.6, dew: 10.6, rh: 73, finish: 12521, km: 42.58 },
  { slug: 'testrace', name: '國道馬',   date: '2025-03-09', temp: 16.7, dew: 11.7, rh: 74, finish: 12879, km: 42.39 },
  { slug: 'xinyi25',  name: '臺北馬 25', date: '2025-12-21', temp: 20.0, dew: 17.2, rh: 84, finish: 12640, km: 42.45 },
  { slug: 'tokyo',    name: '東京馬',   date: '2026-03-01', temp: 12.2, dew:  1.1, rh: 35, finish: 12127, km: 42.65 },
  { slug: 'taitung',  name: '台東 CT',   date: '2026-04-25', temp: 24.4, dew: 20.6, rh: 81, finish: 14214, km: 41.99 },
] as const;

/** 秒 → m:ss。
 *  **先取整再拆分**,不然 299.5 秒會印成 4:60 —— 分鐘取整得 4、
 *  餘數 59.5 四捨五入成 60。`parse_logs.py` 的 _fmt() 踩過同一個坑。 */
export function mmss(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 六場長度不一(41.99~42.65 km、12,127~14,214 秒),橫軸要選一個。
 *
 *  原本做了三個:時間、距離、完賽比例。實測之後拿掉「時間」——
 *  同一個點在時間軸與距離軸上的位置差**最大只有 4.8%、平均不到 3%**
 *  (六場實測),在 800 px 寬的圖上是幾十個像素,肉眼看不出來。
 *  這是必然的:跑步時距離與時間同向單調成長,配速只在 4:30~6:20 之間
 *  變動,兩條軸幾乎是線性關係。三個選項裡有兩個長得一樣,是在浪費選擇。
 *
 *  留下的兩個差異是真的:距離軸讓終點各自落在實際位置(六場差 660 公尺),
 *  完賽比例把終點拉齊。 */
export type XAxis = 'dist' | 'pct';

export const X_AXIS: Record<XAxis, { label: string; hint: string }> = {
  dist: {
    label: '實際距離',
    hint: '橫軸是跑了幾公尺，終點落在各自的實際位置。'
        + '用來看「30K 的時候配速是多少」—— 絕對位置對得上。',
  },
  pct: {
    label: '拉齊終點',
    hint: '每場拉成 0–100%，同時起跑同時結束。'
        + '用來看「掉速是不是都發生在同一個相對位置」，代價是絕對位置消失。',
  },
};

const xOf = (p: RacePoint, r: Race, axis: XAxis, last: RacePoint) =>
  axis === 'dist' ? p.d : p.t / (last.t || 1);

/** 移動平均。
 *
 *  GPS 逐秒配速抖得很兇 —— 同一段路可能在 4:30 和 5:10 之間跳。直接畫出來
 *  是一片鋸齒,六條疊在一起就糊成一團,看不出趨勢。
 *
 *  **這不是點太多造成的**,降採樣解決不了:LTTB 挑的是「偏離直線最遠的點」,
 *  而鋸齒的尖端正好符合那個條件,壓完只會保留最極端的雜訊。要先平滑再取樣。 */
function smooth(pts: RacePoint[], field: 'hr' | 'p', seconds: number): (number | null)[] {
  // 窗口用**時間**不用點數。預覽檔已經 LTTB 壓過,點跟點之間平均隔 13.5 秒
  // 而且不等距 —— 拿點數當窗口的話,18 個點就是 4 分鐘,會把 35K 那種
  // 一兩分鐘內發生的崩盤一起抹平。
  const half = seconds / 2;
  let lo = 0, hi = 0, sum = 0, n = 0;
  return pts.map((p) => {
    while (hi < pts.length && pts[hi].t <= p.t + half) {
      if (pts[hi][field] != null) { sum += pts[hi][field]!; n++; }
      hi++;
    }
    while (pts[lo].t < p.t - half) {
      if (pts[lo][field] != null) { sum -= pts[lo][field]!; n--; }
      lo++;
    }
    return n ? sum / n : null;
  });
}

/** 取一場的曲線，降採樣到 width 個點左右。
 *  螢幕寬度就那麼多像素，畫一萬兩千個點只是在燒 DOM。 */
export function curve(
  race: Race,
  axis: XAxis,
  field: 'hr' | 'p',
  width = 800,
): { x: number; y: number }[] {
  const last = race.points[race.points.length - 1];
  const raw = race.points.filter((p) => p[field] != null);

  // 先平滑再降採樣。配速抖得比心率兇,窗口開大一點,但都以秒為單位。
  const sm = smooth(raw, field, field === 'p' ? 60 : 30);
  const pts = raw.map((p, i) => ({ ...p, [field]: sm[i] })) as typeof raw;

  const sampled = lttb(pts, width, (p) => xOf(p, race, axis, last), (p) => p[field] as number);
  return sampled.map((p) => ({ x: xOf(p, race, axis, last), y: p[field] as number }));
}

/** 讀一場比賽。
 *
 *  預設拿預覽檔(`.min.json`,每場 42 KB,已預先壓到 900 點)。六場合計
 *  262 KB,而完整檔是 3.5 MB —— 差 13 倍,而畫面上根本畫不到那麼多點。
 *
 *  900 這個數字是刻意訂的:圖上最多只畫到畫布寬度的八成(桌機約 640、
 *  手機約 272),所以 900 點對任何螢幕都夠用,前端再跑一次 LTTB 就得到
 *  正確的點數。**預先壓過不會讓畫面變糊**,因為它還是比要畫的點多。
 *
 *  full=true 才抓完整逐秒檔 —— 目前只有需要看單場細節時才用得上。 */
export async function loadRace(slug: string, full = false): Promise<Race> {
  const url = `/races/${slug}${full ? '' : '.min'}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return { slug, ...(await res.json()) };
}
