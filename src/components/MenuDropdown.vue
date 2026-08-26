<script setup lang="ts">
/**
 * 一顆按鈕 + 一片浮出的選單。內容用 slot 給，所以單選（配速基準）
 * 與多選（欄位）共用同一個外殼。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue';

defineProps<{ label: string }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

// 點到選單外面要收起來 —— 用 capture 才不會被 slot 內部的 stopPropagation 擋掉
const onDocClick = (e: MouseEvent) => {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
};
const onEsc = (e: KeyboardEvent) => {
  if (e.key === 'Escape') open.value = false;
};

onMounted(() => {
  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onEsc);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick, true);
  document.removeEventListener('keydown', onEsc);
});
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line
             bg-panel-2 text-[12px] text-fg cursor-pointer transition
             hover:border-[#3a4757] whitespace-nowrap"
      :class="{ 'border-[#3a4757]': open }"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ label }}
      <span class="text-dim text-[9px] leading-none" :class="{ 'rotate-180': open }">▼</span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-20 mt-1.5 min-w-[10.5rem] rounded-lg border border-line
             bg-panel-2 p-1 shadow-lg shadow-black/40"
    >
      <slot />
    </div>
  </div>
</template>
