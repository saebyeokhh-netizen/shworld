# shworld

개인 개발 포트폴리오 사이트. **관리할 서버가 없는 구조**를 목표로, 프레임워크 없이 바닐라 Vite MPA로 만들고 단 하나의 Cloudflare Worker가 정적 자산과 API를 동시에 서빙합니다.

핵심은 **콘텐츠와 상태를 분리한 하이브리드 모델**입니다.

| 종류 | 저장 위치 | 이유 |
|---|---|---|
| 작품 소개, 프로필, 태그 | 리포지토리의 Markdown / JSON → 빌드 시 HTML로 생성 | 배포 시점에 확정된 데이터. 페이지 열 때 DB 조회 0회 |
| 조회수, 방명록, 연락 메시지 | Cloudflare D1 | 런타임에만 알 수 있는 값 |

작품을 추가하려면 `content/projects/` 에 md 파일 하나를 커밋하면 됩니다. DB도, 관리자 페이지도 거치지 않습니다.

---

## 기술 스택

- **프론트엔드** — 바닐라 JavaScript (ES 모듈), Vite 8 MPA. 프레임워크·CSS 라이브러리 없음
- **호스팅** — Cloudflare Workers + Static Assets (Pages 아님). `/api/*` 는 Worker가 처리, 나머지는 `env.ASSETS.fetch()`
- **DB** — Cloudflare D1 (SQLite)
- **스팸 차단** — Cloudflare Turnstile + 입력 검증 + IP 해시 기반 레이트리밋
- **빌드** — `scripts/build-content.mjs` (Markdown → HTML/JSON 생성), `marked`
- **CLI** — Wrangler 4

```
브라우저
  │
  ▼
Cloudflare Worker (하나)
  ├─ /api/*  →  Worker 핸들러  →  D1
  └─ 그 외    →  env.ASSETS.fetch()  →  dist/ (Vite 빌드 산출물)
```

---

## 로컬 실행

### 1. 준비

```bash
npm install
cp .dev.vars.example .dev.vars
```

`.dev.vars` 의 기본값은 Cloudflare 공식 **테스트 키**라서 계정 없이도 바로 동작합니다. 그대로 두고 시작해도 됩니다.

### 2. D1 로컬 DB 생성 + 마이그레이션

Cloudflare 계정 없이 로컬 SQLite에 스키마를 적용합니다.

```bash
npm run db:migrate:local
```

### 3. 실행

두 가지 모드가 있습니다.

```bash
# 전체 스택 (Worker + D1 + 정적 자산) — API를 실제로 테스트할 때
npm run cf:dev          # → http://127.0.0.1:8787

# UI만 빠르게 (Vite HMR) — /api 요청은 8787로 프록시됨
npm run dev             # → http://127.0.0.1:5173
```

> `npm run dev` 는 Worker가 안 떠 있어도 페이지가 정상 렌더링됩니다. 조회수·방명록만 조용히 비어 있게 표시됩니다.

### 4. 기타 명령

```bash
npm run content    # 콘텐츠만 다시 생성 (dev/build 시 자동 실행됨)
npm run build      # 콘텐츠 생성 + 프로덕션 빌드 → dist/
npm run preview    # 빌드 결과를 정적으로만 미리보기
```

---

## 작품 추가하는 법

`content/projects/<slug>.md` 파일 하나를 만들고 커밋하면 끝입니다. 빌드 시 자동으로 상세 페이지, 목록 카드, 검색 색인, sitemap이 생성됩니다.

```markdown
---
title: 프로젝트 이름
slug: my-project              # 파일명과 같게. URL이 됩니다 → /projects/my-project
summary: 목록 카드와 검색 결과에 보이는 한두 문장 요약.
tags: [Cloudflare, Vite, 서버리스]     # 필터 칩으로 노출
stack: [JavaScript, Vite, D1]          # 상세 페이지에 사용 기술로 노출
date: 2026-08-01              # YYYY-MM-DD. 정렬 기준
featured: true                # true면 홈 히어로에 노출 (최대 3개)
links:
  repo: https://github.com/me/my-project
  demo: https://my-project.example.com
thumbnail: /img/projects/my-project.svg   # public/ 기준 경로. 없으면 생략 가능
---

## 개요

본문은 Markdown으로 자유롭게 씁니다.

## 주요 기능

- 목록도 됩니다

## 배운 것

회고를 남기면 좋습니다.
```

확인:

```bash
npm run build      # slug 중복이나 frontmatter 오류가 있으면 여기서 에러로 멈춤
npm run cf:dev
```

썸네일 이미지는 `public/img/projects/` 에 두면 그대로 서빙됩니다.

---

## Cloudflare 셋업 (배포)

로컬 개발은 계정 없이 되지만, 배포에는 계정 연동이 필요합니다. 아래를 순서대로 실행하세요.

### 1. 로그인

```bash
npx wrangler login
```

### 2. D1 데이터베이스 생성

```bash
npx wrangler d1 create shworld-db
```

출력에 나오는 `database_id` 를 복사해 **`wrangler.jsonc` 의 placeholder를 교체**합니다.

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "shworld-db",
    "database_id": "여기에-붙여넣기",   // ← 기본값 00000000-... 을 교체
    "migrations_dir": "migrations"
  }
]
```

> 이 값이 placeholder인 동안 `--local` 개발은 되지만 `--remote` 와 배포는 실패합니다.

### 3. 원격 스키마 적용

```bash
npm run db:migrate:remote
```

### 4. Turnstile 키 발급

Cloudflare 대시보드 → **Turnstile** → 사이트 추가. 도메인을 넣고 위젯을 만들면 키 두 개가 나옵니다.

- **Site Key** (공개값) → `wrangler.jsonc` 의 `vars.TURNSTILE_SITE_KEY` 를 교체
- **Secret Key** (비공개) → 다음 단계에서 시크릿으로 등록

### 5. 시크릿 등록

`.dev.vars` 는 로컬 전용입니다. 운영 값은 반드시 아래로 등록하세요.

```bash
npx wrangler secret put TURNSTILE_SECRET   # 4단계에서 받은 Secret Key
npx wrangler secret put ADMIN_TOKEN        # 방명록 삭제용. 16자 이상
npx wrangler secret put IP_SALT            # IP 해시용 솔트. 절대 공개 금지
```

토큰/솔트 생성 예:

```bash
node -e "console.log(crypto.randomUUID().replace(/-/g,''))"   # ADMIN_TOKEN
node -e "console.log(crypto.randomUUID())"                    # IP_SALT
```

> `IP_SALT` 가 유출되면 저장된 `ip_hash` 를 원본 IP로 되돌릴 수 있습니다. 한 번 정하면 바꾸지 마세요 (바꾸면 기존 레이트리밋 기록이 무효화됩니다).

### 6. 프로필·도메인 수정

`content/profile.json` 의 `name`, `email`, `siteUrl`, `links` 를 본인 값으로 교체합니다. `siteUrl` 은 sitemap과 OG 태그에 쓰이므로 실제 도메인이어야 합니다.

### 7. 배포

```bash
npm run cf:deploy
```

배포 후 바인딩과 시크릿이 제대로 붙었는지 확인:

```bash
curl https://<your-domain>/api/health
# {"ok":true,"bindings":{"DB":true,"ASSETS":true},"secrets":{...:true}}
```

`ok: false` 면 빠진 항목이 그대로 표시됩니다. 값은 노출되지 않습니다.

### 8. 로그 보기

```bash
npx wrangler tail
```

---

## API 명세

모든 응답은 JSON입니다. 에러는 예외 없이 `{ "error": "사람용 한국어 메시지", "code": "기계용_코드" }` 형태입니다.

| 메서드 | 경로 | 인증 | 동작 |
|---|---|---|---|
| `GET` | `/api/views` | — | 전체 `{ slug: 조회수 }` 맵. 목록 페이지에서 1회 호출 |
| `POST` | `/api/views/:slug` | — | 조회수 UPSERT 증가 → `{ slug, views }`. 실제 작품 slug만 허용 (아니면 404) |
| `GET` | `/api/guestbook?limit=&before=` | — | 방명록 목록 → `{ entries, nextCursor }`. 숨김 글 제외 |
| `POST` | `/api/guestbook` | Turnstile | 방명록 작성 → 생성된 글. 201 |
| `POST` | `/api/contact` | Turnstile | 연락 메시지 저장 → `{ ok: true }`. 201 |
| `DELETE` | `/api/guestbook/:id` | `Bearer ADMIN_TOKEN` | 소프트 삭제 (`hidden = 1`) |
| `GET` | `/api/health` | — | 바인딩·시크릿 설정 여부 확인 (값은 미노출) |

### 에러 코드

| code | status | 의미 |
|---|---|---|
| `invalid_input` | 400 | 검증 실패 (길이, 형식, 잘못된 slug/id) |
| `turnstile_missing` | 400 | 봇 확인 토큰 없음 |
| `turnstile_failed` | 403 | 봇 확인 검증 실패 |
| `forbidden_origin` | 403 | `Origin` 이 자기 오리진과 다름 (CSRF 차단) |
| `unauthorized` | 401 | 관리자 토큰 없음/불일치 |
| `not_found` | 404 | 없는 경로, 없는 작품, 이미 삭제된 글 |
| `method_not_allowed` | 405 | 허용되지 않은 메서드 |
| `rate_limited` | 429 | IP당 5분 1건 초과. `Retry-After` 헤더 포함 |
| `not_configured` | 503 | D1 바인딩 누락 등 서버 설정 미완 |
| `server_error` | 500 | 처리 중 예외 |

### 방명록 삭제 예시

```bash
curl -X DELETE https://<your-domain>/api/guestbook/12 \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 저장된 메시지 확인

```bash
npx wrangler d1 execute shworld-db --remote \
  --command "SELECT id, name, email, created_at FROM contacts ORDER BY id DESC LIMIT 20;"
```

---

## 보안 설계

- **SQL** — 전부 `prepare().bind()` 파라미터 바인딩. 문자열 결합 없음
- **IP** — 원본을 저장하지 않고 `SHA-256(IP + IP_SALT)` 만 기록
- **레이트리밋** — 방명록·연락 각각 IP당 5분 1건
- **XSS** — 사용자 입력은 클라이언트에서 `textContent` 로만 렌더링. 서버 저장 시 제어문자 제거
- **CSRF** — 상태 변경 요청에 `Origin` 동일 오리진 검사
- **관리자 토큰** — 길이 차이도 흘리지 않는 상수 시간 비교
- **조회수 남용** — slug 형식 검사 + 배포된 작품 색인 대조 2단으로 임의 행 생성 차단
- **시크릿** — 코드·리포지토리에 없음. 로컬은 `.dev.vars`(gitignore), 운영은 `wrangler secret`

---

## 프로젝트 구조

```
shworld/
├─ content/                  ★ 작품 데이터의 단일 원천
│  ├─ profile.json           프로필, 스킬, 타임라인
│  └─ projects/*.md          작품 (frontmatter + 본문)
│
├─ scripts/
│  └─ build-content.mjs      md → 상세 HTML + 색인 JSON + sitemap + 공통 파셜
│
├─ src/
│  ├─ index.html             홈
│  ├─ projects.html          작품 목록 (검색·태그 필터)
│  ├─ about.html             소개
│  ├─ guestbook.html         방명록
│  ├─ contact.html           연락
│  ├─ 404.html               Worker의 not_found_handling 대상
│  ├─ templates/project.html 상세 페이지 템플릿 (Vite 엔트리 아님)
│  ├─ generated/             빌드 산출물 (gitignore)
│  ├─ styles/                tokens / base / components / main
│  └─ js/                    theme, nav, filter, views, guestbook, contact, turnstile, api
│
├─ worker/
│  ├─ index.js               라우터 + ASSETS 폴백
│  ├─ routes/                views, guestbook, contact, admin
│  └─ lib/                   db, json, validate, turnstile, ratelimit, slugs
│
├─ migrations/0001_init.sql  D1 스키마
├─ public/                   그대로 서빙되는 정적 파일 (favicon, robots, img)
├─ vite.config.js            MPA 엔트리 수집 + 파셜 주입 + /api 프록시
└─ wrangler.jsonc            assets + D1 바인딩 + vars
```

`src/generated/` 와 `public/data/projects.json` 은 빌드 산출물이라 커밋하지 않습니다. `npm run content` 로 언제든 다시 만들 수 있습니다.

---

## 라이선스

MIT. 코드는 자유롭게 가져다 쓰되 `content/` 의 글과 프로필은 교체해서 쓰세요.
