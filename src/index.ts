import { getDatasetCacheTtlSeconds } from "./cache-policy";

const CWA_DATASTORE_PREFIX = "/api/v1/rest/datastore/";
const CWA_DEFAULT_BASE_URL = "https://opendata.cwa.gov.tw";

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
        message: `Use ${CWA_DATASTORE_PREFIX}{datasetId} to proxy CWA Open Data API.`
      },
      404,
      corsHeaders
    );
  }

  if (!env.CWA_API_KEY) {
    return jsonResponse({ error: "CWA_API_KEY secret is not configured" }, 500, corsHeaders);
  }

  const ttlSeconds = getDatasetCacheTtlSeconds(datasetId);
  const cacheKeyRequest = buildCacheKeyRequest(request, url);
  const cache = getDefaultCache();
  const cachedResponse = await cache.match(cacheKeyRequest);

  if (cachedResponse) {
    return withHeaders(cachedResponse, {
      ...corsHeaders,
      "X-Cache": "HIT",
      "X-CWA-Cache-TTL": String(ttlSeconds)
    });
  }

  const upstreamRequest = buildUpstreamRequest(request, url, env);
  const upstreamResponse = await fetch(upstreamRequest, {
    cf: {
      cacheTtl: ttlSeconds,
      cacheEverything: true
    }
  });

  const response = withHeaders(upstreamResponse, {
    ...corsHeaders,
    "Cache-Control": `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
    "X-Cache": "MISS",
    "X-CWA-Cache-TTL": String(ttlSeconds)
  });

  if (response.ok) {
    ctx.waitUntil(cache.put(cacheKeyRequest, response.clone()));
  }

  return response;
}

function getDatasetId(pathname: string): string | null {
  if (!pathname.startsWith(CWA_DATASTORE_PREFIX)) {
    return null;
  }

  const datasetId = pathname.slice(CWA_DATASTORE_PREFIX.length);

  if (!/^[A-Z]-[A-Z]\d{4}-\d{3}$/.test(datasetId)) {
    return null;
  }

  return datasetId;
}

function buildUpstreamRequest(request: Request, url: URL, env: Env): Request {
  const upstreamUrl = new URL(url.pathname + url.search, env.CWA_API_BASE_URL ?? CWA_DEFAULT_BASE_URL);

  upstreamUrl.searchParams.set("Authorization", env.CWA_API_KEY);

  const headers = new Headers(request.headers);

  headers.delete("Host");
  headers.delete("Cookie");
  headers.delete("Authorization");

  return new Request(upstreamUrl.toString(), {
    method: "GET",
    headers
  });
}

function buildCacheKeyRequest(request: Request, url: URL): Request {
  const cacheUrl = new URL(url.toString());

  cacheUrl.searchParams.delete("Authorization");
  cacheUrl.searchParams.sort();

  return new Request(cacheUrl.toString(), {
    method: "GET",
    headers: {
      Accept: request.headers.get("Accept") ?? ""
    }
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
