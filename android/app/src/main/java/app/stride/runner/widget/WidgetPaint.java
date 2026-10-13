package app.stride.runner.widget;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.RectF;

/** Draws the progress ring, progress bar and weekly bar chart into small bitmaps for RemoteViews. */
final class WidgetPaint {
    private WidgetPaint() {}

    static Bitmap ring(int size, float frac, int accent, int track) {
        int s = Math.max(16, size);
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        float stroke = s * 0.11f;
        RectF r = new RectF(stroke / 2f, stroke / 2f, s - stroke / 2f, s - stroke / 2f);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(stroke);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(track);
        c.drawArc(r, 0f, 360f, false, p);
        if (frac > 0f) {
            p.setColor(accent);
            c.drawArc(r, -90f, Math.min(360f, frac * 360f), false, p);
        }
        return b;
    }

    static Bitmap bar(int w, int h, float frac, int accent, int track) {
        int bw = Math.max(16, w);
        int bh = Math.max(4, h);
        Bitmap b = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float rad = bh / 2f;
        p.setColor(track);
        c.drawRoundRect(new RectF(0f, 0f, bw, bh), rad, rad, p);
        if (frac > 0f) {
            p.setColor(accent);
            float fw = Math.max(bh, bw * Math.min(1f, frac));
            c.drawRoundRect(new RectF(0f, 0f, fw, bh), rad, rad, p);
        }
        return b;
    }

    /**
     * Seven daily bars with a dashed goal line. Days with no recorded data show a small tick, never a zero bar.
     * Bars that reached the goal use the full accent; others use a lighter accent. Today and the selected day are emphasised.
     */
    static Bitmap chart(int w, int h, float density, float textPx, WidgetStore.Day[] days, int goal, int sel,
                        int accent, int track, int primary, int secondary, boolean fullLabels, boolean dark) {
        int bw = Math.max(40, w);
        int bh = Math.max(40, h);
        Bitmap b = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        int n = days.length;
        if (n == 0) {
            return b;
        }
        float labelH = textPx * 1.7f;
        float top = textPx * 1.0f;
        float chartH = bh - labelH - top;
        float base = top + chartH;
        float slot = bw / (float) n;
        float barW = slot * 0.5f;
        float max = Math.max(1f, goal * 1.15f);
        for (WidgetStore.Day d : days) {
            if (d.steps > 0) {
                max = Math.max(max, d.steps * 1.05f);
            }
        }
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        // goal reference line
        if (goal > 0) {
            float gy = base - (goal / max) * chartH;
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(Math.max(1f, density));
            p.setColor(WidgetUtil.alpha(secondary, 130));
            p.setPathEffect(new DashPathEffect(new float[] { 4f * density, 4f * density }, 0f));
            c.drawLine(0f, gy, bw, gy, p);
            p.setPathEffect(null);
            p.setStyle(Paint.Style.FILL);
            p.setTextSize(textPx * 0.85f);
            p.setColor(secondary);
            p.setTextAlign(Paint.Align.LEFT);
            String g = goal >= 1000 ? (goal % 1000 == 0 ? (goal / 1000) + "k" : String.format("%.1fk", goal / 1000f)) : String.valueOf(goal);
            c.drawText(g, 2f * density, gy - 2f * density, p);
        }
        Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
        t.setTextSize(textPx);
        t.setTextAlign(Paint.Align.CENTER);
        for (int i = 0; i < n; i++) {
            WidgetStore.Day d = days[i];
            float cx = slot * i + slot / 2f;
            boolean emphasised = d.today || i == sel;
            p.setStyle(Paint.Style.FILL);
            if (d.steps < 0) {
                p.setColor(track);
                c.drawRoundRect(new RectF(cx - barW * 0.25f, base - 3f * density, cx + barW * 0.25f, base), 2f * density, 2f * density, p);
            } else {
                float bhgt = Math.max(3f * density, (d.steps / max) * chartH);
                p.setColor(d.done || i == sel ? accent : WidgetUtil.alpha(accent, dark ? 150 : 105));
                RectF r = new RectF(cx - barW / 2f, base - bhgt, cx + barW / 2f, base);
                c.drawRoundRect(r, barW * 0.3f, barW * 0.3f, p);
                if (i == sel) {
                    Paint o = new Paint(Paint.ANTI_ALIAS_FLAG);
                    o.setStyle(Paint.Style.STROKE);
                    o.setStrokeWidth(2f * density);
                    o.setColor(primary);
                    RectF r2 = new RectF(r.left - 2f * density, r.top - 2f * density, r.right + 2f * density, r.bottom);
                    c.drawRoundRect(r2, barW * 0.35f, barW * 0.35f, o);
                }
            }
            t.setFakeBoldText(emphasised);
            t.setColor(emphasised ? primary : secondary);
            String label = d.label == null ? "" : d.label;
            if (!fullLabels && label.length() > 1) {
                label = label.substring(0, 1);
            }
            c.drawText(label, cx, bh - labelH * 0.2f, t);
        }
        return b;
    }
}
