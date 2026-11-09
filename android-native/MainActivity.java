package com.usama.bookshelf;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BookShelfNative.class);
        super.onCreate(savedInstanceState);
        BookShelfNative.handleIntent(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (BookShelfNative.handleIntent(this, intent) && getBridge() != null) {
            getBridge().triggerWindowJSEvent("bookshelf-open");
        }
    }
}
