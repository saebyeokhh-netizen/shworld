/**
 * 방명록 라우트.
 *   GET  /api/guestbook?limit=&before=  → { entries, nextCursor }
 *   POST /api/guestbook                 → 생성된 항목
 *
 * POST 파이프라인 순서가 중요하다:
 *   오리진 검증 → 본문 파싱 → 입력 검증 → Turnstile → 레이트리밋 → INSERT
 * Turnstile 을 검증 앞에 두지 않는 이유: 형식이 틀린 입력은 외부 API 호출 없이 즉시 거절하는 게 싸다.
 * 레이트리밋을 Turnstile 뒤에 두는 이유: 봇 트래픽으로 DB 를 읽지 않게 한다.
 */

import { json, errors, readJsonBody, checkOrigin } from "../lib/json.js";
import { listGuestbook, insertGuestbookEntry } from "../lib/db.js";
import { validateName, validateMessage, validatePositiveInt } from "../lib/validate.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { clientIp, hashIp, checkRateLimit } from "../lib/ratelimit.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function handleGuestbook(request, env, segments, url) {
  // /api/guestbook
  if (segments.length === 1) {
    if (request.method === "GET" || request.method === "HEAD") return listEntries(env, url);
    if (request.method === "POST") return createEntry(request, env);
    return errors.methodNotAllowed("GET, POST");
  }

  // /api/guestbook/:id — 삭제만 허용 (admin 라우트에서 처리)
  if (segments.length === 2) {
    const { handleGuestbookDelete } = await import("./admin.js");
    if (request.method === "DELETE") return handleGuestbookDelete(request, env, segments[1]);
    return errors.methodNotAllowed("DELETE");
  }

  return errors.notFound();
}

async function listEntries(env, url) {
  const limit = validatePositiveInt(url.searchParams.get("limit"), {
    max: MAX_LIMIT,
    fallback: DEFAULT_LIMIT,
  });
  if (!limit.ok) return errors.badRequest(`limit 은 1~${MAX_LIMIT} 사이의 정수여야 합니다.`);

  const beforeRaw = url.searchParams.get("before");
  const before = validatePositiveInt(beforeRaw, { fallback: null });
  if (!before.ok) return errors.badRequest("before 커서가 올바르지 않습니다.");

  const page = await listGuestbook(env.DB, { limit: limit.value, before: before.value });
  return json(page);
}

async function createEntry(request, env) {
  const originProblem = checkOrigin(request);
  if (originProblem) return originProblem;

  const body = await readJsonBody(request);
  if (!body) return errors.badRequest("JSON 본문이 필요합니다.");

  const name = validateName(body.name);
  if (!name.ok) return errors.badRequest(name.message);

  const message = validateMessage(body.message);
  if (!message.ok) return errors.badRequest(message.message);

  const ip = clientIp(request);

  const turnstile = await verifyTurnstile(body.turnstileToken, {
    secret: env.TURNSTILE_SECRET,
    ip,
  });
  if (!turnstile.ok) {
    return json({ error: turnstile.message, code: turnstile.code }, turnstile.status);
  }

  const ipHash = await hashIp(ip, env.IP_SALT);
  if (!ipHash) return errors.notConfigured("IP_SALT");

  const limit = await checkRateLimit(env.DB, "guestbook", ipHash);
  if (!limit.allowed) return errors.rateLimited(limit.retryAfterSec);

  const entry = await insertGuestbookEntry(env.DB, {
    name: name.value,
    message: message.value,
    ipHash,
  });

  return json(entry, 201);
}
