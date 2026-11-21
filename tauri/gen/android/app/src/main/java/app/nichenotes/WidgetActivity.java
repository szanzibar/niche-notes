package app.nichenotes;

import android.app.Activity;
import android.app.ActivityManager;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;

// The home screen starts this when a widget is added or reconfigured, and for a tap on a Due widget's line. The picker
// page links back to it.
public class WidgetActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Intent intent = getIntent();
        if (AppWidgetManager.ACTION_APPWIDGET_CONFIGURE.equals(intent.getAction())) {
            int widget = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            // Placed right away, so a picker left without choosing leaves a widget that offers the picker again.
            setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget));
            NoteWidget.show(this, widget);
            startActivity(NoteWidget.inApp(this, NoteWidget.picker(this, widget)));
        } else if (intent.hasExtra("due") && !online()) {
            // Offline the widget can't tick, but the app can, so the box opens the note at its line.
            startActivity(NoteWidget.inApp(this, "/?n=" + intent.getStringExtra("note"))
                    .putExtra(MainActivity.LINE, intent.getStringExtra("text")));
        } else if (intent.hasExtra("due") || intent.hasExtra("section")) {
            sendBroadcast(new Intent(DueWidget.TAP, null, this, DueWidget.class).putExtras(intent));
        } else if (intent.hasExtra("note")) {
            startActivity(NoteWidget.inApp(this, "/?n=" + intent.getStringExtra("note")).putExtras(intent));
        } else {
            Uri pick = intent.getData();
            int widget = Integer.parseInt(pick.getQueryParameter("id"));
            NoteWidget.picks(this).edit()
                    .putString("note." + widget, pick.getQueryParameter("note"))
                    .putString("title." + widget, pick.getQueryParameter("title"))
                    .putString("token." + widget, pick.getQueryParameter("token"))
                    .remove("rows." + widget)
                    .apply();
            NoteWidget.show(this, widget);
            sendBroadcast(NoteWidget.refresh(this, widget));
            // Close the picker the way back does. Smart Launcher drops a widget it is still adding if we start the home screen instead.
            for (ActivityManager.AppTask task : getSystemService(ActivityManager.class).getAppTasks()) {
                task.finishAndRemoveTask();
            }
        }
        finish();
    }

    private boolean online() {
        ConnectivityManager network = getSystemService(ConnectivityManager.class);
        NetworkCapabilities capabilities = network.getNetworkCapabilities(network.getActiveNetwork());
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
}
