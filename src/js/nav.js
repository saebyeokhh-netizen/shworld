/**
 * 모바일 내비게이션 토글 + 스크롤 시 헤더 경계선.
 * 키보드로 완전히 사용 가능: Enter/Space 로 열고, Escape 로 닫고 버튼에 포커스 복귀.
 */

const DESKTOP = "(min-width: 48rem)";

export function initNav() {
  const header = document.querySelector(".site-header");
  const btn = document.getElementById("nav-toggle");
  const nav = document.getElementById("site-nav");

  if (header) initScrollState(header);
  if (!btn || !nav) return;

  const isDesktop = () => window.matchMedia(DESKTOP).matches;

  const setOpen = (open) => {
    btn.setAttribute("aria-expanded", String(open));
    if (open) nav.setAttribute("data-open", "true");
    else nav.removeAttribute("data-open");
  };

  setOpen(false);

  btn.addEventListener("click", () => {
    setOpen(btn.getAttribute("aria-expanded") !== "true");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (btn.getAttribute("aria-expanded") !== "true") return;
    setOpen(false);
    btn.focus();
  });

  // 바깥 클릭으로 닫기
  document.addEventListener("click", (e) => {
    if (btn.getAttribute("aria-expanded") !== "true") return;
    if (nav.contains(e.target) || btn.contains(e.target)) return;
    setOpen(false);
  });

  // 메뉴 안에서 포커스가 빠져나가면 닫기 (Tab 이동 대응)
  nav.addEventListener("focusout", (e) => {
    if (isDesktop()) return;
    if (btn.getAttribute("aria-expanded") !== "true") return;
    if (e.relatedTarget && (nav.contains(e.relatedTarget) || btn.contains(e.relatedTarget))) return;
    setOpen(false);
  });

  // 데스크톱 폭으로 넓어지면 열림 상태를 초기화 (CSS가 항상 보이게 처리)
  window.matchMedia(DESKTOP).addEventListener?.("change", () => setOpen(false));
}

function initScrollState(header) {
  const update = () => {
    header.setAttribute("data-scrolled", String(window.scrollY > 8));
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
}
