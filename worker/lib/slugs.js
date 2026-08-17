/**
 * 알려진 작품 slug 집합.
 *
 * 조회수 증가는 인증 없는 엔드포인트라서, slug 를 정규식으로만 검사하면
 * 아무 문자열이나 POST 해서 project_views 에 행을 무한히 만들 수 있다.
 * D1 무료 티어의 쓰기 예산(일 10만 행)과 테이블 크기를 지키려면
 * "실제로 배포된 작품인가"를 확인해야 한다.
 *
 * 목록은 빌드 시 생성되는 /data/projects.json 을 ASSETS 바인딩으로 읽어온다.
 * 별도 생성 파일을 만들지 않으므로 빌드 순서에 의존하지 않고,
 * 배포된 자산과 항상 같은 내용을 본다.
 *
 * 결과는 isolate 수명 동안 모듈 스코프에 캐시한다 —
 * 자산은 배포 때만 바뀌고, 배포하면 isolate 도 새로 뜬다.
 */

/** @type {Set<string>|null} */
let cached = null;

/**
 * @param {Request} request  오리진을 얻기 위한 원본 요청
 * @param {{ ASSETS: Fetcher }} env
 * @returns {Promise<Set<string>|null>} 실패 시 null
 */
async function loadSlugs(request, env) {
  if (cached) return cached;

  try {
    const url = new URL("/data/projects.json", request.url);
    const res = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
    if (!res.ok) {
      console.error(`[slugs] projects.json 응답이 ${res.status} 입니다`);
      return null;
    }

    const data = await res.json();
    const list = Array.isArray(data?.projects) ? data.projects : [];
    if (list.length === 0) {
      console.error("[slugs] projects.json 에 작품이 없습니다");
      return null;
    }

    cached = new Set(list.map((p) => String(p?.slug ?? "")).filter(Boolean));
    return cached;
  } catch (err) {
    console.error("[slugs] projects.json 을 읽지 못했습니다:", err?.message ?? err);
    return null;
  }
}

/**
 * slug 가 실제 작품인지 확인한다.
 *
 * 색인을 못 읽으면 false 를 돌려준다(fail closed). 조회수가 잠깐 안 올라가는 것보다
 * 임의 쓰기가 열리는 쪽이 더 나쁘고, 색인 누락은 배포 설정 문제라 로그로 드러나야 한다.
 */
export async function isKnownSlug(request, env, slug) {
  const slugs = await loadSlugs(request, env);
  return slugs ? slugs.has(slug) : false;
}

/** 테스트/개발용 캐시 무효화. */
export function clearSlugCache() {
  cached = null;
}
