/**
 * 관리자 라우트 — 지금은 방명록 소프트 삭제 하나뿐.
 *   DELETE /api/guestbook/:id   (Authorization: Bearer <ADMIN_TOKEN>)
 *
 * 실제 행을 지우지 않고 hidden = 1 로 둔다. 스팸 신고 대응이나 오삭제 복구에 필요하고,
 * id 시퀀스가 유지되어 커서 페이지네이션도 깨지지 않는다.
 */

import { json, errors, isAdmin, checkOrigin } from "../lib/json.js";
import { hideGuestbookEntry } from "../lib/db.js";
import { validatePositiveInt } from "../lib/validate.js";

export async function handleGuestbookDelete(request, env, rawId) {
  const originProblem = checkOrigin(request);
  if (originProblem) return originProblem;

  if (!isAdmin(request, env)) return errors.unauthorized();

  const id = validatePositiveInt(rawId);
  if (!id.ok) return errors.badRequest("id 가 올바르지 않습니다.");

  const changed = await hideGuestbookEntry(env.DB, id.value);
  if (changed === 0) return errors.notFound();

  return json({ ok: true, id: id.value, hidden: true });
}
