package app.hwasaek.android;

import android.app.AlertDialog;
import android.content.*;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.webkit.*;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.google.android.gms.ads.*;
import com.google.android.gms.ads.rewarded.*;
import com.google.android.ump.*;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;

public class MainActivity extends ComponentActivity {
    static final String ORIGIN="https://appassets.androidplatform.net";
    static final String HOME=ORIGIN+"/assets/web/index.html";
    static final String SITE="https://hwasaek.vercel.app";
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Handler main=new Handler(Looper.getMainLooper());
    private WebView web;
    private FrameLayout root;
    private LinearLayout gate;
    private ScrollView gateScroll;
    private TextView gateTitle,gateText;
    private Button gateAction;
    private boolean checking, ready, loaded, adsInitialized, adBusy, foreground, webSupported=true;
    private volatile boolean destroyed;
    private ConsentInformation consent;
    private ValueCallback<Uri[]> pickerCallback;
    private SaveRequest saveRequest;
    private final Runnable refresh=new Runnable(){public void run(){if(adBusy)main.postDelayed(this,30000);else checkVersion();}};
    private final ActivityResultLauncher<PickVisualMediaRequest> picker=registerForActivityResult(
        new ActivityResultContracts.PickVisualMedia(),uri->{if(pickerCallback!=null){pickerCallback.onReceiveValue(uri==null?null:new Uri[]{uri});pickerCallback=null;}}
    );

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        root=new FrameLayout(this);root.setBackgroundColor(0xfffaf9f7);setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root,(view,insets)->{
            androidx.core.graphics.Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()|WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
        });
        web=new WebView(this);root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        createGate();configureWeb();
        consent=UserMessagingPlatform.getConsentInformation(this);
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){@Override public void handleOnBackPressed(){
            if(!ready){finish();return;}
            web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true;}return false;})()",value->{
                if(!"true".equals(value))new AlertDialog.Builder(MainActivity.this).setTitle("화색을 종료할까요?").setMessage("저장하지 않은 편집 내용은 사라집니다.").setNegativeButton("계속 편집",null).setPositiveButton("종료",(d,w)->finish()).show();
            });
        }});
    }

    private void configureWeb(){
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
        if(WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING))WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings,false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            webSupported=false;showGate("WebView 업데이트가 필요합니다","Android System WebView를 업데이트한 뒤 화색을 다시 실행해주세요.","WebView 업데이트",()->openUrl("https://play.google.com/store/apps/details?id=com.google.android.webview"));return;
        }
        WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                if(!"https".equals(uri.getScheme())||!"appassets.androidplatform.net".equals(uri.getHost()))return blocked();
                WebResourceResponse result=loader.shouldInterceptRequest(uri);
                if(result!=null&&uri.getPath()!=null){if(uri.getPath().endsWith(".wasm"))result.setMimeType("application/wasm");if(uri.getPath().endsWith(".mjs"))result.setMimeType("text/javascript");}
                return result!=null?result:blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                if(request.isForMainFrame()&&!uri.toString().equals(HOME)){
                    if("https".equals(uri.getScheme())&&"hwasaek.vercel.app".equals(uri.getHost()))openUrl(uri.toString());
                    return true;
                }
                return false;
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
                if(request.isForMainFrame())showGate("화면을 열지 못했어요","Android System WebView를 업데이트하고 다시 시도해주세요.","다시 시도",()->{loaded=false;checkVersion();});
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(!ready)return false;
                if(pickerCallback!=null)pickerCallback.onReceiveValue(null);pickerCallback=callback;
                picker.launch(new PickVisualMediaRequest.Builder().setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE).build());return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
        });
        WebViewCompat.addWebMessageListener(web,"HwasaekNative",java.util.Collections.singleton(ORIGIN),(view,message,source,isMainFrame,reply)->{
            if(!isMainFrame||!ORIGIN.equals(source.toString())||!ready)return;
            try{
                JSONObject data=new JSONObject(message.getData());String id=data.getString("id"),type=data.getString("type");
                if(!id.matches("[a-zA-Z0-9-]{1,80}"))return;
                if("info".equals(type)){showInfo();reply(reply,id,true,"");}
                else if("save".equals(type))requestSave(data,id,reply);
            }catch(Exception ignored){/* Reject malformed or untrusted messages without logging photo data. */}
        });
        // Download URLs cannot bypass the native rewarded-export flow.
        web.setDownloadListener((url,userAgent,disposition,mime,length)->{});
    }
    private static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    private Button button(String text,Runnable action){Button b=new Button(this);b.setText(text);b.setMinHeight(dp(48));b.setOnClickListener(v->action.run());return b;}
    private int dp(int n){return Math.round(getResources().getDisplayMetrics().density*n);}
    private void createGate(){
        gateScroll=new ScrollView(this);gateScroll.setFillViewport(true);gateScroll.setBackgroundColor(0xfffaf9f7);
        gate=new LinearLayout(this);gate.setOrientation(LinearLayout.VERTICAL);gate.setGravity(Gravity.CENTER);gate.setPadding(dp(24),dp(24),dp(24),dp(24));gate.setBackgroundColor(0xfffaf9f7);gate.setClickable(true);
        gateTitle=new TextView(this);gateTitle.setTextSize(24);gateTitle.setTextColor(0xff5b21b6);gate.addView(gateTitle);
        gateText=new TextView(this);gateText.setTextSize(16);gateText.setPadding(0,dp(20),0,dp(20));gateText.setTextColor(0xff292526);gate.addView(gateText);
        gateAction=button("다시 확인",this::checkVersion);gateAction.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xff5b21b6));gateAction.setTextColor(0xffffffff);gate.addView(gateAction);
        gate.addView(button("개인정보 처리방침",()->openUrl(SITE+"/privacy.html")));
        gate.addView(button("이용약관",()->openUrl(SITE+"/terms.html")));
        gate.addView(button("종료",this::finish));gateScroll.addView(gate,new ScrollView.LayoutParams(-1,-2));root.addView(gateScroll,new FrameLayout.LayoutParams(-1,-1));
    }
    private void showGate(String title,String text,String action,Runnable click){ready=false;gateTitle.setText(title);gateText.setText(text);gateAction.setText(action);gateAction.setOnClickListener(v->click.run());gateScroll.setVisibility(View.VISIBLE);web.setVisibility(View.INVISIBLE);}
    @Override public void onResume(){super.onResume();foreground=true;web.onResume();if(webSupported&&!adBusy)checkVersion();}
    @Override public void onPause(){super.onPause();foreground=false;web.onPause();main.removeCallbacks(refresh);}
    private void checkVersion(){
        if(checking||destroyed)return;checking=true;
        showGate("화색","최신 버전을 확인하고 있어요.","확인 중",()->{});gateAction.setEnabled(false);
        worker.execute(()->{
            try{
                JSONObject policy;
                if(BuildConfig.DEBUG&&getIntent().getBooleanExtra("qa_update",false))policy=new JSONObject("{\"schemaVersion\":1,\"packageName\":\"app.hwasaek.android\",\"latestVersionCode\":2,\"minimumVersionCode\":2}");
                else {
                    if(BuildConfig.DEBUG&&getIntent().getBooleanExtra("qa_offline",false))throw new IOException();
                    HttpURLConnection connection=(HttpURLConnection)new URL(SITE+"/android-release.json").openConnection();
                    connection.setConnectTimeout(7000);connection.setReadTimeout(7000);connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);connection.setRequestProperty("Cache-Control","no-cache");
                    try{if(connection.getResponseCode()!=200)throw new IOException();ByteArrayOutputStream buffer=new ByteArrayOutputStream();try(InputStream stream=connection.getInputStream()){byte[] chunk=new byte[2048];int count;while((count=stream.read(chunk))!=-1){buffer.write(chunk,0,count);if(buffer.size()>16384)throw new IOException();}}policy=new JSONObject(buffer.toString("UTF-8"));}finally{connection.disconnect();}
                }
                if(policy.getInt("schemaVersion")!=1||!getPackageName().equals(policy.getString("packageName")))throw new IOException();
                boolean mustUpdate=VersionPolicy.requiresUpdate(BuildConfig.VERSION_CODE,policy.getInt("latestVersionCode"),policy.getInt("minimumVersionCode"));
                main.post(()->{if(destroyed)return;checking=false;gateAction.setEnabled(true);
                    if(mustUpdate)showGate("업데이트가 필요합니다","새 버전의 화색을 설치해야 계속 사용할 수 있습니다.","스토어에서 업데이트",this::openStore);
                    else{openEditor();main.removeCallbacks(refresh);main.postDelayed(refresh,300000);}
                });
            }catch(Exception e){main.post(()->{if(destroyed)return;checking=false;gateAction.setEnabled(true);showGate("버전을 확인하지 못했어요","인터넷 연결을 확인하고 다시 시도해주세요. 버전 확인 전에는 앱을 사용할 수 없습니다.","다시 확인",this::checkVersion);});}
        });
    }
    private void openEditor(){
        if(!getPreferences(MODE_PRIVATE).getBoolean("privacyNoticeSeen",false)){
            showGate("사진과 광고 안내","사진과 얼굴 분석은 기기 안에서 처리하며 서버로 보내지 않습니다. 사진 저장 시 보상형 광고를 사용합니다. Google 광고 SDK는 광고 식별자·IP 주소·광고 이용 정보를 처리할 수 있습니다. 자세한 내용은 아래 개인정보 처리방침에서 확인할 수 있습니다.","확인하고 시작",()->{getPreferences(MODE_PRIVATE).edit().putBoolean("privacyNoticeSeen",true).apply();openEditor();});return;
        }
        ready=true;gateScroll.setVisibility(View.GONE);web.setVisibility(View.VISIBLE);if(!loaded){loaded=true;web.loadUrl(HOME);}
    }
    private void openStore(){
        try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("market://details?id="+getPackageName())).setPackage("com.android.vending"));}
        catch(ActivityNotFoundException e){openUrl("https://play.google.com/store/apps/details?id="+getPackageName());}
    }
    private void openUrl(String url){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(ActivityNotFoundException e){Toast.makeText(this,"연결할 앱이 없습니다.",Toast.LENGTH_LONG).show();}}
    private void showInfo(){
        String[] labels={"사용 방법","개인정보 처리방침","이용약관","광고 개인정보 설정","문의 · 앱 버전 "+BuildConfig.VERSION_NAME};
        new AlertDialog.Builder(this).setTitle("화색").setItems(labels,(d,which)->{
            if(which==0)web.evaluateJavascript("window.HwasaekTour.open()",null);
            if(which==1)openUrl(SITE+"/privacy.html");if(which==2)openUrl(SITE+"/terms.html");
            if(which==3)showPrivacyOptions();
            if(which==4)openUrl("mailto:appleap385@gmail.com?subject=Hwasaek%20"+BuildConfig.VERSION_NAME);
        }).setNegativeButton("닫기",null).show();
    }
    private void showPrivacyOptions(){
        consent.requestConsentInfoUpdate(this,new ConsentRequestParameters.Builder().build(),()->{
            if(destroyed)return;
            if(consent.getPrivacyOptionsRequirementStatus()==ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED)UserMessagingPlatform.showPrivacyOptionsForm(this,error->{if(error!=null)Toast.makeText(this,"설정을 불러오지 못했어요. 다시 시도해주세요.",Toast.LENGTH_LONG).show();});
            else Toast.makeText(this,"현재 지역에서 변경할 광고 동의 항목이 없습니다.",Toast.LENGTH_LONG).show();
        },error->Toast.makeText(this,"광고 개인정보 설정을 확인하지 못했어요. 인터넷 연결을 확인해주세요.",Toast.LENGTH_LONG).show());
    }
    static void reply(JavaScriptReplyProxy proxy,String id,boolean ok,String message){
        try{proxy.postMessage(new JSONObject().put("id",id).put("ok",ok).put("message",message).toString());}catch(Exception ignored){}
    }
    private static final class SaveRequest {
        final String id;final JavaScriptReplyProxy reply;final byte[] image;final ExportSession session=new ExportSession();boolean finished,showing;
        SaveRequest(String id,JavaScriptReplyProxy reply,byte[] image){this.id=id;this.reply=reply;this.image=image;}
    }
    private void requestSave(JSONObject data,String id,JavaScriptReplyProxy proxy){
        if(saveRequest!=null||adBusy){reply(proxy,id,false,"다른 저장이 진행 중입니다.");return;}
        try{
            String encoded=data.getString("png");if(encoded.length()>8000000)throw new IOException();
            byte[] bytes=Base64.decode(encoded,Base64.NO_WRAP);BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);
            if(bytes.length<8||bytes[0]!=(byte)137||bytes[1]!=80||bytes[2]!=78||bytes[3]!=71||bounds.outWidth<1||bounds.outHeight<1||bounds.outWidth>1600||bounds.outHeight>1600)throw new IOException();
            SaveRequest request=new SaveRequest(id,proxy,bytes);saveRequest=request;adBusy=true;
            new AlertDialog.Builder(this).setTitle("이미지 저장").setMessage("광고 시청 후 다운로드가 시작됩니다.\n광고 시청을 완료하면 이 사진 1장이 저장됩니다.")
                .setNegativeButton("취소",(d,w)->finishRequest(request,false,"저장을 취소했어요."))
                .setPositiveButton("광고 시청",(d,w)->gatherConsent(request)).setOnCancelListener(d->finishRequest(request,false,"저장을 취소했어요.")).show();
        }catch(Exception e){reply(proxy,id,false,"이미지를 준비하지 못했어요. 다시 시도해주세요.");}
    }
    private void gatherConsent(SaveRequest request){
        if(!active(request))return;
        Toast.makeText(this,"광고를 준비하고 있어요.",Toast.LENGTH_SHORT).show();
        consent.requestConsentInfoUpdate(this,new ConsentRequestParameters.Builder().build(),()->{
            if(!active(request))return;
            UserMessagingPlatform.loadAndShowConsentFormIfRequired(this,error->{if(!active(request))return;if(consent.canRequestAds())initializeAds(request);else finishRequest(request,false,"광고 동의 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");});
        },error->{if(!active(request))return;if(consent.canRequestAds())initializeAds(request);else finishRequest(request,false,"광고 개인정보 설정을 확인하지 못했어요. 다시 시도해주세요.");});
    }
    private boolean active(SaveRequest request){return !destroyed&&saveRequest==request&&!request.finished;}
    private void initializeAds(SaveRequest request){
        // The ad timeout must not limit how long a user may read a consent form.
        main.postDelayed(()->{if(active(request)&&!request.showing)finishRequest(request,false,"광고를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");},45000);
        if(adsInitialized){loadAd(request);return;}
        MobileAds.initialize(this,status->main.post(()->{adsInitialized=true;if(active(request))loadAd(request);}));
    }
    private void loadAd(SaveRequest request){
        if(!active(request))return;
        RewardedAd.load(this,BuildConfig.REWARDED_AD_UNIT_ID,new AdRequest.Builder().build(),new RewardedAdLoadCallback(){
            @Override public void onAdFailedToLoad(@NonNull LoadAdError error){finishRequest(request,false,"지금 표시할 광고가 없어요. 잠시 후 다시 시도해주세요.");}
            @Override public void onAdLoaded(@NonNull RewardedAd ad){
                if(!active(request))return;
                if(!hasWindowFocus()){finishRequest(request,false,"앱으로 돌아온 뒤 저장을 다시 시도해주세요.");return;}
                request.showing=true;
                ad.setFullScreenContentCallback(new FullScreenContentCallback(){
                    @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError error){finishRequest(request,false,"광고를 표시하지 못했어요. 다시 시도해주세요.");}
                    @Override public void onAdDismissedFullScreenContent(){if(!active(request))return;if(request.session.dismiss())saveImage(request);else finishRequest(request,false,"광고 시청이 완료되지 않아 저장하지 않았어요.");}
                });
                ad.show(MainActivity.this,reward->{if(active(request))request.session.earned();});
            }
        });
    }
    private void saveImage(SaveRequest request){
        if(!active(request))return;
        final byte[] image=request.image.clone();
        worker.execute(()->{
            Uri output=null;
            try{
                if(destroyed||Thread.currentThread().isInterrupted())throw new IOException();
                ContentValues values=new ContentValues();values.put(MediaStore.Images.Media.DISPLAY_NAME,"hwasaek-"+System.currentTimeMillis()+".png");values.put(MediaStore.Images.Media.MIME_TYPE,"image/png");values.put(MediaStore.Images.Media.RELATIVE_PATH,"Pictures/Hwasaek");values.put(MediaStore.Images.Media.IS_PENDING,1);
                output=getContentResolver().insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),values);if(output==null)throw new IOException();
                try(OutputStream stream=getContentResolver().openOutputStream(output)){if(stream==null)throw new IOException();stream.write(image);}
                if(destroyed||Thread.currentThread().isInterrupted())throw new IOException();
                values.clear();values.put(MediaStore.Images.Media.IS_PENDING,0);if(getContentResolver().update(output,values,null,null)!=1)throw new IOException();
                main.post(()->finishRequest(request,true,""));
            }catch(Exception e){if(output!=null)getContentResolver().delete(output,null,null);main.post(()->finishRequest(request,false,"사진을 저장하지 못했어요. 저장 공간을 확인해주세요."));}
            finally{java.util.Arrays.fill(image,(byte)0);}
        });
    }
    private void finishRequest(SaveRequest request,boolean ok,String message){
        if(!active(request))return;request.finished=true;if(!ok)request.session.cancel();saveRequest=null;adBusy=false;
        java.util.Arrays.fill(request.image,(byte)0);reply(request.reply,request.id,ok,message);
        main.removeCallbacks(refresh);if(foreground)main.postDelayed(refresh,300000);
    }
    @Override public void onDestroy(){
        destroyed=true;main.removeCallbacksAndMessages(null);
        if(saveRequest!=null){saveRequest.session.cancel();java.util.Arrays.fill(saveRequest.image,(byte)0);saveRequest=null;}
        if(pickerCallback!=null)pickerCallback.onReceiveValue(null);
        web.stopLoading();web.destroy();worker.shutdownNow();super.onDestroy();
    }
}
