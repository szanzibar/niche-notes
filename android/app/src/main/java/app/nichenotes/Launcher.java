package app.nichenotes;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Bundle;
import androidx.browser.customtabs.CustomTabsCallback;
import androidx.core.content.FileProvider;
import com.google.androidbrowserhelper.trusted.LauncherActivity;
import com.google.androidbrowserhelper.trusted.QualityEnforcer;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.stream.Collectors;
import org.json.JSONException;
import org.json.JSONObject;

// Opens the app, first offering an update when a newer release is already downloaded.
// Each launch looks for a newer release in the background, so the offer comes on a later launch.
public class Launcher extends LauncherActivity {
    // The text of the line a widget tap was on, which the note opens at.
    static final String LINE = "line";

    @Override
    protected Uri getLaunchingUrl() {
        String line = getIntent().getStringExtra(LINE);
        Uri url = super.getLaunchingUrl();
        return line == null ? url : url.buildUpon().appendQueryParameter("line", line).build();
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        File apk = new File(getCacheDir(), "update.apk");
        // Null when nothing usable was downloaded.
        PackageInfo update = getPackageManager().getPackageArchiveInfo(apk.getPath(), 0);
        long ready = update == null ? 0 : update.getLongVersionCode();
        if (BuildConfig.RELEASES != null) {
            long have = Math.max(ready, BuildConfig.VERSION_CODE);
            new Thread(() -> download(apk, have)).start();
        }
        if (ready <= BuildConfig.VERSION_CODE) return true;
        startActivityForResult(new Intent(Intent.ACTION_VIEW)
                .setDataAndType(FileProvider.getUriForFile(this, getPackageName() + ".updates", apk),
                        "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), 0);
        return false;
    }

    // Leaving the app refreshes every widget, so it shows what was just written. If Android has frozen or
    // ended the app by then, the next timed refresh catches up.
    @Override
    protected CustomTabsCallback getCustomTabsCallback() {
        Context app = getApplicationContext();
        return new QualityEnforcer() {
            @Override
            public void onNavigationEvent(int event, Bundle extras) {
                if (event != TAB_HIDDEN) return;
                int[] widgets = AppWidgetManager.getInstance(app).getAppWidgetIds(new ComponentName(app, NoteWidget.class));
                app.sendBroadcast(new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE, null, app, NoteWidget.class)
                        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgets));
            }
        };
    }

    // Only a cancelled update comes back here, since installing one ends this app.
    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        launchTwa();
    }

    // Blocks on the network, so it runs off the main thread.
    private static void download(File apk, long have) {
        try {
            JSONObject release;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(new URL(BuildConfig.RELEASES).openStream(), StandardCharsets.UTF_8))) {
                release = new JSONObject(reader.lines().collect(Collectors.joining("\n")));
            }
            // Tags read android-<versionCode>.
            if (Long.parseLong(release.getString("tag_name").replaceAll("\\D", "")) <= have) return;
            File part = new File(apk.getPath() + ".part");
            try (InputStream in = new URL(release.getJSONArray("assets").getJSONObject(0)
                    .getString("browser_download_url")).openStream()) {
                Files.copy(in, part.toPath(), StandardCopyOption.REPLACE_EXISTING);
            }
            Files.move(part.toPath(), apk.toPath(), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException | JSONException e) {
            // Offline or a bad reply: the next launch tries again.
        }
    }
}
