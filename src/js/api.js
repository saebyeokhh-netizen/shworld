/**
 * /api/* 호출 공용 래퍼.
 *
 * 설계 원칙: 이 사이트의 동적 기능은 전부 "있으면 좋은 것"이다.
 * 워커 없이 `vite dev` 만 띄운 경우 /api/* 는 404/연결실패인데,
 * 그때도 페이지는 정상으로 보여야 한다. 그래서 두 층으로 나눈다.
 *   - request(): 실패를 ApiError 로 던진다 (폼 제출처럼 사용자에게 알려야 하는 경우)
 *   - quiet():   실패를 null 로 삼킨다 (조회수처럼 조용히 포기해도 되는 경우)
 */

const BASE = "/api";
const DEFAULT_TIMEOUT = 10_000;

export class ApiError extends Error {
  constructor(message, { code = "unknown", status = 0, offline = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.offline = offline;
  }
}

/** 사용자에게 보여줄 한국어 메시지. 서버가 준 문구가 있으면 그걸 쓴다. */
const FALLBACK_MESSAGE = {
  offline: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  rate_limited: "너무 자주 보내셨습니다. 5분 후에 다시 시도해 주세요.",
  turnstile_failed: "봇 확인에 실패했습니다. 확인란을 다시 체크해 주세요.",
  turnstile_missing: "봇 확인을 완료해 주세요.",
  invalid_input: "입력값을 다시 확인해 주세요.",
  forbidden_origin: "요청 출처가 올바르지 않습니다.",
  server_error: "서버에서 문제가 발생했습니다.",
  unknown: "요청을 처리하지 못했습니다.",
};

export function messageFor(err) {
  if (!(err instanceof ApiError)) return FALLBACK_MESSAGE.unknown;
  if (err.message && err.code !== "offline") return err.message;
  return FALLBACK_MESSAGE[err.code] ?? FALLBACK_MESSAGE.unknown;
}

/**
 * @param {string} path   `/views` 처럼 /api 이후 경로
 * @param {{method?: string, body?: unknown, headers?: Record<string,string>, timeout?: number}} [opts]
 */
export async function request(path, opts = {}) {
  const { method = "GET", body, headers = {}, timeout = DEFAULT_TIMEOUT } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(FALLBACK_MESSAGE.offline, { code: "offline", offline: true });
  } finally {
    clearTimeout(timer);
  }

  const payload = await readJson(res);

  if (!res.ok) {
    throw new ApiError(typeof payload?.error === "string" ? payload.error : "", {
      code: typeof payload?.code === "string" ? payload.code : httpCode(res.status),
      status: res.status,
    });
  }

  return payload;
}

/** 실패해도 무시하고 넘어가야 하는 호출용. 성공 시 payload, 실패 시 null. */
export async function quiet(path, opts = {}) {
  try {
    return await request(path, opts);
  } catch {
    return null;
  }
}

async function readJson(res) {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function httpCode(status) {
  if (status === 401 || status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "unknown";
}
