package app.stride.runner.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import app.stride.runner.R;

/** Widget 1: today's steps, goal and progress ring. */
public class StepsWidgetProvider extends BaseWidgetProvider {
    @Override
    protected void render(Context ctx, AppWidgetManager mgr, int id) {
        WidgetStore.Snapshot s = WidgetStore.load(ctx);
        WidgetUtil.Palette p = WidgetUtil.palette(ctx, s);
        int[] sz = WidgetUtil.sizeDp(mgr, id, 110, 110);
        boolean compact = sz[0] < 150 || sz[1] < 130;
        boolean signedOut = s == null || s.signedOut;
        boolean stale = !signedOut && !WidgetUtil.todayKey().equals(s.day);
        boolean noData = !signedOut && !stale && !s.hasToday;

        String stepsText = "\u2014";
        String goalText;
        String pctText = "";
        float frac = 0f;
        String desc;
        if (signedOut) {
            goalText = "Open Stride";
            desc = "Stride steps. Open Stride to start.";
        } else if (stale) {
            goalText = "Tap to sync";
            desc = "Stride steps. Today's count has not been synced. Open Stride.";
        } else if (noData) {
            goalText = "No data yet";
            desc = "Stride steps. No step data recorded yet.";
        } else {
            stepsText = WidgetUtil.fmt(s.steps);
            goalText = s.goal > 0 ? "of " + WidgetUtil.fmt(s.goal) : "no goal set";
            pctText = s.goal > 0 ? s.pct + "%" : "";
            if (s.goal > 0) {
                frac = s.done ? 1f : Math.min(0.99f, s.steps / (float) s.goal);
            }
            desc = "Stride steps today: " + WidgetUtil.fmt(s.steps) + (s.goal > 0 ? " of " + WidgetUtil.fmt(s.goal) + ", " + s.pct + " percent of the goal" : "");
        }

        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_steps);
        rv.setInt(R.id.root, "setBackgroundResource", p.bgRes);
        float availDp = Math.max(60f, Math.min(sz[0], sz[1]) - 20f);
        int px = Math.min(600, Math.round(WidgetUtil.dp(ctx, availDp)));
        rv.setImageViewBitmap(R.id.ring, WidgetPaint.ring(px, frac, p.accent, p.track));

        rv.setTextViewText(R.id.steps, stepsText);
        rv.setTextViewTextSize(R.id.steps, TypedValue.COMPLEX_UNIT_SP, WidgetUtil.fitSp(ctx, availDp * 0.72f, stepsText.length(), compact ? 24f : 34f));
        rv.setTextColor(R.id.steps, p.primary);
        rv.setTextViewText(R.id.goal, goalText);
        rv.setTextViewTextSize(R.id.goal, TypedValue.COMPLEX_UNIT_SP, compact ? 10f : 12f);
        rv.setTextColor(R.id.goal, p.secondary);
        rv.setTextViewText(R.id.pct, pctText);
        rv.setTextViewTextSize(R.id.pct, TypedValue.COMPLEX_UNIT_SP, compact ? 11f : 13f);
        rv.setTextColor(R.id.pct, p.accentText);
        rv.setViewVisibility(R.id.pct, pctText.isEmpty() ? View.GONE : View.VISIBLE);

        rv.setTextColor(R.id.brand, p.accentText);
        rv.setTextColor(R.id.updated, p.secondary);
        rv.setTextViewText(R.id.updated, signedOut ? "" : WidgetUtil.updated(ctx, s));
        rv.setViewVisibility(R.id.brand, compact ? View.GONE : View.VISIBLE);
        rv.setViewVisibility(R.id.updated, compact || signedOut ? View.GONE : View.VISIBLE);

        rv.setContentDescription(R.id.root, desc);
        rv.setOnClickPendingIntent(R.id.root, WidgetUtil.openApp(ctx, "stride://home", id * 10));
        mgr.updateAppWidget(id, rv);
    }
}
