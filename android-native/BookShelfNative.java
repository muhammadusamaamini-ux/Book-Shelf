package com.usama.bookshelf;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "BookShelfNative")
public class BookShelfNative extends Plugin {
    private static File pendingFile;
    private static String pendingName;
    private static String pendingMime;
    private byte[] pendingSave;
    private static String pendingUpdate;
    private static boolean pendingUpdateGo;

    /** Copies a file opened with "Open with" / "Share" into the app cache. Returns true if a file was taken. */
    static boolean handleIntent(Activity a, Intent i) {
        if (i == null) return false;
        String upd = i.getStringExtra("bookshelf_update");
        if (upd != null) {
            pendingUpdate = upd;
            pendingUpdateGo = i.getBooleanExtra("bookshelf_update_go", false);
            i.removeExtra("bookshelf_update");
            i.removeExtra("bookshelf_update_go");
            NotificationManagerCompat.from(a).cancel(UpdateWorker.NOTE_ID);
            return true;
        }
        String act = i.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(act)) uri = i.getData();
        else if (Intent.ACTION_SEND.equals(act)) uri = i.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return false;
        try {
            String name = queryName(a, uri);
            File dir = new File(a.getCacheDir(), "incoming");
            dir.mkdirs();
            File f = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", "_"));
            try (InputStream in = a.getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(f)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            pendingFile = f;
            pendingName = name;
            pendingMime = a.getContentResolver().getType(uri);
            i.setAction(Intent.ACTION_MAIN);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static String queryName(Context c, Uri uri) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor cur = c.getContentResolver().query(uri, null, null, null, null)) {
                if (cur != null && cur.moveToFirst()) {
                    int idx = cur.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0) name = cur.getString(idx);
                }
            } catch (Exception ignored) { }
        }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null || name.isEmpty()) name = "file";
        return name;
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            ret.put("version", pi.versionName);
        } catch (Exception e) {
            ret.put("version", "0.0.0");
        }
        call.resolve(ret);
    }

    /** Turns the background update check (with its notification) on or off. */
    @PluginMethod
    public void updateSettings(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("background", true));
        int hours = call.getInt("hours", 24);
        String skipped = call.getString("skipped", "");
        getContext().getSharedPreferences(UpdateWorker.PREFS, Context.MODE_PRIVATE).edit().putString("skipped", skipped).apply();
        try { UpdateWorker.schedule(getContext(), on, hours); } catch (Exception e) { call.reject("Couldn't schedule the update check: " + e.getMessage()); return; }
        call.resolve();
    }

    @PluginMethod
    public void notifyPermission(PluginCall call) {
        JSObject r = new JSObject();
        boolean granted = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(getContext(), "android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
        r.put("granted", granted && NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        r.put("canAsk", Build.VERSION.SDK_INT >= 33 && !granted);
        call.resolve(r);
    }

    @PluginMethod
    public void requestNotifyPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            getActivity().requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 4711);
        } else if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            Intent s = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { getContext().startActivity(s); } catch (Exception ignored) { }
        }
        call.resolve();
    }

    /** A tap on the update notification opened the app. */
    @PluginMethod
    public void getPendingUpdate(PluginCall call) {
        JSObject r = new JSObject();
        if (pendingUpdate != null) { r.put("version", pendingUpdate); r.put("go", pendingUpdateGo); pendingUpdate = null; pendingUpdateGo = false; }
        call.resolve(r);
    }

    @PluginMethod
    public void getPendingFile(PluginCall call) {
        JSObject ret = new JSObject();
        if (pendingFile != null && pendingFile.exists()) {
            ret.put("path", pendingFile.getAbsolutePath());
            ret.put("name", pendingName);
            ret.put("mime", pendingMime);
            pendingFile = null;
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name", "file");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("data", "");
        pendingSave = Base64.decode(data, Base64.DEFAULT);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "saveResult");
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        JSObject ret = new JSObject();
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(result.getData().getData())) {
            out.write(pendingSave);
            ret.put("saved", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("The file couldn't be written: " + e.getMessage());
        } finally {
            pendingSave = null;
        }
    }

    /** Lets the person choose a folder (phone storage, SD card, Google Drive...). */
    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "folderResult");
    }

    @ActivityCallback
    private void folderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(ret);
            return;
        }
        Uri tree = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception ignored) { }
        String name = "";
        try {
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            try (Cursor c = getContext().getContentResolver().query(doc, new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            }
        } catch (Exception ignored) { }
        ret.put("uri", tree.toString());
        ret.put("name", name);
        call.resolve(ret);
    }

    /** Writes one file into a folder chosen with pickFolder. */
    @PluginMethod
    public void writeToFolder(PluginCall call) {
        String uri = call.getString("uri");
        String name = call.getString("name", "file");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("data", "");
        if (uri == null) { call.reject("No folder"); return; }
        try {
            Uri tree = Uri.parse(uri);
            Uri dir = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            Uri file = DocumentsContract.createDocument(getContext().getContentResolver(), dir, mime, name);
            if (file == null) throw new Exception("the folder didn't accept a new file");
            try (OutputStream out = getContext().getContentResolver().openOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            JSObject ret = new JSObject();
            ret.put("saved", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("The file couldn't be written: " + e.getMessage());
        }
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        String url = call.getString("url");
        if (url == null) { call.reject("No download address"); return; }
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(s);
            JSObject r = new JSObject();
            r.put("needsPermission", true);
            call.resolve(r);
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(ctx.getCacheDir(), "updates");
                dir.mkdirs();
                File apk = new File(dir, "book-shelf-update.apk");
                String next = url;
                HttpURLConnection con = null;
                for (int hop = 0; hop < 6; hop++) {
                    con = (HttpURLConnection) new URL(next).openConnection();
                    con.setInstanceFollowRedirects(false);
                    con.setConnectTimeout(20000);
                    con.setReadTimeout(60000);
                    con.setRequestProperty("Accept", "application/octet-stream");
                    int code = con.getResponseCode();
                    if (code >= 300 && code < 400) { next = con.getHeaderField("Location"); con.disconnect(); continue; }
                    if (code != 200) throw new Exception("Download failed (" + code + ")");
                    break;
                }
                long total = con.getContentLengthLong();
                long loaded = 0, lastSent = 0;
                try (InputStream in = con.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        loaded += n;
                        if (loaded - lastSent > 262144) {
                            lastSent = loaded;
                            JSObject p = new JSObject();
                            p.put("loaded", loaded);
                            p.put("total", total);
                            notifyListeners("downloadProgress", p);
                        }
                    }
                }
                Uri u = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
                Intent in = new Intent(Intent.ACTION_VIEW);
                in.setDataAndType(u, "application/vnd.android.package-archive");
                in.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(in);
                JSObject r = new JSObject();
                r.put("started", true);
                call.resolve(r);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "The update couldn't be downloaded");
            }
        }).start();
    }
}
