/**
 * 라이트/다크 테마 토글.
 * 기본값은 OS 설정(prefers-color-scheme)이고, 사용자가 토글하면 그 선택을
 * localStorage 에 저장해 <html data-theme> 로 고정한다.
 * 첫 페인트 전 적용은 각 HTML <head> 의 인라인 스크립트가 담당한다(플래시 방지).
 */

export const STORAGE_KEY = "shworld:theme";

function systemPrefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function stored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") ?? (systemPrefersDark() ? "dark" : "light");
}

function apply(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* 시크릿 모드 등 — 저장 실패는 무시 */
  }
  document.dispatchEvent(new CustomEvent("shworld:themechange", { detail: { theme } }));
}

function label(btn, theme) {
  const next = theme === "dark" ? "라이트" : "다크";
  btn.setAttribute("aria-label", `${next} 모드로 전환`);
  btn.setAttribute("title", `${next} 모드로 전환`);
}

export function initTheme() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  label(btn, currentTheme());

  btn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    apply(next);
    label(btn, next);
  });

  // 사용자가 직접 고른 적이 없으면 OS 설정 변화를 계속 따라간다.
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (stored()) return;
    label(btn, systemPrefersDark() ? "dark" : "light");
    document.dispatchEvent(
      new CustomEvent("shworld:themechange", { detail: { theme: systemPrefersDark() ? "dark" : "light" } })
    );
  });
}

/** Turnstile 같은 외부 위젯에 넘길 현재 테마. */
export function activeTheme() {
  return currentTheme();
}
