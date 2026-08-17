/**
 * 입력 검증. 서버가 최종 판정자다 — 클라이언트 검증은 UX용일 뿐이다.
 * 실패는 { ok: false, message } 로 돌려주고 라우트가 400 으로 변환한다.
 */

export const LIMITS = {
  nameMax: 40,
  messageMin: 1,
  messageMax: 1000,
  emailMax: 254,
  slugMax: 64,
};

// 로컬파트@도메인.tld — 실용적인 수준까지만 검사한다(완벽한 RFC 검증은 무의미).
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]{1,63}(\.[^\s@.]{1,63})+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// 개행(LF)과 탭은 남기고 나머지 제어문자만 제거한다.
// 소스에 실제 제어문자를 넣지 않기 위해 RegExp 생성자 + 이스케이프 표기를 쓴다.
const CONTROL_RE = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "g");

const ok = (value) => ({ ok: true, value });
const no = (message) => ({ ok: false, message });

/** 제어문자 제거 + 개행 정규화 + 앞뒤 공백 정리. */
function clean(input) {
  if (typeof input !== "string") return "";
  return input.replace(/\r\n/g, "\n").replace(CONTROL_RE, "").trim();
}

/** 코드포인트 기준 길이 (이모지·한글 조합을 자릿수로 잘못 세지 않게) */
function length(str) {
  return [...str].length;
}

export function validateName(input) {
  const name = clean(input);
  if (name.length === 0) return no("이름을 입력해 주세요.");
  if (length(name) > LIMITS.nameMax) return no(`이름은 ${LIMITS.nameMax}자 이내로 입력해 주세요.`);
  return ok(name);
}

export function validateMessage(input) {
  const message = clean(input);
  if (length(message) < LIMITS.messageMin) return no("메시지를 입력해 주세요.");
  if (length(message) > LIMITS.messageMax)
    return no(`메시지는 ${LIMITS.messageMax}자 이내로 입력해 주세요.`);
  return ok(message);
}

export function validateEmail(input) {
  const email = clean(input);
  if (email.length === 0) return no("이메일을 입력해 주세요.");
  if (email.length > LIMITS.emailMax) return no("이메일이 너무 깁니다.");
  if (!EMAIL_RE.test(email)) return no("이메일 형식이 올바르지 않습니다.");
  return ok(email);
}

/** URL 경로에서 온 slug. 화이트리스트 정규식 통과만 허용. */
export function validateSlug(input) {
  let decoded = "";
  try {
    decoded = decodeURIComponent(String(input ?? ""));
  } catch {
    return no("잘못된 slug 입니다.");
  }
  const slug = clean(decoded).toLowerCase();
  if (slug.length === 0 || slug.length > LIMITS.slugMax) return no("잘못된 slug 입니다.");
  if (!SLUG_RE.test(slug)) return no("잘못된 slug 입니다.");
  return ok(slug);
}

/** 양의 정수 파싱 (id, limit, cursor 등) */
export function validatePositiveInt(input, { max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if ((input === null || input === undefined || input === "") && fallback !== undefined) {
    return ok(fallback);
  }
  const n = Number(input);
  if (!Number.isInteger(n) || n <= 0 || n > max) return no("숫자 파라미터가 올바르지 않습니다.");
  return ok(n);
}
