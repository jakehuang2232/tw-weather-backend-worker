# tw-weather-backend-worker

Cloudflare Worker for proxying the Central Weather Administration Open Data API.

## 功能

- 保留中央氣象署 REST datastore API 路徑格式。
- 使用 Cloudflare Worker secret 注入 API key，不讓前端暴露授權碼。
- 使用 Cloudflare Cache API 快取 GET response。
- 回傳中央氣象署原始 response，不轉換 schema。
- 內建 CORS 與 `/health` endpoint。

## Endpoint

Worker endpoint 對應中央氣象署原始格式：

```text
GET /api/v1/rest/datastore/{datasetId}
```

範例：

```text
GET /api/v1/rest/datastore/F-C0032-001?locationName=臺北市&format=JSON
GET /api/v1/rest/datastore/O-A0001-001?StationName=臺北&format=JSON
```

Worker 會轉發到：

```text
https://opendata.cwa.gov.tw/api/v1/rest/datastore/{datasetId}
```

並自動補上：

```text
Authorization={CWA_API_KEY}
```

## 快取策略

REST datastore API 使用資料集更新頻率作為 Cloudflare cache TTL。中央氣象署官方文件提到 ETag 用戶端快取機制僅提供檔案下載 API 服務；本 Worker 對 REST datastore 使用 edge cache。

目前內建：

| Dataset | 用途 | TTL |
| --- | --- | --- |
| `F-C0032-001` | 一般天氣預報，今明 36 小時 | 6 小時 |
| `F-D0047-*` | 鄉鎮市區天氣預報 | 6 小時 |
| `O-A0001-001` | 自動氣象站觀測 | 10 分鐘 |
| `O-A0002-001` | 自動雨量站觀測 | 10 分鐘 |
| `O-A0003-001` | 氣象觀測相關資料 | 10 分鐘 |
| 其他 dataset | fallback | 10 分鐘 |

TTL 設定集中在 [`src/cache-policy.ts`](src/cache-policy.ts)。

## 開發

安裝依賴：

```sh
npm install
```

設定 Cloudflare Worker secret：

```sh
npx wrangler secret put CWA_API_KEY
```

本機啟動：

```sh
npm run dev
```

型別檢查：

```sh
npm run typecheck
```

部署：

```sh
npm run deploy
```

## 環境變數

| 名稱 | 類型 | 說明 |
| --- | --- | --- |
| `CWA_API_KEY` | secret | 中央氣象署 Open Data API 授權碼 |
| `CWA_API_BASE_URL` | var | 預設 `https://opendata.cwa.gov.tw` |
| `ALLOWED_ORIGIN` | var | CORS allow origin，預設 `*` |

## 參考

- 中央氣象署 Open Data REST API 文件：<https://opendata.cwa.gov.tw/dist/opendata-swagger.html>
- 中央氣象署開發指南：<https://opendata.cwa.gov.tw/devManual/insrtuction>
- 中央氣象署檔案下載 API 用戶端快取說明：<https://opendata.cwa.gov.tw/opendatadoc/client_cache.pdf>
