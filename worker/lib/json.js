/**
 * HTTP 레이어 유틸 — 응답 형태, 에러 형태, 오리진 검증, 관리자 인증.
 * 모든 API 응답은 JSON 이고, 에러는 예외 없이 { error, code } 형태다.
 */

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // API 응답은 절대 캐싱하지 않는다 (조회수·방명록은 항상 최신이어야 함)
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
};

/** 성공 응답. */
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

/**
 * 에러 응답. 코드는 클라이언트가 분기용으로 쓰고, error 는 사용자에게 보여줄 한국어 문구다.
 * @param {number} status
 * @param {string} code    기계용 코드 (invalid_input, rate_limited, ...)
 * @param {string} message 사람용 메시지
 */
export function fail(status, code, message) {
  return json({ error: message, code }, status);
}

export const errors = {
  notFound: () => fail(404, "not_found", "요청한 경로를 찾을 수 없습니다."),
  methodNotAllowed: (allow) =>
    json({ error: "허용되지 않은 메서드입니다.", code: "method_not_allowed" }, 405, { allow }),
  badRequest: (message = "입력값이 올바르지 않습니다.") => fail(400, "invalid_input", message),
  unauthorized: () => fail(401, "unauthorized", "인증이 필요합니다."),
  forbiddenOrigin: () => fail(403, "forbidden_origin", "요청 출처가 허용되지 않았습니다."),
  rateLimited: (retryAfterSec) =>
    json(
      { error: "너무 자주 요청하셨습니다. 잠시 후 다시 시도해 주세요.", code: "rate_limited" },
      429,
      { "retry-after": String(Math.max(1, Math.ceil(retryAfterSec))) }
    ),
  server: () => fail(500, "server_error", "서버에서 문제가 발생했습니다."),
  notConfigured: (what) =>
    fail(503, "not_configured", `서버 설정이 완료되지 않았습니다 (${what}). 관리자에게 문의해 주세요.`),
};

/**
 * 상태 변경 요청의 CSRF 완화: Origin 헤더가 있으면 반드시 자기 오리진과 같아야 한다.
 * Origin 이 아예 없는 요청(curl, 서버 간 호출)은 통과시킨다 —
 * 브라우저는 cross-site 요청에 Origin 을 항상 붙이므로 이것만으로 CSRF 는 막힌다.
 * @returns {Response|null} 문제가 있으면 응답, 없으면 null
 */
export function checkOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  let expected;
  try {
    expected = new URL(request.url).origin;
  } catch {
    return errors.forbiddenOrigin();
  }
  return origin === expected ? null : errors.forbiddenOrigin();
}

/** 길이 차이까지 흘리지 않는 문자열 비교. */
export function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a ?? ""));
  const y = enc.encode(String(b ?? ""));
  // 길이가 달라도 같은 횟수만큼 돌린다.
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Authorization: Bearer <ADMIN_TOKEN> 검증.
 * ADMIN_TOKEN 이 설정되지 않았으면 어떤 토큰도 통과시키지 않는다.
 */
export function isAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (typeof expected !== "string" || expected.length < 16) return false;

  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;

  return safeEqual(header.slice(prefix.length).trim(), expected);
}

/** JSON 본문을 안전하게 읽는다. 실패 시 null. */
export async function readJsonBody(request, maxBytes = 16 * 1024) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return null;

  const raw = await request.text();
  if (raw.length > maxBytes) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
