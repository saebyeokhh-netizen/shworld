/**
 * D1 접근 계층.
 *
 * 규칙: SQL 문자열은 이 파일에 상수로만 존재한다.
 * 값은 예외 없이 prepare().bind() 파라미터로 넘긴다 (문자열 연결 금지 → SQL 인젝션 불가).
 * 테이블명처럼 바인딩할 수 없는 식별자는 아래 TABLES 화이트리스트로만 고른다.
 */

/** 레이트리밋 대상 테이블 화이트리스트 — 외부 입력이 테이블명이 되는 경로를 원천 차단 */
const TABLES = {
  guestbook: "guestbook",
  contacts: "contacts",
};

const SQL = {
  allViews: "SELECT slug, views FROM project_views",
  bumpView: `
    INSERT INTO project_views (slug, views, updated_at)
    VALUES (?, 1, ?)
    ON CONFLICT(slug) DO UPDATE SET
      views = project_views.views + 1,
      updated_at = excluded.updated_at
    RETURNING views
  `,
  readView: "SELECT views FROM project_views WHERE slug = ?",
  guestbookPage: `
    SELECT id, name, message, created_at
    FROM guestbook
    WHERE hidden = 0
    ORDER BY id DESC
    LIMIT ?
  `,
  guestbookPageBefore: `
    SELECT id, name, message, created_at
    FROM guestbook
    WHERE hidden = 0 AND id < ?
    ORDER BY id DESC
    LIMIT ?
  `,
  insertGuestbook: `
    INSERT INTO guestbook (name, message, created_at, ip_hash, hidden)
    VALUES (?, ?, ?, ?, 0)
    RETURNING id, name, message, created_at
  `,
  hideGuestbook: "UPDATE guestbook SET hidden = 1 WHERE id = ? AND hidden = 0",
  insertContact: `
    INSERT INTO contacts (name, email, message, created_at, ip_hash)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `,
  recentGuestbook:
    "SELECT COUNT(*) AS c, COALESCE(MAX(created_at), 0) AS newest FROM guestbook WHERE ip_hash = ? AND created_at >= ?",
  recentContacts:
    "SELECT COUNT(*) AS c, COALESCE(MAX(created_at), 0) AS newest FROM contacts WHERE ip_hash = ? AND created_at >= ?",
};

/** @returns {Promise<Record<string, number>>} slug → 조회수 */
export async function getAllViews(db) {
  const { results } = await db.prepare(SQL.allViews).all();
  const map = {};
  for (const row of results ?? []) {
    map[row.slug] = Number(row.views) || 0;
  }
  return map;
}

/** UPSERT 증가 후 새 값 반환. */
export async function incrementView(db, slug, now = Date.now()) {
  const row = await db.prepare(SQL.bumpView).bind(slug, now).first();
  if (row && row.views !== undefined && row.views !== null) return Number(row.views);

  // RETURNING 을 못 쓰는 환경 대비 폴백
  const fallback = await db.prepare(SQL.readView).bind(slug).first();
  return Number(fallback?.views ?? 0);
}

/**
 * 커서 페이지네이션. before 는 마지막으로 받은 id.
 * limit+1 개를 읽어 다음 페이지 존재 여부를 판단한다.
 */
export async function listGuestbook(db, { limit, before = null }) {
  const take = limit + 1;
  const stmt = before
    ? db.prepare(SQL.guestbookPageBefore).bind(before, take)
    : db.prepare(SQL.guestbookPage).bind(take);

  const { results } = await stmt.all();
  const rows = results ?? [];
  const hasMore = rows.length > limit;
  const entries = (hasMore ? rows.slice(0, limit) : rows).map(toEntry);

  return {
    entries,
    nextCursor: hasMore && entries.length > 0 ? entries[entries.length - 1].id : null,
  };
}

export async function insertGuestbookEntry(db, { name, message, ipHash, now = Date.now() }) {
  const row = await db.prepare(SQL.insertGuestbook).bind(name, message, now, ipHash).first();
  return toEntry(row ?? { id: 0, name, message, created_at: now });
}

/** soft delete. 실제 행을 지우지 않고 hidden = 1. @returns 변경된 행 수 */
export async function hideGuestbookEntry(db, id) {
  const res = await db.prepare(SQL.hideGuestbook).bind(id).run();
  return res.meta?.changes ?? 0;
}

export async function insertContactMessage(db, { name, email, message, ipHash, now = Date.now() }) {
  const row = await db.prepare(SQL.insertContact).bind(name, email, message, now, ipHash).first();
  return Number(row?.id ?? 0);
}

/**
 * 레이트리밋용: 최근 윈도 안에 같은 ip_hash 로 들어온 행 수와 가장 최근 시각.
 * @param {"guestbook"|"contacts"} table
 */
export async function countRecentByIpHash(db, table, ipHash, sinceMs) {
  const name = TABLES[table];
  if (!name) throw new Error(`허용되지 않은 테이블: ${table}`);

  const sql = name === "guestbook" ? SQL.recentGuestbook : SQL.recentContacts;
  const row = await db.prepare(sql).bind(ipHash, sinceMs).first();

  return {
    count: Number(row?.c ?? 0),
    newest: Number(row?.newest ?? 0),
  };
}

function toEntry(row) {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    message: String(row.message ?? ""),
    created_at: Number(row.created_at ?? 0),
  };
}
