package app.nichenotes;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

// The home screen starts this when a widget is added or reconfigured, and the picker page links back to it.
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
            startActivity(NoteWidget.inApp(this, "/widget/" + widget));
        } else {
            Uri pick = intent.getData();
            int widget = Integer.parseInt(pick.getQueryParameter("id"));
            NoteWidget.picks(this).edit()
                    .putString("note." + widget, pick.getQueryParameter("note"))
                    .putString("title." + widget, pick.getQueryParameter("title"))
                    .putString("token." + widget, pick.getQueryParameter("token"))
                    .remove("lines." + widget)
                    .apply();
            NoteWidget.show(this, widget);
            sendBroadcast(NoteWidget.refresh(this, widget));
            startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        finish();
    }
}
