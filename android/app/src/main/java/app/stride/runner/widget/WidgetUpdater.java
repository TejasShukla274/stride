package app.stride.runner.widget;

import android.content.Context;

/** Redraws every placed Stride widget. */
final class WidgetUpdater {
    private WidgetUpdater() {}

    static void updateAll(Context ctx) {
        new StepsWidgetProvider().refresh(ctx);
        new OverviewWidgetProvider().refresh(ctx);
        new GraphWidgetProvider().refresh(ctx);
    }
}
