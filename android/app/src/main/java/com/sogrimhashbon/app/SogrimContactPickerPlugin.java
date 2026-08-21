package com.sogrimhashbon.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SogrimContactPicker")
public class SogrimContactPickerPlugin extends Plugin {
    private static final int MAX_DISPLAY_NAME_CODE_POINTS = 48;
    private static final int MAX_RAW_DISPLAY_NAME_CHARS = 256;

    @PluginMethod
    public void pickContact(PluginCall call) {
        Intent intent = new Intent(
            Intent.ACTION_PICK,
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI
        );
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("Contact picker is unavailable", "CONTACT_PICKER_UNAVAILABLE");
            return;
        }
        startActivityForResult(call, intent, "contactPicked");
    }

    @ActivityCallback
    private void contactPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject payload = new JSObject();
            payload.put("cancelled", true);
            call.resolve(payload);
            return;
        }

        Uri contactUri = result.getData().getData();
        if (contactUri == null) {
            call.reject("Selected contact is unavailable", "CONTACT_MISSING");
            return;
        }

        String[] projection = {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
        };
        try (
            Cursor cursor = getContext().getContentResolver().query(
                contactUri,
                projection,
                null,
                null,
                null
            )
        ) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("Selected contact is unavailable", "CONTACT_MISSING");
                return;
            }
            String displayName = normalizeDisplayName(cursor.getString(0));
            if (displayName.isEmpty()) {
                call.reject("Selected contact has no name", "CONTACT_NAME_MISSING");
                return;
            }

            JSObject payload = new JSObject();
            payload.put("cancelled", false);
            payload.put("displayName", displayName);
            call.resolve(payload);
        } catch (Exception error) {
            call.reject("Selected contact could not be read", "CONTACT_READ_FAILED", error);
        }
    }

    private String normalizeDisplayName(String value) {
        if (value == null) return "";
        String bounded = value.length() > MAX_RAW_DISPLAY_NAME_CHARS
            ? value.substring(0, MAX_RAW_DISPLAY_NAME_CHARS)
            : value;
        String normalized = bounded
            .replaceAll("[\\p{Cc}\\p{Cf}]", "")
            .trim()
            .replaceAll("\\s+", " ");
        int codePointCount = normalized.codePointCount(0, normalized.length());
        if (codePointCount <= MAX_DISPLAY_NAME_CODE_POINTS) return normalized;
        int endIndex = normalized.offsetByCodePoints(0, MAX_DISPLAY_NAME_CODE_POINTS);
        return normalized.substring(0, endIndex).trim();
    }
}
