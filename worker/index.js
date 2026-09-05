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

    const moved = movedGamePath(url.pathname);
    if (moved) {
      return Response.redirect(new URL(moved + url.search, url.origin), 301);
    }

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

/**
 * 예전 게임 주소를 새 자리로 넘긴다.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────────
 *  2026-09-05 에 게임(메두사 미용실)이 도메인 맨 위에서 `/m-hairsalon` 아래로 내려갔다.
 *  그런데 **그 전에 만들어진 링크들은 그대로 남아 있다.**
 *
 *  - 홈 화면에 설치한 앱은 `start_url` 이 `/home` 이라 그리로 간다
 *  - 카카오톡으로 보낸 방 링크(`/room/ABCD`)를 나중에 누르는 사람이 있다
 *
 *  넘겨주지 않으면 그 사람들은 404 를 본다. 앱을 다시 설치하라는 말을 일일이 할 수도 없다.
 *
 * ── 왜 목록을 적어 두나 ──────────────────────────────────────────────────
 *  `/*` 를 통째로 넘길 수는 없다. 이 사이트도 자기 주소를 가지고 있어서
 *  (`/about`, `/projects`, `/contact`, `/guestbook`) 겹치면 **이 사이트가 가려진다.**
 *  특히 `/about` 은 양쪽 모두에 있다 — 여기서는 이 사이트 것이 이긴다.
 *
 *  그래서 **게임에만 있는 주소**를 적어 둔다. 게임에 새 화면이 생겨도 여기 없으면 그냥
 *  404 다. 그것이 남의 주소를 가로채는 것보다 낫다.
 *
 *  301(영구)로 넘긴다. 검색엔진이 옛 주소의 평가를 새 주소로 옮겨 준다.
 */
const GAME_PATHS = new Set([
  "/home",
  "/login",
  "/nickname",
  "/lobby",
  "/matching",
  "/game",
  "/shop",
  "/apples",
  "/records",
  "/friends",
  "/ranking",
  "/settings",
  "/tutorial",
  "/practice",
  "/guide",
  "/privacy",
]);

/** 넘길 주소면 새 경로를, 아니면 null */
function movedGamePath(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (GAME_PATHS.has(path)) return `/m-hairsalon${path}`;

  // 방 링크 — 코드가 뒤에 붙는다. 로그인 콜백도 같은 모양이다
  if (/^\/room\/[A-Za-z0-9_-]{1,32}$/.test(path)) return `/m-hairsalon${path}`;
  if (path === "/auth/callback") return "/m-hairsalon/auth/callback";

  return null;
}

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
