/**
 * Turnstile 서버 검증.
 * 클라이언트가 보낸 토큰은 반드시 여기서 Cloudflare 에 확인받아야 의미가 있다.
 * (프론트에서 위젯이 통과했다는 사실만으로는 아무것도 보장되지 않는다.)
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 8000;

/**
 * @returns {Promise<{ok: true} | {ok: false, code: string, message: string, status: number}>}
 */
export async function verifyTurnstile(token, { secret, ip }) {
  if (typeof secret !== "string" || secret.length === 0) {
    return {
      ok: false,
      code: "not_configured",
      message: "서버에 Turnstile 시크릿이 설정되지 않았습니다.",
      status: 503,
    };
  }

  if (typeof token !== "string" || token.trim().length === 0) {
    return {
      ok: false,
      code: "turnstile_missing",
      message: "봇 확인을 완료해 주세요.",
      status: 400,
    };
  }

  if (token.length > 2048) {
    return {
      ok: false,
      code: "turnstile_failed",
      message: "봇 확인 토큰이 올바르지 않습니다.",
      status: 400,
    };
  }

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let data;
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: controller.signal });
    data = await res.json();
  } catch {
    // 검증 서버에 닿지 못하면 "통과"로 처리하지 않는다 — fail closed.
    return {
      ok: false,
      code: "turnstile_unavailable",
      message: "봇 확인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      status: 503,
    };
  } finally {
    clearTimeout(timer);
  }

  if (data?.success === true) return { ok: true };

  const codes = Array.isArray(data?.["error-codes"]) ? data["error-codes"] : [];
  return {
    ok: false,
    code: "turnstile_failed",
    message: codes.includes("timeout-or-duplicate")
      ? "봇 확인이 만료되었습니다. 다시 확인해 주세요."
      : "봇 확인에 실패했습니다. 다시 시도해 주세요.",
    status: 403,
  };
}
