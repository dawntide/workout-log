# Safari Status Bar / Safe Area Notes

이 문서는 iOS Safari에서 상단 상태바 투명 효과가 깨질 때 확인해야 할 사항을 정리한 메모다.

## 증상

- 상태바 뒤로 컨텐츠가 흘러가야 하는데, 상단 safe-area에 배경색이 생김
- 새로고침 직후 잠깐 정상이다가, 이후 흰색 또는 테마색 tint가 덮임
- 바텀시트/모달/스플래시를 건드린 뒤 재발하기 쉬움

## 우선 의심할 것

1. `position: fixed` 전체 화면 레이어
- 특히 `inset: 0`으로 상태바 영역까지 덮는 overlay, splash, modal blocker
- Safari가 이 레이어를 top bar tint 소스로 다시 잡을 수 있음

2. 루트 배경색과 테마 적용 타이밍
- `html`, `body` 배경색
- 서버 첫 렌더 테마와 클라이언트에서 다시 적용되는 테마가 다르면 Safari가 상단 tint를 다시 샘플링할 수 있음
- 현재는 [`app/layout.tsx`](../src/app/layout.tsx)에서 early theme bootstrap 스크립트로 첫 페인트 전에 테마를 맞춤

3. 전역 스크롤 락
- `html/body/app-shell`에 `overflow: hidden`, `position: fixed`, `touch-action: none` 등을 걸면 상단 상태바 tint가 다시 생길 수 있음
- 가능하면 전역 루트 락보다 로컬 컴포넌트 수준 제어를 우선

## 피해야 할 패턴

- `fixed` fullscreen backdrop를 safe-area top까지 덮는 것
- `BottomSheet`처럼 화면 전체를 덮는 투명 버튼/overlay를 두는 것
- overlay가 투명이어도 Safari는 그 fullscreen 레이어 자체를 top bar tint 합성 대상으로 볼 수 있음
- `body.style.position = "fixed"` 같은 body lock
- 모달을 닫은 뒤에도 남는 전역 dataset/class/style
- `body.dataset.*` 같이 루트 노드에 모달 상태를 기록하는 방식
- splash / launch overlay가 상태바 영역까지 덮는 것

## 현재 유지 중인 대응

1. 초기 테마 부트스트랩
- [`app/layout.tsx`](../src/app/layout.tsx)
- `head`에서 localStorage 기반 테마를 먼저 읽고 `data-theme-preference` 및 루트 배경을 즉시 맞춤

2. launch splash safe-area 분리
- [`components/app-launch-splash.tsx`](../src/components/app-launch-splash.tsx)
- splash는 `top: env(safe-area-inset-top, 0px)` 아래에서만 렌더

3. 공통 BottomSheet fullscreen overlay 제거
- [`components/ui/bottom-sheet.tsx`](../src/components/ui/bottom-sheet.tsx)
- [`styles/components/bottom-sheet.css`](../src/styles/components/bottom-sheet.css)
- 바깥 탭 닫기는 fullscreen overlay/button 대신 `document` `pointerdown` 캡처로 처리
- 시트 루트는 `top: env(safe-area-inset-top, 0px)`부터 시작
- `body.dataset.bottomSheetStack`, `body.dataset.bottomSheetLockCount` 같은 루트 상태 기록은 사용하지 않음

## 이번 이슈 결론

- 공통 바텀시트의 tint 원인은 색상값 자체보다 fullscreen overlay 레이어였다
- overlay 배경을 `transparent`로 바꾸는 것만으로는 부족했다
- 실제로 해결된 변경은:
  - fullscreen overlay/button 제거
  - 바깥 탭 닫기를 문서 이벤트로 이동
  - 시트 루트를 safe-area 아래부터 시작
  - body dataset 기반 전역 상태 제거

4. PTR safe-area 합성 분리
- [`components/pull-to-refresh.tsx`](../src/components/pull-to-refresh.tsx)
- 인디케이터는 상단 `fixed`가 아니라 `.app-shell` 기준 `absolute`로 렌더
- 당김 transform은 safe-area를 포함한 `.app-main`이 아니라 `.app-shell__content`에만 적용
- 임계값 직전 취소 후에도 상태바가 solid tint로 다시 샘플링되지 않도록 상단 레이어를 유지

## 수정할 때 체크리스트

- 새 `fixed` overlay가 safe-area top까지 덮지 않는지
- PTR처럼 상단에 잠깐 보이는 요소도 `fixed`/`sticky`로 만들지 않았는지
- 드래그 transform이 safe-area를 가진 `.app-main`까지 움직이지 않는지
- 투명 overlay라도 fullscreen 레이어 자체가 추가되지 않는지
- top bar tint가 변하는 시점이 “첫 렌더 직후”인지, “모달 open/close 후”인지
- `html/body` 배경과 `data-theme-preference` 적용 순서가 바뀌지 않았는지
- `body`/`html` dataset, class, style을 모달 open/close 때 새로 건드리지 않는지
- iOS Safari 실기기에서 새로고침 직후와 모달 open/close 후 둘 다 확인했는지

## 관련 파일

- [`app/layout.tsx`](../src/app/layout.tsx)
- [`components/app-launch-splash.tsx`](../src/components/app-launch-splash.tsx)
- [`components/ui/bottom-sheet.tsx`](../src/components/ui/bottom-sheet.tsx)
- [`styles/base.css`](../src/styles/base.css)
- [`styles/components/bottom-sheet.css`](../src/styles/components/bottom-sheet.css)
- [`styles/layout.css`](../src/styles/layout.css)

## 참고

- WebKit bug 300965
- WebKit bug 301756
- WebKit bug 301108
