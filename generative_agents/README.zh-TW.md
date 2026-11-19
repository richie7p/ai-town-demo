# Generative Agents（修改版）：12 位居民、50 天、GPT-6 Luna

這個資料夾是史丹佛／Google 論文〈Generative Agents: Interactive Simulacra of
Human Behavior〉官方程式碼的修改版（原始碼與授權見 `LICENSE`、`NOTICE.md`，
原版英文說明保留在 `README.md`）。目標是讓 12 位居民在小鎮裡連續生活
**50 個模擬天**，在 Google Cloud 上不需要人看著跑完。

> [!NOTE]
> 目前狀態：程式、12 位居民、Google Cloud 部署都已完成，並用「假的模型回答」完整測過
> （不花錢）。**還沒有用真正的 API 跑過**，下面的費用與時間都是估算，要以試跑實測為準。

## 12 位居民

| 家庭 | 居民 | 年齡 | 職業 | 故事起點（會在模擬中自己發展） |
|---|---|---|---|---|
| 陳家 | 陳建國 | 48 | 五金行老闆 | 生意變差，考慮週六開修理課 |
| | 陳美玲 | 46 | 藥局藥師 | 兩週後要在公園辦健康講座；擔心兒子吃不好睡不好 |
| | 陳宇翔 | 19 | 大一資工系 | 三週後期中考；偷偷想轉讀音樂，很欣賞蔡依婷 |
| 吳家 | 吳家豪 | 36 | 酒吧老闆 | 想辦每月一次的開放麥克風之夜；夫妻正在討論要不要生小孩 |
| | 吳怡君 | 34 | 自由接案插畫家 | 繪本五週後交稿；對生小孩還沒準備好，沒跟先生說 |
| 張家 | 張福來 | 71 | 退休木匠 | 想教年輕人木工，想借五金行後面開課 |
| | 張秀琴 | 68 | 退休老師、社區志工 | 每週日中午在公園辦百家宴；想幫李佳穎介紹對象 |
| 合租屋 | 黃詩涵 | 29 | 藥局店員 | 六週後考藥師執照，每晚念書很累 |
| | 李佳穎 | 27 | 咖啡師 | 存錢想開自己的咖啡店；暗戀周子豪 |
| 藝術家共居 | 周子豪 | 26 | 畫家 | 四週後在咖啡廳辦個展，還差八幅畫；沒發現李佳穎喜歡他 |
| | 蔡依婷 | 24 | 獨立音樂人 | 在寫第一張 EP；被邀請主持開放麥克風之夜，不確定有沒有時間 |
| 單身 | 林志明 | 45 | 咖啡廳老闆 | 籌備周子豪的個展；考慮再請一位咖啡師 |

模擬從 **2027 年 3 月 1 日（星期一）** 開始。地圖沿用原版，但把住家改成新居民的名字
（例如「Chen (陳) family's house」）；沒人住的房子改名為 empty neighbor's house，居民不會跑進去。
人物設定在 `scripts/build_tw12.py`，修改後執行它就會重新產生初始設定。

### 語言

- **對話、內心想法、反思、每日近況**：繁體中文（`GA_LANGUAGE=zh-TW`）
- **動作描述**（例如 sleeping、having breakfast）：維持英文，因為原版程式用英文關鍵字判斷居民狀態
- 想全部用英文：`GA_LANGUAGE=en`

## 省錢版設定（預設）

| 工作 | 例子 | 思考程度 |
|---|---|---|
| 例行判斷 | 重要性評分、選地點與物件、表情符號 | 不思考（`none`） |
| 重要決策 | 排行程、要不要聊天、對話、反思、每日近況 | 稍微想一下（`low`） |

另外，同一位居民遇到同樣的事件只評一次重要性分數（例如「床沒人用」），不重複問模型。

### 費用估計（12 人、50 模擬天）

| | API | Google Cloud | 合計 |
|---|---|---|---|
| 省錢版 | 約 $95 | 約 $40 | 約 $135 |
| 省錢版＋Flex 半價（`GA_SERVICE_TIER=flex`，較慢） | 約 $50 | 約 $40 | 約 $90 |

估算方式：用原版 25 人小鎮實際跑一天、統計每種提示詞的呼叫次數（每天約 6.4 萬次），
再依 GPT-6 Luna 價格（每百萬 token 輸入 $0.10、輸出 $0.50）換算。現實時間約 10 天（5 倍速）。

## 本機準備（第一次）

需要 Python 3.11 以上。

```bash
cd generative_agents
python3 -m venv .venv
```

```bash
.venv/bin/pip install -r reverie/requirements-sim.txt pytest
```

確認一切正常（不呼叫 API）：

```bash
cd reverie && ../.venv/bin/python -m pytest -q tests
```

## 用 NVIDIA NIM 測試（4 人、正常流速）

測試用的是 **4 人小鎮**（`base_the_ville_tw4`）：林志明、李佳穎、周子豪、黃詩涵，
都會在咖啡廳交會，從 **早上 7 點** 開始，預設 **時間流速和現實一樣**（模擬 1 分鐘 = 現實 1 分鐘）。

用假答案實測：4 人一天平均每分鐘只需約 4 次呼叫；但起床排行程（7:00、8:00）和聊天時會短暫需要
50～150 次，所以仍保留每分鐘最多 35 次的限速，尖峰會被分散開，小鎮時間短暫落後後再追上。

1. 到 [build.nvidia.com](https://build.nvidia.com) 申請 API Key（`nvapi-` 開頭）。
2. 設定金鑰：

```bash
export NVIDIA_API_KEY=nvapi-你的金鑰
```

3. 執行（預設跑 7:00～13:00，正常流速約 6 小時；隨時可按 Ctrl+C 存檔停止）：

```bash
generative_agents/scripts/run_nim_test.sh
```

| 想要 | 指令 |
|---|---|
| 只跑 1 個模擬小時 | `scripts/run_nim_test.sh 360` |
| 快 10 倍 | `SPEED=10 scripts/run_nim_test.sh` |
| 12 人、全速（受限速 35 次／分鐘） | `FORK=base_the_ville_tw12 SPEED= scripts/run_nim_test.sh` |

它會先呼叫一次模型與文字向量確認設定正確，再開始模擬，最後印出中文報告。預設模型是
`meta/llama-3.3-70b-instruct`、文字向量 `nvidia/nv-embedqa-e5-v5`；要換就先設定 `GA_MODEL`、
`GA_EMBED_MODEL`（模型名稱請到 build.nvidia.com 確認）。中途停止後，用報告開頭顯示的模擬名稱
接續：`cd reverie/backend_server && ../../.venv/bin/python headless.py --sim <名稱> --days 1 --speed 1`
（記得同樣的 NIM 環境變數要先設定，可參考 `run_nim_test.sh` 開頭）。

`headless.py` 的 `--speed` 參數：1 = 和現實一樣快，10 = 快 10 倍；不設定 = 能跑多快就跑多快。

## 用 GPT-6 Luna 在本機執行

```bash
export OPENAI_API_KEY=你的金鑰
```

```bash
generative_agents/.venv/bin/python generative_agents/scripts/check_api.py
```

```bash
cd generative_agents/reverie/backend_server && ../../.venv/bin/python headless.py --fork base_the_ville_tw12 --sim luna-pilot --days 1 --max-steps 1080 --max-cost 5
```

（`--max-steps 1080` = 3 個模擬小時；`--max-cost` 是花費上限，到了會自動存檔停止。）

看結果：

```bash
generative_agents/.venv/bin/python generative_agents/scripts/summarize_run.py luna-pilot
```

| `headless.py` 參數 | 說明 |
|---|---|
| `--sim` | 這次模擬的名稱（資料在 `environment/frontend_server/storage/<名稱>`） |
| `--fork` | 第一次執行時從哪個初始設定開始（12 人：`base_the_ville_tw12`；原版 25 人：`base_the_ville_n25`） |
| `--days` | 跑到第幾個模擬天結束；之後用更大的數字執行同一個 `--sim` 就會接續 |
| `--max-steps` | 這次最多跑幾步（360 步 = 1 個模擬小時） |
| `--max-cost` | 花費上限（美元） |
| `--speed` | 時間流速（1 = 現實速度）；不設定 = 全速 |
| `--fake-llm` | 不呼叫 API 的空跑 |

## 部署到 Google Cloud

架構：一台 Compute Engine VM 執行模擬容器；資料放在獨立的永久磁碟；每小時備份到
Cloud Storage；API Key 放在 Secret Manager；當機或 VM 重開機都會從最後的存檔繼續。

需要：已安裝並登入的 [gcloud CLI](https://cloud.google.com/sdk/docs/install)、一個已開啟帳單的專案。

```bash
cd generative_agents/deploy/gcp && cp config.env.example config.env
```

編輯 `config.env`：至少填 `PROJECT_ID`、`BUCKET`。預設已是 12 人、省錢版、試跑 1 天、花費上限 $150。
要改用 NIM，照檔案最下面的說明替換幾行。然後依序執行：

```bash
./setup.sh
```

（一次性：開啟服務、建立儲存桶與映像庫、服務帳號，並請你貼上 API Key 存進 Secret Manager。）

```bash
./build.sh
```

```bash
./create_vm.sh
```

| 指令 | 用途 |
|---|---|
| `./status.sh` | 進度、模擬時間、累計花費（約每小時更新） |
| `./logs.sh` | 容器最近的輸出 |
| `./stop.sh` | 存檔後停止 |
| `./resume.sh` | 停止後繼續 |
| `./update_env.sh` | 修改 `config.env`（例如 `DAYS` 從 1 改成 50）後套用並接續 |
| `./delete_vm.sh` | 刪除 VM（資料磁碟與儲存桶保留） |

結果在 `gs://<儲存桶>/runs/<模擬名稱>/`。下載後可用 `scripts/summarize_run.py` 產生中文報告。

**建議流程：** NIM 測試確認能跑 → 雲端用 Luna 試跑 1 天（`DAYS=1`），看實際每天花費與耗時 →
`DAYS=50`、調整 `MAX_COST` → `./update_env.sh` 接續跑完。

## 模型設定（環境變數）

| 變數 | 預設 | 說明 |
|---|---|---|
| `GA_API` | `responses` | `chat` = Chat Completions（NVIDIA NIM 等相容 API） |
| `GA_BASE_URL` | OpenAI | 例如 `https://integrate.api.nvidia.com/v1` |
| `GA_MODEL` | `gpt-6-luna` | 模型名稱 |
| `GA_REASONING_HIGH` | `low` | 重要決策的思考程度 |
| `GA_REASONING_LOW` | `none` | 例行判斷的思考程度 |
| `GA_REASONING_OVERRIDES` | 無 | 個別調整，例如 `daily_plan=medium` |
| `GA_SERVICE_TIER` | `auto` | `flex` = 半價但較慢 |
| `GA_LANGUAGE` | `zh-TW` | `en` = 全英文 |
| `GA_EMBED_MODEL` | `text-embedding-3-small` | 記憶向量模型 |
| `GA_EMBED_DIMENSIONS` | `512` | 向量長度；NIM 請留空 |
| `GA_EMBED_EXTRA_BODY` | 無 | NIM：`{"input_type":"passage","truncate":"END"}` |
| `GA_MAX_CONCURRENCY` | `16` | 同時進行的呼叫數 |
| `GA_MAX_RPM` | 無 | 每分鐘最多呼叫次數（NIM 免費帳號建議 35） |
| `GA_PRICE_*` | Luna 價格 | 用來計算花費；NIM 免費測試設 0 |
| `GA_VERBOSE` | `0` | `1` = 顯示原版所有提示詞輸出 |

## 原版地圖美術

地圖與角色圖由 PixyMoon 與 LimeZu 繪製，沒有放進 repo；需要原版瀏覽器畫面時執行
`scripts/fetch_assets.sh` 下載。

## 尚未完成

- 用真正的 API（NIM、Luna）實際跑過
- 讀取新記錄格式（`movement_log`）的回放畫面；目前用 `summarize_run.py` 看文字報告
