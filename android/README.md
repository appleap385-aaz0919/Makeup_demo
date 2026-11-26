# 화색 Android

- 패키지: `app.hwasaek.android`, Android 10(API 29) 이상, 버전 1.0.0 / versionCode 1.
- 사진 편집 화면·샘플 사진·분석 모델은 APK에 포함합니다. 신뢰하는 로컬 HTTPS origin만 네이티브 메시지 브리지를 사용할 수 있습니다. 임의 외부 페이지는 앱 WebView에서 실행하지 않습니다.
- 웹 주소와 정책·문의 주소는 https://hwasaek.vercel.app/ 를 사용합니다. 앱에서 GitHub 주소를 노출하지 않습니다.
- 앱 전용 온보딩은 사진/비교, 편집/광고 후 저장의 2페이지이며 삼성 인터넷 설정은 제외합니다. 로고 옆 느낌표는 사용 방법·정책·광고 개인정보 설정·문의 메뉴를 엽니다.
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

1. 결과 사진을 메모리에 준비하고 ‘광고 시청 후 다운로드가 시작됩니다.’ 안내와 취소/광고 시청 버튼을 표시합니다.
2. UMP 동의 정보를 갱신하고 필요한 동의 양식을 표시합니다. `canRequestAds()`가 참일 때만 광고 SDK를 초기화하고 요청합니다.
3. Rewarded 광고의 완료 보상 콜백과 닫힘을 모두 확인한 후 해당 사진 1장만 저장합니다. 광고 중단·로딩 실패·중복 콜백·취소 후 지연 콜백은 저장하지 않습니다.
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

## 스토어 제출 전 계정 작업

- Play Console에 패키지를 등록하고 서명·내부 테스트·스토어 설명/아이콘/콘텐츠 등급/타깃 연령을 설정합니다. 아동 대상 앱으로 설정할 경우 현재 광고·동의 구성을 그대로 출시하지 말고 별도 정책 검토가 필요합니다.
- 개인정보 처리방침: https://hwasaek.vercel.app/privacy.html
- 이용약관: https://hwasaek.vercel.app/terms.html
- 문의: https://hwasaek.vercel.app/support.html / appleap385@gmail.com
- 데이터 보안 양식에는 사진을 업로드하지 않는다는 점과 별도로 AdMob SDK가 처리하는 기기 식별자·광고 이용·진단·IP 관련 항목을 실제 SDK/설정에 맞춰 신고합니다. ‘어떤 데이터도 수집하지 않음’으로 일괄 기입하지 않습니다.
- AdMob의 개인정보 보호 및 메시지에서 배포 지역에 필요한 동의 양식을 게시하고 앱에서 테스트합니다.
- AdMob 앱을 실제 스토어 항목에 연결하고 개발자 웹사이트를 Vercel 주소로 지정한 뒤 app-ads.txt 소유권 검증을 완료합니다.

## 실행 검증 기록 · 2026-11-26

Android 15/API 35 에뮬레이터와 WebView 124에서 번들 모델로 샘플 인물을 실제 분석했습니다. 360·440·768dp 화면, 앱 온보딩 2페이지, 편집 상태를 유지한 화면 크기 변경, 캡처 차단, 저장 취소, 구버전 및 버전 확인 실패 차단을 검사했습니다. Google 공식 테스트 보상형 광고를 실제로 끝까지 시청하고 닫은 뒤 갤러리에 사진 1장이 추가되는 것까지 통과했습니다. 별도의 콜백 주입 저장 검사와 실제 광고 검사를 구분합니다. 단위 검사 7개와 instrumentation 3개가 통과했습니다.

독립 스크린샷 검토는 4개 항목 평균 4.38/5로 통과했습니다. 360dp의 기본 팔레트 공간은 좁으며 기존 ‘색상표 크게’ 도구와 팔레트 스크롤로 확장합니다. 실제 휴대폰, TalkBack, Play 스토어를 통한 업데이트 설치는 아직 검증하지 않았습니다.

검증 시 UMP SDK에서 AdMob 계정에 동의 양식이 게시되지 않았다는 경고가 있었습니다. 해당 지역에서 테스트 광고는 표시됐지만, 출시 전 배포 지역별 메시지를 게시하고 동의 흐름을 확인해야 합니다. 생성한 Release AAB는 아직 업로드 키로 서명하지 않았습니다.

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

## 공식 구현 근거

- https://developer.android.com/security/fraud-prevention/activities
- https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader
- https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges
- https://developers.google.com/admob/android/rewarded
- https://developers.google.com/admob/android/privacy
- https://developers.google.com/admob/android/privacy/play-data-disclosure
- https://support.google.com/admob/answer/7372450?hl=ko
- https://support.google.com/googleplay/android-developer/answer/10144311
