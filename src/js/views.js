/**
 * 조회수.
 *  - 목록/홈: GET /api/views 한 번으로 전체 맵을 받아 카드에 채운다.
 *  - 상세:    sessionStorage 가드로 세션당 1회만 POST /api/views/:slug 로 증가.
 *
 * API가 없으면(로컬 `vite dev` 등) 조회수 요소는 그냥 숨긴 채로 둔다.
 * 스피너를 영원히 돌리거나 에러를 띄우지 않는다.
 */

import { quiet } from "./api.js";

const SEEN_PREFIX = "shworld:viewed:";
const nf = new Intl.NumberFormat("ko-KR");

function paint(el, count) {
  const slot = el.querySelector("[data-views-value]") ?? el;
  slot.textContent = nf.format(count);
  el.hidden = false;
  el.removeAttribute("aria-busy");
}

/** 목록/홈 페이지: [data-views-for="<slug>"] 요소들을 채운다. */
export async function initViewCounts() {
  const nodes = [...document.querySelectorAll("[data-views-for]")];
  if (nodes.length === 0) return;

  const map = await quiet("/views");
  if (!map || typeof map !== "object") return; // 조용히 포기

  for (const el of nodes) {
    const slug = el.getAttribute("data-views-for");
    const count = Number(map[slug] ?? 0);
    if (!Number.isFinite(count) || count <= 0) continue;
    paint(el, count);
  }
}

/** 상세 페이지: 세션당 1회 증가 후 표시. */
export async function initDetailView() {
  const el = document.querySelector("[data-views-detail]");
  if (!el) return;

  const slug = el.getAttribute("data-views-detail");
  if (!slug) return;

  const key = SEEN_PREFIX + slug;
  let alreadySeen = false;
  try {
    alreadySeen = sessionStorage.getItem(key) === "1";
  } catch {
    alreadySeen = false; // sessionStorage 불가 → 그냥 증가 시도
  }

  if (alreadySeen) {
    const map = await quiet("/views");
    const count = Number(map?.[slug] ?? 0);
    if (Number.isFinite(count) && count > 0) paint(el, count);
    return;
  }

  const res = await quiet(`/views/${encodeURIComponent(slug)}`, { method: "POST" });
  if (!res || typeof res.views !== "number") return;

  try {
    sessionStorage.setItem(key, "1");
  } catch {
    /* 무시 */
  }
  paint(el, res.views);
}
