# 화색 Android 작업 상태

2026-11-26 재부팅 후 작업을 재개했고 Android 초기 구현과 에뮬레이터 검증을 완료했습니다. 자세한 설정과 실행 방법은 [android/README.md](android/README.md)에 있습니다.

2026-11-27: 첫 안내를 서비스 배경 위 중앙 레이어로 바꾸고 저장·종료·광고 실패 디자인을 통일했습니다. 정상 재시작 시 안내 화면이 깜박이지 않게 했습니다. 모델과 영역 마스크 준비는 Web Worker에서 실행하며 첫 안내·온보딩과 관계없이 서비스 로드 시 바로 시작합니다. 저장 확인 전에는 저장용 이미지 합성·PNG 인코딩을 하지 않습니다. 광고 없음·실패·로딩 시간 초과·동의 상태상 요청 불가 시에는 광고 없이 저장합니다. 보상 완료 전에 사용자가 광고를 닫으면 저장을 취소하고 재시청/편집을 안내합니다. 이전 실행 증거는 `screenshots/android/revision/`이며 새 정책 검증은 아래에 별도로 기록합니다. 운영 최소 버전은 1을 유지합니다.

- 서비스: https://hwasaek.vercel.app/ / 패키지: `app.hwasaek.android` / versionCode 1.
- 구현: 캡처 차단, 시스템 사진 선택기, 광고 완료/광고 제공 불가 시 갤러리 저장, 강제 업데이트, 앱 온보딩 2페이지, 정책·문의 안내. 느낌표 메뉴는 저장 팝업과 같은 인앱 레이어로 표시하며 ‘사용 방법 / 닫기’, 정책 텍스트 링크, 이메일·버전 일반 텍스트를 제공합니다. 광고 개인정보 설정 항목은 이 레이어에서 제거했습니다.
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Google 공식 테스트 광고를 사용합니다.
- Release AAB: `android/app/build/outputs/bundle/release/app-release.aab`. 실제 광고 ID로 빌드했지만 아직 업로드 키로 서명하지 않았습니다.
- 광고 설정: `android/ads.properties`는 Git에서 제외한 로컬 파일입니다. 광고 모음 OFF·양방향 OFF를 유지하고 출시 후 지표로 조정합니다.
- 검증: 웹 구문·11개 단위 검사·정적 빌드·UI 회귀 검사·실제 모델 검사 통과. Android 단위 검사 10개와 실행 검사 4개 통과. 실제 Google 테스트 광고 완료 저장과 별도의 광고 없음/실패/시간 초과 무료 저장·중단 취소/재시청을 구분해 검사했습니다. 최신 증거는 screenshots/android/parallel-policy/ 입니다. 이전 독립 화면 검토 평균은 4.38/5였습니다.
- 테스트 장치: Android 15/API35 에뮬레이터, WebView124, 360·440·768dp. 실제 기기와 Play 스토어 업데이트 설치 검증은 남아 있습니다.
- 공개 정책: Vercel의 privacy.html, terms.html, support.html; 이메일 appleap385@gmail.com. 개인 이름 대신 화색 운영팀을 사용합니다.

## 다음 단계

1. AdMob ‘개인정보 보호 및 메시지’에서 배포 지역에 필요한 동의 메시지를 게시합니다. 현재 SDK가 계정에 게시된 양식이 없다고 경고했습니다.
2. 사용자 관리 업로드 키로 AAB를 서명하고 Play Console 내부 테스트에 등록합니다. 스토어 설명·아이콘·콘텐츠 등급·타깃 연령·데이터 보안 양식이 필요합니다.
3. 실제 장치에서 사진 교체·캡처 방지·테스트 광고·저장·동의·업데이트 설치를 확인합니다.
4. Play 스토어 공개 후 AdMob 스토어 연결 및 app-ads.txt 검증을 완료합니다.
5. 새 버전이 모든 사용자에게 제공된 뒤에만 android-release.json의 latest/minimum을 함께 올립니다.

## 이 PC 환경

- SDK: D:/jaehyuk.myung/android/sdk, JDK: D:/jaehyuk.myung/android/jdk21, Gradle 캐시: D:/jaehyuk.myung/android/gradle.
- 메모리 부족을 피하려고 빌드와 에뮬레이터를 순차 실행합니다. 에뮬레이터 RAM1536MB, Gradle worker1과 heap768MB로 최종 빌드했습니다.
- AVD pym_phone_360은 부팅 후 Wi-Fi·데이터·DNS 연결을 확인해야 합니다. 경로가 없으면 버전 확인이 정상적으로 차단됩니다.
- 실행 증거: screenshots/android/final/ (Git 제외). 실제 광고 XML과 캡처 차단의 검정 화면도 포함합니다.
