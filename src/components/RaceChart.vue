<script setup lang="ts">
/**
 * 六場全馬疊圖。用 Canvas 不用 SVG。
 *
 * 為什麼換掉 SVG：單場 12,128 點塞進一個 <path> 的 d 屬性就是 140 KB 的
 * 字串，六場接近 1 MB 的 DOM。而且每次切換橫軸都要重算整串重新 parse。
 * Canvas 沒有 DOM，畫完就是像素。
 *
 * 代價是失去 DOM 帶來的東西：沒有 hover 事件、沒有 CSS、螢幕閱讀器讀不到。
 * 所以 hover 要自己算最近點（見 onMove），無障礙靠底下的表格補。
 */
import { ref, watch, onMounted, computed } from 'vue';
import { curve, mmss, type Race, type XAxis } from '../lib/races';

const props = defineProps<{
  races: Race[];
  axis: XAxis;
  field: 'hr' | 'p';
  colorOf: (slug: string) => string;
  height?: number;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const box = ref<HTMLDivElement | null>(null);
const hover = ref<{ x: number; y: number; race: string; val: number } | null>(null);
const H = computed(() => props.height ?? 260);
const PAD = { l: 46, r: 12, t: 12, b: 26 };

// 降採樣後的曲線。切換橫軸或欄位才重算,不是每次重繪都算
const curves = computed(() =>
  props.races.map((r) => ({
    slug: r.slug,
    name: r.name,
    color: props.colorOf(r.slug),
    pts: curve(r, props.axis, props.field, 900),
  })),
);

function draw() {
  const cv = canvas.value, wrap = box.value;
  if (!cv || !wrap || !curves.value.length) return;

  // Retina：canvas 的像素緩衝要乘上 devicePixelRatio,不然線是糊的
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth, h = H.value;
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = `${w}px`; cv.style.height = `${h}px`;

  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  const all = curves.value.flatMap((s) => s.pts);
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (w - PAD.l - PAD.r);
  // 配速的 y 軸要反過來 —— 秒數小 = 跑得快 = 該在上面
  const py = (y: number) => {
    const n = (y - y0) / (y1 - y0 || 1);
    return PAD.t + (props.field === 'p' ? n : 1 - n) * (h - PAD.t - PAD.b);
  };

  c.strokeStyle = '#243040'; c.lineWidth = 1;
  c.font = '10px system-ui'; c.fillStyle = '#8b98a8';
  for (let i = 0; i <= 2; i++) {
    const v = y0 + ((y1 - y0) / 2) * i, y = py(v);
    c.beginPath(); c.moveTo(PAD.l, y); c.lineTo(w - PAD.r, y); c.stroke();
    c.fillText(props.field === 'p' ? mmss(v) : v.toFixed(0), 4, y + 3);
  }

  c.lineWidth = 1.6; c.lineJoin = 'round';
  for (const s of curves.value) {
    c.strokeStyle = s.color; c.beginPath();
    s.pts.forEach((p, i) => (i ? c.lineTo(px(p.x), py(p.y)) : c.moveTo(px(p.x), py(p.y))));
    c.stroke();
  }

  if (hover.value) {
    const hx = px(hover.value.x);
    c.strokeStyle = '#4a5768'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(hx, PAD.t); c.lineTo(hx, h - PAD.b); c.stroke();
  }
}

function onMove(e: MouseEvent) {
  const wrap = box.value; if (!wrap || !curves.value.length) return;
  const w = wrap.clientWidth;
  const all = curves.value.flatMap((s) => s.pts);
  const xs = all.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const rx = e.clientX - wrap.getBoundingClientRect().left;
  const xv = x0 + ((rx - PAD.l) / (w - PAD.l - PAD.r)) * (x1 - x0);

  // Canvas 沒有 DOM 可以掛事件,最近點得自己找
  let best: typeof hover.value = null, bd = Infinity;
  for (const s of curves.value) {
    for (const p of s.pts) {
      const d = Math.abs(p.x - xv);
      if (d < bd) { bd = d; best = { x: p.x, y: p.y, race: s.name, val: p.y }; }
    }
  }
  hover.value = best; draw();
}

onMounted(() => { draw(); window.addEventListener('resize', draw); });
watch([curves, H], draw);
</script>

<template>
  <div ref="box" class="relative w-full" @mousemove="onMove" @mouseleave="hover = null; draw()">
    <canvas ref="canvas" class="block w-full" />
    <div
      v-if="hover"
      class="absolute top-2 right-2 text-[11px] bg-[#141b24] border border-line rounded px-2 py-1 pointer-events-none"
    >
      {{ hover.race }}　{{ field === 'p' ? mmss(hover.val) + '/km' : hover.val.toFixed(0) + ' bpm' }}
    </div>
  </div>
</template>
