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
            String displayName = cursor.getString(0);
            if (displayName == null || displayName.trim().isEmpty()) {
                call.reject("Selected contact has no name", "CONTACT_NAME_MISSING");
                return;
            }

            JSObject payload = new JSObject();
            payload.put("cancelled", false);
            payload.put("displayName", displayName.trim());
            call.resolve(payload);
        } catch (Exception error) {
            call.reject("Selected contact could not be read", "CONTACT_READ_FAILED", error);
        }
    }
}
