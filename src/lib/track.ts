/**
 * GPS 軌跡資料。
 *
 * 兩個來源：
 * 1. loadTrack() —— 讀 fit_sync.py 匯出的真實資料（預設）
 * 2. buildTrack() —— 合成全馬，保留給 Day 27–28 講「撞牆點視覺化」用，
 *    因為田徑場間歇沒有撞牆這回事。
 */

export interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;      // 海拔（公尺）
  dist: number;     // 累積距離（公尺）
  paceSecPerKm: number;
  hr: number;
  t: number;        // 起跑後秒數
}

/** fit_sync.py export 出來的原始格式（欄位可能為 null） */
interface RawPoint {
  lat: number;
  lon: number;
  ele: number | null;
  dist: number | null;
  hr: number | null;
  t: number | null;
  paceSecPerKm: number | null;
}

/**
 * 讀真實軌跡。
 *
 * 兩件必要的清理：
 * 1. **配速補洞** —— 停錶、走動、GPS 抖動時 speed=0，匯出是 null。直接拿去
 *    映射顏色會破圖，這裡用前一個有效值遞補。
 * 2. **海拔平滑** —— GPS 高度雜訊很大（8/13 那場在平坦田徑場上竟從 -1.8
 *    飄到 13.0 公尺）。不平滑的話「海拔誇張倍率」會把雜訊放大成鋸齒。
 */
export async function loadTrack(url: string): Promise<TrackPoint[]> {
  const raw: RawPoint[] = await (await fetch(url)).json();

  let lastPace = 600;
  const pts: TrackPoint[] = raw.map((p, i) => {
    const pace = p.paceSecPerKm ?? lastPace;
    lastPace = pace;
    return {
      lat: p.lat,
      lon: p.lon,
      ele: p.ele ?? 0,
      dist: p.dist ?? 0,
      hr: p.hr ?? 0,
      t: p.t ?? i,
      paceSecPerKm: pace,
    };
  });

  // 海拔移動平均（前後各 10 點）
  const win = 10;
  const smoothed = pts.map((p, i) => {
    const from = Math.max(0, i - win);
    const to = Math.min(pts.length, i + win + 1);
    let s = 0;
    for (let k = from; k < to; k++) s += pts[k].ele;
    return { ...p, ele: +(s / (to - from)).toFixed(2) };
  });

  // 心率為 0 的點（錶還沒抓到）用第一個有效值補
  const firstHr = smoothed.find((p) => p.hr > 0)?.hr ?? 0;
  return smoothed.map((p) => ({ ...p, hr: p.hr || firstHr }));
}

const START = { lat: 25.0375, lon: 121.5637 }; // 臺北市政府一帶

export function buildTrack(totalKm = 42.195, stepM = 25): TrackPoint[] {
  const pts: TrackPoint[] = [];
  const n = Math.floor((totalKm * 1000) / stepM);
  let t = 0;

  for (let i = 0; i <= n; i++) {
    const dist = i * stepM;
    const km = dist / 1000;
    const p = km / totalKm; // 0..1 進度

    // 路線：兩個大迴圈 + 河濱折返，讓 3D 看起來有層次
    const theta = p * Math.PI * 4.2;
    const r = 0.021 + 0.008 * Math.sin(p * Math.PI * 2.5);
    const lat = START.lat + r * Math.sin(theta) * 0.72 + p * 0.012;
    const lon = START.lon + r * Math.cos(theta) + Math.sin(p * Math.PI * 6) * 0.004;

    // 海拔：市區平坦 + 中段兩座橋 + 尾段緩上
    const ele =
      8 +
      12 * Math.max(0, Math.sin((p - 0.18) * Math.PI * 3.4)) +
      6 * Math.max(0, Math.sin((p - 0.62) * Math.PI * 5)) +
      4 * p;

    // 配速：前半穩定 5:05，25K 起緩掉，32K 後明顯撞牆
    let pace = 305;
    if (km > 25) pace += (km - 25) * 4.5;
    if (km > 32) pace += (km - 32) * 11;
    pace += Math.sin(km * 2.3) * 6;              // 正常波動
    pace += Math.max(0, (ele - 10)) * 1.8;       // 上坡變慢

    // 心率：前段爬升到 158 後高原，後段掉速但心率不降 = cardiac drift
    let hr = 138 + Math.min(20, km * 2.6);
    if (km > 12) hr += Math.min(12, (km - 12) * 0.42);
    if (km > 32) hr += (km - 32) * 0.5;
    hr += Math.sin(km * 3.1) * 2.2;

    t += (pace * stepM) / 1000;

    pts.push({
      lat,
      lon,
      ele: +ele.toFixed(1),
      dist,
      paceSecPerKm: +pace.toFixed(1),
      hr: +Math.min(182, hr).toFixed(1),
      t: +t.toFixed(1),
    });
  }
  return pts;
}

/** 每公里分段（Day 22 復盤表格用） */
export function splitByKm(pts: TrackPoint[]) {
  const out: { km: number; paceSecPerKm: number; avgHr: number; drift: number }[] = [];
  const maxKm = Math.floor(pts[pts.length - 1].dist / 1000);
  for (let k = 0; k < maxKm; k++) {
    const seg = pts.filter((p) => p.dist >= k * 1000 && p.dist < (k + 1) * 1000);
    if (!seg.length) continue;
    const pace = seg.reduce((s, p) => s + p.paceSecPerKm, 0) / seg.length;
    const hr = seg.reduce((s, p) => s + p.hr, 0) / seg.length;
    out.push({ km: k + 1, paceSecPerKm: pace, avgHr: hr, drift: 0 });
  }
  // 心率飄移：相對前 5K 的基準
  const base = out.slice(0, 5).reduce((s, r) => s + r.avgHr / r.paceSecPerKm, 0) / 5;
  out.forEach((r) => {
    r.drift = +(((r.avgHr / r.paceSecPerKm - base) / base) * 100).toFixed(1);
  });
  return out;
}

export function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
