import { ref, computed, onUnmounted } from 'vue';

/**
 * 賽事回放。
 *
 * 大綱原本把這件事列在「WebSocket vs SSE」底下,因為「即時推播」聽起來
 * 就該用那些東西。實際做下去才發現**這裡沒有任何東西需要推播** ——
 * 六場的逐秒資料在頁面載入時就全在瀏覽器裡了,回放只是「按時間軸重新
 * 讀一遍已經有的陣列」。伺服器沒有東西可以推。
 *
 * 需要的只是一個跟著螢幕更新率走的計時器:
 *
 * - **用 rAF 不用 setInterval**。setInterval 的間隔不保證準,而且分頁切到
 *   背景時瀏覽器會把它降頻到一秒一次,回來就會發現時間對不上。
 *   rAF 在背景直接暫停,回來接著跑。
 * - **用 delta time 前進,不是每幀加固定值**。60Hz 和 120Hz 的螢幕每秒
 *   收到的幀數差一倍,加固定值的話高刷螢幕會播兩倍快。
 */
export function useReplay(durationSec: () => number) {
  const t = ref(0);            // 目前播到第幾秒（賽事時間）
  const playing = ref(false);
  const speed = ref(60);       // 幾倍速

  let raf = 0;
  let last = 0;

  function tick(now: number) {
    if (!playing.value) return;
    // 第一幀沒有前一幀可以比,先記下來就好
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    t.value += dt * speed.value;
    if (t.value >= durationSec()) {
      t.value = durationSec();
      playing.value = false;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function play() {
    if (playing.value) return;
    if (t.value >= durationSec()) t.value = 0;   // 播完了就從頭
    playing.value = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    playing.value = false;
    cancelAnimationFrame(raf);
  }

  const toggle = () => (playing.value ? pause() : play());

  /** 拖動進度條 —— 拖的時候要停,不然放開會跳回去 */
  function seek(sec: number) {
    pause();
    t.value = Math.max(0, Math.min(sec, durationSec()));
  }

  onUnmounted(pause);

  const progress = computed(() => (durationSec() ? t.value / durationSec() : 0));
  return { t, playing, speed, play, pause, toggle, seek, progress };
}

/** 某場比賽在第 sec 秒前後 window 秒的平均配速與心率。
 *
 *  不能直接讀那一秒的值 —— GPS 算出來的瞬時配速抖得很兇(同一段路
 *  逐秒可能在 4:30 和 5:10 之間跳),播放的時候數字會閃到看不懂。
 *  取一個區間平均才讀得出來。 */
export function windowAt(
  pts: { t: number; p: number | null; hr: number | null }[],
  sec: number,
  window = 30,
): { pace: number | null; hr: number | null } {
  const lo = sec - window / 2, hi = sec + window / 2;
  let ps = 0, pn = 0, hs = 0, hn = 0;
  // 逐秒資料,直接從二分搜到的位置往兩邊掃就好
  const i = pts.findIndex((p) => p.t >= lo);
  if (i < 0) return { pace: null, hr: null };
  for (let j = i; j < pts.length && pts[j].t <= hi; j++) {
    if (pts[j].p) { ps += pts[j].p!; pn++; }
    if (pts[j].hr) { hs += pts[j].hr!; hn++; }
  }
  return { pace: pn ? ps / pn : null, hr: hn ? hs / hn : null };
}

/** 某場比賽在第 sec 秒的狀態。二分搜尋,因為逐秒陣列有一萬多筆。 */
export function stateAt<T extends { t: number }>(pts: T[], sec: number): T | null {
  if (!pts.length || sec < pts[0].t) return null;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid].t <= sec) lo = mid; else hi = mid - 1;
  }
  return pts[lo];
}
