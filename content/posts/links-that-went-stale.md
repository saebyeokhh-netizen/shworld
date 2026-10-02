---
title: 보낸 링크가 옛 주소를 가리키고 있었다
slug: links-that-went-stale
summary: 주소를 옮겼는데 공유 버튼은 옛 주소를 만들고 있었다. 사람들이 이미 보낸 링크도 살려야 했다.
date: 2026-09-11
series: 배포와 PWA
tags: [공유, URL, 배포]
---## 지적받은 것

> 메두사 미용실에서 방을 만들면 주소가 shworld.cloud/room/2222 이런 건데
> 이것도 shworld.cloud/m-hairsalon/room/2222 이렇게 되어야 하는 거 아냐?

맞았다. 주소창은 제대로 찍히고 있었지만 **공유하기 버튼이 만드는 링크만** 옛 주소였다.

## 원인

```ts
const location = useLocation();              // 리액트 라우터
const shareUrl = `${window.location.origin}${location.pathname}`;
```

라우터에게 `basename` 을 알려주면(`/m-hairsalon`) 라우터는 **그 아래에서만** 생각한다.
그래서 `useLocation().pathname` 은 `/room/2222` 다 — 앱이 사는 자리가 빠져 있다.
반면 `window.location.origin` 은 도메인 전체(`https://shworld.cloud`)다. 둘을 이으면
`https://shworld.cloud/room/2222` 가 된다.

**화면을 봐서는 알아챌 수가 없다.** 주소창은 브라우저가 그리므로
`shworld.cloud/m-hairsalon/room/2222` 라고 제대로 나온다. 링크를 실제로 복사해서 봐야
드러난다.

## 지금 열리는데 왜 고치나

도메인 맨 위(포트폴리오 워커)에서 옛 주소를 새 주소로 넘겨주고 있어 링크는 아직 열린다.
그래도 고쳐야 하는 이유가 둘이다.

1. **그 넘겨주기는 다른 저장소가 하는 일이다.** 이쪽이 모르는 사이에 사라질 수 있고,
   사라지면 그동안 뿌려진 링크가 전부 죽는다.
2. **같은 도메인에 게임이 하나 더 올라온다** (`/mafiahost`). 그 게임에도 방이 있으면
   `shworld.cloud/room/2222` 가 어느 게임의 방인지 정할 방법이 없다. 경로를 나눈 이유가
   바로 그것인데, 링크가 그 경로를 안 달고 나가면 나눈 보람이 없다.

## 고친 방법

브라우저가 실제로 보고 있는 주소를 쓴다. `src/lib/pageUrl.ts` 로 따로 뺐다 — 함정의
까닭을 한 곳에 적어두어야 다음에 또 같은 실수를 하지 않는다.

```ts
export function currentPageUrl(loc = window.location): string {
  return `${loc.origin}${loc.pathname}`;
}
```

앱이 어디로 옮겨가든 따라오므로, 나중에 경로가 또 바뀌어도 손댈 곳이 없다.

## 함께 확인한 것 — 경로 옮기기(2026-09-05)가 제대로 됐는지

다른 게임(`/mafiahost`)을 올리기 위해 게임을 `/m-hairsalon` 아래로 내린 작업을 전부
찔러봤다. 아래는 **모두 정상**이었다.

| 확인 | 결과 |
|---|---|
| 도메인 맨 위 | 포트폴리오 (게임 아님) |
| 설치 앱 정보 (id·scope·start_url) | 전부 `/m-hairsalon/` |
| ads.txt | 도메인 맨 위, 게시자 번호 일치 |
| 애드센스 코드 | 포트폴리오에만. 게임 첫 화면에는 없음 |
| 옛 주소 16개 | 전부 새 주소로 넘어감 |
| canonical · og:url | `/m-hairsalon/` |
| 옛 서비스 워커 | 스스로를 지우는 것으로 교체돼 있음 |
| 매일 점검 17개 | 전부 정상 |

`/tips` 가 루트에서 404 지만 **문제가 아니다** — 그 화면은 경로를 옮긴 뒤에 만들어져
`shworld.cloud/tips` 는 존재한 적이 없다(커밋 순서로 확인).

### 사이트맵에서 빠져 있던 '이기는 요령'

포트폴리오 저장소의 사이트맵에 `/m-hairsalon/tips` 가 없었다. 애드센스 반려 사유가
"가치가 별로 없는 콘텐츠" 였고 그 화면은 정확히 그 사유에 대응하려고 쓴 글인데, 크롤러가
그 자리를 알 길이 없었다. `shworld` 저장소의 `scripts/build-content.mjs` 에 한 줄 넣고
배포·커밋했다.

## 확인

- 화면 테스트 373개 통과 (공유 주소 규칙 2개 추가)
- 배포 완료. 사이트맵에 `/m-hairsalon/tips` 가 올라온 것도 실주소로 확인
