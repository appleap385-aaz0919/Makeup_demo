# 화색 Android

- 패키지: `app.hwasaek.android`, Android 10(API 29) 이상, 버전 1.0.0 / versionCode 1.
- 사진 편집 화면·샘플 사진·분석 모델은 APK에 포함합니다. 신뢰하는 로컬 HTTPS origin만 네이티브 메시지 브리지를 사용할 수 있습니다. 임의 외부 페이지는 앱 WebView에서 실행하지 않습니다.
- 웹 주소와 정책·문의 주소는 https://hwasaek.vercel.app/ 를 사용합니다. 앱에서 GitHub 주소를 노출하지 않습니다.
- 앱 전용 온보딩은 사진/비교, 편집/광고 후 저장의 2페이지이며 삼성 인터넷 설정은 제외합니다. 로고 옆 느낌표는 서비스 소개와 ‘사용 방법 / 닫기’가 있는 인앱 레이어를 엽니다. 정책은 텍스트 링크, 이메일과 버전은 일반 텍스트로 표시합니다. 광고 개인정보 설정 메뉴는 사용자 요청에 따라 이 레이어에서 제거했습니다.
- 회원가입·위치·주소록·전체 사진 권한 없이 시스템 사진 선택기로 사진을 선택하고 MediaStore의 `Pictures/Hwasaek`에 결과를 저장합니다.

## 빌드

JDK 17 이상(검증 환경 JDK 21), Android SDK 36, Node.js가 필요합니다. `local.properties`에 SDK 위치를 설정하고 저장소 루트에서 모델 준비를 마친 다음 실행합니다.

```powershell
cd android
.\gradlew.bat assembleDebug testDebugUnitTest
.\gradlew.bat bundleRelease
```

Gradle은 `scripts/build-site.mjs`로 정적 파일을 모아 앱 assets에 복사합니다. Debug APK는 `app/build/outputs/apk/debug/app-debug.apk`, Release AAB는 `app/build/outputs/bundle/release/app-release.aab`에 생성합니다. Debug는 공식 테스트 광고 단위만 요청합니다. 실제 광고를 직접 시청·클릭하며 개발 검증하지 않습니다.

`ads.properties.example`을 `ads.properties`로 복사한 뒤 실제 AdMob 앱 ID와 보상형 단위 ID를 입력합니다. 실제 ID가 없거나 테스트 ID이면 Release 빌드를 중단합니다. 이 PC에는 제공받은 ID를 로컬 파일로 설정했으며 해당 파일은 Git에서 제외합니다. 새 개발 환경에서는 다시 설정해야 합니다. 서명 키와 비밀번호는 저장소에 넣지 않습니다. 스토어 업로드에는 개발자가 관리하는 업로드 키로 AAB에 서명해야 합니다.

## 광고 저장

1. 저장 버튼을 누르면 먼저 ‘사진을 저장할까요?’ 팝업과 광고 완료 조건을 표시합니다. 이 단계에서 취소하면 저장용 이미지 합성·PNG 변환·광고 표시를 실행하지 않습니다. 편집 중 시작한 광고 사전 로딩은 이 취소와 별개입니다. ‘광고 보고 저장’을 선택한 뒤에만 결과 이미지를 준비합니다.
2. 첫 안내와 온보딩을 마치면 앱 세션의 UMP 동의 정보를 갱신하고 필요한 Google 양식만 표시합니다. `canRequestAds()`가 참일 때 SDK를 초기화하고 광고 1개를 미리 불러옵니다. 로딩 중 저장 요청은 같은 요청을 공유하며 준비된 광고는 저장 승인 전에는 표시하지 않습니다. 저장이 끝나면 다음 광고 1개를 자동으로 준비합니다. 사용한 광고는 재사용하지 않고, 캐시는 55분에 교체합니다. 실패 후 자동 요청은 60초 간격 제한을 적용합니다.
3. Rewarded 광고의 완료 보상 콜백과 닫힘을 모두 확인한 후 해당 사진 1장만 저장합니다. 광고 없음·요청/표시 실패·45초 로딩 시간 초과·동의 상태상 요청 불가 시에는 짧은 안내 후 광고 없이 저장합니다. 사용자가 보상 조건 충족 전에 광고를 닫으면 저장을 취소하고 ‘다시 시청하기 / 계속 편집하기’를 제공합니다. 중복 콜백과 취소 후 지연 콜백은 추가 저장을 일으키지 않습니다. 광고 내부의 뒤로 가기·닫기 UI는 SDK가 관리하므로 사전 저장 안내와 닫힌 뒤 취소 안내를 제공합니다.
4. 초기 AdMob 설정: **광고 모음 OFF, 양방향 OFF**. 사용자 확정 사항입니다. 출시 후 완료율·저장 성공률·수익을 검토해 AdMob에서 조정합니다. 리워드 수량은 1, 상품은 이미지 저장입니다.

광고 검증은 클라이언트의 Google SDK 콜백에 기반합니다. 서버 측 보상 검증이나 변조된 APK에 대한 무결성 검증을 구현한 것은 아닙니다.

## 강제 업데이트

`https://hwasaek.vercel.app/android-release.json`을 실행·앱 복귀 시와 이용 중 5분마다 확인합니다. 확인 전, 네트워크/형식 오류 시, 필수 버전보다 낮을 때에는 편집 화면에 접근할 수 없습니다. 구버전에는 스토어 업데이트 버튼과 개인정보 처리방침·종료만 제공합니다. 스토어 버튼은 `market://details?id=app.hwasaek.android`, Play 앱이 없으면 같은 패키지의 HTTPS 스토어 페이지를 엽니다.

새 버전 절차:

1. Gradle의 versionCode를 올리고 서명한 AAB를 Play Console에서 배포합니다.
2. 사용자 전체에게 업데이트가 제공되는지 확인합니다. 점진적 출시 중에 정책을 먼저 올리면 스토어에서 업데이트를 받을 수 없는 사용자도 차단됩니다.
3. `android-release.json`의 `latestVersionCode`와 `minimumVersionCode`를 같은 새 값으로 올려 푸시합니다. 둘이 다르거나 잘못된 데이터이면 앱은 사용을 허용하지 않습니다.
4. 구버전 차단과 새 버전 실행을 확인합니다. 앱 출시 전에는 스토어 URL에 실제 상세 페이지가 존재하지 않습니다.

Android의 FLAG_SECURE로 앱 화면의 일반적인 캡처·녹화를 방지합니다. 다른 카메라로 촬영하거나 변조된 기기에서 우회하는 것까지 막는 기능은 아닙니다. QA instrumentation은 캡처 방지 플래그를 먼저 검증한 뒤 화면 증거 수집을 위해 테스트 코드 안에서만 일시 해제할 수 있습니다.

### 업데이트 테스트 방법

개발용 APK에서는 아래 명령으로 필수 업데이트와 통신 실패 화면을 각각 확인할 수 있습니다. 실제 배포 정책 파일을 수정하지 않으므로 다른 사용자를 차단하지 않습니다. `qa_update`, `qa_offline`, `qa_no_ad`, `qa_ad_case`는 Debug 빌드에서만 읽습니다.

```powershell
adb shell am force-stop app.hwasaek.android
adb shell am start -n app.hwasaek.android/.MainActivity --ez qa_update true
# 업데이트 화면을 확인한 뒤 통신 실패 화면 검사
adb shell am force-stop app.hwasaek.android
adb shell am start -n app.hwasaek.android/.MainActivity --ez qa_offline true
# 정상 실행으로 복구
adb shell am force-stop app.hwasaek.android
adb shell am start -n app.hwasaek.android/.MainActivity
```

이 검사는 차단 화면과 동작을 확인하는 용도입니다. 실제 설치 업데이트는 동일한 패키지·업로드 키로 versionCode 1과 2를 Play 내부 테스트에 순서대로 배포하고 테스트 계정으로 확인합니다. 1을 설치한 기기에서 스토어의 2가 제공되는지, 업데이트 후 앱이 열리는지 확인합니다. 아직 스토어에 앱을 등록하지 않았으므로 실제 스토어 설치 과정은 검증되지 않았습니다. 테스트를 위해 운영 `minimumVersionCode`를 먼저 올리지 않습니다.

## 스토어 제출 전 계정 작업

- Play Console에 패키지를 등록하고 서명·내부 테스트·스토어 설명/아이콘/콘텐츠 등급/타깃 연령을 설정합니다. 아동 대상 앱으로 설정할 경우 현재 광고·동의 구성을 그대로 출시하지 말고 별도 정책 검토가 필요합니다.
- 개인정보 처리방침: https://hwasaek.vercel.app/privacy.html
- 이용약관: https://hwasaek.vercel.app/terms.html
- 문의: https://hwasaek.vercel.app/support.html / appleap385@gmail.com
- 데이터 보안 양식에는 사진을 업로드하지 않는다는 점과 별도로 AdMob SDK가 처리하는 기기 식별자·광고 이용·진단·IP 관련 항목을 실제 SDK/설정에 맞춰 신고합니다. ‘어떤 데이터도 수집하지 않음’으로 일괄 기입하지 않습니다.
- AdMob의 개인정보 보호 및 메시지에서 배포 지역에 필요한 동의 양식을 게시하고 앱에서 테스트합니다.
- 광고 개인정보 설정 항목은 현재 정보 레이어에 노출하지 않습니다. 동의 철회 진입점이 필요한 배포 지역은 출시 전 별도 진입 위치를 확정하고 검증해야 합니다.
- AdMob 앱을 실제 스토어 항목에 연결하고 개발자 웹사이트를 Vercel 주소로 지정한 뒤 app-ads.txt 소유권 검증을 완료합니다.

## 실행 검증 기록 · 2026-11-26

Android 15/API 35 에뮬레이터와 WebView 124에서 번들 모델로 샘플 인물을 실제 분석했습니다. 360·440·768dp 화면, 앱 온보딩 2페이지, 편집 상태를 유지한 화면 크기 변경, 캡처 차단, 저장 취소, 구버전 및 버전 확인 실패 차단을 검사했습니다. Google 공식 테스트 보상형 광고를 실제로 끝까지 시청하고 닫은 뒤 갤러리에 사진 1장이 추가되는 것까지 통과했습니다. 별도의 콜백 주입 저장 검사와 실제 광고 검사를 구분합니다. 단위 검사 7개와 instrumentation 3개가 통과했습니다.

독립 스크린샷 검토는 4개 항목 평균 4.38/5로 통과했습니다. 360dp의 기본 팔레트 공간은 좁으며 기존 ‘색상표 크게’ 도구와 팔레트 스크롤로 확장합니다. 실제 휴대폰, TalkBack, Play 스토어를 통한 업데이트 설치는 아직 검증하지 않았습니다.

검증 시 UMP SDK에서 AdMob 계정에 동의 양식이 게시되지 않았다는 경고가 있었습니다. 해당 지역에서 테스트 광고는 표시됐지만, 출시 전 배포 지역별 메시지를 게시하고 동의 흐름을 확인해야 합니다. 생성한 Release AAB는 아직 업로드 키로 서명하지 않았습니다.

### 안내와 저장 반응성 개선 · 2026-11-27

첫 안내는 서비스 화면 위 중앙 레이어로 표시하며 서비스 소개를 크게, 가상 색상표·사진/광고 안내를 작게 배치합니다. 정책·약관·종료는 텍스트로 제공합니다. 확인 기록이 있으면 레이어를 다시 만들지 않으며, 정상 버전 확인 중에는 전면 안내 화면을 잠깐 표시하지 않습니다. 저장·종료·광고 실패도 같은 인앱 레이어를 사용하고 시스템 상태 표시줄은 별도로 어둡게 하지 않습니다.

분석 모델과 피부·헤어 등 영역 마스크 준비는 Web Worker에서 실행합니다. 서비스 화면을 불러오면 첫 안내·온보딩과 관계없이 분석을 시작합니다. 준비된 마스크를 화면에 전달하는 작업도 나눠 실행해 안내 버튼이 반응할 수 있도록 합니다. 저장은 확인 후에만 이미지를 준비하며 기존 원본 캔버스와 편집 오버레이를 재사용합니다.

Android 15 에뮬레이터에서 첫 온보딩 다음 응답은 최종 실행 80ms(앞선 실행 47ms), 저장 확인 레이어 3회 배치는 192·99·60ms였습니다. 이는 실제 기기 성능 보장이 아닙니다. UIAutomator 자체의 화면 안정화 대기는 제외하고 레이어의 실제 레이아웃 시점을 기록했습니다. 취소 시 PNG 준비 전 `saveRequest == null`이며 저장 파일이 증가하지 않는 것을 확인했습니다.

첫 안내·재시작 미노출·저장/취소 3회·종료 취소·실제 Google 테스트 광고 완료 저장 시나리오가 통과했습니다. 구버전 차단·버전 확인 실패·광고 없음/재시도/편집 유지도 별도 실행에서 통과했습니다. 네 실행 시나리오의 결과를 합친 기록이며, 첫 계측의 자동화 대기 시간이 포함된 실패는 수정 후 해당 시나리오를 재실행했습니다. 최신 화면은 `screenshots/android/revision/`에 있습니다. 실제 장치와 실제 Play 업데이트 설치는 미검증입니다.

```powershell
# 저장소 루트, Android SDK의 platform-tools를 PATH에 추가한 환경
android\gradlew.bat --no-daemon -p android assembleDebug assembleDebugAndroidTest testDebugUnitTest bundleRelease
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w -e liveAd true app.hwasaek.android.test/androidx.test.runner.AndroidJUnitRunner
adb pull /sdcard/Android/data/app.hwasaek.android/files/qa/. screenshots/android/final
adb shell wm size reset
adb shell wm density reset
```

### 병렬 분석과 광고 예외 저장 검증 · 2026-11-27

첫 안내를 닫기 전에 실제 모델 분석이 시작되며, 온보딩을 열어 둔 상태에서도 분석 완료까지 진행하는 것을 Android 15/API35 에뮬레이터에서 확인했습니다. 웹 Chrome의 실제 분석 중 온보딩 다음 응답은 10ms였습니다. Android의 다음 응답 45ms는 안내를 읽는 동안 분석이 이미 완료된 뒤의 측정값입니다. 저장 확인창의 실제 배치는 반복 3회 86·56·91ms였으며 취소 때 저장용 PNG 준비를 시작하지 않았습니다.

실제 Google 테스트 광고 시청 완료·닫기 후 사진 1장 저장이 통과했습니다. 별도 Debug 콜백 주입 검사에서는 광고 없음·불러오기 실패·표시 실패·시간 초과·완료 후 닫기에 각각 1장이 저장됐습니다. 중도 닫기는 파일을 만들지 않고 취소 안내를 표시했으며 재시청 완료 시 1장만 저장했습니다. 이 실패 검사는 SDK 장애를 실제로 유발한 검사가 아니라 동일 처리 경로를 실행하는 fixture입니다. 시간 초과 fixture는 100ms 후 동작하며 운영 타이머는 45초입니다. 편집 상태는 모든 분기에서 유지됐습니다.

단위 검사 10개와 Android 실행 검사 4개가 통과했습니다. 캡처 차단, 휴대폰/태블릿 크기 변경, 재시작 안내 미노출, 강제 업데이트/통신 실패 차단도 통과했습니다. 웹 실제 모델 검사에서는 서로 다른 인물 2명, 거절 사진, 메이크업 렌더링을 확인했고 사진 업로드나 외부 API 호출은 없었습니다. 최신 화면 증거는 `screenshots/android/parallel-policy/`입니다. 저장/취소 레이어의 독립 화면 검토는 7개 항목 평균 4.43/5, 모든 항목 4 이상으로 통과했습니다. 두 레이어는 360dp에서 캡처했으며 440dp에서는 첫 안내와 편집 화면을 캡처했습니다. 실제 휴대폰·TalkBack·확대 글자·Play 업데이트 설치는 아직 검증하지 않았습니다.

### 느낌표 안내와 저장 여백 · 2026-11-27

느낌표는 시스템 목록 대신 저장·종료와 동일한 AppPopup을 사용합니다. 서비스 소개, ‘사용 방법 / 닫기’, 정책 텍스트 링크, 이메일·버전 일반 텍스트를 표시합니다. Android 15 에뮬레이터의 별도 실행 검사 `informationPopupAndSaveSpacing`이 통과했습니다. 360dp에서 저장 버튼 위·아래는 5px, 440dp에서는 7px이며 footer 아래 WebView 내부 여백은 두 화면 모두 0px였습니다. OS 내비게이션 영역은 별도로 유지합니다. ‘사용 방법’의 온보딩 열기와 ‘닫기’의 편집 복귀도 확인했습니다. 증거는 `screenshots/android/info-footer/`에 있습니다. 독립 화면 검토는 7개 항목 평균 4.43/5, 모든 항목 4 이상으로 통과했습니다. 기존 광고·업데이트 흐름은 변경하지 않았습니다. 현재 단위 검사 10개, 웹 UI 회귀 검사, Debug APK/Release AAB 빌드도 통과했습니다. 이전 4개 Android 실행 검사를 이번 변경에서 다시 실행한 것은 아닙니다.

### 사전 로딩과 비교 도구 검증 · 2026-11-27

실제 Google 테스트 광고가 저장 확인 전에 캐시된 것을 확인했고, 중복 준비 요청 4회에도 같은 광고를 유지했습니다. 광고 완료 후 MediaStore에 사진 1장이 추가됐으며 다음 광고도 자동으로 캐시됐습니다. 이 검사는 SDK 광고를 실제로 불러온 결과입니다. 별도 fixture에서는 광고 없음·요청/표시 실패·시간 초과의 무료 저장, 중도 닫기 취소/재시청, 사전 로딩 실패의 무료 저장, 이전 세대 실패 콜백 무시를 검사했습니다. 실제 SDK 장애나 55분 경과를 자연스럽게 기다린 검사는 아닙니다.

Android 실행 검사 5개 전체와 단위 검사 10개, 웹 UI 회귀 검사 및 웹 단위 검사 11개가 통과했습니다. 사진 분석 중 첫 온보딩 다음 응답은 이번 에뮬레이터에서 803ms였으며 저장 팝업 3회 배치는 323·178·135ms였습니다. 에뮬레이터 부하에 따른 값이며 실제 장치 성능 보장이 아닙니다. 360·440dp 정보 팝업에서 버튼의 같은 행 배치, 일반 텍스트 메타데이터, 사용 방법/닫기 동작을 확인했습니다. 사진 도구의 원본 전환과 전후 비교 토글 상호 배제도 웹에서 검사했습니다. 화면 증거는 `screenshots/android/preload-toggle/`에 있습니다. 독립 화면 검토는 7개 항목 평균 4.36/5, 모든 항목 4 이상으로 통과했습니다. 실제 휴대폰·TalkBack·확대 글자·스토어 설치 업데이트는 미검증입니다.

## 공식 구현 근거

- https://developer.android.com/security/fraud-prevention/activities
- https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader
- https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges
- https://developers.google.com/admob/android/rewarded
- https://developers.google.com/admob/android/privacy
- https://developers.google.com/admob/android/privacy/play-data-disclosure
- https://support.google.com/admob/answer/7372450?hl=ko
- https://support.google.com/googleplay/android-developer/answer/10144311
