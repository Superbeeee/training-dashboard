<script setup lang="ts">
import { ref } from 'vue';
import OverviewView from './views/OverviewView.vue';
import Route3DView from './views/Route3DView.vue';
import ScaleView from './views/ScaleView.vue';

type Tab = 'overview' | 'route' | 'scale';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '總覽' },
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
    <Route3DView v-else-if="tab === 'route'" />
    <ScaleView v-else />
  </div>
</template>
