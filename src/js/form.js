/**
 * 방명록·연락 폼이 공유하는 자잘한 유틸.
 * (두 폼의 상태 표시·글자수 카운터·중복 제출 방지 로직이 같아서 한곳에 모았다.)
 */

/** 상태 메시지 표시. kind: "info" | "error" | "success" | null(지움) */
export function setStatus(el, kind, text) {
  if (!el) return;
  if (!kind) {
    el.textContent = "";
    el.removeAttribute("data-kind");
    return;
  }
  el.setAttribute("data-kind", kind);
  el.textContent = text; // 항상 textContent — 사용자 입력이 섞여도 안전
}

/** textarea/input 글자수 카운터를 연결한다. */
export function bindCounter(field, counter, max) {
  if (!field || !counter) return;
  const update = () => {
    const len = [...field.value].length;
    counter.textContent = `${len} / ${max}`;
    counter.setAttribute("data-over", String(len > max));
  };
  field.addEventListener("input", update);
  update();
}

/**
 * 제출 중 버튼을 잠그는 래퍼. 같은 폼의 중복 제출을 막는다.
 * @param {HTMLButtonElement} btn
 * @param {string} busyLabel
 */
export function busyButton(btn, busyLabel) {
  const original = btn?.textContent ?? "";
  return {
    lock() {
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = busyLabel;
    },
    unlock() {
      if (!btn) return;
      btn.disabled = false;
      btn.textContent = original;
    },
  };
}

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** epoch(ms 또는 s) → "2026. 08. 17. 14:03" */
export function formatTime(value) {
  const ms = value > 1e12 ? value : value * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return dateFmt.format(d);
}
