/**
 * IP 기반 레이트리밋 — 단, 원본 IP 는 어디에도 저장하지 않는다.
 * 저장하는 값은 SHA-256(IP + IP_SALT) 의 hex 뿐이고, salt 는 시크릿이므로
 * DB 가 유출되어도 IP 를 되돌릴 수 없다(레인보우 테이블 방어).
 *
 * 별도 KV 없이 D1 에 이미 남는 행의 created_at 을 세어 판정한다 —
 * 개인 사이트 트래픽에서는 이 방식이 충분하고 인프라가 하나 줄어든다.
 */

import { countRecentByIpHash } from "./db.js";

export const WINDOW_MS = 5 * 60 * 1000; // 5분에 1건

/** 클라이언트 IP. Cloudflare 는 CF-Connecting-IP 를 신뢰할 수 있게 채워준다. */
export function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    "0.0.0.0"
  );
}

/** SHA-256(ip + salt) → hex. salt 미설정 시 null (호출측이 503 처리). */
export async function hashIp(ip, salt) {
  if (typeof salt !== "string" || salt.length < 8) return null;
  const data = new TextEncoder().encode(`${ip}|${salt}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {D1Database} db
 * @param {"guestbook"|"contacts"} table
 * @param {string} ipHash
 * @param {number} now epoch ms
 * @returns {Promise<{allowed: boolean, retryAfterSec: number}>}
 */
export async function checkRateLimit(db, table, ipHash, now = Date.now()) {
  const since = now - WINDOW_MS;
  const latest = await countRecentByIpHash(db, table, ipHash, since);

  if (latest.count === 0) return { allowed: true, retryAfterSec: 0 };

  const elapsed = now - latest.newest;
  const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000));
  return { allowed: false, retryAfterSec };
}
