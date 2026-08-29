package com.sogrimhashbon.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SogrimCapabilities")
public class SogrimCapabilitiesPlugin extends Plugin {

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject result = new JSObject();
        result.put("pushNotifications", BuildConfig.FIREBASE_PUSH_CONFIGURED);
        result.put(
            "fontScale",
            getContext().getResources().getConfiguration().fontScale
        );
        call.resolve(result);
    }

    @PluginMethod
    public void setSystemBarStyle(PluginCall call) {
        boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).setLightStatusBars(light);
        }
        call.resolve();
    }

    @PluginMethod
    public void notifyWebSplashReady(PluginCall call) {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).setWebSplashReady();
        }
        call.resolve();
    }
}
