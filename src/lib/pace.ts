/**
 * 配速換算與跑力預測。
 *
 * 兩組公式,出處都查過:
 *
 * 1. **Riegel**(Pete Riegel, Runner's World 1977;American Scientist 1981)
 *    T2 = T1 × (D2/D1)^1.06
 *    適用 3.5–230 分鐘。指數 1.06 代表距離加倍時配速掉多少。
 *
 * 2. **Daniels-Gilbert VDOT**(Daniels & Gilbert,《Oxygen Power》1979)
 *    VO2     = −4.60 + 0.182258·v + 0.000104·v²      (v = 公尺/分)
 *    %VO2max = 0.8 + 0.1894393·e^(−0.012778t)
 *                 + 0.2989558·e^(−0.1932605t)        (t = 分鐘)
 *    VDOT = VO2 / %VO2max
 */

export const RIEGEL_EXP = 1.06;

/** 由一場成績推另一個距離。t 秒、d 公尺。 */
export const riegel = (t1: number, d1: number, d2: number) =>
  t1 * Math.pow(d2 / d1, RIEGEL_EXP);

/** 跑一段距離所需的耗氧量(ml/kg/min)。 */
const vo2Cost = (metersPerMin: number) =>
  -4.60 + 0.182258 * metersPerMin + 0.000104 * metersPerMin ** 2;

/** 這個時長能維持最大攝氧的百分之幾。時間越長比例越低。 */
const pctMax = (minutes: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * minutes)
      + 0.2989558 * Math.exp(-0.1932605 * minutes);

/** 由一場成績算 VDOT。t 秒、d 公尺。 */
export function vdot(t: number, d: number): number {
  const min = t / 60;
  return vo2Cost(d / min) / pctMax(min);
}

/** 由 VDOT 反推某距離的成績。沒有解析解,用二分逼近。 */
export function timeFromVdot(v: number, d: number): number {
  let lo = 60, hi = 6 * 3600;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    // 時間越長 VDOT 越低,所以算出來比目標高就要往「更慢」找
    if (vdot(mid, d) > v) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 目標距離用**標準賽事距離**,不是 GPS 實測值。
 *
 *  這件事要標出來:按「帶入實績」的時候來源是那場的 GPS 距離
 *  (東京馬 42,650 公尺),而「全馬」這一列算的是標準的 42,195 —— 少 455
 *  公尺,所以會比輸入的成績快兩分鐘。不寫距離的話那個數字看起來像算錯。 */
export const DISTANCES = [
  { label: '5K', m: 5000, note: '5.0K' },
  { label: '10K', m: 10000, note: '10.0K' },
  { label: '半馬', m: 21097.5, note: '21.0975K' },
  { label: '全馬', m: 42195, note: '42.195K' },
] as const;

/** Daniels 的訓練強度區間,各為 VDOT 的固定百分比。 */
export const ZONES = [
  { code: 'E', name: '輕鬆', pct: 0.70 },
  { code: 'M', name: '馬拉松', pct: 0.84 },
  { code: 'T', name: '節奏', pct: 0.88 },
  { code: 'I', name: '間歇', pct: 0.98 },
  { code: 'R', name: '重複', pct: 1.05 },
] as const;

/** 某個 VDOT 百分比對應的配速(秒/公里)。反解 vo2Cost 的二次式。 */
export function paceForPct(v: number, pct: number): number {
  const target = v * pct;
  // 0.000104x² + 0.182258x − (4.60 + target) = 0
  const a = 0.000104, b = 0.182258, c = -(4.60 + target);
  const mPerMin = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return 60000 / mPerMin;
}
