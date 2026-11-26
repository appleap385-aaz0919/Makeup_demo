package app.hwasaek.android;

import android.content.*;
import android.database.Cursor;
import android.provider.MediaStore;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.uiautomator.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.File;
import java.lang.reflect.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AndroidFlowsTest {
    private final UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private Object field(Object target,String name)throws Exception{Field f=target.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(target);}
    private String js(ActivityScenario<MainActivity> scenario,String code)throws Exception{
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        scenario.onActivity(activity->{try{((WebView)field(activity,"web")).evaluateJavascript(code,result->{value.set(result);latch.countDown();});}catch(Exception e){throw new RuntimeException(e);}});
        assertTrue("JavaScript response timed out during emulator inference",latch.await(90,TimeUnit.SECONDS));return value.get();
    }
    private void waitJs(ActivityScenario<MainActivity> scenario,String code,int seconds)throws Exception{
        long deadline=System.currentTimeMillis()+seconds*1000L;
        while(System.currentTimeMillis()<deadline){if("true".equals(js(scenario,code)))return;Thread.sleep(400);}
        fail("WebView condition failed: "+code+"; "+js(scenario,"document.body.innerText.slice(-1200)"));
    }
    private void capture(ActivityScenario<MainActivity> scenario,String name)throws Exception{
        if(name.contains("editor")||name.contains("onboarding")){
            js(scenario,"window.qaPaintReady=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.qaPaintReady=true))");
            waitJs(scenario,"window.qaPaintReady===true",20);
        }
        File folder=new File(context.getExternalFilesDir(null),"qa");folder.mkdirs();
        if(name.equals("android-editor"))assertTrue(device.takeScreenshot(new File(folder,"android-capture-protected.png")));
        // Test code only: production keeps FLAG_SECURE throughout normal usage.
        scenario.onActivity(a->{assertTrue((a.getWindow().getAttributes().flags&WindowManager.LayoutParams.FLAG_SECURE)!=0);a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);});
        Thread.sleep(1800);device.waitForIdle(3000);assertTrue(device.takeScreenshot(new File(folder,name+".png")));
        scenario.onActivity(a->a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE));
    }
    private int imageCount(){try(Cursor c=context.getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,new String[]{"_id"},"relative_path=?",new String[]{"Pictures/Hwasaek/"},null)){return c==null?0:c.getCount();}}

    @Test public void realModelOnboardingCancelAndCompletedRewardSave()throws Exception{
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            UiObject2 begin=device.wait(Until.findObject(By.text("확인하고 시작")),15000);if(begin!=null)begin.click();
            waitJs(scenario,"typeof livePhoto!=='undefined'&&Boolean(livePhoto)&&photoAssessment.status==='ready'",180);
            assertEquals("true",js(scenario,"window.HwasaekApp.isAndroid"));
            assertEquals("\"화색 | 내 사진으로 메이크업 미리보기\"",js(scenario,"document.title"));
            js(scenario,"window.HwasaekTour.open();document.getElementById('onboarding-next').click()");
            assertEquals("\"시작하기\"",js(scenario,"document.getElementById('onboarding-next').textContent"));
            assertEquals("false",js(scenario,"document.getElementById('onboarding-content').textContent.includes('삼성 인터넷')"));
            capture(scenario,"android-onboarding");
            js(scenario,"document.getElementById('onboarding-next').click();document.getElementById('tab-lip').click();document.querySelectorAll('.swatch')[2].click()");
            capture(scenario,"android-editor");
            String editing=js(scenario,"JSON.stringify(state)");
            device.executeShellCommand("wm size 880x1912");Thread.sleep(1500);capture(scenario,"android-editor-440");
            device.executeShellCommand("wm size 1536x2048");Thread.sleep(1500);capture(scenario,"android-editor-tablet");
            device.executeShellCommand("wm size 720x1280");Thread.sleep(1500);
            waitJs(scenario,"typeof livePhoto!=='undefined'&&Boolean(livePhoto)&&photoAssessment.status==='ready'",180);
            assertEquals("Resizing must preserve the selected makeup",editing,js(scenario,"JSON.stringify(state)"));
            int before=imageCount();js(scenario,"document.getElementById('save-button').click()");
            assertNotNull(device.wait(Until.findObject(By.textContains("광고 시청 후 다운로드가 시작됩니다.")),12000));
            capture(scenario,"android-save-confirmation");device.findObject(By.text("취소")).click();
            waitJs(scenario,"!savingImage",10);assertEquals(before,imageCount());

            // Inject the two SDK completion events via instrumentation, not via a production hook.
            // This verifies native MediaStore and bridge behavior without claiming a real ad view.
            js(scenario,"document.getElementById('save-button').click()");
            assertNotNull(device.wait(Until.findObject(By.text("광고 시청")),12000));
            scenario.onActivity(activity->{try{
                Object request=field(activity,"saveRequest");ExportSession session=(ExportSession)field(request,"session");session.earned();assertTrue(session.dismiss());
                Method method=MainActivity.class.getDeclaredMethod("saveImage",request.getClass());method.setAccessible(true);method.invoke(activity,request);
            }catch(Exception e){throw new RuntimeException(e);}});
            waitJs(scenario,"!savingImage",15);assertEquals(before+1,imageCount());
            device.findObject(By.text("취소")).click();
            assertEquals("true",js(scenario,"document.getElementById('toast').textContent.includes('저장')"));
            // Exercise actual Google test-ad loading separately; failure must never save a file.
            if("true".equals(InstrumentationRegistry.getArguments().getString("liveAd"))){
                int beforeAd=imageCount();
                js(scenario,"document.getElementById('save-button').click()");device.wait(Until.findObject(By.text("광고 시청")),12000).click();Thread.sleep(35000);
                File folder=new File(context.getExternalFilesDir(null),"qa");folder.mkdirs();device.dumpWindowHierarchy(new File(folder,"android-test-ad.xml"));
                UiObject2 close=device.findObject(By.desc(java.util.regex.Pattern.compile("(?i).*(close|닫기).*")));
                if(close==null)close=device.findObject(By.text(java.util.regex.Pattern.compile("(?i)close|닫기")));
                assertNotNull("Google test ad did not expose a close button after viewing; inspect android-test-ad.xml",close);close.click();
                waitJs(scenario,"!savingImage",30);assertEquals("Completed SDK test ad must save one image",beforeAd+1,imageCount());
            }
        }
    }
    @Test public void oldVersionCannotOpenEditor()throws Exception{
        Intent intent=new Intent(context,MainActivity.class).putExtra("qa_update",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(intent)){
            assertNotNull(device.wait(Until.findObject(By.text("업데이트가 필요합니다")),12000));
            assertNotNull(device.findObject(By.text("스토어에서 업데이트")));
            assertEquals("false",js(scenario,"typeof livePhoto!=='undefined'"));capture(scenario,"android-forced-update");
        }
    }
    @Test public void failedVersionCheckCannotOpenEditor()throws Exception{
        Intent intent=new Intent(context,MainActivity.class).putExtra("qa_offline",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(intent)){
            assertNotNull(device.wait(Until.findObject(By.text("버전을 확인하지 못했어요")),12000));
            assertEquals("false",js(scenario,"typeof livePhoto!=='undefined'"));capture(scenario,"android-version-unavailable");
        }
    }
}
