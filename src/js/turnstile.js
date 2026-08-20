/**
 * Cloudflare Turnstile 위젯 마운트 (explicit 렌더).
 *
 * 사이트 키는 공개값이므로 프론트에 들어가도 된다.
 * 값은 Vite 환경변수 VITE_TURNSTILE_SITE_KEY 로 주입하고,
 * 없으면 Cloudflare 공식 테스트 키(항상 통과)를 쓴다 → 로컬 개발이 바로 된다.
 *
 * 스크립트 로드가 실패하면(오프라인·차단) null 을 돌려주고, 폼은 토큰 없이 제출된다.
 * 그 경우 서버가 400/403 으로 거절하므로 보안이 약해지지 않는다.
 */

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "0x4AAAAAAEWyIkOakKUZLcAp";

let loader = null;

function loadScript() {
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(s);
  }).catch((err) => {
    loader = null;
    throw err;
  });
  return loader;
}

/**
 * @param {HTMLElement} slot 위젯을 넣을 컨테이너
 * @returns {Promise<{token(): string, reset(): void} | null>}
 */
export async function mountTurnstile(slot) {
  if (!slot) return null;

  let turnstile;
  try {
    turnstile = await loadScript();
  } catch {
    return null;
  }

  const theme = document.documentElement.getAttribute("data-theme") ?? "auto";
  let widgetId;
  try {
    widgetId = turnstile.render(slot, {
      sitekey: SITE_KEY,
      theme,
      size: "flexible",
      language: "ko",
    });
  } catch {
    return null;
  }

  if (widgetId === undefined) return null;

  // 테마를 바꾸면 위젯도 다시 그린다.
  document.addEventListener("shworld:themechange", (e) => {
    try {
      turnstile.remove(widgetId);
      widgetId = turnstile.render(slot, {
        sitekey: SITE_KEY,
        theme: e.detail?.theme ?? "auto",
        size: "flexible",
        language: "ko",
      });
    } catch {
      /* 무시 */
    }
  });

  return {
    token() {
      try {
        return turnstile.getResponse(widgetId) || "";
      } catch {
        return "";
      }
    },
    reset() {
      try {
        turnstile.reset(widgetId);
      } catch {
        /* 무시 */
      }
    },
  };
}
