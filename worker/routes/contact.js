/**
 * 연락 폼 라우트.
 *   POST /api/contact → { ok: true }
 *
 * 응답에 저장된 id 를 노출하지 않는다 — 클라이언트가 알 필요가 없고,
 * 순번이 보이면 총 문의 수가 추측되므로.
 */

import { json, errors, readJsonBody, checkOrigin } from "../lib/json.js";
import { insertContactMessage } from "../lib/db.js";
import { validateName, validateEmail, validateMessage } from "../lib/validate.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { clientIp, hashIp, checkRateLimit } from "../lib/ratelimit.js";

export async function handleContact(request, env, segments) {
  if (segments.length !== 1) return errors.notFound();
  if (request.method !== "POST") return errors.methodNotAllowed("POST");

  const originProblem = checkOrigin(request);
  if (originProblem) return originProblem;

  const body = await readJsonBody(request);
  if (!body) return errors.badRequest("JSON 본문이 필요합니다.");

  const name = validateName(body.name);
  if (!name.ok) return errors.badRequest(name.message);

  const email = validateEmail(body.email);
  if (!email.ok) return errors.badRequest(email.message);

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

  const limit = await checkRateLimit(env.DB, "contacts", ipHash);
  if (!limit.allowed) return errors.rateLimited(limit.retryAfterSec);

  await insertContactMessage(env.DB, {
    name: name.value,
    email: email.value,
    message: message.value,
    ipHash,
  });

  return json({ ok: true }, 201);
}
