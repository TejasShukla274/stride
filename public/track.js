/* Stride pure tracking logic: GPS filtering, distance, pace/speed, goals. No DOM, no storage. */
(function (root) {
  const R = 6371008.8, MI = 1.609344;
  const Track = {
    haversineM(a, b) {
      const t = x => x * Math.PI / 180, dl = t(b.lat - a.lat), dn = t(b.lon - a.lon);
      const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dn / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    },
    /* Decide whether a GPS fix counts. `last` is the last ACCEPTED fix (not the last received one), so slow
       walking accumulates until it clears the drift threshold. fix = {lat, lon, t(ms), acc(m)} */
    acceptFix(last, fix, opt) {
      const o = Object.assign({ maxAcc: 30, maxSpeed: 12, minMove: 3 }, opt);
      if (!(fix.acc > 0) || fix.acc > o.maxAcc) return { ok: false, reason: 'weak' };
      if (!last) return { ok: true, reason: 'first', d: 0, dt: 0 };
      const d = Track.haversineM(last, fix), dt = (fix.t - last.t) / 1000;
      if (!(dt > 0)) return { ok: false, reason: 'time' };
      if (d / dt > o.maxSpeed) return { ok: false, reason: 'jump' };
      if (d < Math.max(o.minMove, fix.acc * 0.5)) return { ok: false, reason: 'drift' };
      return { ok: true, reason: 'move', d, dt };
    },
    /* Ramer-Douglas-Peucker on one segment of {lat,lon} points; tol in metres. */
    simplify(pts, tol) {
      if (pts.length < 3) return pts.slice();
      const k = Math.cos(pts[0].lat * Math.PI / 180), m = p => [p.lon * 111320 * k, p.lat * 110574];
      const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
      const stack = [[0, pts.length - 1]];
      while (stack.length) {
        const [a, b] = stack.pop(), A = m(pts[a]), B = m(pts[b]);
        let best = -1, bi = -1;
        for (let i = a + 1; i < b; i++) {
          const P = m(pts[i]), dx = B[0] - A[0], dy = B[1] - A[1], L = dx * dx + dy * dy;
          let u = L ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L : 0; u = Math.max(0, Math.min(1, u));
          const d = Math.hypot(P[0] - (A[0] + u * dx), P[1] - (A[1] + u * dy));
          if (d > best) { best = d; bi = i; }
        }
        if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
      }
      return pts.filter((_, i) => keep[i]);
    },
    /* Elevation gain with a hysteresis threshold so GPS altitude noise is not counted as climbing. */
    elevation(alts, thresh) {
      const th = thresh || 3, v = alts.filter(x => typeof x === 'number' && isFinite(x));
      if (v.length < 5) return null;
      let gain = 0, ref = v[0], max = v[0];
      for (const a of v) {
        max = Math.max(max, a);
        if (a - ref >= th) { gain += a - ref; ref = a; } else if (ref - a >= th) ref = a;
      }
      return { gain: Math.round(gain), max: Math.round(max) };
    },
    /* Pace/speed from MOVING time (seconds) and distance (km). Paused time is never included by callers. */
    paceSec(movSec, km, units) {
      if (!(km >= 0.01) || !(movSec > 0)) return null;
      return movSec / (units === 'mi' ? km / MI : km);
    },
    speed(movSec, km, units) {
      if (!(km >= 0.01) || !(movSec > 0)) return null;
      return (units === 'mi' ? km / MI : km) / (movSec / 3600);
    },
    fmtPace(s) {
      if (s == null || !isFinite(s) || s <= 0 || s > 5999) return '--:--';
      const m = Math.floor(s / 60), r = Math.round(s - m * 60);
      return r === 60 ? (m + 1) + ':00' : m + ':' + String(r).padStart(2, '0');
    },
    fmtSpeed(v) { return v == null || !isFinite(v) ? '--' : v.toFixed(1); },
    /* Goals: never round up to 100 before the target is reached. */
    pct(actual, target) {
      if (!(target > 0) || !(actual > 0)) return 0;
      if (actual >= target) return 100;
      return Math.min(99, Math.floor(actual / target * 100 + 1e-9));
    },
    done(actual, target) { return target > 0 && actual >= target; },
    goalFor(hist, fallback, key) {
      let g = null;
      for (const e of hist || []) if (e.d <= key && (!g || e.d >= g.d)) g = e;
      if (!g && hist && hist.length) g = hist.reduce((a, b) => (a.d <= b.d ? a : b));
      return g ? { steps: g.s, km: g.k } : { steps: fallback.steps, km: fallback.dist };
    },
    strideM(heightCm, overrideCm) {
      if (overrideCm > 0) return overrideCm / 100;
      return heightCm > 0 ? heightCm * 0.415 / 100 : 0.75;
    },
    RUN_FACTOR: 1.45,
    estKm(steps, strideM, isRun) { return Math.max(0, steps) * strideM * (isRun ? Track.RUN_FACTOR : 1) / 1000; },
    MI
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Track; else root.Track = Track;
})(typeof window !== 'undefined' ? window : globalThis);
