package app.nichenotes;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.text.format.DateFormat;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

// Every dated line the user can open, as the app's Due list shows them, read as whoever is signed in to the app. A tap
// on a line's box ticks it the way an alert's Done does, a tap on its text opens the note there, and a tap on a section
// folds it in the app too.
public class DueWidget extends NoteWidget {
    static final String TAP = "app.nichenotes.DUE_TAP";
    private static final String[] SECTIONS = {"Past due", "Today", "Tomorrow", "Later"};
    // Ticked lines stay a moment, then leave together once the ticking stops, like checked items in a note.
    private static final long STILL_MS = 2000;
    private static volatile long lastTick;

    // The rows of a list share one tap, so they all go through WidgetActivity, which ticks without opening the app.
    static PendingIntent taps(Context context, int widget) {
        return PendingIntent.getActivity(context, widget, new Intent(context, WidgetActivity.class),
                PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // Each line under its note, in a section for when it is due on this phone, the note with the earliest line first.
    // The phone's own date picks the section, so lines move on at midnight even offline.
    static void lines(Context context, int widget, JSONArray rows, RemoteViews.RemoteCollectionItems.Builder items,
            float font) throws JSONException {
        LocalDate today = LocalDate.now();
        List<String> folded = folded(context, widget);
        List<Map<String, List<JSONObject>>> sections = new ArrayList<>();
        for (String name : SECTIONS) sections.add(new LinkedHashMap<>());
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.getJSONObject(i);
            LocalDate day = LocalDate.parse(row.getString("due").substring(0, 10));
            int section = day.isBefore(today) ? 0 : day.equals(today) ? 1 : day.equals(today.plusDays(1)) ? 2 : 3;
            sections.get(section).computeIfAbsent(row.getString("note"), note -> new ArrayList<>()).add(row);
        }

        String app = context.getPackageName();
        int id = 0;
        for (int s = 0; s < SECTIONS.length; s++) {
            Map<String, List<JSONObject>> notes = sections.get(s);
            if (notes.isEmpty()) continue;
            boolean collapsed = folded.contains(SECTIONS[s]);
            RemoteViews section = new RemoteViews(app, R.layout.widget_section);
            section.setViewVisibility(R.id.rule, id == 0 ? View.GONE : View.VISIBLE);
            section.setTextViewText(R.id.label, (collapsed ? "▶ " : "▼ ") + SECTIONS[s] + " "
                    + notes.values().stream().mapToInt(List::size).sum());
            section.setTextViewTextSize(R.id.label, TypedValue.COMPLEX_UNIT_DIP, 12 * font);
            section.setOnClickFillInIntent(R.id.section,
                    new Intent().putExtra("section", SECTIONS[s]).putExtra("collapsed", !collapsed));
            items.addItem(id++, section);
            if (collapsed) continue;

            for (List<JSONObject> lines : notes.values()) {
                String note = lines.get(0).getString("note");
                RemoteViews title = new RemoteViews(app, R.layout.widget_line);
                title.setViewVisibility(R.id.box, View.GONE);
                title.setTextViewText(R.id.line, lines.get(0).getString("title"));
                title.setTextViewTextSize(R.id.line, TypedValue.COMPLEX_UNIT_DIP, 15 * font);
                title.setOnClickFillInIntent(R.id.row, new Intent().putExtra("note", note));
                items.addItem(id++, title);

                for (JSONObject line : lines) {
                    String due = line.getString("due");
                    String text = line.getString("text");
                    boolean late = due.contains("T")
                            ? LocalDateTime.parse(due).isBefore(LocalDateTime.now())
                            : LocalDate.parse(due).isBefore(today);
                    RemoteViews item = new RemoteViews(app, R.layout.widget_due_line);
                    item.setImageViewResource(R.id.box,
                            line.optBoolean("ticked") ? R.drawable.widget_checked : R.drawable.widget_unchecked);
                    item.setTextViewText(R.id.line, text);
                    item.setTextViewTextSize(R.id.line, TypedValue.COMPLEX_UNIT_DIP, 15 * font);
                    item.setTextViewText(R.id.date, label(context, due, today));
                    item.setTextViewTextSize(R.id.date, TypedValue.COMPLEX_UNIT_DIP, 12 * font);
                    item.setTextColor(R.id.date, context.getColor(late ? R.color.widget_ink : R.color.widget_muted));
                    item.setOnClickFillInIntent(R.id.row,
                            new Intent().putExtra("note", note).putExtra(MainActivity.LINE, text));
                    // `next` counts from the last refresh's day, so a tick past midnight before one can land on today.
                    item.setOnClickFillInIntent(R.id.box, new Intent().putExtra("note", note)
                            .putExtra("due", due).putExtra("text", text)
                            .putExtra("next", line.isNull("next") ? null : line.getString("next")));
                    items.addItem(id++, item);
                }
            }
        }
    }

    // A tap on a box or a section shows on every Due widget at once, then the server makes the change. A tick the
    // server didn't take shows its box empty again.
    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!TAP.equals(intent.getAction())) return;
        int[] widgets = AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, DueWidget.class));
        String section = intent.getStringExtra("section");
        long tapped = System.currentTimeMillis();
        JSONObject change = new JSONObject();
        try {
            if (section != null) {
                change.put("section", section).put("collapsed", intent.getBooleanExtra("collapsed", false));
            } else {
                lastTick = tapped;
                change.put("due", intent.getStringExtra("due")).put("text", intent.getStringExtra("text"));
                String next = intent.getStringExtra("next");
                if (next != null) change.put("move_to", next); else change.put("checked", true);
            }
            mark(context, widgets, intent, true);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
        PendingResult result = goAsync();
        new Thread(() -> {
            try {
                if (section != null) {
                    // Offline the fold stays only here, until a refresh brings back the app's. Known and accepted.
                    Alerts.Companion.send(context, "PATCH", "/api/widget/due", change);
                } else {
                    int status = Alerts.Companion.send(context, "PATCH", "/api/docs/" + intent.getStringExtra("note") + "/line", change);
                    if (status < 200 || (status > 299 && status != 404)) mark(context, widgets, intent, false);
                    Thread.sleep(Math.max(0, tapped + STILL_MS - System.currentTimeMillis()));
                }
                if (section != null || lastTick == tapped) refreshAll(context);
            } catch (InterruptedException | JSONException e) {
                throw new IllegalStateException(e);
            } finally {
                result.finish();
            }
        }).start();
    }

    private static List<String> folded(Context context, int widget) throws JSONException {
        JSONArray stored = new JSONArray(picks(context).getString("collapsed." + widget, "[]"));
        List<String> folded = new ArrayList<>();
        for (int i = 0; i < stored.length(); i++) folded.add(stored.getString(i));
        return folded;
    }

    // Shows a fold, or a line's box ticked or empty again, in what each widget has stored, and draws it.
    private static void mark(Context context, int[] widgets, Intent tap, boolean ticked) throws JSONException {
        SharedPreferences picks = picks(context);
        String section = tap.getStringExtra("section");
        for (int widget : widgets) {
            SharedPreferences.Editor editor = picks.edit();
            if (section != null) {
                List<String> folded = folded(context, widget);
                folded.remove(section);
                if (tap.getBooleanExtra("collapsed", false)) folded.add(section);
                editor.putString("collapsed." + widget, new JSONArray(folded).toString());
            } else {
                JSONArray rows = new JSONArray(picks.getString("rows." + widget, "[]"));
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject row = rows.getJSONObject(i);
                    if (row.getString("note").equals(tap.getStringExtra("note"))
                            && row.getString("due").equals(tap.getStringExtra("due"))
                            && row.getString("text").equals(tap.getStringExtra("text"))) row.put("ticked", ticked);
                }
                editor.putString("rows." + widget, rows.toString());
            }
            editor.apply();
            show(context, widget);
        }
    }

    // Near days by name, the coming week by weekday and the rest by date, as the app labels them, in the phone's
    // language and clock.
    private static String label(Context context, String due, LocalDate today) {
        LocalDate day = LocalDate.parse(due.substring(0, 10));
        long days = ChronoUnit.DAYS.between(today, day);
        Locale locale = Locale.getDefault();
        String skeleton = days > 1 && days < 7 ? "EEE" : day.getYear() == today.getYear() ? "MMMd" : "yMMMd";
        String label = days == 0 ? "Today" : days == 1 ? "Tomorrow" : days == -1 ? "Yesterday"
                : day.format(DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, skeleton), locale));
        if (!due.contains("T")) return label;
        String clock = DateFormat.getBestDateTimePattern(locale, DateFormat.is24HourFormat(context) ? "Hm" : "hm");
        return label + " " + LocalTime.parse(due.substring(11)).format(DateTimeFormatter.ofPattern(clock, locale));
    }
}
