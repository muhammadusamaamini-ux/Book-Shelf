package com.usama.bookshelf;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Checks GitHub for a newer Book Shelf now and then, even when the app is closed, and shows a notification. */
public class UpdateWorker extends Worker {
    static final String WORK = "bookshelf-update-check";
    static final String CHANNEL = "updates";
    static final String PREFS = "bookshelf-updates";
    static final String RELEASES = "https://api.github.com/repos/muhammadusamaamini-ux/Book-Shelf/releases/latest";
    static final int NOTE_ID = 7101;

    public UpdateWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    static void schedule(Context c, boolean on, int hours) {
        WorkManager wm = WorkManager.getInstance(c);
        if (!on) { wm.cancelUniqueWork(WORK); return; }
        Constraints cons = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(UpdateWorker.class, Math.max(6, hours), TimeUnit.HOURS)
            .setConstraints(cons).setInitialDelay(Math.max(1, hours / 2), TimeUnit.HOURS).build();
        wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, req);
    }

    static boolean newer(String a, String b) {
        String[] x = a.replaceFirst("^v", "").split("\\."), y = b.replaceFirst("^v", "").split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? num(x[i]) : 0, q = i < y.length ? num(y[i]) : 0;
            if (p != q) return p > q;
        }
        return false;
    }
    private static int num(String s) { try { return Integer.parseInt(s.replaceAll("\\D.*$", "")); } catch (Exception e) { return 0; } }

    @NonNull @Override
    public Result doWork() {
        Context c = getApplicationContext();
        try {
            HttpURLConnection con = (HttpURLConnection) new URL(RELEASES).openConnection();
            con.setRequestProperty("Accept", "application/vnd.github+json");
            con.setRequestProperty("User-Agent", "BookShelf-App");
            con.setConnectTimeout(20000);
            con.setReadTimeout(20000);
            if (con.getResponseCode() != 200) return Result.success();
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(con.getInputStream(), "UTF-8"))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
            String ver = new JSONObject(sb.toString()).optString("tag_name", "").replaceFirst("^v", "");
            String mine = c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
            if (ver.isEmpty() || !newer(ver, mine)) return Result.success();
            SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (ver.equals(sp.getString("notified", "")) || ver.equals(sp.getString("skipped", ""))) return Result.success();
            show(c, ver);
            sp.edit().putString("notified", ver).apply();
        } catch (Exception ignored) { }
        return Result.success();
    }

    static void show(Context c, String ver) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Tells you when a new version of Book Shelf is ready");
            nm.createNotificationChannel(ch);
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Intent open = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("bookshelf_update", ver);
        Intent go = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("bookshelf_update", ver).putExtra("bookshelf_update_go", true);
        PendingIntent piOpen = PendingIntent.getActivity(c, 1, open, flags);
        PendingIntent piGo = PendingIntent.getActivity(c, 2, go, flags);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("New update available")
            .setContentText("Book Shelf " + ver + " is ready to download.")
            .setContentIntent(piOpen)
            .addAction(android.R.drawable.stat_sys_download, "Download", piGo)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        try { NotificationManagerCompat.from(c).notify(NOTE_ID, b.build()); } catch (SecurityException ignored) { }
    }
}
