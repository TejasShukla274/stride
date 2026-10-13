package app.stride.runner.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.format.DateFormat;
import app.stride.runner.R;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Shared helpers: colours that follow the app theme, formatting, sizes and tap targets. */
final class WidgetUtil {
    private WidgetUtil() {}

    static final class Palette {
        boolean dark;
        int bgRes;
        int primary;
        int secondary;
        int track;
        int accent;
        int accentText;
    }

    static String todayKey() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static Palette palette(Context ctx, WidgetStore.Snapshot s) {
        String theme = s == null ? "system" : s.theme;
        boolean stardust = s != null && "stardust".equals(s.style);
        boolean night = (ctx.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        Palette p = new Palette();
        p.dark = "dark".equals(theme) || ("system".equals(theme) && night);
        p.accent = s == null ? Color.parseColor("#E10600") : s.accent;
        if (stardust) {
            p.bgRes = p.dark ? R.drawable.widget_bg_stardust_dark : R.drawable.widget_bg_stardust_light;
            p.primary = Color.parseColor(p.dark ? "#EEF0FF" : "#12142A");
            p.secondary = Color.parseColor(p.dark ? "#9498BB" : "#666B8C");
            p.track = Color.parseColor(p.dark ? "#1E2340" : "#E0E3F3");
        } else {
            p.bgRes = p.dark ? R.drawable.widget_bg_classic_dark : R.drawable.widget_bg_classic_light;
            p.primary = Color.parseColor(p.dark ? "#F2F2F2" : "#141414");
            p.secondary = Color.parseColor(p.dark ? "#A0A0A0" : "#666666");
            p.track = Color.parseColor(p.dark ? "#2E2E2E" : "#E6E6E6");
        }
        p.accentText = accentText(p.accent, p.dark);
        return p;
    }

    /** Same idea as the app: darken bright accents on light backgrounds, lighten dark accents on dark ones. */
    static int accentText(int accent, boolean dark) {
        float lum = (0.299f * Color.red(accent) + 0.587f * Color.green(accent) + 0.114f * Color.blue(accent)) / 255f;
        if (!dark && lum > 0.35f) {
            return Color.rgb(Math.round(Color.red(accent) * 0.6f), Math.round(Color.green(accent) * 0.6f), Math.round(Color.blue(accent) * 0.6f));
        }
        if (dark && lum < 0.4f) {
            return Color.rgb(lift(Color.red(accent)), lift(Color.green(accent)), lift(Color.blue(accent)));
        }
        return accent;
    }

    private static int lift(int v) {
        return Math.round(v + (255 - v) * 0.28f);
    }

    static String fmt(int n) {
        return NumberFormat.getIntegerInstance().format(n);
    }

    static String distance(WidgetStore.Snapshot s, double km) {
        double v = s.miles ? km / 1.609344 : km;
        return String.format(Locale.getDefault(), "%.2f", v);
    }

    static String distanceUnit(WidgetStore.Snapshot s) {
        return s.miles ? "mi" : "km";
    }

    static String updated(Context ctx, WidgetStore.Snapshot s) {
        if (s == null || s.at <= 0) {
            return "";
        }
        return "Updated " + DateFormat.getTimeFormat(ctx).format(new Date(s.at));
    }

    static float dp(Context ctx, float v) {
        return v * ctx.getResources().getDisplayMetrics().density;
    }

    static float fontScale(Context ctx) {
        return Math.max(1f, ctx.getResources().getConfiguration().fontScale);
    }

    /** Text size (sp) that fits `chars` characters into `availDp`, respecting the user's font scale. */
    static float fitSp(Context ctx, float availDp, int chars, float maxSp) {
        float sp = availDp / (Math.max(1, chars) * 0.62f);
        return Math.max(10f, Math.min(maxSp, sp / fontScale(ctx)));
    }

    /** Widget size in dp as reported by the launcher: {width, height}. */
    static int[] sizeDp(AppWidgetManager mgr, int id, int defW, int defH) {
        Bundle o = mgr.getAppWidgetOptions(id);
        int w = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        return new int[] { w > 0 ? w : defW, h > 0 ? h : defH };
    }

    static PendingIntent openApp(Context ctx, String url, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.setPackage(ctx.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static int alpha(int color, int a) {
        return Color.argb(a, Color.red(color), Color.green(color), Color.blue(color));
    }
}
