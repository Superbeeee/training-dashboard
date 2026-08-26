<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { fmtPace, fmtDuration, type TrackPoint } from '../lib/track';
import {
  useTrackStore, DATASETS, type Dataset, type ColorMode, type VerticalMode,
} from '../stores/track';

const store = useTrackStore();
const mount = ref<HTMLDivElement | null>(null);
let cleanup: (() => void) | null = null;

const COLOR_LABEL: Record<ColorMode, string> = { pace: '配速', hr: '心率', ele: '海拔' };

const rampCss = computed(() =>
  store.colorMode === 'ele'
    ? 'linear-gradient(90deg, hsl(223,75%,35%), hsl(150,75%,45%), hsl(61,75%,55%))'
    : 'linear-gradient(90deg, hsl(151,85%,45%), hsl(75,85%,48%), hsl(0,85%,51%))'
);

function ramp(t: number, mode: ColorMode): THREE.Color {
  const c = new THREE.Color();
  const x = Math.max(0, Math.min(1, t));
  if (mode === 'ele') c.setHSL(0.62 - x * 0.45, 0.75, 0.35 + x * 0.2);
  else c.setHSL(0.42 * (1 - x), 0.85, 0.45 + x * 0.06);
  return c;
}

function project(pts: TrackPoint[]) {
  const lat0 = pts[0].lat, lon0 = pts[0].lon;
  const mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return pts.map((p) => ({
    x: (p.lon - lon0) * mPerLon,
    z: -(p.lat - lat0) * 110540,
    ele: p.ele,
    t: p.t,
  }));
}

function render() {
  cleanup?.();
  cleanup = null;
  const el = mount.value;
  const track = store.points;
  if (!el || !track || track.length < 2) return;

  const w = el.clientWidth, h = el.clientHeight;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1017');
  const camera = new THREE.PerspectiveCamera(50, w / h, 0.5, 60000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  el.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.05;

  const proj = project(track);
  const xs = proj.map((p) => p.x), zs = proj.map((p) => p.z);
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const maxT = Math.max(...proj.map((p) => p.t)) || 1;
  const ex = store.exaggeration;
  const vert = store.vertical;

  // 垂直座標：海拔（誇張倍率）或時間（把重疊的圈數展開成螺旋）
  const yOf = (p: { ele: number; t: number }) =>
    vert === 'ele' ? p.ele * ex : (p.t / maxT) * extent * (ex / 18);

  const grid = new THREE.GridHelper(Math.max(extent * 2.2, 200), 30, 0x1e2a38, 0x161f2b);
  grid.position.y = Math.min(...proj.map(yOf)) - extent * 0.03;
  scene.add(grid);

  const mode = store.colorMode;
  const vals = track.map((p) => (mode === 'pace' ? p.paceSecPerKm : mode === 'hr' ? p.hr : p.ele));
  const sorted = [...vals].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.floor((sorted.length - 1) * f)];
  const vMin = q(0.02);
  // 配速是長尾分佈：站著休息時「配速」趨近無限大，照一般百分位取上界會讓
  // 所有真正在跑的區間擠成同一色，所以改用中位數倍率封頂。
  const vMax = mode === 'pace' ? Math.min(q(0.95), q(0.5) * 1.9) : q(0.98);

  const positions: number[] = [], colors: number[] = [];
  proj.forEach((p, i) => {
    positions.push(p.x, yOf(p), p.z);
    const c = ramp((vals[i] - vMin) / (vMax - vMin || 1), mode);
    colors.push(c.r, c.g, c.b);
  });

  const geo = new LineGeometry();
  geo.setPositions(positions);
  geo.setColors(colors);
  const mat = new LineMaterial({ linewidth: 3.5, vertexColors: true });
  mat.resolution.set(w, h);
  const line = new Line2(geo, mat);
  line.computeLineDistances();
  scene.add(line);

  // 海拔模式才畫簾幕；時間模式畫了會糊成一片
  let curtain: THREE.Mesh | null = null;
  if (vert === 'ele') {
    const cp: number[] = [], cc: number[] = [];
    const base = grid.position.y;
    for (let i = 0; i < proj.length - 1; i++) {
      const a = proj[i], b = proj[i + 1];
      const ay = yOf(a), by = yOf(b);
      cp.push(a.x, base, a.z, a.x, ay, a.z, b.x, by, b.z);
      cp.push(a.x, base, a.z, b.x, by, b.z, b.x, base, b.z);
      const c = ramp((vals[i] - vMin) / (vMax - vMin || 1), mode);
      for (let k = 0; k < 6; k++) cc.push(c.r, c.g, c.b);
    }
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cGeo.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    curtain = new THREE.Mesh(cGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    scene.add(curtain);
  }

  // 起點／終點：懸在上方的倒立圓錐指標
  const markR = Math.max(extent * 0.014, 1.5);
  const markers: THREE.Object3D[] = [];
  const addMarker = (p: { x: number; z: number; ele: number; t: number }, color: number) => {
    const g = new THREE.Group();
    const y = yOf(p), lift = markR * 5.5;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(markR * 1.15, markR * 2.6, 20),
      new THREE.MeshBasicMaterial({ color })
    );
    cone.rotation.x = Math.PI;
    cone.position.set(p.x, y + lift + markR * 1.3, p.z);
    g.add(cone);
    const stem = new THREE.Mesh(
      new THREE.BoxGeometry(markR * 0.12, lift, markR * 0.12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 })
    );
    stem.position.set(p.x, y + lift / 2, p.z);
    g.add(stem);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(markR * 0.5, 12, 12),
      new THREE.MeshBasicMaterial({ color })
    );
    dot.position.set(p.x, y, p.z);
    g.add(dot);
    scene.add(g);
    markers.push(g);
    return cone;
  };
  const startCone = addMarker(proj[0], 0x23d3a0);
  const endCone = addMarker(proj[proj.length - 1], 0xff6b6b);

  // 取景：把 bounding box 的八個角投影到相機的 right/up 軸上，量出實際需要的
  // 畫面寬高再回推距離。用外接球會嚴重高估 —— 馬拉松路線又長又平，球半徑是
  // 對角線的一半，但斜著看時佔的畫面遠比那小，結果路線只填滿三成畫面。
  const box = new THREE.Box3().setFromObject(line);
  const center = box.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(0.5, 0.55, 0.67).normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();

  const min = box.min, max = box.max;
  let halfW = 0, halfH = 0;
  for (const cx of [min.x, max.x])
    for (const cy of [min.y, max.y])
      for (const cz of [min.z, max.z]) {
        const v = new THREE.Vector3(cx, cy, cz).sub(center);
        halfW = Math.max(halfW, Math.abs(v.dot(right)));
        halfH = Math.max(halfH, Math.abs(v.dot(up)));
      }

  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = Math.max(halfW / Math.tan(hFov / 2), halfH / Math.tan(vFov / 2)) * 1.3;
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(dir, dist);
  controls.update();

  const raycaster = new THREE.Raycaster();
  // 注意：Line2 不看 params.Line，要設 params.Line2（螢幕空間像素單位）
  (raycaster.params as any).Line2 = { threshold: 14 };
  const pointer = new THREE.Vector2();
  const onMove = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(line);
    if (!hits.length) { store.hover = null; return; }
    const p = hits[0].point;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < proj.length; i += 2) {
      const d = (proj[i].x - p.x) ** 2 + (yOf(proj[i]) - p.y) ** 2 + (proj[i].z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    store.hover = track[best];
  };
  renderer.domElement.addEventListener('pointermove', onMove);

  const onResize = () => {
    const nw = el.clientWidth, nh = el.clientHeight;
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
    mat.resolution.set(nw, nh);
  };
  window.addEventListener('resize', onResize);

  let raf = 0;
  const bobBase = [startCone.position.y, endCone.position.y];
  const tick = () => {
    const s = performance.now() / 620;
    startCone.position.y = bobBase[0] + Math.sin(s) * markR * 0.55;
    endCone.position.y = bobBase[1] + Math.sin(s + Math.PI / 2) * markR * 0.55;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  tick();

  cleanup = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    renderer.domElement.removeEventListener('pointermove', onMove);
    controls.dispose();
    geo.dispose();
    mat.dispose();
    if (curtain) {
      curtain.geometry.dispose();
      (curtain.material as THREE.Material).dispose();
    }
    markers.forEach((g) => g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    }));
    renderer.dispose();
    el.removeChild(renderer.domElement);
  };
}

onMounted(async () => {
  if (!store.points) await store.select(store.dataset);
  render();
});
onBeforeUnmount(() => cleanup?.());
watch(
  () => [store.points, store.colorMode, store.vertical, store.exaggeration],
  () => render()
);
</script>

<template>
  <div class="grid gap-3.5 grid-cols-1 lg:grid-cols-[1fr_300px]">
    <div class="card !p-0 overflow-hidden relative">
      <div ref="mount" class="w-full h-[520px]" />
      <div v-if="!store.points" class="absolute inset-0 grid place-items-center text-dim text-[13px]">
        {{ store.error ? `載入失敗：${store.error}` : '載入軌跡中…' }}
      </div>
    </div>

    <div class="flex flex-col gap-3.5">
      <div class="card">
        <h2 class="card-h">資料來源</h2>
        <div class="flex gap-1.5 mb-2.5">
          <button
            v-for="(m, k) in DATASETS" :key="k"
            class="pill flex-1 !px-0 text-center text-xs"
            :class="{ 'pill-on': store.dataset === k }"
            @click="store.select(k as Dataset)"
          >{{ m.label }}</button>
        </div>
        <div class="sub">{{ store.meta.desc }}</div>
        <div v-if="store.stats" class="flex gap-3.5 mt-2.5 text-xs flex-wrap tnum">
          <span>{{ store.stats.km }} km</span>
          <span>{{ fmtDuration(store.stats.seconds) }}</span>
          <span class="text-hr">最高 {{ store.stats.maxHr }} bpm</span>
          <span class="text-accent">最快 {{ fmtPace(store.stats.bestPace) }}/km</span>
        </div>
      </div>

      <div class="card">
        <h2 class="card-h">垂直軸</h2>
        <div class="flex gap-1.5 mb-2">
          <button
            v-for="v in (['ele', 'time'] as VerticalMode[])" :key="v"
            class="pill flex-1 !px-0 text-center text-xs"
            :class="{ 'pill-on': store.vertical === v }"
            @click="store.vertical = v"
          >{{ v === 'ele' ? '海拔' : '時間' }}</button>
        </div>
        <input
          v-model.number="store.exaggeration" type="range" min="1" max="40"
          class="w-full accent-accent"
        />
        <div class="sub">
          {{ store.vertical === 'ele'
            ? `海拔誇張倍率 ×${store.exaggeration}。真實高低差只有十幾公尺，不誇張化看不出起伏。`
            : `時間軸尺度 ×${store.exaggeration}。田徑場繞圈軌跡會完全重疊，改用時間當高度把圈數展開成螺旋。` }}
        </div>
      </div>

      <div class="card">
        <h2 class="card-h">顏色映射</h2>
        <div class="flex gap-1.5 mb-3">
          <button
            v-for="m in (['pace', 'hr', 'ele'] as ColorMode[])" :key="m"
            class="pill flex-1 !px-0 text-center text-xs"
            :class="{ 'pill-on': store.colorMode === m }"
            @click="store.colorMode = m"
          >{{ COLOR_LABEL[m] }}</button>
        </div>
        <div class="h-2.5 rounded-full my-2" :style="{ background: rampCss }" />
        <div class="flex justify-between text-[11px] text-dim">
          <span>{{ store.colorMode === 'ele' ? '低' : '快 / 低' }}</span>
          <span>{{ COLOR_LABEL[store.colorMode] }}</span>
          <span>{{ store.colorMode === 'ele' ? '高' : '慢 / 高' }}</span>
        </div>
      </div>

      <div class="card">
        <h2 class="card-h">游標所在點</h2>
        <div v-if="store.hover" class="text-[13px] leading-8 tnum">
          <div>距離 <b>{{ (store.hover.dist / 1000).toFixed(2) }} km</b>／{{ fmtDuration(store.hover.t) }}</div>
          <div>配速 <b class="text-accent">{{ fmtPace(store.hover.paceSecPerKm) }}/km</b></div>
          <div>心率 <b class="text-hr">{{ Math.round(store.hover.hr) }} bpm</b></div>
          <div>海拔 <b>{{ store.hover.ele }} m</b></div>
        </div>
        <div v-else class="sub">把游標移到路線上看該點數據</div>
      </div>
    </div>
  </div>

  <div class="card mt-3.5">
    <h2 class="card-h">POC 筆記</h2>
    <div class="note">
      真實軌跡來自 <code>fit_sync.py export</code> 解析 Garmin 原始 FIT。兩個必要的清理：
      <b>配速補洞</b>（停錶時 speed=0，直接映射顏色會破圖）與
      <b>海拔平滑</b>（GPS 高度雜訊很大）。<br /><br />
      東京馬折返段同一地點兩次經過，記錄到的海拔中位數差 <b>4.6 公尺</b>、最大 8.6 公尺
      —— 整條路線真實高低差才 40 公尺，所以全馬的誇張倍率預設只開 ×5。
    </div>
  </div>
</template>
