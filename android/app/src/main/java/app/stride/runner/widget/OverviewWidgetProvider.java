package app.stride.runner.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import app.stride.runner.R;

/** Widget 2: steps with progress bar, distance and streak. */
public class OverviewWidgetProvider extends BaseWidgetProvider {
    @Override
    protected void render(Context ctx, AppWidgetManager mgr, int id) {
        WidgetStore.Snapshot s = WidgetStore.load(ctx);
        WidgetUtil.Palette p = WidgetUtil.palette(ctx, s);
        int[] sz = WidgetUtil.sizeDp(mgr, id, 250, 110);
        boolean narrow = sz[0] < 230;
        boolean signedOut = s == null || s.signedOut;
        boolean stale = !signedOut && !WidgetUtil.todayKey().equals(s.day);
        boolean noData = !signedOut && !stale && !s.hasToday;
        boolean live = !signedOut && !stale && !noData;

        String stepsText = "\u2014";
        String sub;
        String dist = "\u2014";
        String streak = "\u2014";
        float frac = 0f;
        String desc;
        if (signedOut) {
            sub = "Open Stride";
            desc = "Stride overview. Open Stride to start.";
        } else if (stale) {
            sub = "Tap to sync";
            desc = "Stride overview. Today's data has not been synced. Open Stride.";
        } else if (noData) {
            sub = "No data yet";
            desc = "Stride overview. No step data recorded yet.";
        } else {
            stepsText = WidgetUtil.fmt(s.steps);
            sub = s.goal > 0 ? "of " + WidgetUtil.fmt(s.goal) + " \u00b7 " + s.pct + "%" : "no goal set";
            dist = WidgetUtil.distance(s, s.km);
            streak = String.valueOf(s.streak);
            if (s.goal > 0) {
                frac = s.done ? 1f : Math.min(0.99f, s.steps / (float) s.goal);
            }
            desc = "Stride today: " + WidgetUtil.fmt(s.steps) + " steps"
                + (s.goal > 0 ? " of " + WidgetUtil.fmt(s.goal) + ", " + s.pct + " percent" : "")
                + ". Distance " + dist + " " + WidgetUtil.distanceUnit(s)
                + ". Streak " + s.streak + (s.streak == 1 ? " day" : " days") + ". A day counts when both the steps and distance goals are met.";
        }

        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_overview);
        rv.setInt(R.id.root, "setBackgroundResource", p.bgRes);
        float colDp = Math.max(60f, (sz[0] - 24f) * 0.4f);

        rv.setTextViewText(R.id.title, "TODAY");
        rv.setTextColor(R.id.title, p.accentText);
        rv.setTextViewText(R.id.steps, stepsText);
        rv.setTextViewTextSize(R.id.steps, TypedValue.COMPLEX_UNIT_SP, WidgetUtil.fitSp(ctx, colDp, stepsText.length(), narrow ? 24f : 30f));
        rv.setTextColor(R.id.steps, p.primary);
        rv.setTextViewText(R.id.stepsSub, sub);
        rv.setTextColor(R.id.stepsSub, p.secondary);
        rv.setImageViewBitmap(R.id.bar, WidgetPaint.bar(Math.round(WidgetUtil.dp(ctx, colDp)), Math.round(WidgetUtil.dp(ctx, 6f)), frac, p.accent, p.track));
        rv.setTextViewText(R.id.updated, live ? WidgetUtil.updated(ctx, s) : "");
        rv.setTextColor(R.id.updated, p.secondary);
        rv.setViewVisibility(R.id.updated, live && !narrow ? View.VISIBLE : View.GONE);

        rv.setInt(R.id.distIcon, "setColorFilter", p.accentText);
        rv.setTextViewText(R.id.distValue, dist);
        rv.setTextColor(R.id.distValue, p.primary);
        rv.setTextViewText(R.id.distUnit, live ? WidgetUtil.distanceUnit(s) : "distance");
        rv.setTextColor(R.id.distUnit, p.secondary);

        rv.setInt(R.id.streakIcon, "setColorFilter", p.accentText);
        rv.setTextViewText(R.id.streakValue, streak);
        rv.setTextColor(R.id.streakValue, p.primary);
        rv.setTextViewText(R.id.streakLabel, "day streak");
        rv.setTextColor(R.id.streakLabel, p.secondary);

        rv.setContentDescription(R.id.root, desc);
        rv.setOnClickPendingIntent(R.id.root, WidgetUtil.openApp(ctx, "stride://home", id * 10));
        mgr.updateAppWidget(id, rv);
    }
}
