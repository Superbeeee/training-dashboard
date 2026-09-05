/**
 * LTTB（Largest-Triangle-Three-Buckets）降採樣。
 *
 * 六場全馬疊起來是 72,768 個點。直接塞進 SVG 的 `d` 屬性，單場就是
 * 140 KB 的字串，六場接近 1 MB —— 而螢幕上根本畫不出那麼多像素。
 *
 * 但不能用「每 N 點取一點」：那是在固定位置取樣，剛好落在轉折點之間
 * 就會把它跳過去。東京馬 35K 之後配速從 4:33 掉到 5:57，那個轉折是
 * 整場最重要的一個點，抽稀時把它弄丟就白畫了。
 *
 * LTTB 的作法是把資料切成 N 個桶，每桶挑一個「跟前後兩點圍成的三角形
 * 面積最大」的點 —— 面積大代表那個點偏離直線最多，也就是視覺上的轉折。
 * 首末兩點一律保留。
 */
export function lttb<T>(
  data: T[],
  threshold: number,
  x: (d: T) => number,
  y: (d: T) => number,
): T[] {
  if (threshold >= data.length || threshold < 3) return data;

  const out: T[] = [data[0]];
  // 首末各佔一個名額，中間平分
  const every = (data.length - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    // 下一個桶的平均點，當作三角形的第三個頂點
    const lo = Math.floor((i + 1) * every) + 1;
    const hi = Math.min(Math.floor((i + 2) * every) + 1, data.length);
    let ax = 0, ay = 0;
    for (let j = lo; j < hi; j++) { ax += x(data[j]); ay += y(data[j]); }
    const n = hi - lo || 1;
    ax /= n; ay /= n;

    const from = Math.floor(i * every) + 1;
    const to = Math.floor((i + 1) * every) + 1;
    const px = x(data[a]), py = y(data[a]);

    let best = -1, bestIdx = from;
    for (let j = from; j < to && j < data.length; j++) {
      // 三角形面積（省略 ×0.5，比大小用不到）
      const area = Math.abs((px - ax) * (y(data[j]) - py) - (px - x(data[j])) * (ay - py));
      if (area > best) { best = area; bestIdx = j; }
    }
    out.push(data[bestIdx]);
    a = bestIdx;
  }

  out.push(data[data.length - 1]);
  return out;
}
