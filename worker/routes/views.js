/**
 * 조회수 라우트.
 *   GET  /api/views        → { "<slug>": 12, ... }
 *   POST /api/views/:slug  → { slug, views }
 *
 * 인증 없이 증가시킬 수 있는 엔드포인트다. 카운트 위조 자체는 이득이 없어 막지 않지만,
 * 아무 slug 나 받아주면 project_views 에 임의의 행을 무한히 만들 수 있으므로
 * 실제로 배포된 작품 slug 인지 확인한다(형식 검사 + 색인 대조 2단).
 * 세션당 1회 증가는 클라이언트가 보장한다.
 */

import { json, errors } from "../lib/json.js";
import { getAllViews, incrementView } from "../lib/db.js";
import { validateSlug } from "../lib/validate.js";
import { isKnownSlug } from "../lib/slugs.js";

export async function handleViews(request, env, segments) {
  // segments: ["views"] 또는 ["views", "<slug>"]
  if (segments.length === 1) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return errors.methodNotAllowed("GET");
    }
    const map = await getAllViews(env.DB);
    return json(map);
  }

  if (segments.length === 2) {
    if (request.method !== "POST") return errors.methodNotAllowed("POST");

    const slug = validateSlug(segments[1]);
    if (!slug.ok) return errors.badRequest(slug.message);

    // 존재하지 않는 작품은 행을 만들지 않고 404 로 끝낸다.
    if (!(await isKnownSlug(request, env, slug.value))) return errors.notFound();

    const views = await incrementView(env.DB, slug.value);
    return json({ slug: slug.value, views });
  }

  return errors.notFound();
}
