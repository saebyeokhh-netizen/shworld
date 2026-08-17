/**
 * 작품 목록 검색 + 태그 필터.
 *
 * 카드 마크업 자체는 빌드 시점에 이미 HTML 로 구워져 있다(JS 없이도 목록이 보인다).
 * 이 모듈이 하는 일은 (1) /data/projects.json 으로 검색 인덱스를 만들고
 * (2) 조건에 맞지 않는 <li> 를 감추고 (3) 상태를 URL 쿼리에 동기화하는 것뿐이다.
 *
 * projects.json 을 못 받아오면 DOM 의 data-search 속성으로 폴백한다 → 기능은 계속 동작.
 */

const PARAM_Q = "q";
const PARAM_TAG = "tag";

export async function initFilter() {
  const grid = document.getElementById("project-grid");
  const input = document.getElementById("project-search");
  const chipList = document.getElementById("tag-filters");
  const status = document.getElementById("filter-status");
  const empty = document.getElementById("filter-empty");
  const reset = document.getElementById("filter-reset");
  if (!grid || !input) return;

  const items = [...grid.querySelectorAll("[data-slug]")].map((el) => ({
    el,
    slug: el.getAttribute("data-slug") ?? "",
    tags: (el.getAttribute("data-tags") ?? "").split("|").filter(Boolean),
    haystack: (el.getAttribute("data-search") ?? "").toLowerCase(),
  }));
  if (items.length === 0) return;

  // 검색 인덱스 보강 (본문 발췌·스택까지 검색 대상에 넣는다). 실패해도 그냥 진행.
  await enrich(items);

  const chips = chipList ? [...chipList.querySelectorAll("[data-tag]")] : [];
  const state = { q: "", tags: new Set() };

  const readUrl = () => {
    const p = new URLSearchParams(location.search);
    state.q = (p.get(PARAM_Q) ?? "").trim();
    state.tags = new Set(
      (p.get(PARAM_TAG) ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    );
  };

  const writeUrl = (replace) => {
    const p = new URLSearchParams(location.search);
    if (state.q) p.set(PARAM_Q, state.q);
    else p.delete(PARAM_Q);
    if (state.tags.size) p.set(PARAM_TAG, [...state.tags].join(","));
    else p.delete(PARAM_TAG);
    const qs = p.toString();
    const url = qs ? `${location.pathname}?${qs}` : location.pathname;
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
  };

  const render = () => {
    const needle = state.q.toLowerCase();
    let shown = 0;

    for (const item of items) {
      const matchText = !needle || item.haystack.includes(needle);
      const matchTags = state.tags.size === 0 || [...state.tags].every((t) => item.tags.includes(t));
      const visible = matchText && matchTags;
      item.el.hidden = !visible;
      if (visible) shown += 1;
    }

    for (const chip of chips) {
      chip.setAttribute("aria-pressed", String(state.tags.has(chip.getAttribute("data-tag"))));
    }

    if (input.value !== state.q) input.value = state.q;

    const filtering = Boolean(state.q) || state.tags.size > 0;
    if (status) {
      status.textContent = filtering
        ? `${items.length}개 중 ${shown}개 표시`
        : `총 ${items.length}개의 작품`;
    }
    if (empty) empty.hidden = shown !== 0;
    if (reset) reset.hidden = !filtering;
    grid.hidden = shown === 0;
  };

  input.addEventListener("input", debounce(() => {
    state.q = input.value.trim();
    writeUrl(true);
    render();
  }, 140));

  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const tag = chip.getAttribute("data-tag");
      if (state.tags.has(tag)) state.tags.delete(tag);
      else state.tags.add(tag);
      writeUrl(false);
      render();
    });
  }

  reset?.addEventListener("click", () => {
    state.q = "";
    state.tags.clear();
    writeUrl(false);
    render();
    input.focus();
  });

  window.addEventListener("popstate", () => {
    readUrl();
    render();
  });

  readUrl();
  render();
}

async function enrich(items) {
  try {
    const res = await fetch("/data/projects.json", { headers: { accept: "application/json" } });
    if (!res.ok) return;
    const data = await res.json();
    const list = Array.isArray(data?.projects) ? data.projects : [];
    const bySlug = new Map(list.map((p) => [p.slug, p]));
    for (const item of items) {
      const p = bySlug.get(item.slug);
      if (!p) continue;
      item.haystack = [
        p.title,
        p.summary,
        ...(p.tags ?? []),
        ...(p.stack ?? []),
        p.excerpt ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (Array.isArray(p.tags) && p.tags.length) item.tags = p.tags;
    }
  } catch {
    /* 인덱스 없이도 data-search 폴백으로 동작 */
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
