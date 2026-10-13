package app.stride.runner.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lets the web app hand its already-computed numbers to the native widgets and ask Android to pin a widget. */
@CapacitorPlugin(name = "StrideWidgets")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.length() > 40000 || !WidgetStore.save(getContext(), json)) {
            call.reject("Invalid widget data");
            return;
        }
        WidgetUpdater.updateAll(getContext());
        JSObject r = new JSObject();
        r.put("ok", true);
        call.resolve(r);
    }

    @PluginMethod
    public void pin(PluginCall call) {
        String type = call.getString("type", "");
        Class<?> cls;
        if ("steps".equals(type)) {
            cls = StepsWidgetProvider.class;
        } else if ("overview".equals(type)) {
            cls = OverviewWidgetProvider.class;
        } else if ("graph".equals(type)) {
            cls = GraphWidgetProvider.class;
        } else {
            call.reject("Unknown widget type");
            return;
        }
        JSObject r = new JSObject();
        boolean supported = false;
        if (Build.VERSION.SDK_INT >= 26) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(getContext());
            supported = mgr.isRequestPinAppWidgetSupported();
            if (supported) {
                supported = mgr.requestPinAppWidget(new ComponentName(getContext(), cls), null, null);
            }
        }
        r.put("supported", supported);
        call.resolve(r);
    }

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext();
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        JSObject r = new JSObject();
        r.put("steps", mgr.getAppWidgetIds(new ComponentName(c, StepsWidgetProvider.class)).length);
        r.put("overview", mgr.getAppWidgetIds(new ComponentName(c, OverviewWidgetProvider.class)).length);
        r.put("graph", mgr.getAppWidgetIds(new ComponentName(c, GraphWidgetProvider.class)).length);
        r.put("pinSupported", Build.VERSION.SDK_INT >= 26 && mgr.isRequestPinAppWidgetSupported());
        r.put("lastUpdate", WidgetStore.lastUpdate(c));
        call.resolve(r);
    }
}
