<script setup lang="ts">
/**
 * 六場全馬的色帶圖。
 *
 * 原本用折線,但六條線疊在 300px 寬的手機畫面裡本來就分不開 —— 不管
 * 怎麼平滑、怎麼降採樣,線與線交錯的地方就是讀不出來。
 *
 * 改成一場一條橫帶、顏色代表配速。好處是**線之間不再互相遮蔽**:
 * 每一場有自己的一條,而且色階的跳變比線的轉折更容易被眼睛抓到 ——
 * 崩掉的那一段會直接變成一塊紅色。
 *
 * 代價是**讀不出精確數值**。色帶回答「什麼時候變快變慢、哪一場比較穩」,
 * 要看某一點跑多少,點一下(或滑過去)看數字。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { curve, mmss, type Race, type XAxis } from '../lib/races';
import { stateAt } from '../lib/replay';

const props = defineProps<{
  races: Race[];
  axis: XAxis;
  field: 'hr' | 'p';
  /** 回放到第幾秒。null = 沒在回放。
   *  每條帶各自算位置 —— 同一秒六場跑到的距離不一樣。 */
  playTime?: number | null;
  height?: number;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const box = ref<HTMLDivElement | null>(null);
const cw = ref(800);
const hover = ref<{ race: string; val: number; x: number } | null>(null);

/** 標籤欄寬。窄螢幕壓縮,但不能沒有 —— 顏色現在代表配速,
 *  不再代表哪一場,所以名字一定要在帶子旁邊。 */
const LABEL = computed(() => (cw.value < 480 ? 54 : 72));
const PAD = { t: 8, r: 10, b: 22 };
const GAP = 4;

const bandH = computed(() => {
  const usable = (props.height ?? 260) - PAD.t - PAD.b - GAP * (props.races.length - 1);
  return Math.max(14, usable / Math.max(1, props.races.length));
});

const curves = computed(() =>
  props.races.map((r) => ({
    slug: r.slug,
    name: r.name,
    pts: curve(r, props.axis, props.field, Math.max(120, Math.round(cw.value * 0.8))),
  })),
);

/** 色階:快→慢。用現有的主題色,不另外引入色票。 */
const STOPS = ['#4ea8ff', '#23d3a0', '#a3e635', '#ffb454', '#ff5c5c'];
function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
const STOP_RGB = STOPS.map(rgb);
/** n 為 0（最快）到 1（最慢）。 */
function colorAt(n: number): string {
  const t = Math.max(0, Math.min(1, n)) * (STOP_RGB.length - 1);
  const i = Math.min(STOP_RGB.length - 2, Math.floor(t));
  const f = t - i;
  const c = STOP_RGB[i].map((a, k) => Math.round(a + (STOP_RGB[i + 1][k] - a) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** 色階的值域:整段資料的最小到最大,不裁。
 *  色帶不像折線會互相遮蔽,所以不需要為了「看清楚」去砍掉兩端 ——
 *  崩到 8 分還是 12 分,顏色差得出來。 */
const domain = computed(() => {
  const all = curves.value.flatMap((s) => s.pts.map((p) => p.y)).sort((a, b) => a - b);
  if (!all.length) return null;
  const q = (f: number) => all[Math.min(all.length - 1, Math.floor(all.length * f))];
  return { lo: all[0], hi: all[all.length - 1] };
});

function draw() {
  const cv = canvas.value, wrap = box.value, d = domain.value;
  if (!cv || !wrap || !d || !curves.value.length) return;
  const w = wrap.clientWidth;
  if (w !== cw.value) cw.value = w;
  const h = props.height ?? 260;

  const dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  const xs = curves.value.flatMap((s) => s.pts.map((p) => p.x));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const left = LABEL.value, right = w - PAD.r;
  const px = (x: number) => left + ((x - x0) / (x1 - x0 || 1)) * (right - left);
  // 心率相反：高心率才是「吃力」，跟配速的慢是同一端
  const norm = (v: number) =>
    props.field === 'p'
      ? (v - d.lo) / (d.hi - d.lo || 1)
      : 1 - (v - d.lo) / (d.hi - d.lo || 1);

  c.font = '11px system-ui';
  curves.value.forEach((s, i) => {
    const y = PAD.t + i * (bandH.value + GAP);

    // 色帶：一個資料點畫一格，格子之間不留縫
    s.pts.forEach((p, j) => {
      const nx = j + 1 < s.pts.length ? s.pts[j + 1].x : x1;
      const a = px(p.x), b = px(nx);
      c.fillStyle = colorAt(norm(p.y));
      c.fillRect(a, y, Math.max(1, b - a + 0.6), bandH.value);
    });

    c.fillStyle = '#c3cedb';
    c.textAlign = 'right';
    c.fillText(s.name, left - 6, y + bandH.value / 2 + 4);
  });

  // 播放游標:一條帶一個,各自在自己的位置。跑得快的那條會在前面 ——
  // 六個記號散開的樣子本身就是「誰領先」
  if (props.playTime != null) {
    props.races.forEach((race, i) => {
      const now = stateAt(race.points, props.playTime!);
      if (!now) return;
      const last = race.points[race.points.length - 1];
      const hx = px(props.axis === 'dist' ? now.d : now.t / (last.t || 1));
      const y = PAD.t + i * (bandH.value + GAP);
      c.fillStyle = '#e8eef6';
      c.fillRect(hx - 1, y - 2, 2, bandH.value + 4);
    });
  }
  if (hover.value) {
    const hx = px(hover.value.x);
    c.strokeStyle = '#0b1017'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(hx, PAD.t); c.lineTo(hx, h - PAD.b); c.stroke();
  }

  // 底部色階說明
  const gy = h - PAD.b + 6, gw = right - left;
  const g = c.createLinearGradient(left, 0, right, 0);
  STOPS.forEach((s, i) => g.addColorStop(i / (STOPS.length - 1), s));
  c.fillStyle = g; c.fillRect(left, gy, gw, 6);
  c.fillStyle = '#8b98a8'; c.textAlign = 'left';
  c.fillText(props.field === 'p' ? mmss(d.lo) : `${d.hi.toFixed(0)}`, left, gy + 16);
  c.textAlign = 'right';
  c.fillText(props.field === 'p' ? mmss(d.hi) : `${d.lo.toFixed(0)}`, right, gy + 16);
}

function pick(clientX: number, clientY: number) {
  const wrap = box.value, d = domain.value;
  if (!wrap || !d || !curves.value.length) return;
  const r = wrap.getBoundingClientRect();
  const rx = clientX - r.left, ry = clientY - r.top;
  const i = Math.floor((ry - PAD.t) / (bandH.value + GAP));
  const s = curves.value[i];
  if (!s) { hover.value = null; draw(); return; }

  const xs = curves.value.flatMap((q) => q.pts.map((p) => p.x));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const left = LABEL.value, right = wrap.clientWidth - PAD.r;
  const xv = x0 + ((rx - left) / (right - left)) * (x1 - x0);

  let best = s.pts[0], bd = Infinity;
  for (const p of s.pts) {
    const dd = Math.abs(p.x - xv);
    if (dd < bd) { bd = dd; best = p; }
  }
  hover.value = { race: s.name, val: best.y, x: best.x };
  draw();
}

function onTap(e: PointerEvent) {
  if (e.pointerType === 'mouse') return;
  pick(e.clientX, e.clientY);
}

let ro: ResizeObserver | null = null;
onMounted(() => {
  draw();
  if (box.value) {
    // ⚠️ 只在**寬度**變的時候重畫。draw() 會設定 canvas 的高度,而 canvas
    // 就在被觀察的容器裡 —— 高度一變又觸發觀察器,再 draw、再觸發,
    // 分頁會直接凍住。這是 ResizeObserver 的典型陷阱。
    ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w === cw.value) return;
      cw.value = w;
      draw();
    });
    ro.observe(box.value);
  }
});
onBeforeUnmount(() => ro?.disconnect());
watch([curves, () => props.height, () => props.playTime], draw);
</script>

<template>
  <div
    ref="box" class="relative w-full"
    @mousemove="pick($event.clientX, $event.clientY)"
    @mouseleave="hover = null; draw()"
    @pointerup="onTap"
  >
    <canvas ref="canvas" class="block w-full" />
    <div
      v-if="hover"
      class="absolute top-1 right-2 text-[11px] bg-[#141b24] border border-line
             rounded px-2 py-1 pointer-events-none tnum"
    >
      {{ hover.race }}　{{ field === 'p' ? mmss(hover.val) + '/km' : hover.val.toFixed(0) + ' bpm' }}
    </div>
  </div>
</template>
