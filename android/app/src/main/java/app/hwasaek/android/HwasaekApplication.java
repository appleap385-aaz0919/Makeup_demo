package app.hwasaek.android;
import android.app.*;
import android.os.Bundle;
import android.view.WindowManager;

/** Apply capture protection to this app's activities, including ad SDK activities. */
public final class HwasaekApplication extends Application implements Application.ActivityLifecycleCallbacks {
    @Override public void onCreate(){super.onCreate();registerActivityLifecycleCallbacks(this);}
    @Override public void onActivityCreated(Activity activity,Bundle state){activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);}
    @Override public void onActivityStarted(Activity activity){}
    @Override public void onActivityResumed(Activity activity){activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);}
    @Override public void onActivityPaused(Activity activity){}
    @Override public void onActivityStopped(Activity activity){}
    @Override public void onActivitySaveInstanceState(Activity activity,Bundle state){}
    @Override public void onActivityDestroyed(Activity activity){}
}
