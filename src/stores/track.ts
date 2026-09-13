import { defineStore } from 'pinia';
import { buildTrack, loadTrack, type TrackPoint } from '../lib/track';

export type Dataset = 'tokyo' | 'interval' | 'synthetic';
export type ColorMode = 'pace' | 'hr' | 'ele';
// ele：海拔（地形）；time：起跑後秒數（把重疊的圈展開成螺旋，但螺距會混到配速）；
// dist：累積距離（每圈等高，螺距固定，配速全交給顏色）
export type VerticalMode = 'ele' | 'time' | 'dist';

interface DatasetMeta {
  label: string;
  desc: string;
  url?: string;
  vertical: VerticalMode;
  exaggeration: number;
}

export const DATASETS: Record<Dataset, DatasetMeta> = {
  tokyo: {
    label: '東京馬 3/01',
    desc: '2026 東京馬拉松，42.65 km / 3:22:07，12,128 筆逐秒 record。35K 後配速從 4:51 掉到 5:57，心率反而從 175 降到 161 —— 撞牆的教科書形狀。',
    url: '/tracks/20260301-tokyo.json',
    vertical: 'ele',
    // 這場高度誤差實測中位數 4.6m（同一地點兩次經過），倍率開太大會放大成假高低差
    exaggeration: 5,
  },
  interval: {
    label: '間歇 8/13',
    desc: '1600m×3 (r180s)，松山區田徑場，5.22 km / 28 分鐘。田徑場繞圈軌跡會重疊，預設用距離軸展開成螺旋：每圈等高，配速交給顏色。',
    url: '/tracks/20260813-interval.json',
    // 不用時間軸：快的圈佔的時間少、慢的佔得多，螺距會同時混到配速與時間佔比，
    // 跟顏色講的配速打架。距離軸每 400 m 一圈等高，形狀只剩圈數，配速全交給顏色。
    vertical: 'dist',
    exaggeration: 14,
  },
  synthetic: {
    label: '合成對照',
    desc: '合成的 42.195 km，開發期用來對照真實資料的形狀是否合理。',
    vertical: 'ele',
    exaggeration: 14,
  },
};

export const useTrackStore = defineStore('track', {
  state: () => ({
    dataset: 'tokyo' as Dataset,
    points: null as TrackPoint[] | null,
    error: null as string | null,
    colorMode: 'pace' as ColorMode,
    vertical: 'ele' as VerticalMode,
    exaggeration: 5,
    hover: null as TrackPoint | null,
  }),

  getters: {
    meta: (s) => DATASETS[s.dataset],
    loading: (s) => s.points === null && s.error === null,
    stats: (s) => {
      const p = s.points;
      if (!p?.length) return null;
      return {
        km: (p[p.length - 1].dist / 1000).toFixed(2),
        seconds: p[p.length - 1].t,
        maxHr: Math.max(...p.map((x) => x.hr)),
        bestPace: Math.min(...p.map((x) => x.paceSecPerKm)),
      };
    },
  },

  actions: {
    async select(d: Dataset) {
      this.dataset = d;
      this.points = null;
      this.error = null;
      this.hover = null;
      // 每個資料集有適合自己的垂直軸與倍率（田徑場用時間、全馬用海拔）
      this.vertical = DATASETS[d].vertical;
      this.exaggeration = DATASETS[d].exaggeration;

      const url = DATASETS[d].url;
      if (!url) {
        this.points = buildTrack();
        return;
      }
      try {
        const pts = await loadTrack(url);
        // 使用者可能在載入期間又切換了資料集
        if (this.dataset === d) this.points = pts;
      } catch (e) {
        if (this.dataset === d) this.error = String(e);
      }
    },
  },
});
