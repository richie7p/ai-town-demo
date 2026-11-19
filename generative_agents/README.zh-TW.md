# Generative Agents（修改版）：16 位居民、100 天、GPT-6 Luna

這個資料夾是史丹佛／Google 論文〈Generative Agents: Interactive Simulacra of
Human Behavior〉官方程式碼的修改版（原始碼與授權見 `LICENSE`、`NOTICE.md`，
原版英文說明保留在 `README.md`）。目標是讓居民在小鎮裡連續生活 **100 個遊戲天**，
在 Google Cloud 上不需要人看著跑完（預計現實時間約 20 天）。

> [!NOTE]
> 目前狀態：模型呼叫、無畫面執行、記憶儲存、Google Cloud 部署都已完成並通過離線測試；
> **16 位新居民還在設計中**，尚未用真正的 API 跑過試驗。下面的費用與時間都是估算，
> 要以第一天試跑的實測為準。

## 和原版的差別

| | 原版 | 這個版本 |
|---|---|---|
| 模型 | 已停用的 `text-davinci-003`、`gpt-3.5-turbo`（openai 0.27 套件） | `gpt-6-luna`（Responses API），可用環境變數更換 |
| 思考 | 無 | 規劃、對話、反思、每日身分更新用 `medium`；評分、選物件、表情符號用 `low` |
| 執行方式 | 必須開著瀏覽器，後端等前端回報位置 | `headless.py` 不需要瀏覽器 |
| 居民 | 一個一個依序處理 | 同時思考，對話衝突依原本順序處理 |
| 中斷 | 沒有存檔就全部重來 | 每個遊戲小時存檔，當機或重開機會從最後的存檔繼續 |
| 記憶 | 向量存在 JSON，每次回想逐筆計算 | NumPy 矩陣，一次算完（同一個公式） |
| API Key | 寫在 `utils.py` 裡 | 只從環境變數或 Secret Manager 讀取 |
| 日誌 | 不斷印出所有提示詞 | 預設關閉（`GA_VERBOSE=1` 可打開） |

完整的修改清單在 `NOTICE.md`。

## 本機試跑（不花錢）

```bash
cd generative_agents
python3 -m venv .venv
```

```bash
.venv/bin/pip install -r reverie/requirements-sim.txt pytest
```

```bash
cd reverie && ../.venv/bin/python -m pytest -q tests
```

用假的模型回答跑一段（不呼叫 API，用原版 25 人小鎮）：

```bash
cd reverie/backend_server && ../../.venv/bin/python headless.py --fork base_the_ville_n25 --sim dry --days 1 --fake-llm
```

## 本機真正執行

```bash
export OPENAI_API_KEY=你的金鑰
```

```bash
cd reverie/backend_server && ../../.venv/bin/python headless.py --fork base_the_ville_n25 --sim pilot --days 1 --max-cost 30
```

| 參數 | 說明 |
|---|---|
| `--sim` | 這次模擬的名稱（資料夾在 `environment/frontend_server/storage/<名稱>`） |
| `--fork` | 第一次執行時從哪個初始設定複製 |
| `--days` | 跑到第幾天結束；之後用更大的數字再執行同一個 `--sim` 就會接續 |
| `--max-cost` | 花費上限（美元），到了就存檔停止 |
| `--stop-file` | 這個檔案出現時存檔停止 |
| `--checkpoint-every` | 幾步存一次檔（預設 360 步 = 1 個遊戲小時） |

執行中會產生：`run_status.json`（進度與累計花費）、`usage.jsonl`（每次 API 呼叫的 token 與費用）、
`movement_log/day-XXX.jsonl.gz`（每一步每位居民的位置、動作與對話）、`checkpoint/`（最新存檔）。

## 模型設定（環境變數）

| 變數 | 預設 | 說明 |
|---|---|---|
| `GA_MODEL` | `gpt-6-luna` | 模型名稱 |
| `GA_REASONING_HIGH` | `medium` | 規劃、對話、反思、每日身分更新的思考強度 |
| `GA_REASONING_LOW` | `low` | 例行判斷（重要性評分、選地點與物件等）的思考強度 |
| `GA_REASONING_OVERRIDES` | 無 | 個別調整，例如 `daily_plan=high,event_poignancy=none` |
| `GA_SERVICE_TIER` | `auto` | `flex` 為半價但較慢 |
| `GA_EMBED_MODEL` | `text-embedding-3-small` | 記憶向量模型 |
| `GA_EMBED_DIMENSIONS` | `512` | 向量長度（越短越省記憶體） |
| `GA_MAX_CONCURRENCY` | `16` | 同時進行的 API 呼叫數 |

價格依 OpenAI 官方模型頁：`gpt-6-luna` 每百萬 token 輸入 $0.10、快取輸入 $0.01、輸出 $0.50；
`text-embedding-3-small` $0.02。價格若變動，可用 `GA_PRICE_INPUT`、`GA_PRICE_OUTPUT` 等變數更新費用計算。

## 部署到 Google Cloud

架構：一台 Compute Engine VM（Container-Optimized OS，預設 4 vCPU / 16 GB）執行模擬容器；
資料放在獨立的永久磁碟；每小時備份到 Cloud Storage；API Key 放在 Secret Manager；
容器當掉會自動重啟並從存檔繼續，VM 重開機也會自動接續。

需要：已安裝並登入的 [gcloud CLI](https://cloud.google.com/sdk/docs/install)、一個已開啟帳單的專案。

```bash
cd generative_agents/deploy/gcp && cp config.env.example config.env
```

編輯 `config.env`（專案 ID、區域、儲存桶名稱、模擬名稱、天數、花費上限），然後依序執行：

```bash
./setup.sh
```

（一次性：開啟需要的服務、建立儲存桶與映像庫、服務帳號，並請你貼上 OpenAI Key 存進 Secret Manager。）

```bash
./build.sh
```

```bash
./create_vm.sh
```

之後：

| 指令 | 用途 |
|---|---|
| `./status.sh` | 看進度、遊戲時間、累計花費（約每小時更新） |
| `./logs.sh` | 看容器最近的輸出 |
| `./stop.sh` | 讓模擬存檔後停止 |
| `./resume.sh` | 停止後繼續 |
| `./update_env.sh` | 修改 `config.env`（例如把 `DAYS` 從 1 改成 100）後套用並接續 |
| `./delete_vm.sh` | 刪除 VM（資料磁碟與儲存桶會保留） |

結果都在 `gs://<儲存桶>/runs/<模擬名稱>/`。

**建議流程：** 先用 `DAYS=1`、`MAX_COST` 設小一點跑試驗日 → 用 `status.sh` 和 `usage.jsonl`
看實際花費與每個遊戲天的耗時 → 確認能在 20 天內跑完、費用可接受 → 把 `DAYS` 改成 100、
調整 `MAX_COST` → `./update_env.sh` 接續跑。

## 原版的地圖美術

地圖與角色圖由 PixyMoon 與 LimeZu 繪製，沒有放進這個 repo。只有要用原版的瀏覽器畫面時才需要：

```bash
generative_agents/scripts/fetch_assets.sh
```

## 尚未完成

- 16 位新居民的設定與初始記憶（設計中）
- 用真正的 API 跑第一天試驗、依實測調整步長與思考強度
- 讀取 `movement_log` 的回放畫面（原版的回放頁面讀的是舊格式）
- 100 天結果的中文整理報表
