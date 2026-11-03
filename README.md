# tw-weather-backend-worker

Cloudflare Worker for proxying the Central Weather Administration Open Data API.

## 功能

- 保留中央氣象署 REST datastore API 路徑格式。
- 只代理 App 用到的資料集，其他一律 404：
  - 鄉鎮天氣預報：`F-D0047-001` 到 `F-D0047-087` 的奇數號。
  - 氣象觀測站 10 分鐘綜觀氣象資料：`O-A0003-001`，給「現在」的天氣用。
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
GET /api/v1/rest/datastore/O-A0003-001?format=JSON
```

查詢參數不會轉給中央氣象署：Worker 一律向上游要整份資料（`format=JSON`），`locationName`、`StationId` 等參數都會被忽略。預報本來就回傳全縣市（中央氣象署不理會 `locationName`），觀測則回傳全台各站，由 App 自己挑測站。

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

- 快取鍵只有資料集代號，不含查詢參數：每個資料集只存一份。預報是同一縣市的所有鄉鎮共用一份，觀測是全台一份。每個 Cloudflare 機房最多 45 份。
- 預報的 TTL 是 1 小時，也就是每個機房每份資料每小時最多向中央氣象署要一次。
- 觀測每 10 分鐘一筆，快取存到下一筆應該發布的時候為止：
  - 到期時間是各站最新的觀測時間（`ObsTime.DateTime`）加 10 分鐘，再加 2 分鐘的發布延遲。延遲是估計值，沒有實測；估太短只會讓下面那份 1 分鐘的快取多出現幾次。
  - Worker 不會主動去拿資料：只有 App 的請求遇到快取過期時，才向中央氣象署要一次。
  - 要回來的若還是舊的那筆（新的一筆還沒發布），這份快取只存 1 分鐘，之後的請求才有機會拿到新的；晚了一整期以上（觀測停了），改存 10 分鐘。
  - 讀不到觀測時間時存 5 分鐘；回應不是 JSON（例如錯誤頁）就不存。
- 每份快取記著自己的到期時間（`X-Cache-Expires`，不會傳給裝置）。命中時回應的 `Cache-Control: max-age` 是剩下的秒數，所以裝置端不會把資料留得比快取更久。

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
