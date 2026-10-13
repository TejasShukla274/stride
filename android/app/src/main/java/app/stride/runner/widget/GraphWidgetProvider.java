package app.stride.runner.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import app.stride.runner.R;

/** Widget 3: steps for the last seven days with a goal line. Tap a bar to inspect that day. */
public class GraphWidgetProvider extends BaseWidgetProvider {
    static final String ACTION_SELECT = "app.stride.runner.widget.SELECT_DAY";
    private static final int[] ZONES = { R.id.d0, R.id.d1, R.id.d2, R.id.d3, R.id.d4, R.id.d5, R.id.d6 };

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent != null && ACTION_SELECT.equals(intent.getAction())) {
            WidgetStore.Snapshot s = WidgetStore.load(ctx);
            int idx = intent.getIntExtra("idx", -1);
            if (s != null && !s.signedOut && idx >= 0 && idx < s.days.length) {
                int cur = WidgetStore.selected(ctx, s.day);
                WidgetStore.select(ctx, s.day, cur == idx ? -1 : idx);
            }
            refresh(ctx);
            return;
        }
        super.onReceive(ctx, intent);
    }

    @Override
    protected void render(Context ctx, AppWidgetManager mgr, int id) {
        WidgetStore.Snapshot s = WidgetStore.load(ctx);
        WidgetUtil.Palette p = WidgetUtil.palette(ctx, s);
        int[] sz = WidgetUtil.sizeDp(mgr, id, 250, 180);
        boolean signedOut = s == null || s.signedOut;
        boolean stale = !signedOut && !WidgetUtil.todayKey().equals(s.day);
        WidgetStore.Day[] days = signedOut ? new WidgetStore.Day[0] : s.days;
        boolean anyData = false;
        for (WidgetStore.Day d : days) {
            if (d.steps >= 0) {
                anyData = true;
            }
        }
        int sel = signedOut ? -1 : WidgetStore.selected(ctx, s.day);

        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_graph);
        rv.setInt(R.id.root, "setBackgroundResource", p.bgRes);

        String summary;
        String footer;
        String footerUrl = "stride://insights";
        StringBuilder desc = new StringBuilder("Stride steps, last seven days. ");
        if (signedOut) {
            summary = "";
            footer = "Open Stride to start";
        } else if (!anyData) {
            summary = "No data yet";
            footer = "Walk with Stride to see your week";
        } else {
            summary = (s.avg >= 0 ? "Avg " + WidgetUtil.fmt(s.avg) + "/day" : "") + (s.bestSteps >= 0 && !s.bestLabel.isEmpty() ? " \u00b7 Best " + s.bestLabel : "");
            if (sel >= 0 && sel < days.length) {
                WidgetStore.Day d = days[sel];
                String state = d.steps < 0 ? "no data recorded" : (d.done ? "goal reached" : "goal not reached");
                footer = d.label + " \u00b7 " + (d.steps < 0 ? "no data" : WidgetUtil.fmt(d.steps) + " steps") + " \u00b7 " + state;
                footerUrl = "stride://day/" + d.key;
            } else {
                footer = stale ? "Last updated " + s.day + " \u00b7 open Stride" : "Tap a bar for details \u00b7 " + WidgetUtil.updated(ctx, s);
            }
            for (WidgetStore.Day d : days) {
                desc.append(d.label).append(' ').append(d.steps < 0 ? "no data" : WidgetUtil.fmt(d.steps)).append(". ");
            }
            if (s.goal > 0) {
                desc.append("Goal ").append(WidgetUtil.fmt(s.goal)).append(" steps.");
            }
        }

        rv.setTextViewText(R.id.title, "THIS WEEK");
        rv.setTextColor(R.id.title, p.accentText);
        rv.setTextViewText(R.id.summary, summary);
        rv.setTextColor(R.id.summary, p.secondary);
        rv.setTextViewText(R.id.footer, footer);
        rv.setTextColor(R.id.footer, p.secondary);

        float density = ctx.getResources().getDisplayMetrics().density;
        int wPx = Math.min(1200, Math.round(WidgetUtil.dp(ctx, Math.max(100f, sz[0] - 24f))));
        int hPx = Math.min(800, Math.round(WidgetUtil.dp(ctx, Math.max(44f, sz[1] - 24f - 18f - 22f))));
        float textPx = WidgetUtil.dp(ctx, 10f) * Math.min(1.3f, WidgetUtil.fontScale(ctx));
        int goal = signedOut || s.days.length == 0 ? 0 : s.goal;
        rv.setImageViewBitmap(R.id.chart, WidgetPaint.chart(wPx, hPx, density, textPx, days, goal, sel, p.accent, p.track, p.primary, p.secondary, sz[0] >= 230, p.dark));
        rv.setContentDescription(R.id.chart, signedOut ? "Open Stride to start" : desc.toString());

        for (int i = 0; i < ZONES.length; i++) {
            if (!signedOut && i < days.length) {
                Intent in = new Intent(ctx, GraphWidgetProvider.class);
                in.setAction(ACTION_SELECT);
                in.putExtra("idx", i);
                PendingIntent pi = PendingIntent.getBroadcast(ctx, id * 10 + i + 1, in, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                rv.setOnClickPendingIntent(ZONES[i], pi);
                rv.setContentDescription(ZONES[i], days[i].label + (days[i].steps < 0 ? " no data" : " " + WidgetUtil.fmt(days[i].steps) + " steps"));
            } else {
                rv.setOnClickPendingIntent(ZONES[i], WidgetUtil.openApp(ctx, "stride://insights", id * 10));
            }
        }
        rv.setOnClickPendingIntent(R.id.footer, WidgetUtil.openApp(ctx, footerUrl, id * 10 + 8));
        rv.setOnClickPendingIntent(R.id.title, WidgetUtil.openApp(ctx, "stride://insights", id * 10 + 9));
        rv.setOnClickPendingIntent(R.id.summary, WidgetUtil.openApp(ctx, "stride://insights", id * 10 + 9));
        mgr.updateAppWidget(id, rv);
    }
}
