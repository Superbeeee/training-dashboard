<script setup lang="ts">
/**
 * Day 6：用 Web Bluetooth 讀米家體重機。
 *
 * 走 GATT 連線（service 0x181B / characteristic 0x2A9C notify），
 * 拿到的 13 bytes 與 weight_sync.py 讀廣播拿到的完全相同，共用同一套解析。
 *
 * 為什麼不用廣播（requestLEScan）—— 2026-08-22 實測結論：
 *   1. 該 API 仍鎖在 chrome://flags 的實驗性功能後面
 *   2. 開啟旗標後，方法存在、權限框也跳、Chrome 顯示「掃描中」，
 *      但 promise 永遠不 resolve，十秒零封包（Chromium 已知問題）
 *   3. 同時間 chrome://bluetooth-internals 看得到 MIBFS 正在廣播
 *      → 藍牙底層與 OS 權限都正常，是掃描 API 這層拿不到資料
 * 因此廣播路徑的實作已移除，只保留可用的 GATT。
 */
import { ref } from 'vue';

const SERVICE_BODY = 0x181b;
const CHAR_BODY_COMPOSITION = 0x2a9c;

interface Reading {
  weight: number; unit: string; impedance: number;
  hasImpedance: boolean; stabilized: boolean; raw: string;
}

const log = ref<string[]>([]);
const reading = ref<Reading | null>(null);
const busy = ref(false);
const packetCount = ref(0);
let device: any = null;

const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

const say = (m: string) =>
  log.value.push(`${new Date().toLocaleTimeString('zh-TW', { hour12: false })}  ${m}`);

/** 與 weight_sync.py 的 _parse() 同一套解析 */
function parse(dv: DataView): Reading | null {
  if (dv.byteLength < 13) return null;
  const ctrl0 = dv.getUint8(0);
  const ctrl1 = dv.getUint8(1);
  const rawW = dv.getUint16(11, true);   // 小端序
  let weight: number, unit: string;
  // 除數由單位旗標決定：公斤 0.005 解析度（÷200），磅與台斤 0.01（÷100）
  if (ctrl0 & 0x01) { weight = rawW / 100; unit = 'lb'; }
  else if (ctrl0 & 0x10) { weight = rawW / 100; unit = 'jin'; }
  else { weight = rawW / 200; unit = 'kg'; }
  const bytes = Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength));
  return {
    weight: +weight.toFixed(2), unit,
    impedance: dv.getUint16(9, true),
    hasImpedance: !!(ctrl1 & 0x02),
    stabilized: !!(ctrl1 & 0x20),
    raw: bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '),
  };
}

/**
 * 三個收包條件，與 Python 端一致。
 * 注意：最終那包有效資料同時也會帶「已離開（0x80）」位元，
 * 所以不能拿那個位元當排除條件，否則會把唯一想要的那包丟掉。
 */
function accept(r: Reading): boolean {
  return r.stabilized && r.hasImpedance && r.impedance !== 0 && r.impedance !== 0xffff;
}

function handlePacket(dv: DataView) {
  packetCount.value += 1;
  const r = parse(dv);
  if (!r) return say('封包長度不足 13 bytes，略過');
  say(`#${packetCount.value} ${r.raw} → ${r.weight}${r.unit} 阻抗=${r.impedance} 穩定=${r.stabilized}`);
  if (accept(r)) {
    reading.value = r;
    say('✅ 取得穩定讀數');
  }
}

async function connect() {
  busy.value = true;
  reading.value = null;
  packetCount.value = 0;
  try {
    say('要求裝置選擇…（請先踩一下喚醒體重機）');
    device = await (navigator as any).bluetooth.requestDevice({
      filters: [{ services: [SERVICE_BODY] }],
      optionalServices: [SERVICE_BODY],
    });
    say(`選到裝置：${device.name || '(無名稱)'}`);
    device.addEventListener('gattserverdisconnected', () => say('⚠️ 連線中斷'));

    const server = await device.gatt.connect();
    say('取得 service 0x181B…');
    const service = await server.getPrimaryService(SERVICE_BODY);
    say('取得 characteristic 0x2A9C…');
    const ch = await service.getCharacteristic(CHAR_BODY_COMPOSITION);

    ch.addEventListener('characteristicvaluechanged', (e: any) =>
      handlePacket(e.target.value as DataView)
    );
    await ch.startNotifications();
    say('已訂閱通知 —— 現在站上體重機，站穩不要動');
  } catch (err: any) {
    say(`❌ ${err?.name || 'Error'}: ${err?.message || String(err)}`);
  } finally {
    busy.value = false;
  }
}

function disconnect() {
  try {
    device?.gatt?.disconnect();
    device = null;
    say('已中斷連線');
  } catch { /* 忽略 */ }
}
</script>

<template>
  <div class="grid gap-3.5 grid-cols-1 lg:grid-cols-2">
    <div class="card">
      <h2 class="card-h">Web Bluetooth 讀體重機</h2>

      <div v-if="!hasBluetooth" class="note note-warn mb-3">
        這個瀏覽器沒有 Web Bluetooth。Safari / Firefox 全平台不支援，
        需要桌機版 Chrome 或 Edge（且頁面必須是 https 或 localhost）。
      </div>

      <div class="sub !mt-0 mb-3">
        連線後訂閱 <code>0x2A9C</code> 通知，拿到的是與
        <code>weight_sync.py</code> 相同的 13 bytes。
      </div>

      <div class="flex gap-2 mb-3.5">
        <button class="btn" :disabled="!hasBluetooth || busy" @click="connect">
          {{ busy ? '連線中…' : '連線體重機' }}
        </button>
        <button class="btn btn-ghost" @click="disconnect">中斷</button>
        <button class="btn btn-ghost" @click="log = []; packetCount = 0">清除紀錄</button>
      </div>

      <div v-if="reading" class="py-3.5">
        <div class="stat text-accent !text-[46px]">
          {{ reading.weight }}<span class="stat-u !text-lg">{{ reading.unit }}</span>
        </div>
        <div class="sub">
          阻抗 {{ reading.impedance }} Ω · 可推算體脂率與肌肉量
        </div>
      </div>
      <div v-else class="sub py-3.5">
        尚未取得穩定讀數。順序很重要：<b>先連線訂閱、再站上去</b>。
      </div>

      <div
        class="bg-[#0b1017] border border-line rounded-lg p-3 font-mono text-xs
               leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap break-all text-[#9fb3c8]"
      >{{ log.length ? log.join('\n') : '（尚無紀錄）' }}</div>
    </div>

    <div class="flex flex-col gap-3.5">
      <div class="card">
        <h2 class="card-h">為什麼是連線，不是聽廣播</h2>
        <div class="note">
          <code>weight_sync.py</code> 讀的是 BLE <b>廣播</b>——體重機不用連線就
          一直對外送資料。瀏覽器對應的 API 是 <code>requestLEScan()</code>，
          但實測走不通：<br /><br />
          開了 <code>chrome://flags</code> 的實驗性功能後，方法確實出現、權限框也跳、
          Chrome 顯示「掃描中」，<b>但 promise 永遠不 resolve，十秒零封包</b>。
          同一時間 <code>chrome://bluetooth-internals</code> 卻看得到體重機正在廣播
          ——底層正常，是掃描 API 這層拿不到。
        </div>
      </div>

      <div class="card">
        <h2 class="card-h">收包的三個條件</h2>
        <div class="note">
          <b>已穩定</b>、<b>有量到阻抗</b>、且<b>阻抗值不是 0 或 0xFFFF</b>
          （旗標有時會打開但值是無效填充）。<br /><br />
          另外封包裡的「已離開」位元不能拿來當排除條件——最終那包有效資料
          同時也會帶著它，排掉就永遠等不到結果。
        </div>
      </div>

      <div class="card">
        <h2 class="card-h">兩條路，兩種用途</h2>
        <div class="note">
          瀏覽器版必須由使用者按鈕觸發、且限 https 或 localhost，
          <b>做不了無人值守的自動化</b>。<br /><br />
          所以排程那條線留給 Python，網頁版負責「現在想量一下、當場看到數字」。
        </div>
      </div>
    </div>
  </div>
</template>
