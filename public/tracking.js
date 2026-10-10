/* Stride tracking: step sensor, GPS and the activity engine. Depends on app.js globals (S, run, T, live, R ...). */
const PED = () => window.Capacitor?.Plugins?.CapacitorPedometer, BGL = () => window.Capacitor?.Plugins?.BackgroundGeolocation;
const strideM = () => Track.strideM(+S.u.h, +S.stride);
const distNum = km => (S.units === 'mi' ? km / Track.MI : km).toFixed(2);
let uiAt = 0;

/* ---------- pace / speed (always from MOVING time and distance, in the selected units) ---------- */
const pm = (mov, km, kind) => {
  const u = S.units === 'mi';
  return kind === 'pace' ? Track.fmtPace(Track.paceSec(mov, km, S.units)) + (u ? ' /mi' : ' /km') : Track.fmtSpeed(Track.speed(mov, km, S.units)) + (u ? ' mph' : ' km/h');
};
const PC = (mov, km) => pm(mov, km, S.pace === 'speed' ? 'speed' : 'pace');
const PS = (mov, km) => pm(mov, km, S.pace === 'speed' ? 'pace' : 'speed');
const avgLbl = () => (S.pace === 'speed' ? 'Avg speed' : 'Avg pace'), curLbl = () => (S.pace === 'speed' ? 'Current speed' : 'Current pace');

/* ---------- step sensor ---------- */
function onTotal(t) {
  if (!(t >= 0)) return;
  S.rawTotal = t;
  S.stepsToday = Store.stepsUpdate(t);
  S.dayKey = Store.dayKey();
  if (run && live()) {
    if (!run.paused && run.lastTot != null && t >= run.lastTot) run.steps += t - run.lastTot;
    run.lastTot = t;
  }
  if (S.s === 'start' && live()) updRun();
  else if (S.s === 'home' && !$('#sh') && Date.now() - uiAt > 2000) { uiAt = Date.now(); R(); }
}
async function syncSteps() {
  const P = PED();
  if (!P || !S.live) return false;
  try { const r = await P.getTotalSteps(); onTotal(r.totalSteps); return true; } catch (e) { return false; }
}
async function stepsInit(ask) {
  const P = PED();
  if (!P) { S.stepState = 'unsupported'; if (ask) toast('Step counting works in the Android app only'); return; }
  try {
    const a = await P.isAvailable();
    if (!a.stepCounting) { S.stepState = 'nosensor'; R(); return; }
    let pr = await P.checkPermissions();
    if (pr.activityRecognition !== 'granted') {
      if (!ask) { S.stepState = 'needperm'; if (S.s === 'home') R(); return; }
      pr = await P.requestPermissions();
      if (pr.activityRecognition !== 'granted') { S.stepState = 'denied'; R(); return; }
    }
    if (!stepsInit.on) { await P.addListener('measurement', e => onTotal(e.totalSteps)); stepsInit.on = 1; }
    await P.startMeasurementUpdates();
    S.live = 1; S.stepState = 'live';
    await syncSteps();
    R();
    if (ask) toast('Step counter started');
  } catch (e) { S.stepState = 'error'; S.live = 0; R(); }
}
function dayCheck() {
  const k = Store.dayKey();
  if (S.dayKey === k) return;
  S.dayKey = k;
  S.stepsToday = Store.stepsToday();
  if (S.live) syncSteps();
  if (['home', 'insights', 'hist'].includes(S.s)) R();
}
function onResume() { dayCheck(); syncSteps(); if (run && live()) tick(); }
const stepStatus = () => (S.live ? 'Steps: active' : { unsupported: 'Steps: app only', nosensor: 'Steps: no sensor', denied: 'Steps: permission denied', error: 'Steps: error' }[S.stepState] || 'Steps: off');

/* ---------- GPS (free: phone GPS + an open-source foreground-service plugin) ---------- */
async function gpsPermission() {
  const B = BGL();
  if (!B) { toast('GPS works in the Android app only'); return; }
  let denied = false, id = null;
  try {
    id = await B.addWatcher({ requestPermissions: true, stale: true }, (l, e) => { if (e) denied = true; });
    setTimeout(() => { B.removeWatcher({ id }).catch(() => {}); toast(denied ? 'Location is off or denied. Allow it in Android Settings.' : 'Location access is allowed'); }, 2500);
  } catch (e) { toast('Could not check location access'); }
}
async function gpsStart() {
  const B = BGL();
  if (!B) { run.gps = 'unavailable'; updRun(); return; }
  try {
    run.wid = await B.addWatcher({ backgroundTitle: 'Stride is recording your activity', backgroundMessage: 'Tap to return to Stride', requestPermissions: true, stale: false, distanceFilter: 3 },
      (loc, err) => {
        if (err) { run.gps = err.code === 'NOT_AUTHORIZED' ? 'denied' : 'error'; if (err.code === 'NOT_AUTHORIZED') toast('Location denied. Distance will be estimated from steps.'); updRun(); return; }
        onFix(loc);
      });
    if (run.gps === 'off') run.gps = 'searching';
  } catch (e) { run.gps = 'error'; }
  updRun();
}
function gpsStop() {
  const B = BGL();
  if (B && run && run.wid != null) { B.removeWatcher({ id: run.wid }).catch(() => {}); run.wid = null; }
}
function onFix(loc) {
  if (!run || !live() || run.paused) return;
  const f = { lat: loc.latitude, lon: loc.longitude, t: loc.time || Date.now(), acc: loc.accuracy, alt: loc.altitude, altAcc: loc.altitudeAccuracy };
  run.acc = Math.round(f.acc); run.fixAt = Date.now();
  if (run.lastOk && f.t - run.lastOk.t > 30000) { run.seg++; run.lastOk = null; } // signal gap: start a new segment, never bridge it
  const r = Track.acceptFix(run.lastOk, f);
  run.gps = f.acc > 30 ? 'weak' : 'ok';
  if (!r.ok) { updRun(); return; }
  if (run.lastOk) { run.gpsKm += r.d / 1000; if (r.d / r.dt >= 0.3) run.mov += Math.min(r.dt, 10); }
  run.lastOk = f;
  run.pts.push([+f.lat.toFixed(6), +f.lon.toFixed(6), f.t, Math.round(f.acc), f.alt != null && f.altAcc != null && f.altAcc <= 15 ? Math.round(f.alt) : null, run.seg]);
  updRun();
}
const gpsStatus = () => {
  const g = run ? run.gps : 'off';
  return { ok: 'GPS: good ±' + (run && run.acc) + ' m', weak: 'GPS: weak ±' + (run && run.acc) + ' m', searching: 'GPS: searching…', lost: 'GPS: signal lost', denied: 'GPS: permission denied', unavailable: 'GPS: app only', error: 'GPS: error', off: 'GPS: off' }[g];
};

/* ---------- activity engine ---------- */
const elapsed = (r, n) => Math.max(0, ((r.paused ? r.pauseT : (n || Date.now())) - r.start - r.pausedMs) / 1000);
const runDist = r => (r.pts.length >= 2 && r.gpsKm > 0 ? { km: r.gpsKm, src: 'gps' } : { km: Track.estKm(r.steps, strideM(), r.t === 'Running'), src: 'steps' });
const movSec = (r, n) => (runDist(r).src === 'gps' ? Math.min(r.mov, elapsed(r, n)) : elapsed(r, n));
const defaultTitle = (t, ts) => { const h = new Date(ts).getHours(); return (h < 12 ? 'Morning ' : h < 17 ? 'Afternoon ' : h < 21 ? 'Evening ' : 'Night ') + (t === 'Running' ? 'Run' : 'Walk'); };
function newRun() {
  const n = Date.now(), sh = selShoe();
  return { id: 'r' + n, t: S.act, start: n, paused: false, pauseT: null, pausedMs: 0, steps: 0, lastTot: S.rawTotal, gps: 'off', pts: [], lastOk: null, seg: 0, gpsKm: 0, mov: 0, acc: null, fixAt: 0, win: [], sh: sh ? sh.id : null, wid: null, hasSteps: !!S.live };
}
async function startRun() {
  run = newRun(); S.st.rs = 'running';
  Store.clearSession(); Store.deleteRoute('_active');
  clearInterval(T); T = setInterval(tick, 500);
  R();
  if (!S.live) await stepsInit(true); // permission is requested now, when the user starts tracking
  if (S.live) { await syncSteps(); run.lastTot = S.rawTotal; run.hasSteps = true; PED().setKeepAlive({ value: true }).catch(() => {}); }
  PED()?.requestNotificationPermission?.().catch(() => {}); // lets Android show the "recording" notification (13+)
  gpsStart();
  persistRun(true);
}
function tick() {
  if (!run || !live()) return;
  const n = Date.now(), d = runDist(run);
  if (!run.paused) {
    if (run.win.length && run.win[run.win.length - 1][2] !== d.src) run.win = [];
    run.win.push([n, d.km, d.src]);
    while (run.win.length > 1 && n - run.win[0][0] > 20000) run.win.shift();
    if (run.gps === 'ok' && n - run.fixAt > 20000) run.gps = 'lost';
  }
  updRun();
  if (n - (tick.sv || 0) > 5000) { tick.sv = n; persistRun(n - (tick.rt || 0) > 15000 && (tick.rt = n)); }
}
function persistRun(withRoute) {
  if (!run) return;
  const slim = Object.assign({}, run, { pts: [], win: [], lastOk: null, wid: null });
  Store.saveSession(slim, S.act);
  if (withRoute) Store.saveRoute('_active', run.pts);
}
function curPace() {
  if (!run || run.paused || run.win.length < 2) return PC(0, 0);
  const a = run.win[0], b = run.win[run.win.length - 1];
  return PC((b[0] - a[0]) / 1000, b[1] - a[1]);
}
function updRun() {
  if (S.s !== 'start' || !run || !live()) return;
  const n = Date.now(), e = elapsed(run, n), d = runDist(run), mv = movSec(run, n);
  const set = (i, v) => { const x = $('#' + i); if (x && x.textContent !== String(v)) x.textContent = v; };
  set('t', dur(Math.floor(e))); set('st', fmt(run.steps)); set('d', distNum(d.km)); set('td', fmt(S.stepsToday || 0));
  set('ap', PC(mv, d.km)); set('as', S.sec ? PS(mv, d.km) : ''); set('cp', curPace());
  set('ds', d.src === 'gps' ? 'Distance measured by GPS' : 'Distance estimated from steps');
  set('gc', gpsStatus()); set('sc', stepStatus());
}
async function pauseRun() {
  if (!live() || S.st.rs === 'stopping') return;
  await syncSteps();
  if (!run.paused) { run.paused = true; run.pauseT = Date.now(); S.st.rs = 'paused'; }
  else {
    run.pausedMs += Date.now() - run.pauseT; run.paused = false; run.pauseT = null; S.st.rs = 'running';
    run.lastOk = null; run.seg++; run.win = []; // do not link the point before the pause to the one after it
    if (run.wid == null && !['denied', 'unavailable'].includes(run.gps)) gpsStart();
    if (!T) T = setInterval(tick, 500);
  }
  persistRun(true); R();
}
function simplifyRoute(pts) {
  const out = [], by = {};
  pts.forEach(p => (by[p[5]] = by[p[5]] || []).push({ lat: p[0], lon: p[1], p }));
  Object.keys(by).sort((a, b) => a - b).forEach(k => Track.simplify(by[k], 3).forEach(o => out.push(o.p)));
  return out;
}
async function stopRun() {
  if (!run || !live()) return;
  await syncSteps();
  const n = Date.now(), r = run;
  if (r.paused) { r.pausedMs += n - r.pauseT; r.paused = false; }
  const e = elapsed(r, n);
  clearInterval(T); T = null; gpsStop(); PED()?.setKeepAlive({ value: false }).catch(() => {});
  if (e < 5) { S.st.rs = 'idle'; run = null; Store.clearSession(); Store.deleteRoute('_active'); toast('Activity too short to save'); go('run', 'run'); return; }
  const d = runDist(r), isRun = r.t === 'Running', sh = shoe(r.sh), mov = d.src === 'gps' ? Math.max(1, Math.min(r.mov, e)) : e;
  const rec = { id: r.id, t: r.t, title: defaultTitle(r.t, r.start), start: r.start, ts: n, sec: Math.round(e), mov: Math.round(mov), km: +d.km.toFixed(3), src: d.src, gpsKm: +r.gpsKm.toFixed(3), steps: r.steps, hasSteps: r.hasSteps, cal: Math.round(d.km * (+S.u.w || 70) * (isRun ? 1 : 0.55)), sh: r.sh, shn: sh ? sh.brand + ' ' + sh.model : '', elev: Track.elevation(r.pts.map(p => p[4]), 3), gpsPts: r.pts.length, gps: r.gps };
  if (r.pts.length) Store.saveRoute(r.id, simplifyRoute(r.pts));
  if (!Store.saveRun(rec)) { toast('Could not save this activity. Storage is unavailable.'); return; }
  S.runs = Store.getRuns(); Store.clearSession(); Store.deleteRoute('_active');
  S.st.rs = 'completed'; S.st.last = rec; S.st.vid = rec.id; run = null;
  go('summary');
}
function leaveRun() {
  clearInterval(T); T = null; gpsStop(); PED()?.setKeepAlive({ value: false }).catch(() => {});
  Store.clearSession(); Store.deleteRoute('_active');
  S.st.rs = 'idle'; run = null; go('run', 'run');
}
function discardRun() {
  sheet('Discard this activity?', '<p class="mu">The time, steps and route recorded so far will be deleted. This cannot be undone.</p><button class="btn" onclick="closeSh();leaveRun()">DISCARD ACTIVITY</button><button class="btn o" onclick="closeSh()">KEEP RECORDING</button>');
}
function restoreSheet() {
  sheet('Unfinished activity found', '<p class="mu">The app closed during an activity. Resume it (the closed time is counted as a pause) or discard it.</p><button class="btn" onclick="resumeSession()">RESUME ACTIVITY</button><button class="btn o" onclick="Store.clearSession();Store.deleteRoute(\'_active\');closeSh()">DISCARD</button>');
}
function resumeSession() {
  const ses = Store.getSession();
  if (!ses || !ses.run) return;
  run = Object.assign(ses.run, { paused: true, pauseT: ses.at, pts: Store.getRoute('_active'), win: [], lastOk: null, wid: null, lastTot: S.rawTotal });
  S.act = ses.act; S.st.rs = 'paused';
  clearInterval(T); T = setInterval(tick, 500);
  closeSh(); go('start');
}
