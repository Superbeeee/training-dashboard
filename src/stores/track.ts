import { defineStore } from 'pinia';
import { buildTrack, loadTrack, type TrackPoint } from '../lib/track';

export type Dataset = 'tokyo' | 'interval' | 'synthetic';
export type ColorMode = 'pace' | 'hr' | 'ele';
export type VerticalMode = 'ele' | 'time';

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
    desc: '2026 東京馬拉松，42.65 km / 3:22:07，12,128 筆逐秒 record。35K 後配速從 4:33 掉到 5:57，心率反而從 175 降到 161 —— 撞牆的教科書形狀。',
    url: '/tracks/20260301-tokyo.json',
    vertical: 'ele',
    // 這場高度誤差實測中位數 4.6m（同一地點兩次經過），倍率開太大會放大成假高低差
    exaggeration: 5,
  },
  interval: {
    label: '間歇 8/13',
    desc: '1600m×3 (r180s)，松山區田徑場，5.22 km / 28 分鐘。田徑場繞圈軌跡會重疊，預設用時間軸展開成螺旋。',
    url: '/tracks/20260813-interval.json',
    vertical: 'time',
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
