/**
 * shworld — 단 하나의 Worker.
 *
 *   /api/*  → 아래 라우터가 직접 처리 (D1)
 *   그 외    → env.ASSETS.fetch(request) 로 Vite 빌드 산출물(dist/)에 넘긴다.
 *
 * 정적 자산 서빙은 Cloudflare 의 asset 레이어가 담당하므로
 * 404 페이지 처리·Content-Type·캐시 헤더를 직접 만들 필요가 없다
 * (wrangler.jsonc 의 assets.not_found_handling = "404-page").
 */

import { errors } from "./lib/json.js";
import { handleViews } from "./routes/views.js";
import { handleGuestbook } from "./routes/guestbook.js";
import { handleContact } from "./routes/contact.js";

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: Fetcher, DB: D1Database, TURNSTILE_SECRET?: string, ADMIN_TOKEN?: string, IP_SALT?: string }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await routeApi(request, env, url);
    } catch (err) {
      // 스택은 로그에만. 클라이언트에는 내부 정보를 흘리지 않는다.
      console.error("[api] unhandled", err?.stack ?? err);
      return errors.server();
    }
  },
};

async function routeApi(request, env, url) {
  if (!env.DB) return errors.notConfigured("D1 바인딩(DB)");

  // "/api/guestbook/12" → ["guestbook", "12"]
  const segments = url.pathname.slice("/api/".length).split("/").filter(Boolean);
  if (segments.length === 0) return errors.notFound();

  // OPTIONS: 동일 오리진만 쓰므로 CORS 프리플라이트는 필요 없다. 허용 메서드만 알려준다.
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { allow: "GET, POST, DELETE, OPTIONS", "cache-control": "no-store" },
    });
  }

  switch (segments[0]) {
    case "views":
      return handleViews(request, env, segments);
    case "guestbook":
      return handleGuestbook(request, env, segments, url);
    case "contact":
      return handleContact(request, env, segments);
    case "health":
      return healthCheck(env);
    default:
      return errors.notFound();
  }
}

/** 배포 후 바인딩·시크릿이 제대로 붙었는지 확인하는 용도. 값은 노출하지 않는다. */
function healthCheck(env) {
  const body = {
    ok: true,
    bindings: {
      DB: Boolean(env.DB),
      ASSETS: Boolean(env.ASSETS),
    },
    secrets: {
      TURNSTILE_SECRET: Boolean(env.TURNSTILE_SECRET),
      ADMIN_TOKEN: Boolean(env.ADMIN_TOKEN),
      IP_SALT: Boolean(env.IP_SALT),
    },
  };
  const allReady = Object.values(body.secrets).every(Boolean) && Object.values(body.bindings).every(Boolean);
  return allReady
    ? new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      })
    : new Response(JSON.stringify({ ...body, ok: false }), {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
}
