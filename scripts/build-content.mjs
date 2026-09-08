/**
 * 콘텐츠 빌드 — content/ 의 파일들을 사이트가 쓸 수 있는 형태로 굽는다.
 *
 * 입력
 *   content/profile.json         프로필·스킬·타임라인
 *   content/projects/*.md        frontmatter + 본문
 *
 * 출력 (전부 .gitignore 대상)
 *   src/generated/projects/<slug>.html   작품 상세 페이지 (Vite 엔트리가 된다)
 *   src/generated/partials.json          공통 페이지에 주입할 HTML 조각 (vite.config.js 가 사용)
 *   public/data/projects.json            클라이언트 검색·필터용 인덱스
 *   public/sitemap.xml                   사이트맵
 *
 * 실패 정책: frontmatter 가 깨졌거나 slug 가 중복되면 즉시 종료한다.
 * 조용히 넘어가면 배포된 사이트에 빈 페이지가 생기므로, 여기서 크게 실패하는 게 낫다.
 */

import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = {
  content: path.join(ROOT, "content"),
  projects: path.join(ROOT, "content", "projects"),
  templates: path.join(ROOT, "src", "templates"),
  generated: path.join(ROOT, "src", "generated"),
  public: path.join(ROOT, "public"),
};

const REQUIRED_FIELDS = ["title", "slug", "summary", "date"];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// 에러 처리
// ---------------------------------------------------------------------------

class ContentError extends Error {
  constructor(file, message) {
    super(`${message}\n    파일: ${file}`);
    this.name = "ContentError";
  }
}

// ---------------------------------------------------------------------------
// frontmatter 파서 (YAML 의 아주 작은 부분집합)
//   - key: value
//   - key: [a, b, c]
//   - key:  +  들여쓴 하위 매핑 / "- " 시퀀스
//   외부 의존성을 늘리지 않기 위해 직접 구현했다. 지원하지 않는 문법은 에러로 알려준다.
// ---------------------------------------------------------------------------

function splitFrontmatter(raw, file) {
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) {
    throw new ContentError(file, "frontmatter 가 없습니다. 파일은 '---' 줄로 시작해야 합니다.");
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    throw new ContentError(file, "frontmatter 종료 구분자 '---' 를 찾을 수 없습니다.");
  }
  const closeLineEnd = text.indexOf("\n", end + 1);
  return {
    frontmatter: text.slice(4, end),
    body: closeLineEnd === -1 ? "" : text.slice(closeLineEnd + 1),
  };
}

function tokenize(block, file) {
  return block
    .split("\n")
    .map((line, index) => ({ raw: line, lineNo: index + 1 }))
    .filter(({ raw }) => raw.trim() !== "" && !raw.trim().startsWith("#"))
    .map(({ raw, lineNo }) => {
      if (raw.includes("\t")) {
        throw new ContentError(file, `frontmatter ${lineNo}번째 줄: 탭 대신 공백으로 들여쓰세요.`);
      }
      return { indent: raw.length - raw.trimStart().length, text: raw.trim(), lineNo };
    });
}

function parseScalar(input) {
  let text = input.trim();

  if (text === "") return "";
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "~") return null;

  // 인라인 배열: [a, b, "c d"]
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    if (inner === "") return [];
    return splitInlineList(inner).map((item) => unquote(item));
  }

  return unquote(text);
}

/** 따옴표 안의 콤마를 존중하며 분리 */
function splitInlineList(inner) {
  const out = [];
  let buf = "";
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
      else buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ",") {
      out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== "") out.push(buf.trim());
  return out.filter((s) => s !== "");
}

function unquote(text) {
  const t = text.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseNode(lines, i, indent, file) {
  // 시퀀스
  if (lines[i].text.startsWith("- ") || lines[i].text === "-") {
    const arr = [];
    while (i < lines.length && lines[i].indent === indent && (lines[i].text.startsWith("- ") || lines[i].text === "-")) {
      const rest = lines[i].text === "-" ? "" : lines[i].text.slice(2).trim();
      i += 1;
      if (rest === "") {
        if (i < lines.length && lines[i].indent > indent) {
          const [value, next] = parseNode(lines, i, lines[i].indent, file);
          arr.push(value);
          i = next;
        } else {
          arr.push(null);
        }
      } else {
        arr.push(parseScalar(rest));
      }
    }
    return [arr, i];
  }

  // 매핑
  const obj = {};
  while (i < lines.length && lines[i].indent === indent && !lines[i].text.startsWith("- ")) {
    const { text, lineNo } = lines[i];
    const colon = text.indexOf(":");
    if (colon <= 0) {
      throw new ContentError(file, `frontmatter ${lineNo}번째 줄: 'key: value' 형태가 아닙니다 → "${text}"`);
    }
    const key = text.slice(0, colon).trim();
    const rest = text.slice(colon + 1).trim();
    i += 1;

    if (rest !== "") {
      obj[key] = parseScalar(rest);
      continue;
    }

    const next = lines[i];
    if (next && next.indent > indent) {
      const [value, ni] = parseNode(lines, i, next.indent, file);
      obj[key] = value;
      i = ni;
    } else if (next && next.indent === indent && next.text.startsWith("- ")) {
      const [value, ni] = parseNode(lines, i, indent, file);
      obj[key] = value;
      i = ni;
    } else {
      obj[key] = "";
    }
  }
  return [obj, i];
}

function parseFrontmatter(block, file) {
  const lines = tokenize(block, file);
  if (lines.length === 0) throw new ContentError(file, "frontmatter 가 비어 있습니다.");

  const baseIndent = lines[0].indent;
  if (baseIndent !== 0) throw new ContentError(file, "frontmatter 첫 줄은 들여쓰지 마세요.");

  const [data, consumed] = parseNode(lines, 0, 0, file);
  if (consumed !== lines.length) {
    const bad = lines[consumed];
    throw new ContentError(
      file,
      `frontmatter ${bad.lineNo}번째 줄의 들여쓰기를 해석할 수 없습니다 → "${bad.text}"`
    );
  }
  return data;
}

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

function asStringArray(value, field, file) {
  if (value === undefined || value === "" || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ContentError(file, `'${field}' 는 배열이어야 합니다. 예: ${field}: [A, B]`);
  }
  return value.map((v) => String(v).trim()).filter(Boolean);
}

function validateProject(data, body, file) {
  for (const field of REQUIRED_FIELDS) {
    const value = data[field];
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new ContentError(file, `필수 frontmatter 항목 '${field}' 이(가) 없습니다.`);
    }
  }

  const slug = String(data.slug).trim();
  if (!SLUG_RE.test(slug)) {
    throw new ContentError(
      file,
      `slug '${slug}' 형식이 올바르지 않습니다. 소문자·숫자·하이픈만 쓰세요 (예: my-project).`
    );
  }

  const date = String(data.date).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ContentError(file, `date '${date}' 는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  if (Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw new ContentError(file, `date '${date}' 는 존재하지 않는 날짜입니다.`);
  }

  if (body.trim() === "") {
    throw new ContentError(file, "본문이 비어 있습니다. frontmatter 아래에 내용을 작성하세요.");
  }

  const links = data.links ?? {};
  if (typeof links !== "object" || Array.isArray(links)) {
    throw new ContentError(file, "'links' 는 repo / demo 키를 가진 매핑이어야 합니다.");
  }

  return {
    title: String(data.title).trim(),
    slug,
    summary: String(data.summary).trim(),
    tags: asStringArray(data.tags, "tags", file),
    stack: asStringArray(data.stack, "stack", file),
    date,
    featured: data.featured === true,
    links: {
      repo: String(links.repo ?? "").trim(),
      demo: String(links.demo ?? "").trim(),
    },
    thumbnail: String(data.thumbnail ?? "").trim(),
    body,
    file,
  };
}

// ---------------------------------------------------------------------------
// 렌더링 유틸
// ---------------------------------------------------------------------------

const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** HTML 텍스트/속성용 이스케이프 */
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

/** 템플릿의 {{token}} 을 치환한다. 남은 토큰이 있으면 에러 — 오타를 빌드에서 잡는다. */
function fill(template, vars, label) {
  const out = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (!(key in vars)) {
      throw new Error(`${label}: 템플릿 토큰 '{{${key}}}' 에 대응하는 값이 없습니다.`);
    }
    return vars[key];
  });
  const leftover = out.match(/\{\{\s*[\w.]+\s*\}\}/);
  if (leftover) throw new Error(`${label}: 치환되지 않은 토큰 ${leftover[0]}`);
  return out;
}

marked.setOptions({ gfm: true, breaks: false });

function renderMarkdown(md) {
  const html = marked.parse(md);
  // 넓은 표는 가로 스크롤 컨테이너로 감싼다 (모바일에서 페이지가 밀리지 않게)
  return html.replace(/<table>/g, '<div class="table-scroll"><table>').replace(/<\/table>/g, "</table></div>");
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

function humanDate(iso) {
  return DATE_FMT.format(new Date(`${iso}T00:00:00Z`));
}

/** thumbnail 파일이 public/ 에 실제로 있는지 확인 — 없으면 이니셜 폴백을 쓴다. */
function thumbnailExists(thumbnail) {
  if (!thumbnail || !thumbnail.startsWith("/")) return false;
  return existsSync(path.join(DIR.public, thumbnail.replace(/^\//, "")));
}

function initials(title) {
  const cleaned = title.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const first = words[0] ?? "?";
  return [...first].slice(0, 2).join("").toUpperCase();
}

// ---------------------------------------------------------------------------
// HTML 조각
// ---------------------------------------------------------------------------

function tagListHtml(tags, { link = false } = {}) {
  if (tags.length === 0) return "";
  const items = tags
    .map((tag) =>
      link
        ? `<li><a class="tag" href="/projects.html?tag=${encodeURIComponent(tag)}">${esc(tag)}</a></li>`
        : `<li><span class="tag">${esc(tag)}</span></li>`
    )
    .join("");
  return `<ul class="tag-list">${items}</ul>`;
}

/**
 * 카드에서 바로 써볼 수 있는 링크.
 *
 * 이 사이트는 만든 것을 보여주려고 있는 곳이라, 방문자가 목록에서 한 번 더 눌러
 * 상세로 들어가야만 데모에 닿는 건 한 단계가 많다. 데모가 있으면 카드에서 바로 연다.
 */
function cardTryHtml(project) {
  if (!project.links.demo) return "";
  return `<p class="card__try">
      <a href="${esc(project.links.demo)}" target="_blank" rel="noopener">
        지금 해보기
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17 17 7M17 7H9M17 7v8"/></svg>
      </a>
    </p>`;
}

/**
 * 첫 화면 오른쪽에 세우는 대표 작품 한 점.
 *
 * 이 사이트는 작품을 보여주려고 있는 곳이라, 첫 화면이 글만으로 채워지면 정작
 * 무엇을 만들었는지가 한 화면 아래로 밀린다. 대표작을 바로 옆에 세워 스크롤 전에
 * 눈에 들어오게 한다. 그림이 없는 작품이면 아무것도 그리지 않는다 —
 * 빈 액자를 세우느니 글만 두는 편이 낫다.
 */
function heroWorkHtml(project) {
  if (!project || !thumbnailExists(project.thumbnail)) return "";
  return `<a class="hero__work" href="/projects/${esc(project.slug)}.html">
    <span class="hero__work-frame">
      <img src="${esc(project.thumbnail)}" alt="" width="1024" height="576" decoding="async">
    </span>
    <span class="hero__work-meta">
      <span class="hero__work-eyebrow">대표 작품</span>
      <strong>${esc(project.title)}</strong>
      <span class="hero__work-summary">${esc(project.summary)}</span>
    </span>
  </a>`;
}

function projectCardHtml(project) {
  const href = `/projects/${project.slug}.html`;
  const haystack = [project.title, project.summary, ...project.tags, ...project.stack].join(" ");

  const thumb = thumbnailExists(project.thumbnail)
    ? `<img src="${esc(project.thumbnail)}" alt="" width="640" height="360" loading="lazy" decoding="async">`
    : `<span class="card__thumb-fallback" aria-hidden="true">${esc(initials(project.title))}</span>`;

  return `<li class="card${project.featured ? " card--featured" : ""}"
    data-slug="${esc(project.slug)}"
    data-tags="${esc(project.tags.join("|"))}"
    data-search="${esc(haystack.toLowerCase())}">
  <div class="card__thumb">${thumb}</div>
  <div class="card__body">
    <h3 class="card__title"><a href="${esc(href)}">${esc(project.title)}</a></h3>
    <p class="card__summary">${esc(project.summary)}</p>
    ${tagListHtml(project.tags)}
    ${cardTryHtml(project)}
    <div class="card__foot">
      <time class="card__date" datetime="${esc(project.date)}">${esc(humanDate(project.date))}</time>
      <span class="views" data-views-for="${esc(project.slug)}" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
        <span data-views-value>0</span><span class="visually-hidden"> 회 조회</span>
      </span>
    </div>
  </div>
</li>`;
}

function linksHtml(links) {
  const out = [];
  if (links.github) out.push(`<li><a href="${esc(links.github)}" rel="me noopener">GitHub</a></li>`);
  if (links.linkedin) out.push(`<li><a href="${esc(links.linkedin)}" rel="me noopener">LinkedIn</a></li>`);
  if (links.blog) out.push(`<li><a href="${esc(links.blog)}" rel="me noopener">Blog</a></li>`);
  return out.join("");
}

function skillsHtml(skills) {
  return skills
    .map(
      (group) => `<li class="skill-group">
  <h3>${esc(group.category)}</h3>
  ${tagListHtml(group.items ?? [])}
</li>`
    )
    .join("");
}

function timelineHtml(timeline) {
  return timeline
    .map(
      (item) => `<li>
  <span class="timeline__period">${esc(item.period)}</span>
  <h3>${esc(item.title)}</h3>
  <p>${esc(item.description)}</p>
</li>`
    )
    .join("");
}

// 작품이 0개일 때 카드 자리에 넣는 안내. content/projects/ 에 md 를 추가하면 사라진다.
function emptyProjectsHtml() {
  return `<li class="empty-state">
  <h3>아직 공개한 작품이 없습니다</h3>
  <p>준비되는 대로 하나씩 올릴 예정입니다.</p>
</li>`;
}

function bioHtml(bio) {
  return bio.map((para) => `<p>${esc(para)}</p>`).join("");
}

function tagChipsHtml(tags) {
  return tags
    .map(
      (tag) =>
        `<li><button class="chip" type="button" data-tag="${esc(tag)}" aria-pressed="false">${esc(tag)}</button></li>`
    )
    .join("");
}

function projectLinkButtons(project) {
  const out = [];
  if (project.links.demo) {
    out.push(
      `<a class="btn btn--primary" href="${esc(project.links.demo)}" target="_blank" rel="noopener">
        데모 보기
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17 17 7M17 7H9M17 7v8"/></svg>
      </a>`
    );
  }
  if (project.links.repo) {
    out.push(
      `<a class="btn btn--ghost" href="${esc(project.links.repo)}" target="_blank" rel="noopener">
        소스 코드
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17 17 7M17 7H9M17 7v8"/></svg>
      </a>`
    );
  }
  // 공유는 항상 붙는다 — 링크가 하나도 없는 작품에도 공유할 주소는 있다.
  out.push(
    `<button class="btn btn--ghost share-btn" type="button" data-share data-share-title="${esc(project.title)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/></svg>
        <span data-share-label>공유</span>
        <span class="visually-hidden" role="status" data-share-status></span>
      </button>`
  );
  return out.join("\n");
}

function pagerHtml(prev, next) {
  const parts = [];
  if (prev) {
    parts.push(`<a href="/projects/${esc(prev.slug)}.html" data-dir="prev" rel="prev">
  <span class="pager__label">이전 작품</span>
  <span class="pager__title">${esc(prev.title)}</span>
</a>`);
  } else {
    parts.push(`<span></span>`);
  }
  if (next) {
    parts.push(`<a href="/projects/${esc(next.slug)}.html" data-dir="next" rel="next">
  <span class="pager__label">다음 작품</span>
  <span class="pager__title">${esc(next.title)}</span>
</a>`);
  }
  return parts.join("\n");
}

function metaRow(label, value) {
  return `<li><dfn>${esc(label)}</dfn> <span>${value}</span></li>`;
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

async function loadProfile() {
  const file = path.join(DIR.content, "profile.json");
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`content/profile.json 을 읽을 수 없습니다: ${file}`);
  }
  let profile;
  try {
    profile = JSON.parse(raw);
  } catch (err) {
    throw new Error(`content/profile.json JSON 파싱 실패: ${err.message}`);
  }
  for (const field of ["name", "tagline", "email"]) {
    if (!profile[field]) throw new Error(`content/profile.json: '${field}' 가 필요합니다.`);
  }
  profile.bio = Array.isArray(profile.bio) ? profile.bio : [String(profile.bio ?? "")];
  profile.skills = Array.isArray(profile.skills) ? profile.skills : [];
  profile.timeline = Array.isArray(profile.timeline) ? profile.timeline : [];
  profile.links = profile.links ?? {};
  profile.siteUrl = String(profile.siteUrl ?? "https://shworld.cloud").replace(/\/$/, "");
  return profile;
}

async function loadProjects() {
  let files;
  try {
    files = (await readdir(DIR.projects)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    throw new Error(`content/projects/ 디렉터리를 읽을 수 없습니다: ${DIR.projects}`);
  }
  // 작품이 0개여도 빌드는 통과시킨다. 목록/홈은 비어 있는 상태로 렌더링된다.
  if (files.length === 0) {
    console.warn("[content] content/projects/ 에 .md 파일이 없습니다 — 작품 없이 빌드합니다.");
  }

  const projects = [];
  const seen = new Map();

  for (const name of files) {
    const file = path.join("content", "projects", name);
    const raw = await readFile(path.join(DIR.projects, name), "utf8");
    const { frontmatter, body } = splitFrontmatter(raw, file);
    const data = parseFrontmatter(frontmatter, file);
    const project = validateProject(data, body, file);

    if (seen.has(project.slug)) {
      throw new ContentError(
        file,
        `slug '${project.slug}' 가 중복됩니다. 이미 ${seen.get(project.slug)} 에서 사용 중입니다.`
      );
    }
    seen.set(project.slug, file);
    projects.push(project);
  }

  // 최신 날짜 우선. 같은 날짜면 제목 순으로 안정 정렬.
  projects.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title, "ko") : b.date.localeCompare(a.date)));
  return projects;
}

async function writeDetailPages(projects, profile) {
  const templatePath = path.join(DIR.templates, "project.html");
  let template;
  try {
    template = await readFile(templatePath, "utf8");
  } catch {
    throw new Error(`상세 페이지 템플릿이 없습니다: ${templatePath}`);
  }

  const outDir = path.join(DIR.generated, "projects");
  await mkdir(outDir, { recursive: true });

  for (const [index, project] of projects.entries()) {
    const prev = projects[index + 1] ?? null; // 목록이 최신순이므로 뒤쪽이 '이전 작품'
    const next = projects[index - 1] ?? null;

    const bodyHtml = renderMarkdown(project.body);
    // 확장자를 뺀 주소가 이 글의 정식 주소다. `.html` 로 열면 자산 레이어가
    // 확장자 없는 쪽으로 넘겨주므로, 정식 주소를 `.html` 로 적으면 정식 주소가
    // 곧바로 다른 주소로 넘어가는 셈이 된다. 검색엔진은 그런 지목을 믿지 않는다.
    const canonical = `${profile.siteUrl}/projects/${project.slug}`;
    const description = project.summary.slice(0, 180);

    const meta = [
      metaRow("공개", `<time datetime="${esc(project.date)}">${esc(humanDate(project.date))}</time>`),
    ];
    if (project.stack.length > 0) {
      meta.push(metaRow("스택", project.stack.map((s) => `<code>${esc(s)}</code>`).join(", ")));
    }
    meta.push(
      metaRow(
        "조회",
        `<span class="views" data-views-detail="${esc(project.slug)}" hidden><span data-views-value>0</span><span class="visually-hidden"> 회</span></span>`
      )
    );

    const ogImage = thumbnailExists(project.thumbnail) ? `${profile.siteUrl}${project.thumbnail}` : "";
    const ogImageTags = ogImage
      ? `<meta property="og:image" content="${esc(ogImage)}">\n    <meta name="twitter:image" content="${esc(ogImage)}">\n    <meta name="twitter:card" content="summary_large_image">`
      : `<meta name="twitter:card" content="summary">`;

    const html = fill(
      template,
      {
        title: esc(project.title),
        siteName: esc(profile.name),
        description: esc(description),
        canonical: esc(canonical),
        ogImageTags,
        slug: esc(project.slug),
        summary: esc(project.summary),
        tags: tagListHtml(project.tags, { link: true }),
        metaRows: meta.join("\n        "),
        actions: projectLinkButtons(project),
        body: bodyHtml,
        pager: pagerHtml(prev, next),
      },
      `src/templates/project.html → ${project.slug}`
    );

    await writeFile(path.join(outDir, `${project.slug}.html`), html, "utf8");
  }
}

async function writeIndexJson(projects) {
  const dir = path.join(DIR.public, "data");
  await mkdir(dir, { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    count: projects.length,
    projects: projects.map((p) => ({
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      tags: p.tags,
      stack: p.stack,
      date: p.date,
      featured: p.featured,
      url: `/projects/${p.slug}.html`,
      links: p.links,
      // 검색용 발췌 — 본문 앞부분 텍스트만
      excerpt: stripTags(renderMarkdown(p.body)).slice(0, 400),
    })),
  };

  await writeFile(path.join(dir, "projects.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/*
 * 같은 도메인에 얹혀 사는 다른 사이트의 주소.
 *
 * 게임(메두사 미용실)은 별도 저장소이고 Cloudflare 워커가 `/m-hairsalon` 아래로 보내준다.
 * 저장소가 다르다고 크롤러가 알아서 찾아가지는 않으므로 여기서 함께 알려준다 — 게임 방법과
 * 개인정보처리방침에 읽을 글이 9,000자쯤 있는데, 그 자리를 모르면 없는 글이 된다.
 *
 * 애드센스가 이 도메인을 "가치가 별로 없는 콘텐츠" 로 반려한 적이 있다(2026-09-05). 도메인
 * 전체에 무엇이 있는지 빠짐없이 알리는 편이 낫다.
 */
const EXTERNAL_PAGES = [
  "/m-hairsalon/",
  "/m-hairsalon/guide",
  "/m-hairsalon/about",
  "/m-hairsalon/privacy",
];

async function writeSitemap(projects, profile) {
  // 넘어가는 주소가 아니라 넘어간 뒤의 주소를 적는다. 사이트맵은 '여기를 거둬
  // 가라'고 내미는 목록인데, 거기 적힌 것이 죄다 다른 주소로 넘어가면 크롤러는
  // 같은 걸음을 두 번씩 걷게 되고 정식 주소도 흐려진다.
  const pages = ["/", "/projects", "/about", "/guestbook", "/contact"];
  const urls = [
    ...pages.map((p) => ({ loc: profile.siteUrl + p, lastmod: null })),
    ...projects.map((p) => ({ loc: `${profile.siteUrl}/projects/${p.slug}`, lastmod: p.date })),
    ...EXTERNAL_PAGES.map((p) => ({ loc: profile.siteUrl + p, lastmod: null })),
  ];

  const body = urls
    .map(({ loc, lastmod }) =>
      `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : ""}</url>`
    )
    .join("\n");

  await writeFile(
    path.join(DIR.public, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    "utf8"
  );
}

async function writePartials(projects, profile) {
  const allTags = [...new Set(projects.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, "ko"));
  const featured = projects.filter((p) => p.featured);
  const heroFeatured = (featured.length > 0 ? featured : projects).slice(0, 3);

  const partials = {
    "profile.name": esc(profile.name),
    "profile.role": esc(profile.role ?? ""),
    "profile.tagline": esc(profile.tagline),
    "profile.location": esc(profile.location ?? ""),
    "profile.email": esc(profile.email),
    "profile.emailHref": esc(`mailto:${profile.email}`),
    "profile.bio": bioHtml(profile.bio),
    "profile.bioFirst": esc(profile.bio[0] ?? ""),
    // 첫 화면용 한 줄. 소개 페이지의 자기 이야기(bio)와 목적이 다르다 —
    // 여기는 "무엇을 만들었고 지금 써볼 수 있다" 를 알리는 자리다
    "profile.pitch": esc(profile.pitch ?? profile.bio[0] ?? ""),
    "profile.links": linksHtml(profile.links),
    "profile.skills": skillsHtml(profile.skills),
    "profile.skillsTop": skillsHtml(profile.skills.slice(0, 4)),
    "profile.timeline": timelineHtml(profile.timeline),
    "projects.featured": heroFeatured.map(projectCardHtml).join("\n") || emptyProjectsHtml(),
    "projects.hero": heroWorkHtml(heroFeatured[0]),
    "projects.all": projects.map(projectCardHtml).join("\n") || emptyProjectsHtml(),
    "projects.tagChips": tagChipsHtml(allTags),
    "projects.count": String(projects.length),
    "projects.tagCount": String(allTags.length),
    "stack.count": String(new Set(projects.flatMap((p) => p.stack)).size),
    // 첫 화면 숫자는 방문자가 궁금해할 것만 센다. "사용 기술 12개" 는 이력서의 문법이지,
    // 작품을 보러 온 사람에게는 아무 의미가 없다
    "projects.playable": String(projects.filter((p) => p.links.demo).length),
    "site.url": esc(profile.siteUrl),
    "site.year": String(new Date().getFullYear()),
  };

  await mkdir(DIR.generated, { recursive: true });
  await writeFile(path.join(DIR.generated, "partials.json"), `${JSON.stringify(partials, null, 2)}\n`, "utf8");
  return partials;
}

async function main() {
  const started = Date.now();

  // 이전 산출물 제거 — 삭제된 작품의 HTML 이 dist 에 남지 않게 한다.
  await rm(path.join(DIR.generated, "projects"), { recursive: true, force: true });

  const profile = await loadProfile();
  const projects = await loadProjects();

  await writeDetailPages(projects, profile);
  await writeIndexJson(projects);
  await writeSitemap(projects, profile);
  await writePartials(projects, profile);

  const tagCount = new Set(projects.flatMap((p) => p.tags)).size;
  console.log(
    `[content] 작품 ${projects.length}개 / 태그 ${tagCount}개 → src/generated, public/data (${Date.now() - started}ms)`
  );
  for (const p of projects) {
    console.log(`  · ${p.slug}${p.featured ? " (featured)" : ""} — ${p.title}`);
  }
}

main().catch((err) => {
  console.error("\n[content] 빌드 실패\n");
  console.error(`  ${err.message}\n`);
  if (!(err instanceof ContentError) && err.stack) console.error(err.stack);
  process.exitCode = 1;
});
