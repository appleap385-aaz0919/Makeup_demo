# ColorMatch · 컬러매치

정지 사진에서 파운데이션, 립스틱, 블러셔, 아이섀도, 아이라이너, 애교살, 헤어 색상을 체험하는 웹 앱입니다.

- 공개 데모: https://appleap385-aaz0919.github.io/Makeup_demo/
- 얼굴 분석과 메이크업 합성은 브라우저에서 실행합니다. 사진을 서버로 업로드하거나 AI API를 호출하지 않습니다.
- 모델과 실행 파일은 `vendor/vision`에 포함되어 있으며 사이트에서 내려받습니다.
- 사진의 원래 색과 조명에 따라 결과가 달라집니다. 색상표는 실물 제품과 대응하지 않는 가상 색상입니다.

## 로컬 실행

Node.js를 설치한 뒤 `npm start`를 실행하고 http://127.0.0.1:4173/ 에 접속합니다. PowerShell에서는 `npm.cmd start`를 사용할 수 있습니다.

HTML 파일을 더블클릭하는 `file://` 방식에서는 모듈과 모델 로딩이 제한될 수 있으므로 HTTP 서버를 사용합니다. 이 서버는 정적 파일을 전달하며 사진을 분석하는 백엔드는 아닙니다.

## 배포

`main`에 푸시하면 `.github/workflows/pages.yml`이 앱과 테스트를 확인하고 GitHub Pages에 정적 파일을 배포합니다. 공개 사이트는 개발 PC가 꺼져 있어도 접속할 수 있습니다.

## 검증

- `npm run check`: JavaScript 구문 검사
- `npm test`: 사진 판정 로직 검사
- `npm run verify:ui`: 로컬 Chrome에서 UI 및 오류 복구 검사
- `npm run verify:real`: 실제 모델 및 렌더링 검사
- `COLORMATCH_URL` 환경 변수로 `verify:real`의 검사 주소를 지정할 수 있습니다.

브라우저 검증 스크립트의 Chrome 경로는 Windows 환경 기준입니다. 모바일 크기 검증은 실제 휴대폰/Safari 검증과 다릅니다. 애교살 위치는 명암 기반 추정이므로 수동 보정이 필요할 수 있습니다.

모델 및 SDK 출처와 라이선스는 `scripts/prepare-models.mjs` 및 `vendor/vision/LICENSE`를 참고하세요.
