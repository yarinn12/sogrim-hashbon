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
    private boolean refreshWebBundleCacheOnLoad;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        refreshWebBundleCacheOnLoad = savedInstanceState == null;
        long splashDeadline = SystemClock.uptimeMillis() + SPLASH_SAFETY_TIMEOUT_MS;
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> {
            if (SystemClock.uptimeMillis() >= splashDeadline) return false;
            return !webSplashReady;
        });

        registerPlugin(SogrimCapabilitiesPlugin.class);
        super.onCreate(savedInstanceState);

        applySystemBarStyle();
        getWindow().getDecorView().post(this::applySystemBarStyle);

        if (BuildConfig.NATIVE_QA_WEBVIEW) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(Color.WHITE);
        }
    }

    @Override
    protected void load() {
        // BridgeActivity has inflated the WebView, but has not yet built the
        // Bridge or requested the first bundled page. Invalidate resource cache
        // at this boundary, retaining cookies and storage without a second load.
        boolean refreshCache = refreshWebBundleCacheOnLoad;
        refreshWebBundleCacheOnLoad = false;
        if (refreshCache) {
            WebView appWebView = findViewById(com.getcapacitor.android.R.id.webview);
            if (appWebView != null && shouldRefreshWebBundleCache()) {
                appWebView.clearCache(true);
                markWebBundleCacheRefreshed();
            }
        }
        super.load();
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
        return true;
    }

    private void markWebBundleCacheRefreshed() {
        if (BuildConfig.NATIVE_QA_WEBVIEW) return;

        // A throwing clear must leave the update pending for the next launch.
        getSharedPreferences(WEB_BUNDLE_CACHE_PREFS, MODE_PRIVATE)
            .edit()
            .putInt(WEB_BUNDLE_VERSION_KEY, BuildConfig.VERSION_CODE)
            .apply();
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
