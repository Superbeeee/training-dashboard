<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue';
import OverviewView from './views/OverviewView.vue';

// 總覽是進站第一眼,同步載入。其餘三個分頁動態載入 ——
// 3D 路線那頁光是 three.js 就佔掉整包的一半以上,而多數人不會點進去;
// 六場全馬那頁還要再抓 3.5 MB 的逐秒資料。
// 打開總覽卻先下載整個 3D 引擎,是沒有道理的。
const RacesView = defineAsyncComponent(() => import('./views/RacesView.vue'));
const Route3DView = defineAsyncComponent(() => import('./views/Route3DView.vue'));
const ScaleView = defineAsyncComponent(() => import('./views/ScaleView.vue'));
const PaceView = defineAsyncComponent(() => import('./views/PaceView.vue'));

type Tab = 'overview' | 'races' | 'pace' | 'route' | 'scale';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '總覽' },
  { id: 'races', label: '六場全馬' },
  { id: 'pace', label: '配速計算' },
  { id: 'route', label: '3D 路線' },
  { id: 'scale', label: '體重機' },
];
const tab = ref<Tab>('overview');
</script>

<template>
  <div class="max-w-[1180px] mx-auto px-4 pt-5 pb-16">
    <nav class="flex items-center gap-1.5 flex-wrap mb-5 pb-3.5 border-b border-line">
      <h1 class="text-[15px] font-bold tracking-wide mr-4 my-0">
        教練看不到的那<span class="text-accent">六天</span>
      </h1>
      <button
        v-for="t in TABS" :key="t.id"
        class="pill" :class="{ 'pill-on': tab === t.id }"
        @click="tab = t.id"
      >{{ t.label }}</button>
    </nav>

    <OverviewView v-if="tab === 'overview'" />
    <RacesView v-else-if="tab === 'races'" />
    <PaceView v-else-if="tab === 'pace'" />
    <Route3DView v-else-if="tab === 'route'" />
    <ScaleView v-else />
  </div>
</template>
