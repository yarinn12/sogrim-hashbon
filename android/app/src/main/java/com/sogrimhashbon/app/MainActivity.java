package com.sogrimhashbon.app;

import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final long SPLASH_SAFETY_TIMEOUT_MS = 2_500L;
    private static final String WEB_BUNDLE_CACHE_PREFS = "sogrim_web_bundle_cache";
    private static final String WEB_BUNDLE_VERSION_KEY = "installed_version_code";
    private boolean lightStatusBars = true;
    private volatile boolean webSplashReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        long splashDeadline = SystemClock.uptimeMillis() + SPLASH_SAFETY_TIMEOUT_MS;
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> {
            if (SystemClock.uptimeMillis() >= splashDeadline) return false;
            return !webSplashReady;
        });

        registerPlugin(SogrimCapabilitiesPlugin.class);
        registerPlugin(SogrimContactPickerPlugin.class);
        super.onCreate(savedInstanceState);

        applySystemBarStyle();
        getWindow().getDecorView().post(this::applySystemBarStyle);

        if (BuildConfig.NATIVE_QA_WEBVIEW) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView appWebView = getBridge().getWebView();
            appWebView.setBackgroundColor(Color.WHITE);

            // Capacitor serves bundled files through a local WebView origin. Android can
            // otherwise retain an older HTTP response after an in-place app update even
            // though the APK already contains the new assets. Clear only the WebView's
            // resource cache (not cookies, localStorage, or app data) and reload once when
            // the installed version changes so users always see the bundled update.
            if (savedInstanceState == null && shouldRefreshWebBundleCache()) {
                appWebView.clearCache(true);
                appWebView.post(appWebView::reload);
            }
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applySystemBarStyle();
    }

    public void setLightStatusBars(boolean light) {
        lightStatusBars = light;
        runOnUiThread(this::applySystemBarStyle);
    }

    public void setWebSplashReady() {
        webSplashReady = true;
    }

    private boolean shouldRefreshWebBundleCache() {
        if (BuildConfig.NATIVE_QA_WEBVIEW) return true;

        SharedPreferences preferences = getSharedPreferences(
            WEB_BUNDLE_CACHE_PREFS,
            MODE_PRIVATE
        );
        int installedVersion = preferences.getInt(WEB_BUNDLE_VERSION_KEY, -1);
        if (installedVersion == BuildConfig.VERSION_CODE) return false;

        preferences.edit()
            .putInt(WEB_BUNDLE_VERSION_KEY, BuildConfig.VERSION_CODE)
            .apply();
        return true;
    }

    private void applySystemBarStyle() {
        WindowInsetsControllerCompat systemBars = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
        );
        systemBars.setAppearanceLightStatusBars(lightStatusBars);
        systemBars.setAppearanceLightNavigationBars(true);
        getWindow().setNavigationBarColor(
            lightStatusBars ? Color.rgb(217, 213, 207) : Color.WHITE
        );
    }
}
