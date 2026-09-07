<script setup lang="ts">
/**
 * 六場全馬疊圖。用 Canvas 不用 SVG。
 *
 * 為什麼換掉 SVG：單場 12,128 點塞進一個 <path> 的 d 屬性就是 140 KB 的
 * 字串，六場接近 1 MB 的 DOM。而且每次切換橫軸都要重算整串重新 parse。
 * Canvas 沒有 DOM，畫完就是像素。
 *
 * 代價是失去 DOM 帶來的東西：沒有 hover 事件、沒有 CSS、螢幕閱讀器讀不到。
 * 所以 hover 要自己算最近點（見 pick），無障礙靠底下的表格補。
 *
 * 觸控是另一筆債。桌機是「滑到哪顯示哪」，但手機沒有 hover 這個狀態 ——
 * 手指碰到螢幕就已經是按下去了。若照搬 touchmove，就得 preventDefault
 * 擋掉捲動，而這張圖佔了螢幕一大半，使用者會覺得頁面卡住。
 * 所以觸控改成**點一下顯示、再點別處換位置**，捲動完全不受影響。
 */
import { ref, watch, onMounted, computed } from 'vue';
import { curve, mmss, type Race, type XAxis } from '../lib/races';

const props = defineProps<{
  races: Race[];
  axis: XAxis;
  field: 'hr' | 'p';
  colorOf: (slug: string) => string;
  height?: number;
  /** 回放的播放頭位置（跟橫軸同一個單位）。null = 沒在回放 */
  playhead?: number | null;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const box = ref<HTMLDivElement | null>(null);
// 畫布實際寬度。降採樣的點數要跟著它走 —— 桌機 800px 和手機 340px
// 用同一個點數的話,手機上每個像素會擠三倍的點,線糊成一團
const cw = ref(800);
const hover = ref<{ x: number; y: number; race: string; val: number } | null>(null);
// 窄螢幕反而要更高。橫向被壓縮之後,六條線只剩垂直方向可以分開
const H = computed(() => props.height ?? (cw.value < 480 ? 320 : 260));
// 窄螢幕把左邊留給刻度的空間縮小,不然畫線的區域被吃掉太多
const PAD = computed(() => ({ l: cw.value < 480 ? 38 : 46, r: 12, t: 12, b: 26 }));

/** 每條線要留幾個點。
 *
 *  一個像素只畫得出一個位置,所以點數超過像素寬度就是白算。但也不能
 *  剛好等於寬度 —— 六條線疊在一起的時候,每條都塞滿會糊成一片,
 *  所以取寬度的八成,線之間才有空隙。
 *  手機(~340px)因此只留 270 點左右,桌機(~800px)是 640。 */
const samples = computed(() => Math.max(120, Math.round(cw.value * 0.8)));

// 降採樣後的曲線。寬度、橫軸或欄位變了才重算,不是每次重繪都算
const curves = computed(() =>
  props.races.map((r) => ({
    slug: r.slug,
    name: r.name,
    color: props.colorOf(r.slug),
    pts: curve(r, props.axis, props.field, samples.value),
  })),
);

function draw() {
  const cv = canvas.value, wrap = box.value;
  if (!cv || !wrap || !curves.value.length) return;

  // Retina：canvas 的像素緩衝要乘上 devicePixelRatio,不然線是糊的
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth, h = H.value;
  if (w !== cw.value) cw.value = w;    // 寬度變了要重新降採樣
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = `${w}px`; cv.style.height = `${h}px`;

  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  const all = curves.value.flatMap((s) => s.pts);
  const xs = all.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);

  // Y 軸取百分位不取 min/max。一場全馬裡總有幾秒是停下來的 —— 等紅燈、
  // 補給、綁鞋帶 —— 那幾秒的配速會算出 70 分/km,用 max 的話整條軸會被
  // 那一個點撐開。
  //
  // 但 98 百分位還是太寬:六場實測 1~98% 跨 4.4~9.2 分/km,而中間 50%
  // 的資料只佔 4.7~5.3 —— **一半以上的資料被壓在上緣 16% 的高度裡**,
  // 六條線當然分不開。收到 92%,把畫面讓給真正在跑的那一段。
  const sorted = all.map((p) => p.y).sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
  const y0 = q(0.02), y1 = q(0.92);
  const px = (x: number) => PAD.value.l + ((x - x0) / (x1 - x0 || 1)) * (w - PAD.value.l - PAD.value.r);
  // 配速的 y 軸要反過來 —— 秒數小 = 跑得快 = 該在上面
  const py = (y: number) => {
    // 夾在 0~1 —— 超出百分位範圍的點畫在邊緣,而不是飛出畫布外
    const n = Math.max(0, Math.min(1, (y - y0) / (y1 - y0 || 1)));
    return PAD.value.t + (props.field === 'p' ? n : 1 - n) * (h - PAD.value.t - PAD.value.b);
  };

  c.strokeStyle = '#243040'; c.lineWidth = 1;
  c.font = '10px system-ui'; c.fillStyle = '#8b98a8';
  for (let i = 0; i <= 2; i++) {
    const v = y0 + ((y1 - y0) / 2) * i, y = py(v);
    c.beginPath(); c.moveTo(PAD.value.l, y); c.lineTo(w - PAD.value.r, y); c.stroke();
    c.fillText(props.field === 'p' ? mmss(v) : v.toFixed(0), 4, y + 3);
  }

  // 窄螢幕線細一點,六條疊在一起才不會糊成一片
  c.lineWidth = w < 480 ? 1.1 : 1.6;
  c.lineJoin = 'round';
  for (const s of curves.value) {
    c.strokeStyle = s.color; c.beginPath();
    s.pts.forEach((p, i) => (i ? c.lineTo(px(p.x), py(p.y)) : c.moveTo(px(p.x), py(p.y))));
    c.stroke();
  }

  if (hover.value) {
    const hx = px(hover.value.x);
    c.strokeStyle = '#4a5768'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(hx, PAD.value.t); c.lineTo(hx, h - PAD.value.b); c.stroke();
  }

  // 播放頭：一條線加上每場當下位置的圓點
  if (props.playhead != null) {
    const hx = px(props.playhead);
    c.strokeStyle = '#e8eef6'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(hx, PAD.value.t); c.lineTo(hx, h - PAD.value.b); c.stroke();

    for (const s of curves.value) {
      // 找出這條線在播放頭左側的最後一個點
      let cur = null;
      for (const pt of s.pts) { if (pt.x > props.playhead) break; cur = pt; }
      if (!cur) continue;
      c.fillStyle = s.color;
      c.beginPath(); c.arc(hx, py(cur.y), 3.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#0b1017'; c.lineWidth = 1.2; c.stroke();
    }
  }
}

/** 由畫面上的 x 座標找出最近的資料點。滑鼠與觸控共用。 */
function pick(clientX: number) {
  const wrap = box.value; if (!wrap || !curves.value.length) return;
  const w = wrap.clientWidth;
  const all = curves.value.flatMap((s) => s.pts);
  const xs = all.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const rx = clientX - wrap.getBoundingClientRect().left;
  const xv = x0 + ((rx - PAD.value.l) / (w - PAD.value.l - PAD.value.r)) * (x1 - x0);

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

// 觸控:點一下標一個位置,再點一次換位置,點同一處收起來。
// 不用 touchmove —— 那會跟捲動搶手勢
function onTap(e: PointerEvent) {
  if (e.pointerType === 'mouse') return;   // 滑鼠走 mousemove 那條
  const before = hover.value?.x;
  pick(e.clientX);
  if (before != null && hover.value && Math.abs(before - hover.value.x) < 1e-6) {
    hover.value = null; draw();            // 點同一個地方 = 收起來
  }
}

onMounted(() => { draw(); window.addEventListener('resize', draw); });
watch([curves, H, () => props.playhead], draw);
</script>

<template>
  <div
    ref="box" class="relative w-full"
    @mousemove="pick($event.clientX)"
    @mouseleave="hover = null; draw()"
    @pointerup="onTap"
  >
    <canvas ref="canvas" class="block w-full" />
    <div
      v-if="hover"
      class="absolute top-2 right-2 text-[11px] bg-[#141b24] border border-line rounded px-2 py-1 pointer-events-none"
    >
      {{ hover.race }}　{{ field === 'p' ? mmss(hover.val) + '/km' : hover.val.toFixed(0) + ' bpm' }}
    </div>
    <!-- 觸控裝置才提示怎麼收起來。用 hover 媒體查詢判斷,不是判斷螢幕寬度 ——
         有觸控筆的桌機、有滑鼠的平板都存在 -->
    <div
      v-if="hover"
      class="absolute bottom-1 right-2 text-[10px] text-dim pointer-events-none hidden [@media(hover:none)]:block"
    >再點一次收起</div>
  </div>
</template>
