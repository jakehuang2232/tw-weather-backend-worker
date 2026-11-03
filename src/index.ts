import {
  ALLOWED_DATASETS,
  FORECAST_TTL_SECONDS,
  OBSERVATION_DATASET,
  newestReport,
  observationTtlSeconds
} from "./cache-policy";

const CWA_DATASTORE_PREFIX = "/api/v1/rest/datastore/";
const CWA_DEFAULT_BASE_URL = "https://opendata.cwa.gov.tw";
// When the cached copy runs out (seconds since 1970), kept with the copy:
// each dataset keeps its copies for its own time.
const EXPIRES_HEADER = "X-Cache-Expires";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  }
};

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const corsHeaders = getCorsHeaders(env);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (url.pathname === "/health") {
    return jsonResponse({ ok: true }, 200, corsHeaders);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405, {
      ...corsHeaders,
      Allow: "GET, OPTIONS"
    });
  }

  const datasetId = getDatasetId(url.pathname);

  if (!datasetId) {
    return jsonResponse(
      {
        error: "Not Found",
        message: `Use ${CWA_DATASTORE_PREFIX}{datasetId} with a township forecast, F-D0047-001 to F-D0047-087, or ${OBSERVATION_DATASET}.`
      },
      404,
      corsHeaders
    );
  }

  if (!env.CWA_API_KEY) {
    return jsonResponse({ error: "CWA_API_KEY secret is not configured" }, 500, corsHeaders);
  }

  const cacheKeyRequest = buildCacheKeyRequest(url, datasetId);
  const cache = getDefaultCache();
  const cachedResponse = await cache.match(cacheKeyRequest);

  if (cachedResponse) {
    // The client may keep it only for what is left of the copy's time.
    const expires = Number(cachedResponse.headers.get(EXPIRES_HEADER)) || 0;
    const response = withHeaders(cachedResponse, {
      ...corsHeaders,
      "Cache-Control": `public, max-age=${Math.max(Math.floor(expires - Date.now() / 1000), 0)}`,
      "X-Cache": "HIT"
    });

    response.headers.delete("Age");
    response.headers.delete(EXPIRES_HEADER);

    return response;
  }

  // No fetch cache underneath: the Cache API's copy is the only one, so its
  // age is the data's.
  const upstream = await forCache(datasetId, await fetch(buildUpstreamRequest(request, datasetId, env)));

  const response = withHeaders(upstream.response, {
    ...corsHeaders,
    "Cache-Control": `public, max-age=${upstream.ttlSeconds}, s-maxage=${upstream.ttlSeconds}`,
    "X-Cache": "MISS",
    "X-CWA-Cache-TTL": String(upstream.ttlSeconds)
  });

  if (response.ok && upstream.cacheable) {
    const copy = withHeaders(response.clone(), {
      [EXPIRES_HEADER]: String(Math.floor(Date.now() / 1000) + upstream.ttlSeconds)
    });

    ctx.waitUntil(cache.put(cacheKeyRequest, copy));
  }

  return response;
}

// How long CWA's response is kept: a forecast for the hour; the observations
// until their next report is due, read from the reports' times, and not at
// all if the body is not JSON (CWA's error pages).
async function forCache(
  datasetId: string,
  upstreamResponse: Response
): Promise<{ response: Response; ttlSeconds: number; cacheable: boolean }> {
  if (datasetId !== OBSERVATION_DATASET) {
    return { response: upstreamResponse, ttlSeconds: FORECAST_TTL_SECONDS, cacheable: true };
  }

  const text = await upstreamResponse.text();
  const response = new Response(text, upstreamResponse);

  // The body as read, not as sent.
  response.headers.delete("Content-Length");
  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch {
    return { response, ttlSeconds: 0, cacheable: false };
  }

  return { response, ttlSeconds: observationTtlSeconds(newestReport(body), new Date()), cacheable: true };
}

function getDatasetId(pathname: string): string | null {
  if (!pathname.startsWith(CWA_DATASTORE_PREFIX)) {
    return null;
  }

  const datasetId = pathname.slice(CWA_DATASTORE_PREFIX.length);

  return ALLOWED_DATASETS.has(datasetId) ? datasetId : null;
}

// The client's query is dropped: CWA ignores the app's locationName and sends
// the whole county anyway, so every district shares the county's one copy.
function buildUpstreamRequest(request: Request, datasetId: string, env: Env): Request {
  const upstreamUrl = new URL(CWA_DATASTORE_PREFIX + datasetId, env.CWA_API_BASE_URL ?? CWA_DEFAULT_BASE_URL);

  upstreamUrl.searchParams.set("Authorization", env.CWA_API_KEY);
  upstreamUrl.searchParams.set("format", "JSON");

  const headers = new Headers(request.headers);

  headers.delete("Host");
  headers.delete("Cookie");
  headers.delete("Authorization");

  return new Request(upstreamUrl.toString(), {
    method: "GET",
    headers
  });
}

function buildCacheKeyRequest(url: URL, datasetId: string): Request {
  return new Request(new URL(CWA_DATASTORE_PREFIX + datasetId, url.origin).toString(), {
    method: "GET"
  });
}

function getCorsHeaders(env: Env): HeadersInit {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    Vary: "Origin"
  };
}

function jsonResponse(body: unknown, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function withHeaders(response: Response, headers: HeadersInit): Response {
  const responseHeaders = new Headers(response.headers);

  new Headers(headers).forEach((value, key) => {
    responseHeaders.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

function getDefaultCache(): Cache {
  return (caches as CacheStorage & { default: Cache }).default;
}
