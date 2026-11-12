package app.nichenotes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.stream.Collectors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

// Each widget shows the note picked for it, read from the server with the token that came with the pick.
// A tap opens that note in the app, or the picker until one is picked.
public class NoteWidget extends AppWidgetProvider {
    static final String REFRESH = "app.nichenotes.REFRESH";

    static SharedPreferences picks(Context context) {
        return context.getSharedPreferences("widgets", Context.MODE_PRIVATE);
    }

    // Starts the app afresh, since Android would bring back an app opened by this same link wherever it was left.
    static Intent inApp(Context context, String path) {
        return new Intent(Intent.ACTION_VIEW, Uri.parse(context.getString(R.string.site) + path), context, Launcher.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
    }

    static Intent refresh(Context context, int widget) {
        return new Intent(REFRESH, null, context, NoteWidget.class)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widget);
    }

    static SharedPreferences.Editor forget(SharedPreferences.Editor editor, int widget) {
        return editor.remove("note." + widget).remove("title." + widget)
                .remove("token." + widget).remove("lines." + widget);
    }

    static void show(Context context, int widget) {
        SharedPreferences picks = picks(context);
        String note = picks.getString("note." + widget, null);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget);
        views.setTextViewText(R.id.title,
                note == null ? context.getString(R.string.widget_pick) : picks.getString("title." + widget, ""));
        views.setViewVisibility(R.id.refresh, note == null ? View.GONE : View.VISIBLE);
        views.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(context, widget,
                refresh(context, widget), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        // Mutable, because a tap on a row fills its intent into this one.
        PendingIntent open = PendingIntent.getActivity(context, widget,
                inApp(context, note == null ? "/widget/" + widget : "/n/" + note),
                PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        views.setOnClickPendingIntent(android.R.id.background, open);
        views.setPendingIntentTemplate(R.id.lines, open);

        RemoteViews.RemoteCollectionItems.Builder rows = new RemoteViews.RemoteCollectionItems.Builder();
        try {
            JSONArray lines = new JSONArray(picks.getString("lines." + widget, "[]"));
            for (int i = 0; i < lines.length(); i++) {
                RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_line);
                row.setTextViewText(R.id.line, lines.getString(i));
                row.setOnClickFillInIntent(R.id.line, new Intent());
                rows.addItem(i, row);
            }
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
        views.setRemoteAdapter(R.id.lines, rows.build());
        AppWidgetManager.getInstance(context).updateAppWidget(widget, views);
    }

    // Blocks on the network, so it runs off the main thread. Offline, the widget keeps its last lines.
    static void fetch(Context context, int widget) {
        SharedPreferences picks = picks(context);
        String token = picks.getString("token." + widget, null);
        if (token == null) {
            // Picked before widgets had tokens, or by a picker page from before: offer the picker again.
            forget(picks.edit(), widget).apply();
        } else {
            try {
                HttpURLConnection http = (HttpURLConnection) new URL(context.getString(R.string.site) + "/api/widget").openConnection();
                http.setRequestProperty("Authorization", "Bearer " + token);
                http.setConnectTimeout(5000);
                http.setReadTimeout(5000);
                int status = http.getResponseCode();
                if (status == 200) {
                    String body;
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(http.getInputStream(), StandardCharsets.UTF_8))) {
                        body = reader.lines().collect(Collectors.joining("\n"));
                    }
                    JSONObject read = new JSONObject(body);
                    picks.edit()
                            .putString("title." + widget, read.getString("title"))
                            .putString("lines." + widget, read.getJSONArray("lines").toString())
                            .apply();
                } else if (status == 401 || status == 404) {
                    // Deleted or no longer shared, so the widget offers the picker again.
                    forget(picks.edit(), widget).apply();
                }
            } catch (IOException | JSONException e) {
                // Offline or a bad reply: keep the last lines.
            }
        }
        show(context, widget);
    }

    // goAsync keeps the broadcast alive off the main thread, long enough for a short request per widget.
    private void fetchInBackground(Context context, int... widgets) {
        for (int widget : widgets) show(context, widget);
        PendingResult result = goAsync();
        new Thread(() -> {
            for (int widget : widgets) fetch(context, widget);
            result.finish();
        }).start();
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgets) {
        fetchInBackground(context, widgets);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (REFRESH.equals(intent.getAction())) {
            fetchInBackground(context, intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID));
        }
    }

    @Override
    public void onDeleted(Context context, int[] widgets) {
        SharedPreferences.Editor editor = picks(context).edit();
        for (int widget : widgets) forget(editor, widget);
        editor.apply();
    }
}
