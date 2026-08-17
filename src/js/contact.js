/**
 * 연락 폼. 성공하면 폼을 감사 메시지로 교체한다.
 */

import { request, messageFor } from "./api.js";
import { mountTurnstile } from "./turnstile.js";
import { setStatus, bindCounter, busyButton } from "./form.js";

const NAME_MAX = 40;
const MESSAGE_MAX = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export async function initContact() {
  const form = document.getElementById("contact-form");
  if (!form) return;

  const statusEl = document.getElementById("contact-status");
  const nameEl = document.getElementById("ct-name");
  const emailEl = document.getElementById("ct-email");
  const messageEl = document.getElementById("ct-message");
  const submitEl = form.querySelector('button[type="submit"]');
  const slot = document.getElementById("contact-turnstile");

  bindCounter(messageEl, document.getElementById("ct-message-count"), MESSAGE_MAX);

  const widget = await mountTurnstile(slot);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus(statusEl, null);

    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    const message = messageEl.value.trim();

    const problem = validate({ name, email, message });
    if (problem) {
      setStatus(statusEl, "error", problem.text);
      problem.el?.focus();
      return;
    }

    const busy = busyButton(submitEl, "보내는 중…");
    busy.lock();
    setStatus(statusEl, "info", "전송 중…");

    try {
      await request("/contact", {
        method: "POST",
        body: { name, email, message, turnstileToken: widget?.token() ?? "" },
      });
      form.reset();
      bindCounter(messageEl, document.getElementById("ct-message-count"), MESSAGE_MAX);
      setStatus(statusEl, "success", "메시지를 받았습니다. 빠르게 답장 드리겠습니다.");
    } catch (err) {
      setStatus(statusEl, "error", messageFor(err));
    } finally {
      widget?.reset();
      busy.unlock();
    }
  });
}

function validate({ name, email, message }) {
  if (!name) return { text: "이름을 입력해 주세요.", el: document.getElementById("ct-name") };
  if ([...name].length > NAME_MAX)
    return { text: `이름은 ${NAME_MAX}자 이내로 입력해 주세요.`, el: document.getElementById("ct-name") };
  if (!EMAIL_RE.test(email))
    return { text: "이메일 형식이 올바르지 않습니다.", el: document.getElementById("ct-email") };
  if ([...email].length > 254)
    return { text: "이메일이 너무 깁니다.", el: document.getElementById("ct-email") };
  if (!message) return { text: "메시지를 입력해 주세요.", el: document.getElementById("ct-message") };
  if ([...message].length > MESSAGE_MAX)
    return {
      text: `메시지는 ${MESSAGE_MAX}자 이내로 입력해 주세요.`,
      el: document.getElementById("ct-message"),
    };
  return null;
}
