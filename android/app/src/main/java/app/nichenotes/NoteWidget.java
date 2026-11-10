package app.nichenotes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

// Each widget shows the note picked for it. A tap opens that note in the app, or the picker until one is picked.
public class NoteWidget extends AppWidgetProvider {
    static final String SITE = "https://notes.example.com";

    static SharedPreferences picks(Context context) {
        return context.getSharedPreferences("widgets", Context.MODE_PRIVATE);
    }

    static Intent inApp(Context context, String path) {
        return new Intent(Intent.ACTION_VIEW, Uri.parse(SITE + path), context, LauncherActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    static void show(Context context, int widget) {
        String note = picks(context).getString("note." + widget, null);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget);
        views.setTextViewText(R.id.title,
                note == null ? context.getString(R.string.widget_pick) : picks(context).getString("title." + widget, ""));
        Intent tap = inApp(context, note == null ? "/widget/" + widget : "/n/" + note);
        views.setOnClickPendingIntent(android.R.id.background,
                PendingIntent.getActivity(context, widget, tap, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        AppWidgetManager.getInstance(context).updateAppWidget(widget, views);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgets) {
        for (int widget : widgets) show(context, widget);
    }

    @Override
    public void onDeleted(Context context, int[] widgets) {
        SharedPreferences.Editor editor = picks(context).edit();
        for (int widget : widgets) editor.remove("note." + widget).remove("title." + widget);
        editor.apply();
    }
}
