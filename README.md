# training-dashboard

馬拉松訓練資料的視覺層。跑步、重訓、體重、GPS 軌跡都在同一個畫面上。

技術棧：**Vite + Vue 3（script setup）+ Pinia + Tailwind CSS 4 + Three.js**

三個分頁：

| 分頁 | 內容 |
|---|---|
| 總覽 | 訓練紀錄（可翻週）、體重趨勢、最近一次間歇的分組明細、訓練負荷 |
| 3D 路線 | GPS 軌跡 + 海拔，配速／心率／海拔三種上色 |
| 體重機 | Web Bluetooth 直接讀米家體重機 |

```bash
npm install
npm run dev
```

---

## 資料從哪裡來

畫面本身不抓資料，只讀 `public/` 底下的 JSON。那些檔案由另一個 repo
[`personal-trainer`](https://github.com/Superbeeee/personal-trainer) 產生：

```
coach/logs/*.md          手寫的訓練紀錄
      ↓ parse_logs.py
public/sessions.json     每天練了什麼（含間歇的分組明細）
public/weights.json      體重與阻抗
```

產生指令：

```bash
cd ~/code/personal-trainer
.venv/bin/python parse_logs.py --json ~/code/training-dashboard/public/sessions.json
```

`scripts/sync_dashboard.sh` 把這件事包起來，由 launchd 每天 07:00 執行。

### 這兩個 JSON 不在版控裡

`public/sessions.json` 與 `public/weights.json` 已加入 `.gitignore`。

這個 repo 是公開的，而那兩個檔案裝的是**逐日訓練紀錄與體重**——前者會露出作息
與常去的地點，後者是健康資料。程式碼公開沒問題，資料不必跟著。

所以 clone 下來直接跑會看到「讀不到訓練紀錄」。要看畫面的話，`public/` 裡放一份
同樣結構的 JSON 就行：

```jsonc
// sessions.json —— 新到舊排序
[{
  "date": "2026-08-25",
  "kind": "run",              // run | bike | swim | lift
  "summary": "跑步(中山區田徑場 間歇:1000m×2 + 800m×3)",
  "moves": 0,                 // 動作數，重訓才有意義
  "reps": [{                  // 間歇的分組明細，沒有就空陣列
    "idx": 1, "distance": "1010m", "time": "4:06.5",
    "per400": "1:37.6", "per400_sec": 97.6, "pace": "4:04/km",
    "max_hr": 186, "rest": "3:01", "hit": true
  }]
}]

// weights.json —— 新到舊排序
[{ "at": "2026-08-26 00:42", "weight_kg": 72.3, "impedance": 457 }]
```

### 軌跡檔

`public/tracks/` 裡的兩份有進版控，因為起點都是公開場所（東京馬起跑區、
松山區田徑場）。**日常訓練的軌跡不要放進來**——那些的起點是住家。

---

## 畫面上有些數字還是假的

總覽頁的「訓練負荷 ATL/CTL/TSB」與「本週跑量」掛著橘色的**示意資料**標籤。

它們算不出來，因為 `sessions.json` 沒有總距離、也沒有逐秒心率——TRIMP 需要
後者。等 FIT 檔的心率資料接進來才會變成真的。

標籤是刻意留的：**假資料混在真資料裡而沒有標示，比沒有那張圖更糟。**

---

## 背景

這是 2026 iThome 鐵人賽系列〈教練看不到的那六天〉的視覺層。文章與規劃在
[`ithome-2026-marathon-dashboard`](https://github.com/Superbeeee/ithome-2026-marathon-dashboard)，
資料管線與 Telegram bot 在 `personal-trainer`。
