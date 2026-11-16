package app.nichenotes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.text.SpannableString;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.util.TypedValue;
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

// Each widget shows the note picked for it, or all the notes as the tree shows them, read from the server with the
// token that came with the pick. A tap opens that note in the app, the list for the tree, or the picker until one is
// picked. Every widget is drawn and refreshed here, whichever kind it is.
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
        return editor.remove("note." + widget).remove("title." + widget).remove("token." + widget)
                .remove("rows." + widget).remove("color." + widget).remove("ink." + widget);
    }

    static boolean isTree(Context context, int widget) {
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(context).getAppWidgetInfo(widget);
        return info != null && info.provider.getClassName().equals(TreeWidget.class.getName());
    }

    // A notes widget's picker hands over the tree at once.
    static String picker(Context context, int widget) {
        return "/widget/" + widget + (isTree(context, widget) ? "?tree" : "");
    }

    static void show(Context context, int widget) {
        SharedPreferences picks = picks(context);
        String note = picks.getString("note." + widget, null);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget);
        // Sizes in dp, scaled by the font size setting here, since a home screen's first draw can turn sp into text
        // a third bigger than its later draws.
        float font = context.getResources().getConfiguration().fontScale;
        views.setTextViewTextSize(R.id.title, TypedValue.COMPLEX_UNIT_DIP, 17 * font);
        int ink = picks.getInt("ink." + widget, context.getColor(R.color.on_accent));
        views.setInt(R.id.header, "setBackgroundColor", picks.getInt("color." + widget, context.getColor(R.color.accent)));
        views.setTextColor(R.id.title, ink);
        views.setInt(R.id.refresh, "setColorFilter", ink);
        views.setTextViewText(R.id.title,
                note != null ? picks.getString("title." + widget, "")
                        : context.getString(isTree(context, widget) ? R.string.tree_widget_pick : R.string.widget_pick));
        views.setViewVisibility(R.id.refresh, note == null ? View.GONE : View.VISIBLE);
        views.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(context, widget,
                refresh(context, widget), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        // Mutable, because a tap on a row fills its intent into this one, and a note in the tree names its own page.
        String page = note == null ? picker(context, widget) : note.equals("tree") ? "/" : "/n/" + note;
        PendingIntent open = PendingIntent.getActivity(context, widget, inApp(context, page),
                PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT | Intent.FILL_IN_DATA);
        views.setOnClickPendingIntent(android.R.id.background, open);
        views.setPendingIntentTemplate(R.id.lines, open);

        RemoteViews.RemoteCollectionItems.Builder items = new RemoteViews.RemoteCollectionItems.Builder();
        try {
            JSONArray rows = new JSONArray(picks.getString("rows." + widget, "[]"));
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                RemoteViews item = new RemoteViews(context.getPackageName(), R.layout.widget_line);
                SpannableString line = new SpannableString(row.getString("line"));
                // Headings are bold, and the first two levels a little bigger, like in the note.
                int level = row.optInt("heading");
                if (level > 0) {
                    line.setSpan(new StyleSpan(Typeface.BOLD), 0, line.length(), 0);
                    line.setSpan(new RelativeSizeSpan(1.3f - 0.1f * level), 0, line.length(), 0);
                }
                item.setTextViewText(R.id.line, line);
                item.setTextViewTextSize(R.id.line, TypedValue.COMPLEX_UNIT_DIP, 15 * font);
                float indent = 18 * row.getInt("depth");
                boolean box = row.has("checked");
                item.setViewVisibility(R.id.box, box ? View.VISIBLE : View.GONE);
                item.setImageViewResource(R.id.box,
                        row.optBoolean("checked") ? R.drawable.widget_checked : R.drawable.widget_unchecked);
                item.setViewLayoutMargin(R.id.box, RemoteViews.MARGIN_START, indent, TypedValue.COMPLEX_UNIT_DIP);
                item.setViewLayoutMargin(R.id.line, RemoteViews.MARGIN_START, box ? 0 : indent,
                        TypedValue.COMPLEX_UNIT_DIP);
                // A tap on a line opens the note at that line, and a tap on a note in the tree opens that note.
                item.setOnClickFillInIntent(R.id.row, row.has("note")
                        ? new Intent().setData(Uri.parse(context.getString(R.string.site) + "/n/" + row.getString("note")))
                        : new Intent().putExtra(Launcher.LINE, row.getString("text")));
                items.addItem(i, item);
            }
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
        views.setRemoteAdapter(R.id.lines, items.build());
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
                            .putString("rows." + widget, read.getJSONArray("rows").toString())
                            .putInt("color." + widget, Color.parseColor(read.getString("color")))
                            .putInt("ink." + widget, Color.parseColor(read.getString("ink")))
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
