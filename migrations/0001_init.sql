-- shworld 초기 스키마
-- 적용:  npm run db:migrate:local   /   npm run db:migrate:remote
--
-- 시간 값은 모두 epoch milliseconds (INTEGER) 로 저장한다.
-- ip_hash 는 SHA-256(IP + IP_SALT) 의 hex 문자열 — 원본 IP 는 저장하지 않는다.

-- 작품 조회수 -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_views (
  slug       TEXT    PRIMARY KEY,
  views      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- 방명록 ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guestbook (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash    TEXT    NOT NULL,
  hidden     INTEGER NOT NULL DEFAULT 0
);

-- 목록 조회: hidden = 0 인 행을 id 역순으로 페이지네이션
CREATE INDEX IF NOT EXISTS idx_guestbook_created ON guestbook (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_visible ON guestbook (hidden, id DESC);
-- 레이트리밋 조회: ip_hash + 최근 시각
CREATE INDEX IF NOT EXISTS idx_guestbook_ip ON guestbook (ip_hash, created_at DESC);

-- 연락 메시지 ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_ip ON contacts (ip_hash, created_at DESC);
