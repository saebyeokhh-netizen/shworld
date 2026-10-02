---
title: 주소를 붙이고 이름을 바꾸다
slug: domain-and-deploy
summary: 도메인을 사서 붙이는 일, 그리고 프로젝트 이름을 바꾸려다 알게 된 것. DNS 캐시는 거짓말을 한다.
date: 2026-08-27
series: 배포와 PWA
tags: [배포, DNS, Cloudflare, 도메인]
---주소가 생겼다 — **https://schoolking.pages.dev**

## 왜 Vercel 이 아니라 Cloudflare 인가

처음에는 Vercel 로 가려 했다가 요금 조건을 확인하고 바꿨다.

**Vercel 무료(Hobby) 플랜은 "개인·비상업 용도" 로만 쓸 수 있다.** 지금은 결제 기능이 없어 문제가 없지만, 기획서 6절의 코인 충전(실결제)을 붙이는 순간 약관에 걸려 Pro($20/월)로 올라가야 한다. 나중에 반드시 이사해야 하는 집에 짐을 푸는 셈이다.

**Cloudflare Pages 는 정적 파일 대역폭이 무제한이고 상업적 사용도 허용된다.** 이 앱은 서버 기능이 하나도 없는 순수 정적 사이트라(멀티플레이는 Playroom 서버가 처리한다) 조건이 정확히 들어맞는다.

배포 방식은 **GitHub 연결**로 했다. `main` 에 push 하면 Cloudflare 가 알아서 빌드하고 올린다. CLI 로 수동 배포하면 "누가 언제 올렸는지" 가 사람 손에 달리는데, 저장소가 곧 배포본인 편이 관리가 쉽다.

## 정적 호스팅에 맞춰 넣은 것

**`public/_redirects` — SPA 라우팅.** 이게 없으면 `/room/1234` 로 직접 들어온 사람이 404 를 본다. 정적 호스팅은 그 경로에 해당하는 파일을 찾기 때문이다. `/* /index.html 200` 으로 모든 경로를 index.html 이 받게 하고, 라우터가 주소를 해석하게 했다. 상태 코드가 200 이어야 주소가 유지된다(301/302 면 `/` 로 튕긴다). 친구에게 방 링크를 보내는 게임에서 이건 필수다.

**`public/_headers` — 캐시 정책.** 빌드 자산은 파일명에 해시가 붙으니 영구 캐시(1년)로 두고, 서비스 워커는 `no-cache` 로 잠갔다. 서비스 워커가 캐시되면 새 버전을 영영 못 받는 사고가 난다.

**PWA.** 매니페스트와 아이콘 4종(192/512/maskable/apple-touch)을 넣어 홈 화면에 설치되게 했다. 아이콘은 별도로 그리지 않고 **화면에 쓰는 브랜드 배지(골드 그라디언트 + 왕관)를 그대로 렌더해서 스크린샷으로 뽑았다.** 앱 안팎의 인상이 자동으로 일치한다.

서비스 워커는 설치 조건(fetch 핸들러)만 채운 최소 버전이고 **캐싱은 일부러 하지 않는다.** 실시간 멀티플레이 게임이라 오래된 자산이 캐시에서 나오면 같은 방 안에서 클라이언트 버전이 갈린다. 캐싱이 필요해지면 빌드 해시를 아는 도구로 제대로 붙이는 편이 낫다.

**`NODE_VERSION=22`.** Cloudflare 기본 Node 버전이 낮아 Vite 7 빌드가 깨진다. 대시보드 환경변수로 올렸다.

## 배포본 점검 결과

로컬이 아닌 실제 서버에서 확인한 것들이다.

| 확인 | 결과 |
|---|---|
| `/lobby` 직접 진입 (SPA 라우팅) | 200, 로비 렌더 OK |
| PWA 매니페스트 · 아이콘 · 서비스 워커 | standalone, 아이콘 로드, 워커 activated |
| 자산 캐시 헤더 | `public, max-age=31536000, immutable` |
| 매칭 → 게임 진입 → 예측 → 카드 제출 | 정상 |
| **온라인 2인 대전** | 같은 방 코드로 입장 → 방장/게스트 구분 → 방장이 시작 → 두 화면 모두 진입 → 각자 자기 손패(1장)만 보고 각자 예측·카드 제출 → 트릭 4장 동일 표시 |
| 실패한 요청 · 콘솔 에러 | 0건 |

localhost 가 아닌 HTTPS 환경에서 Playroom 연결이 그대로 동작하는 것까지 확인했다. 서비스 워커도 HTTPS 라야 등록되는데 정상 활성화됐다.

## 남은 것

- **Playroom gameId 미발급.** 지금은 개발 모드로 붙어서 하루 고유 사용자 수 제한이 있다. 친구들에게 링크를 뿌릴 거면 [dev.joinplayroom.com](https://dev.joinplayroom.com) 에서 받아 Cloudflare 환경변수 `VITE_PLAYROOM_GAME_ID` 에 넣고 재배포하면 된다.
- **커스텀 도메인.** `schoolking.pages.dev` 로 충분하지만, 도메인을 붙이면 대시보드에서 몇 분이면 된다.
- **포트폴리오 연결.** 기존 개인 사이트(`wonderful.shworld.workers.dev`)의 Projects 에 이 게임을 추가하면 자연스럽다. 두 프로젝트는 같은 Cloudflare 계정 안에서 서로 독립적으로 돌아간다.

---

도메인을 샀다. 대시보드에서 클릭 몇 번이면 되는 일이지만, **코드에서 먼저 고쳐야 하는 것이
넷** 있었다. 안 고치고 도메인만 붙이면 겉보기에는 멀쩡한데 로그인만 조용히 깨진다.

## 왜 도메인만 붙이면 안 되나

앱(`shworld.cloud`)과 방 서버(`schoolking-room.shworld.workers.dev`)는 도메인이 다르다.
서버 쪽에 **앱 주소가 세 군데 박혀** 있었고, 전부 `schoolking.pages.dev` 였다.

| 자리 | 안 고치면 |
|---|---|
| `wrangler.jsonc` 의 `APP_URL` | 로그인은 되는데 돌아올 곳을 몰라 `pages.dev` 로 떨어진다 |
| `api.ts` 의 `ALLOWED_ORIGINS` | 새 도메인에서 온 요청이 CORS 에 막혀 전적·코인·친구가 전부 죽는다 |
| `auth.ts` 의 `allowedRedirects` | 새 도메인으로 돌려보내 달라는 요청이 거부된다 |

세 번째가 특히 눈에 안 띄는 자리다. "아무 데나 보내주면 열린 리다이렉트 취약점" 이라 일부러
좁혀 둔 목록이라, 새 주소를 넣지 않으면 **보안 장치가 제 앱을 막는다.**

## 소셜 로그인 콘솔은 건드릴 것이 없었다

처음엔 구글·카카오 콘솔의 리디렉션 URI 도 고쳐야 하는 줄 알았는데, 코드를 보니 아니었다.

```ts
function callbackUrl(request: Request, provider: string): string {
  return new URL(`/auth/${provider}/callback`, new URL(request.url).origin).toString();
}
```

공급자가 돌아오는 곳은 **요청을 받은 서버 자신**이다. 앱이 아니라 워커 주소이고, 그 주소는
바뀌지 않았다. 앱 주소(`APP_URL`)는 그 뒤에 서버가 내부적으로 한 번 더 돌려보낼 때만 쓴다.
로그인 흐름을 이렇게 짜 둔 덕에 도메인을 바꿔도 콘솔을 손댈 일이 없다.

## pages.dev 를 지우지 않았다

`schoolking.pages.dev` 는 **빌드가 실제로 올라가는 자리**다. 커스텀 도메인은 그 위에 얹은
이름일 뿐이고, PR 미리보기는 지금도 `<해시>.schoolking.pages.dev` 로 뜬다. 허용 목록에서
빼면 미리보기에서 로그인과 전적이 조용히 깨진다.

대신 같은 내용이 두 주소에 보이는 문제가 남는다. 검색엔진과 광고 심사가 어느 쪽이 진짜인지
모르게 된다. 그래서 `index.html` 에 정식 주소를 **`canonical` 로 못박아** 한쪽으로 몰았다.
주소를 막는 대신 어느 쪽이 대표인지 밝히는 방법이다.

## 곁다리 — og:image 가 상대 경로였다

도메인이 생긴 김에 미리보기 태그를 손봤다. `og:image` 가 `/icon-512.png` 였는데, **미리보기를
만드는 쪽은 우리 사이트가 어디인지 모르는 채로 이 값만 읽는다.** 카카오톡으로 방 링크를
보내면 그림 없는 링크로 떴을 것이다. 절대 주소로 바꾸고 `og:url`·`og:site_name`·
`og:locale`·이미지 크기·`twitter:card` 를 함께 넣었다.

## 확인

`tsc --noEmit` 통과, 테스트 270개 통과, 빌드된 `dist/index.html` 에 새 주소 4곳 반영 확인.

## 남은 것은 대시보드 일 — `DEPLOY.md` 에 정리했다

1. 도메인을 Cloudflare 에 올린다 (다른 곳에서 샀으면 네임서버를 Cloudflare 것으로 바꾼다).
   apex 주소는 CNAME 을 직접 걸 수 없어 Cloudflare 의 CNAME 평탄화가 필요하다
2. Workers & Pages → `schoolking` → Custom domains → `shworld.cloud` 와 `www.shworld.cloud`
3. **방 서버는 자동 배포가 아니다** — `cd server && npx wrangler deploy` 를 직접 해야
   위에서 고친 `APP_URL` 이 실제로 반영된다. 이걸 빠뜨리면 로그인만 안 된다
4. `shworld.cloud/ads.txt` 가 열리는지 확인 — 애드센스 심사가 이 파일을 본다


---

## 덧붙임 (2026-08-27) — 도메인을 또 바꾸게 됐다

애드센스를 신청한 뒤에 주소를 바꾸고 싶어졌다. 알아보니 **애드센스에게 새 도메인은 내용이
같아도 다른 사이트**라 승인이 따라오지 않고, 심사 중인 주소가 안 열리면 그대로 반려에다
짧은 사이에 재신청을 되풀이하면 대기 기간까지 늘어난다.

다행히 Cloudflare Pages 는 **한 프로젝트에 커스텀 도메인을 여러 개** 붙일 수 있다. 그래서
끄고 켜는 대신 새 주소를 먼저 붙여 둘 다 살려 놓고, 심사가 끝난 뒤에 옮기면 된다.

여기서 걸리는 것이 `canonical` 이다. 어제 "두 주소에 같은 내용이 있으면 어느 쪽이 진짜인지
모른다" 는 이유로 넣은 태그인데, 바로 그 성질 때문에 **심사 중에는 건드리면 안 된다.**
심사 중인 주소를 가리키던 것을 떼면 심사 대상이 "대표가 아닌 복제본" 이 된다. 반대로 새
도메인에 신청할 때는 그쪽을 가리키고 있어야 한다. 한 번에 하나씩 옮겨야 하는 이유다.

주소가 박힌 자리가 코드에 넷, 대시보드에 하나, 애드센스에 하나로 흩어져 있어서 **무엇이
빠지면 무엇이 깨지는지** 표로 만들어 `DEPLOY.md` 에 넣었다. 셋은 서버 쪽이라 push 만으로는
안 올라가고 `wrangler deploy` 가 필요하다는 것도 함께 적었다 — 이번에 실제로 빠뜨리기 쉬운
자리였다.

---

이름이 스쿨킹에서 메두사 미용실로 바뀌었는데 주소가 `schoolking.pages.dev` 그대로여서
Pages 프로젝트 이름을 `medusa-salon` 으로 바꾸기로 했다. 결과적으로 **둘 다 틀린 기대**였고,
가는 길에 사이트를 한 번 죽였다.

## 1. 코드부터 고쳤다 — 여기까지는 옳았다

`<프로젝트>.pages.dev` 는 빌드가 실제로 올라가는 자리이고, 그 주소가 방 서버 코드 세 군데에
박혀 있었다(`api.ts` 의 허용 목록과 미리보기 판정, `auth.ts` 의 리다이렉트 목록). 이름만
바꾸면 새 주소가 목록에 없어 전적·코인·로그인이 조용히 죽는다.

그래서 옛 주소와 새 주소를 나란히 허용해 두고 먼저 배포했다. 순서를 지켜 끊기는 구간을
없앤다는 판단이었고, 이 판단 자체는 맞았다.

## 2. Pages 이름을 바꿨는데 주소가 그대로였다

바꾼 뒤 `medusa-salon.pages.dev` 를 찔러보니 DNS 에 아예 없었다(`ENOTFOUND`).
`pages.dev` 는 와일드카드가 아니라서 실제로 만들어진 주소만 뜬다. wrangler 가 답을 줬다.

```
$ npx wrangler pages project list
Project Name │ Project Domains
medusa-salon │ schoolking.pages.dev
```

**이름은 바뀌었고 주소는 안 바뀌었다.** `*.pages.dev` 는 프로젝트를 만들 때 정해진다.
바꾸려면 프로젝트를 새로 만드는 수밖에 없는데, 커스텀 도메인을 붙일 거면 그럴 이유가 없다 —
`pages.dev` 는 그 뒤로 숨고 PR 미리보기에서만 쓰인다.

### 그래서 내가 넣어둔 줄이 보안 구멍이 됐다

`medusa-salon.pages.dev` 를 허용 목록에 미리 넣어둔 것이 문제였다. 그 주소는 우리 것이
**아니고**, 아직 아무나 Pages 프로젝트를 그 이름으로 만들어 가져갈 수 있다. 남겨두면 남이
그 이름을 주워 우리 API 를 부르거나, `allowedRedirects` 를 타고 **로그인 결과를 자기
사이트로 돌려받을** 수 있다.

내가 커밋 메시지에 "옛 이름을 방치하면 문이 된다" 고 적어놓고, 정작 **아직 갖지도 않은
이름**을 열어둔 셈이다. 얻은 규칙: **허용 목록에는 지금 실제로 소유한 주소만 넣는다.**
"곧 갖게 될 주소" 는 갖고 나서 넣는다.

## 3. 워커 이름을 바꾸자 사이트가 죽었다

다음 시도에서 바뀐 것은 Pages 가 아니라 **워커**였다. 그 순간 이렇게 됐다.

```
schoolking-room.shworld.workers.dev/api/me  → 404   ← 앱 번들이 부르는 주소
medusa-salon.shworld.workers.dev/api/me     → 200   ← 워커가 옮겨간 곳
```

로그인·전적·코인·친구·멀티플레이가 전부 죽었다. **화면은 멀쩡히 뜬다** — 그래서 눈치채기
어렵다. 배포된 번들을 직접 뜯어 확인했다.

```
$ curl -s https://schoolking.pages.dev/assets/index-DaY3AGy0.js | grep -o 'https://[a-z0-9.-]*workers\.dev'
https://schoolking-room.shworld.workers.dev
```

`wrangler deploy` 로 되돌리려 해도 막힌다 —
`Durable Object namespace name 'schoolking-room_GameRoom' already in use`.
DO 이름을 새 이름의 워커가 붙들고 있기 때문이다.

**되돌리는 것이 가장 빠른 복구였다.** 대시보드에서 이름을 되돌리자 30초 만에 살아났다.

## 왜 워커 이름이 특별히 위험한가

소셜 로그인 콜백이 **워커 자신의 주소**이기 때문이다.

```ts
function callbackUrl(request: Request, provider: string): string {
  return new URL(`/auth/${provider}/callback`, new URL(request.url).origin).toString();
}
```

어제 devlog 에 "도메인을 바꿔도 소셜 로그인 콘솔은 건드릴 것이 없다" 고 적혀 있는데,
그건 **앱 도메인** 이야기다. 워커 주소가 바뀌면 구글·카카오 콘솔에 등록된 리디렉션 URI 가
어긋나서 로그인만 계속 깨진다. 같은 문장이 정반대로 읽힐 수 있어 `DEPLOY.md` 에 갈라 적었다.

## 최종 상태

| | |
|---|---|
| Pages 프로젝트 이름 | `medusa-salon` (바꿈) |
| Pages 주소 | `schoolking.pages.dev` (안 바뀜, 그대로 둔다) |
| 워커 | `schoolking-room` (되돌림) |
| 서버 허용 목록 | `shworld.cloud`, `www`, `schoolking.pages.dev`, 그 미리보기, localhost |

`medusa-salon.pages.dev` 는 허용 목록에서 지우고 다시 배포했다. 확인한 응답:

```
https://schoolking.pages.dev        → 그대로 반사 (허용)
https://abc.schoolking.pages.dev    → 그대로 반사 (미리보기 허용)
https://medusa-salon.pages.dev      → shworld.cloud 로 되돌림 (거부)
https://evil.example.com            → shworld.cloud 로 되돌림 (거부)
```

## 남은 것

사용자에게 `schoolking` 을 안 보이게 하는 원래 목적은 **커스텀 도메인 `shworld.cloud` 를
붙이면 끝난다.** 내부 이름 정리는 거기 필요 없고, 워커 이름은 로그인 콘솔 작업이 따라오므로
정말 필요할 때 순서를 지켜서 한다(`DEPLOY.md` 에 순서 적어둠).
