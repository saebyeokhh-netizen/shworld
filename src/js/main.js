/**
 * 모든 페이지의 단일 엔트리.
 * 공통 동작(테마·내비)은 즉시, 페이지별 동작은 body[data-page] 기준으로 동적 import.
 * → 홈에서는 방명록 코드를 내려받지 않는다.
 */

import { initTheme } from "./theme.js";
import { initNav } from "./nav.js";

initTheme();
initNav();

const page = document.body.dataset.page;

// 연도 자동 표기 (푸터)
for (const el of document.querySelectorAll("[data-year]")) {
  el.textContent = String(new Date().getFullYear());
}

async function boot() {
  if (page === "projects") {
    const { initFilter } = await import("./filter.js");
    await initFilter();
  }

  if (page === "home" || page === "projects") {
    const { initViewCounts } = await import("./views.js");
    await initViewCounts();
  }

  if (page === "project") {
    const { initDetailView } = await import("./views.js");
    await initDetailView();
  }

  if (page === "guestbook") {
    const { initGuestbook } = await import("./guestbook.js");
    await initGuestbook();
  }

  if (page === "contact") {
    const { initContact } = await import("./contact.js");
    await initContact();
  }
}

boot().catch((err) => {
  // 어떤 경우에도 페이지 자체는 살아 있어야 한다. 콘솔에만 남긴다.
  console.warn("[shworld] 초기화 중 오류:", err);
});
