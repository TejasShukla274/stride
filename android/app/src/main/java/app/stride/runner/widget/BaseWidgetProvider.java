package app.stride.runner.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

/** Common behaviour: redraw on update, resize, date/time/timezone changes. A failed draw never crashes the host. */
public abstract class BaseWidgetProvider extends AppWidgetProvider {
    private static final String TAG = "StrideWidget";

    protected abstract void render(Context ctx, AppWidgetManager mgr, int id);

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            safeRender(ctx, mgr, id);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle newOptions) {
        safeRender(ctx, mgr, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if (Intent.ACTION_DATE_CHANGED.equals(a) || Intent.ACTION_TIME_CHANGED.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
            refresh(ctx);
            return;
        }
        super.onReceive(ctx, intent);
    }

    /** Redraws every placed instance of this widget type. */
    public void refresh(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, getClass()));
        for (int id : ids) {
            safeRender(ctx, mgr, id);
        }
    }

    private void safeRender(Context ctx, AppWidgetManager mgr, int id) {
        try {
            render(ctx, mgr, id);
        } catch (Exception e) {
            Log.w(TAG, "widget render failed", e);
        }
    }
}
