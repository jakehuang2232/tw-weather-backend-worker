# tw-weather-backend-worker

Cloudflare Worker for proxying the Central Weather Administration Open Data API.

## 功能

- 保留中央氣象署 REST datastore API 路徑格式。
- 只代理 App 用到的鄉鎮天氣預報（`F-D0047-001` 到 `F-D0047-087` 的奇數號），其他資料集一律 404。
- 使用 Cloudflare Worker secret 注入 API key，不讓前端暴露授權碼。
- 使用 Cloudflare Cache API 快取 GET response，每個資料集（縣市）只存一份。
- 回傳中央氣象署原始 response，不轉換 schema。
- 內建 CORS 與 `/health` endpoint。

## Endpoint

Worker endpoint 對應中央氣象署原始格式：

```text
GET /api/v1/rest/datastore/{datasetId}
```

範例：

```text
GET /api/v1/rest/datastore/F-D0047-061?format=JSON
GET /api/v1/rest/datastore/F-D0047-063?format=JSON&locationName=中正區
```

查詢參數不會轉給中央氣象署：Worker 一律向上游要整個縣市（`format=JSON`），`locationName` 等參數會被忽略（中央氣象署本來就不理會 `locationName`，一樣回傳全縣市）。

Worker 會轉發到：

```text
https://opendata.cwa.gov.tw/api/v1/rest/datastore/{datasetId}
```

並自動補上：

```text
Authorization={CWA_API_KEY}
```

## 快取策略

中央氣象署官方文件提到 ETag 用戶端快取機制僅提供檔案下載 API 服務；本 Worker 對 REST datastore 使用 edge cache。

- 快取鍵只有資料集代號，不含查詢參數：同一縣市的所有鄉鎮共用一份。22 縣市 × 2 種預報，每個 Cloudflare 機房最多 44 份。
- TTL 1 小時，也就是每個機房每份資料每小時最多向中央氣象署要一次。
- 命中快取時，回應的 `Cache-Control: max-age` 是這份快取剩下的秒數，裝置端不會把資料留得比 1 小時更久。

允許的資料集與 TTL 集中在 [`src/cache-policy.ts`](src/cache-policy.ts)。

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
