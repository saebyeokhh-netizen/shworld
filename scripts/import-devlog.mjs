/**
 * 개발일지를 사이트의 글로 옮긴다.
 *
 * ── 왜 손으로 하지 않나 ────────────────────────────────────────────────────
 *  옮길 글이 수십 편이고, 편마다 **지워야 할 것이 같은 모양으로 반복**된다 — 배포 버전 id,
 *  실제 이용자 닉네임, 이메일, 민원 접수번호, 내부 문서 경로. 한 편씩 눈으로 훑으면
 *  **반드시 하나를 놓친다.** 놓친 것이 개인정보면 그것으로 끝이다.
 *
 *  그래서 기계가 지우고, 사람은 **무엇을 옮길지만** 고른다(`PICKS`).
 *
 * ── 안전장치 ───────────────────────────────────────────────────────────────
 *  지우고 난 뒤에도 남아 있으면 안 되는 낱말을 다시 한 번 훑어, 하나라도 걸리면
 *  **그 글을 내보내지 않고 알린다.** 조용히 통과시키는 것보다 시끄럽게 막는 편이 낫다.
 *
 *   node scripts/import-devlog.mjs          — 변환해서 content/posts 에 쓴다
 *   node scripts/import-devlog.mjs --check  — 쓰지 않고 걸리는 것만 보여준다
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEVLOG = path.join("C:", "project", "schoolking", "docs", "devlog");
const OUT = path.join(ROOT, "content", "posts");

/**
 * 옮길 글.
 *
 * `files` 가 여럿이면 한 편으로 **합친다** — 개발일지는 편당 1,500~3,000자가 대부분이라
 * 낱개로 올리면 "얇은 페이지를 잔뜩 찍어냈다" 는 신호가 된다. 이어지는 이야기끼리 묶는다.
 */
const PICKS = [
  // ── 시리즈 ① 규칙 설계와 밸런스 ──────────────────────────────────────────
  {
    slug: "medusa-flips-the-trick",
    title: "메두사는 왜 \"판을 뒤집는 카드\" 가 되었나",
    summary:
      "규칙을 설명하려는데 예외가 자꾸 늘어났다. 예시를 더 다는 대신 규칙을 두 줄로 줄였다.",
    date: "2026-08-29",
    series: "규칙 설계와 밸런스",
    tags: ["게임 디자인", "카드게임", "규칙"],
    files: ["2026-08-29-메두사-판을-뒤집다.md", "2026-08-29-메두사가-이기는-경우-설명.md"],
  },
  {
    slug: "simulating-8250-tricks",
    title: "감으로 정하지 않으려고 8,250 판을 돌려봤다",
    summary:
      "약한 카드로 이기면 보너스를 주기로 했는데 얼마가 적당한지 알 수가 없었다. 세어 보니 문제는 양이 아니라 성격이었다.",
    date: "2026-08-30",
    series: "규칙 설계와 밸런스",
    tags: ["게임 디자인", "밸런스", "시뮬레이션"],
    files: ["2026-08-29-약한-카드-보너스.md", "2026-08-30-보너스-둘을-하나로.md"],
  },
  {
    slug: "random-clumps",
    title: "\"쟤가 계속 선이네\" 는 착각이 아니었다",
    summary:
      "무작위로 뽑으면 공평할 줄 알았다. 20만 판을 돌려 보니 사람이 느끼는 불공평은 진짜였다.",
    date: "2026-08-30",
    series: "규칙 설계와 밸런스",
    tags: ["게임 디자인", "확률", "시뮬레이션"],
    files: ["2026-08-30-선이-한자리씩-돈다.md"],
  },
  {
    slug: "player-count-changes-the-game",
    title: "인원이 바뀌면 같은 게임이 아니다",
    summary:
      "둘이 할 때와 여덟이 할 때 특수 카드를 만날 확률이 네 배 차이였다. 덱을 인원에 맞춰 바꿨다.",
    date: "2026-08-31",
    series: "규칙 설계와 밸런스",
    tags: ["게임 디자인", "밸런스", "확률"],
    files: ["2026-08-31-메두사-겹침-인원별-덱-8인.md"],
  },

  // ── 시리즈 ② 실시간 방 서버 ─────────────────────────────────────────────
  {
    slug: "own-room-server-durable-objects",
    title: "남의 서비스를 걷어내고 방 서버를 직접 만들었다",
    summary:
      "무료 한도에 걸릴 것이 눈에 보였다. Cloudflare Durable Objects 로 옮기면서 규칙 판정까지 서버로 가져왔다.",
    date: "2026-08-25",
    series: "실시간 방 서버",
    tags: ["Cloudflare", "Durable Objects", "웹소켓", "서버"],
    files: ["2026-08-23-자체-방서버.md", "2026-08-25-3단계-규칙을-서버로.md"],
  },
  {
    slug: "reconnect-and-inapp-browser",
    title: "초대한 친구를 못 만나던 문제 뒤에는 세 가지가 있었다",
    summary:
      "같은 방 번호를 넣었는데 서로 안 보였다. 끊긴 줄 모르는 소켓, 답하지 않는 종료 신호, 그리고 카카오톡 안에서 열린 브라우저.",
    date: "2026-08-24",
    series: "실시간 방 서버",
    tags: ["웹소켓", "재접속", "인앱 브라우저"],
    files: ["2026-08-24-재접속과-인앱브라우저.md"],
  },
  {
    slug: "durable-object-remembers",
    title: "Durable Object 는 저장한 것을 스스로 버리지 않는다",
    summary:
      "\"매칭했는데 AI 가 나왔다\" 는 제보의 진짜 원인. 방은 비었는데 기억은 남아 있었다.",
    date: "2026-08-28",
    series: "실시간 방 서버",
    tags: ["Cloudflare", "Durable Objects", "상태 관리"],
    files: ["2026-08-28-매칭-한자리-그리고-오염된-방.md"],
  },

  // ── 시리즈 ③ 배포와 PWA ─────────────────────────────────────────────────
  {
    slug: "two-deploys-one-app",
    title: "화면은 자동 배포, 서버는 손 배포 — 한 주에 세 번 같은 사고",
    summary:
      "고쳤는데 안 고쳐졌다. 원인은 코드가 아니라 두 곳이 서로 다른 시점에 올라간다는 것이었다.",
    date: "2026-08-30",
    series: "배포와 PWA",
    tags: ["배포", "Cloudflare", "운영"],
    files: ["2026-08-29-트로피가-0으로-뜬-이유.md", "2026-08-30-판이-끝나면-앱이-죽던-일.md"],
  },
  {
    slug: "service-worker-is-hard-to-recall",
    title: "서비스 워커는 한 번 내보내면 회수가 어렵다",
    summary:
      "주소를 옮겼더니 설치해둔 앱이 안 열렸다. 파일을 지우는 것으로는 못 지우고, 자기 자신을 지우는 워커를 새로 내보내야 했다.",
    date: "2026-09-14",
    series: "배포와 PWA",
    tags: ["PWA", "서비스 워커", "배포"],
    files: ["2026-09-05-옛-주소-살리기와-설명-건너뛰기.md", "2026-09-14-고친-것이-닿지-않던-이유.md"],
  },

  // ── 시리즈 ④ 광고·법·개인정보 ───────────────────────────────────────────
  {
    slug: "adsense-saw-a-blank-page",
    title: "애드센스가 본 것은 백지였다",
    summary:
      "글이 없어서가 아니라 로봇 눈에 안 보여서였다. 자바스크립트로 그리는 화면은 심사에서 0자로 읽힌다.",
    date: "2026-09-05",
    series: "광고·법·개인정보",
    tags: ["애드센스", "SPA", "검색 노출", "프리렌더"],
    files: ["2026-08-28-애드센스-정책위반-광고코드-위치.md", "2026-09-05-애드센스-백지-문제.md"],
  },
  {
    slug: "age-check-without-birthdate",
    title: "생년월일을 저장하지 않고 만 14세를 확인하는 법",
    summary:
      "법은 확인하라고 하고, 같은 법이 필요 없는 정보는 갖지 말라고 한다. 둘 다 지키는 방법.",
    date: "2026-08-28",
    series: "광고·법·개인정보",
    tags: ["개인정보", "법", "회원가입"],
    files: ["2026-08-28-만14세-확인.md"],
  },
  {
    slug: "no-entry-fee",
    title: "판에 참가비를 두지 않기로 한 이유",
    summary:
      "게임 안 재화를 걸고 이기면 돌려받는 구조는 한국에서 규제 대상이 된다. 그래서 경제를 통째로 바꿨다.",
    date: "2026-08-27",
    series: "광고·법·개인정보",
    tags: ["법", "게임산업법", "수익모델"],
    files: ["2026-08-27-코인을-걷어내고-황금사과.md"],
  },
];

/** 어느 글에서든 무조건 지우는 것 */
const SCRUB = [
  // 배포 버전 id — 읽는 사람에게 아무 뜻이 없고 내부 정보다
  [/^.*(버전|Version) ?ID.*$/gim, ""],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, "(배포 id)"],
  [/\b[0-9a-f]{8}\b(?= 배포| 로 배포)/g, "(배포 id)"],
  // 연락처·민원 번호
  [/wonderful\.shworld@gmail\.com/g, "(문의 주소)"],
  [/\b[12]AA-\d{4}-\d{7}\b/g, "(접수번호)"],
  // 내부 문서 경로
  [/`docs\/(plan|legal)\/[^`]+`/g, "기획 문서"],
  [/\(`?docs\/(plan|legal)\/[^)]+\)/g, ""],
];

/** 실제 이용자 닉네임 → 가명 */
const NICKNAMES = {
  강남여자: "A 님", 용산남자: "B 님", 코코: "C 님", 폭탄: "D 님",
  예준: "E 님", 매미는맴맴: "F 님", 와나: "G 님", 거믄밤: "H 님",
  검은밤: "H 님", 민트초코: "I 님", 영재: "J 님", 소라게: "K 님", 떨리잉: "L 님",
};

/** 남아 있으면 내보내지 않는다 */
const FORBIDDEN = [
  /스컬\s?킹/i, /skull\s?king/i,
  /SESSION_SECRET/,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
  /@gmail\.com/,
  /[12]AA-\d{4}-\d{7}/,
  /ca-pub-\d+/,
  ...Object.keys(NICKNAMES).map((n) => new RegExp(n)),
];

function scrub(text) {
  let out = text;
  for (const [re, to] of SCRUB) out = out.replace(re, to);
  for (const [from, to] of Object.entries(NICKNAMES)) {
    out = out.replace(new RegExp(from, "g"), to);
  }
  /*
   * "## 파일" 절 — 저장소 안에서만 뜻이 있는 목록이라 뺀다.
   *
   * 다음 제목까지만 지운다. 처음에는 파일 끝까지 지웠는데, 두 편을 합칠 때 앞 편의
   * 이 절이 뒤 편을 통째로 삼켰다. 2,413자가 1,083자로 줄어든 것을 보고 알았다.
   */
  out = out.replace(/\n## 파일\n[\s\S]*?(?=\n## |$)/g, "\n");
  // 빈 줄이 셋 이상 이어지면 둘로
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

/** 본문 맨 앞의 `# 제목` 줄은 템플릿이 따로 그리므로 뺀다 */
function dropTitle(md) {
  return md.replace(/^#\s+[^\n]*\n+/, "");
}

async function main() {
  const check = process.argv.includes("--check");
  if (!existsSync(DEVLOG)) {
    console.error(`[import] 개발일지를 찾을 수 없습니다: ${DEVLOG}`);
    process.exit(1);
  }
  if (PICKS.length === 0) {
    console.error("[import] PICKS 가 비어 있습니다. 옮길 글을 골라 적으세요.");
    process.exit(1);
  }
  await mkdir(OUT, { recursive: true });

  let failed = 0;
  for (const pick of PICKS) {
    const parts = [];
    for (const file of pick.files) {
      const full = path.join(DEVLOG, file);
      if (!existsSync(full)) {
        console.error(`[import] ${pick.slug}: 원본이 없습니다 — ${file}`);
        failed += 1;
        continue;
      }
      // 편마다 따로 손질한 뒤 합친다. 통째로 손질하면 앞 편의 절 삭제가 뒤 편까지 먹는다
      parts.push(scrub(dropTitle(await readFile(full, "utf8"))));
    }
    if (parts.length === 0) continue;

    const body = scrub(parts.join("\n\n---\n\n"));

    const hits = FORBIDDEN.filter((re) => re.test(body)).map((re) => String(re));
    if (hits.length > 0) {
      console.error(`[import] ⛔ ${pick.slug}: 지워지지 않은 것이 있습니다 — ${hits.join(", ")}`);
      failed += 1;
      continue;
    }

    const front = [
      "---",
      `title: ${pick.title}`,
      `slug: ${pick.slug}`,
      `summary: ${pick.summary}`,
      `date: ${pick.date}`,
      pick.series ? `series: ${pick.series}` : "",
      pick.tags?.length ? `tags: [${pick.tags.join(", ")}]` : "",
      "---",
      "",
    ].filter(Boolean).join("\n");

    const chars = body.replace(/\s/g, "").length;
    if (check) {
      console.log(`  · ${pick.slug.padEnd(34)} ${String(chars).padStart(6)}자  (${pick.files.length}편 합본)`);
      continue;
    }
    await writeFile(path.join(OUT, `${pick.slug}.md`), `${front}${body}\n`, "utf8");
    console.log(`  ✓ ${pick.slug.padEnd(34)} ${String(chars).padStart(6)}자`);
  }

  if (failed > 0) {
    console.error(`\n[import] ${failed}편이 걸렸습니다. 원본을 손보거나 PICKS 에서 빼세요.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[import] 실패:", err);
  process.exit(1);
});
