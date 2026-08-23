/**
 * 공유 버튼.
 *
 * [data-share] 를 가진 버튼에 붙는다. 동작은 두 갈래다.
 *   1) navigator.share 가 있으면 (폰, 윈도우 크롬 등) 시스템 공유창을 띄운다
 *   2) 없으면 주소를 클립보드에 복사하고 버튼 글자를 잠깐 "복사됨" 으로 바꾼다
 *
 * 공유할 주소는 <link rel="canonical"> 을 우선한다. 상세 페이지는 .html 이
 * 벗겨진 주소로 리다이렉트되므로, 지금 보고 있는 주소보다 canonical 이 정확하다.
 */

/** 바뀐 버튼 글자를 원래대로 되돌리기까지의 시간(ms) */
const RESET_MS = 2000;

/** 페이지의 대표 주소 — canonical 이 있으면 그것을, 없으면 현재 주소를 쓴다. */
function pageUrl() {
  const canonical = document.querySelector('link[rel="canonical"]');
  return canonical?.href || location.href;
}

/**
 * 클립보드 복사. 최신 API 를 먼저 쓰고, 막히면 임시 textarea 로 물러난다.
 * (클립보드 API 는 https 가 아니면 아예 없는 경우가 있다)
 */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 폴백으로 계속
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  // 화면 밖으로 빼되 focus 는 받을 수 있어야 한다 (display:none 이면 선택이 안 된다)
  ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
  document.body.appendChild(ta);
  ta.select();

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** 버튼 글자를 잠깐 바꿔 결과를 알린다. 연타해도 타이머가 겹치지 않는다. */
function flash(btn, message) {
  const label = btn.querySelector("[data-share-label]");
  const status = btn.querySelector("[data-share-status]");
  if (status) status.textContent = message;
  if (!label) return;

  if (btn._shareTimer) {
    clearTimeout(btn._shareTimer);
  } else {
    // 원래 글자는 첫 번째 변경 때만 저장한다 (연타 시 "복사됨" 이 원본이 되면 안 된다)
    btn._shareText = label.textContent;
  }

  label.textContent = message;
  btn.classList.add("is-done");
  btn._shareTimer = setTimeout(() => {
    label.textContent = btn._shareText;
    btn.classList.remove("is-done");
    btn._shareTimer = null;
  }, RESET_MS);
}

async function handleShare(btn) {
  const url = btn.dataset.shareUrl || pageUrl();
  const title = btn.dataset.shareTitle || document.title;

  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      // 사용자가 공유창을 그냥 닫은 경우 — 실패가 아니므로 아무 표시도 하지 않는다
      if (err?.name === "AbortError") return;
      // 그 밖의 이유로 막혔으면 복사로 물러난다
    }
  }

  const ok = await copyToClipboard(url);
  flash(btn, ok ? "복사됨" : "복사 실패");
}

export function initShare() {
  for (const btn of document.querySelectorAll("[data-share]")) {
    btn.addEventListener("click", () => {
      handleShare(btn).catch((err) => console.warn("[shworld] 공유 실패:", err));
    });
  }
}
