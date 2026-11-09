package com.usama.bookshelf;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BookShelfNative.class);
        super.onCreate(savedInstanceState);
        BookShelfNative.handleIntent(this, getIntent());

        // Back button: let the app close what is open (a book, a panel, a menu) and go back to the shelf.
        // Only when the shelf itself is showing does Back leave the app.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv == null) { leave(); return; }
                wv.evaluateJavascript("(window.bookshelfBack&&window.bookshelfBack())?'1':'0'", value -> {
                    if (!"\"1\"".equals(value)) leave();
                });
            }
        });
    }

    private void leave() {
        moveTaskToBack(true);
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
