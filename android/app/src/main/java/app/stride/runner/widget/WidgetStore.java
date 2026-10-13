package app.stride.runner.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import org.json.JSONArray;
import org.json.JSONObject;

/** Reads and writes the small snapshot of Stride data that the home-screen widgets display. Local only. */
final class WidgetStore {
    private static final String PREFS = "stride_widgets";
    private static final String K_SNAP = "snapshot";
    private static final String K_SEL = "sel_idx";
    private static final String K_SEL_DAY = "sel_day";

    private WidgetStore() {}

    static final class Day {
        String key = "";
        String label = "";
        int steps = -1; // -1 = no data recorded (not a confirmed zero)
        int goal = 0;
        boolean done;
        boolean today;
    }

    static final class Snapshot {
        boolean signedOut;
        long at;
        String day = "";
        String theme = "system";
        String style = "classic";
        int accent = Color.parseColor("#E10600");
        boolean miles;
        boolean live;
        boolean hasToday;
        int steps;
        int goal;
        double km;
        double goalKm;
        int pct;
        boolean done;
        int streak;
        Day[] days = new Day[0];
        int avg = -1;
        String bestLabel = "";
        int bestSteps = -1;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean save(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            if (o.optInt("v", 0) != 1) {
                return false;
            }
        } catch (Exception e) {
            return false;
        }
        prefs(c).edit().putString(K_SNAP, json).apply();
        return true;
    }

    static long lastUpdate(Context c) {
        Snapshot s = load(c);
        return s == null ? 0L : s.at;
    }

    static Snapshot load(Context c) {
        String raw = prefs(c).getString(K_SNAP, null);
        if (raw == null) {
            return null;
        }
        try {
            JSONObject o = new JSONObject(raw);
            Snapshot s = new Snapshot();
            s.signedOut = o.optBoolean("signedOut", false);
            if (s.signedOut) {
                return s;
            }
            s.at = o.optLong("at", 0L);
            s.day = o.optString("day", "");
            s.theme = o.optString("theme", "system");
            s.style = o.optString("style", "classic");
            try {
                s.accent = Color.parseColor(o.optString("acc", "#E10600"));
            } catch (IllegalArgumentException e) {
                // keep the default accent
            }
            s.miles = "mi".equals(o.optString("units", "km"));
            s.live = o.optBoolean("live", false);
            s.hasToday = o.optBoolean("hasToday", false);
            s.steps = o.optInt("steps", 0);
            s.goal = o.optInt("goal", 0);
            s.km = o.optDouble("km", 0.0);
            s.goalKm = o.optDouble("goalKm", 0.0);
            s.pct = Math.max(0, Math.min(100, o.optInt("pct", 0)));
            s.done = o.optBoolean("done", false);
            s.streak = Math.max(0, o.optInt("streak", 0));
            JSONArray arr = o.optJSONArray("days");
            if (arr != null) {
                s.days = new Day[arr.length()];
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject a = arr.optJSONObject(i);
                    Day d = new Day();
                    if (a != null) {
                        d.key = a.optString("k", "");
                        d.label = a.optString("l", "");
                        d.steps = a.isNull("s") ? -1 : a.optInt("s", -1);
                        d.goal = a.optInt("g", 0);
                        d.done = a.optBoolean("done", false);
                        d.today = a.optBoolean("today", false);
                    }
                    s.days[i] = d;
                }
            }
            s.avg = o.isNull("avg") ? -1 : o.optInt("avg", -1);
            JSONObject best = o.optJSONObject("best");
            if (best != null) {
                s.bestLabel = best.optString("l", "");
                s.bestSteps = best.optInt("s", -1);
            }
            return s;
        } catch (Exception e) {
            return null;
        }
    }

    /** Selected bar in the graph widget; only valid for the day the snapshot was taken. */
    static int selected(Context c, String day) {
        SharedPreferences p = prefs(c);
        return day.equals(p.getString(K_SEL_DAY, "")) ? p.getInt(K_SEL, -1) : -1;
    }

    static void select(Context c, String day, int idx) {
        prefs(c).edit().putString(K_SEL_DAY, day).putInt(K_SEL, idx).apply();
    }
}
