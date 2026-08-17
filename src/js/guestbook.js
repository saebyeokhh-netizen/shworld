/**
 * 방명록: 목록 조회(커서 페이지네이션) + 작성.
 * 사용자 입력은 전부 textContent 로만 넣는다 — innerHTML 금지.
 */

import { request, quiet, messageFor } from "./api.js";
import { mountTurnstile } from "./turnstile.js";
import { setStatus, bindCounter, busyButton, formatTime } from "./form.js";

const PAGE_SIZE = 20;
const NAME_MAX = 40;
const MESSAGE_MAX = 1000;

export async function initGuestbook() {
  const list = document.getElementById("entry-list");
  const loading = document.getElementById("entry-loading");
  const emptyEl = document.getElementById("entry-empty");
  const moreBtn = document.getElementById("entry-more");
  const offlineEl = document.getElementById("entry-offline");

  const form = document.getElementById("guestbook-form");
  const statusEl = document.getElementById("guestbook-status");
  const nameEl = document.getElementById("gb-name");
  const messageEl = document.getElementById("gb-message");
  const submitEl = form?.querySelector('button[type="submit"]');
  const slot = document.getElementById("guestbook-turnstile");

  bindCounter(nameEl, document.getElementById("gb-name-count"), NAME_MAX);
  bindCounter(messageEl, document.getElementById("gb-message-count"), MESSAGE_MAX);

  let cursor = null;

  const showList = () => {
    if (loading) loading.hidden = true;
  };

  const appendEntries = (entries) => {
    for (const entry of entries) list?.appendChild(renderEntry(entry));
  };

  const loadPage = async (before) => {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (before) qs.set("before", String(before));
    return quiet(`/guestbook?${qs}`);
  };

  // --- 첫 페이지 ---
  const first = await loadPage(null);
  showList();

  if (!first) {
    // API 없음(로컬 vite dev 등) — 조용히 안내만 남기고 폼은 그대로 둔다.
    if (offlineEl) offlineEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
  } else {
    const entries = Array.isArray(first.entries) ? first.entries : [];
    appendEntries(entries);
    cursor = first.nextCursor ?? null;
    if (emptyEl) emptyEl.hidden = entries.length > 0;
    if (moreBtn) moreBtn.hidden = !cursor;
  }

  moreBtn?.addEventListener("click", async () => {
    const busy = busyButton(moreBtn, "불러오는 중…");
    busy.lock();
    const page = await loadPage(cursor);
    busy.unlock();
    if (!page) return;
    appendEntries(Array.isArray(page.entries) ? page.entries : []);
    cursor = page.nextCursor ?? null;
    moreBtn.hidden = !cursor;
  });

  // --- 작성 폼 ---
  if (!form) return;
  const widget = await mountTurnstile(slot);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus(statusEl, null);

    const name = nameEl.value.trim();
    const message = messageEl.value.trim();

    const problem = validate(name, message);
    if (problem) {
      setStatus(statusEl, "error", problem.text);
      problem.el?.focus();
      return;
    }

    const busy = busyButton(submitEl, "남기는 중…");
    busy.lock();
    setStatus(statusEl, "info", "전송 중…");

    try {
      const created = await request("/guestbook", {
        method: "POST",
        body: { name, message, turnstileToken: widget?.token() ?? "" },
      });

      if (emptyEl) emptyEl.hidden = true;
      if (offlineEl) offlineEl.hidden = true;
      list?.prepend(renderEntry(created));
      form.reset();
      bindCounter(nameEl, document.getElementById("gb-name-count"), NAME_MAX);
      bindCounter(messageEl, document.getElementById("gb-message-count"), MESSAGE_MAX);
      setStatus(statusEl, "success", "남겨주셔서 감사합니다.");
    } catch (err) {
      setStatus(statusEl, "error", messageFor(err));
    } finally {
      widget?.reset();
      busy.unlock();
    }
  });
}

function validate(name, message) {
  if (!name) return { text: "이름을 입력해 주세요.", el: document.getElementById("gb-name") };
  if ([...name].length > NAME_MAX)
    return { text: `이름은 ${NAME_MAX}자 이내로 입력해 주세요.`, el: document.getElementById("gb-name") };
  if (!message) return { text: "메시지를 입력해 주세요.", el: document.getElementById("gb-message") };
  if ([...message].length > MESSAGE_MAX)
    return {
      text: `메시지는 ${MESSAGE_MAX}자 이내로 입력해 주세요.`,
      el: document.getElementById("gb-message"),
    };
  return null;
}

function renderEntry(entry) {
  const li = document.createElement("li");
  li.className = "entry";

  const head = document.createElement("div");
  head.className = "entry__head";

  const name = document.createElement("span");
  name.className = "entry__name";
  name.textContent = String(entry?.name ?? "익명");

  const time = document.createElement("time");
  time.className = "entry__time";
  const created = Number(entry?.created_at ?? 0);
  if (created > 0) {
    const ms = created > 1e12 ? created : created * 1000;
    time.dateTime = new Date(ms).toISOString();
    time.textContent = formatTime(created);
  }

  head.append(name, time);

  const body = document.createElement("p");
  body.className = "entry__message";
  body.textContent = String(entry?.message ?? "");

  li.append(head, body);
  return li;
}
