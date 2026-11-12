package app.nichenotes;

import android.content.Intent;
import android.content.pm.PackageInfo;
import androidx.core.content.FileProvider;
import com.google.androidbrowserhelper.trusted.LauncherActivity;
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
