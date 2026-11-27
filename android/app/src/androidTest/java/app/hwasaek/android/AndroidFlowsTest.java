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
        if(name.contains("editor")||name.contains("onboarding")||name.contains("welcome")){
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
        context.getSharedPreferences("MainActivity",Context.MODE_PRIVATE).edit().putBoolean("privacyNoticeSeen",false).commit();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            UiObject2 begin=device.wait(Until.findObject(By.text("확인하고 시작")),20000);assertNotNull(begin);
            assertEquals("false",js(scenario,"HwasaekPhotoEngine.workerActive"));
            assertEquals("true",js(scenario,"document.getElementById('portrait').naturalWidth>0"));
            capture(scenario,"android-welcome");
            device.executeShellCommand("wm size 880x1912");Thread.sleep(1200);capture(scenario,"android-welcome-440");
            device.executeShellCommand("wm size 720x1280");Thread.sleep(1200);
            js(scenario,"window.HwasaekTour.open()");device.wait(Until.findObject(By.text("확인하고 시작")),10000).click();
            assertEquals("false",js(scenario,"HwasaekPhotoEngine.workerActive"));
            long tapStarted=System.currentTimeMillis();
            js(scenario,"document.getElementById('onboarding-next').click()");
            long tourResponse=System.currentTimeMillis()-tapStarted;System.out.println("First tour next response: "+tourResponse+"ms");
            assertTrue("First onboarding must respond without cold model initialization",tourResponse<2000);
            assertEquals("\"메이크업과 저장\"",js(scenario,"document.getElementById('onboarding-title').textContent"));
            js(scenario,"document.getElementById('onboarding-next').click()");
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
            int before=imageCount();
            for(int attempt=0;attempt<3;attempt++){
                java.util.concurrent.atomic.AtomicLong laidOutAt=new java.util.concurrent.atomic.AtomicLong();
                AtomicReference<android.view.ViewTreeObserver.OnGlobalLayoutListener> observer=new AtomicReference<>();
                scenario.onActivity(a->{try{
                    android.view.View host=(android.view.View)field(a,"root");
                    observer.set(()->{try{android.view.View layer=(android.view.View)field(a,"popup");if(layer!=null&&layer.getWidth()>0)laidOutAt.compareAndSet(0,System.currentTimeMillis());}catch(Exception e){throw new RuntimeException(e);}});
                    host.getViewTreeObserver().addOnGlobalLayoutListener(observer.get());
                }catch(Exception e){throw new RuntimeException(e);}});
                long started=System.currentTimeMillis();js(scenario,"document.getElementById('save-button').click()");
                assertNotNull(device.wait(Until.findObject(By.text("사진을 저장할까요?")),2000));
                long elapsed=laidOutAt.get()-started;System.out.println("Save popup layout attempt "+attempt+": "+elapsed+"ms (automation wait "+(System.currentTimeMillis()-started)+"ms)");
                scenario.onActivity(a->{try{((android.view.View)field(a,"root")).getViewTreeObserver().removeOnGlobalLayoutListener(observer.get());}catch(Exception e){throw new RuntimeException(e);}});
                assertTrue("Popup must have reached layout",laidOutAt.get()>0);
                assertTrue("Repeated cancel must not encode PNG before confirmation",elapsed<2000);
                scenario.onActivity(a->{try{assertNull(field(a,"saveRequest"));}catch(Exception e){throw new RuntimeException(e);}});
                if(attempt==2)capture(scenario,"android-save-confirmation");
                device.findObject(By.text("취소")).click();waitJs(scenario,"!savingImage",10);assertEquals(before,imageCount());
            }
            device.pressBack();assertNotNull(device.wait(Until.findObject(By.text("편집을 마칠까요?")),3000));
            capture(scenario,"android-exit");device.findObject(By.text("계속 편집하기")).click();

            // Exercise actual Google test-ad loading separately; failure must never save a file.
            if("true".equals(InstrumentationRegistry.getArguments().getString("liveAd"))){
                int beforeAd=imageCount();
                js(scenario,"document.getElementById('save-button').click()");device.wait(Until.findObject(By.text("광고 보고 저장")),3000).click();Thread.sleep(35000);
                File folder=new File(context.getExternalFilesDir(null),"qa");folder.mkdirs();device.dumpWindowHierarchy(new File(folder,"android-test-ad.xml"));
                UiObject2 close=device.findObject(By.desc(java.util.regex.Pattern.compile("(?i).*(close|닫기).*")));
                if(close==null)close=device.findObject(By.text(java.util.regex.Pattern.compile("(?i)close|닫기")));
                assertNotNull("Google test ad did not expose a close button after viewing; inspect android-test-ad.xml",close);close.click();
                waitJs(scenario,"!savingImage",30);assertEquals("Completed SDK test ad must save one image",beforeAd+1,imageCount());
            }
        }
        try(ActivityScenario<MainActivity> restarted=ActivityScenario.launch(MainActivity.class)){
            waitJs(restarted,"window.HwasaekApp&&document.readyState==='complete'",20);
            restarted.onActivity(a->{try{assertNull("Welcome must not be created on restart",field(a,"popup"));assertEquals(android.view.View.GONE,((android.view.View)field(a,"gateScroll")).getVisibility());}catch(Exception e){throw new RuntimeException(e);}});
            assertNull(device.findObject(By.text("확인하고 시작")));
        }
    }
    @Test public void unavailableAdPreservesEditingAndAllowsRetry()throws Exception{
        context.getSharedPreferences("MainActivity",Context.MODE_PRIVATE).edit().putBoolean("privacyNoticeSeen",true).commit();
        Intent intent=new Intent(context,MainActivity.class).putExtra("qa_no_ad",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(intent)){
            waitJs(scenario,"Boolean(window.HwasaekApp&&window.HwasaekTour)",20);
            js(scenario,"HwasaekApp.whenStarted.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{document.getElementById('onboarding-dialog').close();resolve()}))))");
            waitJs(scenario,"typeof livePhoto!=='undefined'&&Boolean(livePhoto)&&photoAssessment.status==='ready'",180);
            js(scenario,"document.getElementById('onboarding-dialog').close();document.getElementById('tab-lip').click();document.querySelectorAll('.swatch')[2].click()");
            String editing=js(scenario,"JSON.stringify(state)");int before=imageCount();
            js(scenario,"document.getElementById('save-button').click()");device.wait(Until.findObject(By.text("광고 보고 저장")),3000).click();
            assertNotNull(device.wait(Until.findObject(By.textContains("지금은 볼 수 있는 광고가 없어요")),15000));
            waitJs(scenario,"!savingImage",10);assertEquals(before,imageCount());assertEquals(editing,js(scenario,"JSON.stringify(state)"));
            capture(scenario,"android-no-ad");device.findObject(By.text("다시 시도")).click();
            assertNotNull(device.wait(Until.findObject(By.text("사진을 저장할까요?")),3000));
            device.pressBack();waitJs(scenario,"!savingImage",10);assertEquals(before,imageCount());
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
