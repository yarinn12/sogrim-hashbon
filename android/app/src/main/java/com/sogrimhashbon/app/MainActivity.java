package com.sogrimhashbon.app;

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
            getBridge().getWebView().setBackgroundColor(Color.WHITE);
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
