// End-to-end checks of the real app code in a headless DOM. The Android sensor, GPS and map plugins are SIMULATED
// here; this proves the app logic, not the hardware. Real-phone behaviour must be checked on a device.
const { JSDOM } = require('jsdom'); const fs = require('fs');
const files = ['store', 'track', 'app', 'tracking', 'screens', 'boot'].map(f => fs.readFileSync('dist/' + f + '.js', 'utf8'));
const errs = []; let fails = 0, n = 0;
const ck = (name, c, extra) => { n++; if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : '  ' + (extra || ''))); };
const wait = ms => new Promise(r => setTimeout(r, ms));

function pedMock(perm) {
  const p = { perm, total: 0, cb: null, keep: false, available: true };
  p.isAvailable = async () => ({ stepCounting: p.available });
  p.checkPermissions = async () => ({ activityRecognition: p.perm });
  p.requestPermissions = async () => { if (p.perm !== 'denied') p.perm = 'granted'; return { activityRecognition: p.perm }; };
  p.addListener = async (_, f) => { p.cb = f; };
  p.startMeasurementUpdates = async () => {};
  p.getTotalSteps = async () => ({ totalSteps: p.total, stale: false });
  p.setKeepAlive = async o => { p.keep = o.value; };
  p.emit = t => { p.total = t; p.cb && p.cb({ totalSteps: t }); };
  return p;
}
function geoMock(denied) {
  const g = { cb: null, opts: null, id: 0, active: false, denied };
  g.addWatcher = async (o, f) => { g.cb = f; g.opts = o; g.active = true; if (g.denied) setTimeout(() => f(null, { code: 'NOT_AUTHORIZED' }), 5); return 'w' + (++g.id); };
  g.removeWatcher = async () => { g.active = false; g.cb = null; };
  g.fix = (lat, lon, acc, t, alt, altAcc) => g.cb && g.cb({ latitude: lat, longitude: lon, accuracy: acc, time: t, altitude: alt == null ? null : alt, altitudeAccuracy: altAcc == null ? null : altAcc });
  return g;
}
function leafMock() {
  const L = { calls: { poly: [], marker: [], fit: 0, tiles: 0 } };
  L.map = () => ({ fitBounds: () => { L.calls.fit++; } });
  L.tileLayer = () => { L.calls.tiles++; return { addTo() {} }; };
  L.polyline = c => { L.calls.poly.push(c); return { addTo() {} }; };
  L.circleMarker = c => { L.calls.marker.push(c); const o = { addTo: () => o, bindTooltip: () => o }; return o; };
  return L;
}
function boot(opt) {
  opt = opt || {};
  const d = new JSDOM('<!DOCTYPE html><body><div id="app"></div></body>', { url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = d.window, RD = w.Date; let off = 0;
  class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + off); } static now() { return RD.now() + off; } }
  w.Date = FD; w.matchMedia = q => ({ matches: opt.dark !== false });
  w.console.error = (...a) => errs.push(a.join(' ')); w.addEventListener('error', e => errs.push(e.message));
  Object.entries(opt.items || {}).forEach(([k, v]) => w.localStorage.setItem(k, v));
  const ped = opt.ped === null ? null : (opt.ped || pedMock('granted')), geo = opt.geo === null ? null : (opt.geo || geoMock(false));
  w.Capacitor = { Plugins: Object.assign({}, ped && { CapacitorPedometer: ped }, geo && { BackgroundGeolocation: geo }) };
  if (opt.leaflet) w.L = opt.leaflet;
  files.forEach(t => { const s = w.document.createElement('script'); s.textContent = t; w.document.body.append(s); });
  const E = s => w.eval(s);
  return { w, E, ped, geo, adv: ms => { off += ms; }, now: () => w.Date.now(), dump() { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; } };
}
const text = a => a.w.document.querySelector('#app').textContent;

(async () => {
  /* ---- fresh install ---- */
  const p0 = pedMock('prompt'); p0.total = 50000; let a = boot({ ped: p0 }), E = a.E; await wait(100);
  E("go('login')"); a.w.document.querySelector('#nm').value = 'Tester'; E('startProfile()');
  ck('profile created and lands on Home', E('S.s') == 'home' && E('S.u.name') == 'Tester');
  ck('no demo numbers on a fresh install', !text(a).includes('8,421') && !text(a).includes('10,800') && E('streak()') === 0);
  ck('permission not yet granted -> step counter off, with an enable button', E('S.live') !== 1 && text(a).includes('ENABLE STEP COUNTER'));
  await E("stepsInit(true)"); await wait(50);
  ck('after granting permission the counter is live', E('S.live') === 1 && E('S.stepState') == 'live');
  a.ped.emit(50000); ck('first reading starts at 0 (no earlier history exists)', E('S.stepsToday') === 0);
  a.ped.emit(50800); await wait(10); ck('steps update live without reopening the app', E('S.stepsToday') === 800);

  /* ---- goal progress bug ---- */
  E("S.stepsToday=9900;R()"); let t = text(a);
  ck('9,900 of 10,000 shows 99% and is NOT complete', t.includes('99%') && !t.includes('Goal met') && !t.includes('100%'), JSON.stringify(t.match(/[\w, ·]{0,18}\d+%|Goal met/g)));
  E("S.stepsToday=10000;S.runs=[];R()"); t = text(a); ck('10,000 of 10,000 shows 100% and Goal met', t.includes('100%') && t.includes('Goal met'));
  E("S.stepsToday=12500;R()"); ck('over target never exceeds 100%', !/1[0-9]{2}%/.test(text(a).replace(/100%/g, '')) && !text(a).includes('125%'));
  E("S.stepsToday=800;R()");

  /* ---- editable goals + history keeps old goals ---- */
  const yk = E('Store.dayKey(+ago(1))'); E("Store._set('stride.steps',{hist:{'" + yk + "':12000,'" + E('Store.dayKey(+ago(2))') + "':5000},day:Store.dayKey(),today:800,last:50800,lastT:Date.now()})");
  E("goalSheet()"); a.w.document.querySelector('#gs').value = '0'; E('saveGoals()'); ck('invalid goal is rejected', E('S.g.steps') === 10000);
  a.w.document.querySelector('#gs').value = '5000'; a.w.document.querySelector('#gd').value = '4'; E('saveGoals()');
  ck('valid goal saved and persisted', E('S.g.steps') === 5000 && E('S.g.dist') === 4 && JSON.parse(a.dump()['stride.settings']).g.steps === 5000);
  ck("yesterday keeps the goal it had (10,000), today uses the new one", E('sd(ago(1)).g.steps') === 10000 && E('sd(ago(0)).g.steps') === 5000);
  E("S.g={steps:10000,dist:8};S.goalHist=[]");

  /* ---- calendar + date selection ---- */
  ck('completed day is marked, partial day has a dot, empty day is plain', /\bd\b/.test(E('hm(ago(1))')) && /\bh\b/.test(E('hm(ago(2))')) && !/[dh]\b/.test(E('hm(ago(3))').replace(/\bsl\b|\bt\b|\bfu\b/g, '')));
  ck('future days are disabled', /fu/.test(E('hm(new Date(Date.now()+864e5*3))')));
  E("selectDate('" + yk + "')"); t = text(a);
  ck('selecting a past day updates the main dial and numbers', E('S.selKey') === yk && t.includes('12,000') && t.includes('100%') && t.includes('Goal met'));
  ck('selected day is visibly marked', a.w.document.querySelector('.cal .sl') !== null && a.w.document.querySelector('.cal .t') !== null);
  E("selectDate('" + E('Store.dayKey(+ago(2))') + "')"); t = text(a); ck('a partial day shows 50% and not complete', t.includes('5,000') && t.includes('50%') && !t.includes('Goal met'), JSON.stringify(t.match(/[\w, ·]{0,18}\d+%|Goal met|5,000/g)));
  E('selectDate(null)'); ck('returns to today', E('S.selKey') === null && text(a).includes('Steps today'));
  ck('month summary uses stored data', text(a).includes('summary') && text(a).includes('Longest streak'));

  /* ---- activity: steps + GPS + pause + finish ---- */
  E("S.act='Walking';go('start')"); E('startRun()'); await wait(60);
  ck('activity starts immediately on the live screen', E('S.s') == 'start' && E('S.st.rs') == 'running' && !!a.w.document.querySelector('#st'));
  ck('GPS watcher started with a foreground notification and keep-alive for steps', a.geo.active && !!a.geo.opts.backgroundMessage && a.ped.keep === true);
  const t0 = a.now(); let lat = 12.9716, lon = 77.5946, tot = a.ped.total;
  E('S.stepsToday'); const dayBefore = E('S.stepsToday');
  for (let i = 0; i < 20; i++) { a.adv(8000); lat += 0.0001; tot += 10; a.ped.emit(tot); a.geo.fix(lat, lon, 5, a.now(), 900 + i * 2, 4); E('tick()'); }
  ck('live activity steps update as steps arrive', E('run.steps') === 200 && a.w.document.querySelector('#st').textContent === '200');
  ck('daily steps and activity steps are separate and consistent', E('S.stepsToday') === dayBefore + 200 && a.w.document.querySelector('#td').textContent === (dayBefore + 200).toLocaleString('en-IN'));
  const km = E('run.gpsKm'); ck('GPS distance accumulates from valid points (~' + km.toFixed(3) + ' km)', Math.abs(km - 19 * 0.01112) < 0.004);
  ck('screen says distance is GPS measured', a.w.document.querySelector('#ds').textContent.includes('GPS'));
  const before = E('run.gpsKm'); a.geo.fix(lat + 0.00001, lon, 5, a.now() + 1000); ck('stationary drift is ignored', E('run.gpsKm') === before);
  a.geo.fix(lat + 0.005, lon, 5, a.now() + 2000); ck('an impossible GPS jump is ignored', E('run.gpsKm') === before);
  a.geo.fix(lat + 0.0001, lon, 90, a.now() + 3000); ck('a poor-accuracy fix is ignored but shown as weak GPS', E('run.gpsKm') === before && E('run.gps') === 'weak');
  await E('pauseRun()'); const stPaused = E('run.steps'); a.adv(60000); a.ped.emit(tot += 100); await wait(10);
  ck('pausing stops step counting for the activity', E('S.st.rs') == 'paused' && E('run.steps') === stPaused);
  await E('pauseRun()'); a.adv(8000); tot += 10; a.ped.emit(tot); lat += 0.0001; a.geo.fix(lat, lon, 5, a.now()); await wait(10);
  ck('resume continues; the gap across the pause is not bridged', E('S.st.rs') == 'running' && E('run.steps') === stPaused + 10 && E('run.seg') === 1);
  E("backRun()"); ck('back during an activity asks what to do (never silently leaves)', !!a.w.document.querySelector('#sh') && text(a).includes('discards this run') || text(a).includes('Leaving now discards')); E('closeSh()');
  E("hold(1)"); await wait(300); E('hold(0)'); ck('releasing the stop button early cancels it', E('S.st.rs') == 'running' && E('run') !== null);
  E("hold(1)"); await wait(2400); await wait(100);
  ck('holding 2 seconds finishes and opens the saved activity', E('S.s') == 'summary' && E('S.runs.length') === 1 && E('Store.getRuns().length') === 1);
  const r1 = E('S.runs[0]');
  ck('saved with GPS distance, steps, moving time <= elapsed', r1.src === 'gps' && Math.abs(r1.km - E('S.runs[0].gpsKm')) < 1e-9 && r1.steps === 210 && r1.mov > 0 && r1.mov <= r1.sec);
  ck('elevation is reported only because altitude accuracy was good', r1.elev !== null && r1.elev.gain >= 0);
  ck('route stored under its own activity (simplified)', E('Store.getRoute(S.runs[0].id).length') >= 2 && E("Store.getRoute('_active').length") === 0);
  ck('location collection stopped when the activity ended', a.geo.active === false && a.ped.keep === false);
  ck('session cleared after finishing', E('Store.getSession()') === null);

  /* ---- map ---- */
  a.w.L = leafMock(); E("S.st.vid=S.runs[0].id;go('rundetail')"); await wait(80);
  ck('details screen has a map element and stats', !!a.w.document.querySelector('#map') && text(a).includes('MOVING TIME') && text(a).includes('ELAPSED TIME'));
  ck('map draws the stored route, start and finish, and fits it', a.w.L.calls.poly.length === 1 && a.w.L.calls.marker.length === 2 && a.w.L.calls.fit === 1);
  ck('map attribution/tiles requested only when the background is on', a.w.L.calls.tiles === 1);
  const real = a.w.L; a.w.L = undefined; delete a.w.L; E("S.tiles.on=0;go('rundetail')"); await wait(80);
  ck('without the map library the route still shows as a plain SVG', !!a.w.document.querySelector('#map svg') || !!a.w.document.querySelector('#map.none'));
  E("S.tiles.on=1"); a.w.L = real;

  /* ---- second activity must not mix routes ---- */
  E("S.act='Running';startRun()"); await wait(50); a.adv(8000); a.ped.emit(tot += 10); let lat2 = 13.05, lon2 = 77.7;
  for (let i = 0; i < 10; i++) { a.adv(8000); lon2 += 0.0001; a.ped.emit(tot += 12); a.geo.fix(lat2, lon2, 6, a.now()); }
  await E('stopRun()'); await wait(50);
  ck('two saved activities have separate routes', E('S.runs.length') === 2 && E('Store.getRoute(S.runs[0].id)[0][0]') === 13.05 && E('Store.getRoute(S.runs[1].id)[0][0]') === 12.9717);
  E("renameRun(S.runs[0].id)"); a.w.document.querySelector('#ev').value = 'Park loop'; a.w.document.querySelector('#sh .btn').click(); ck('activity can be renamed', E('S.runs[0].title') === 'Park loop' && E('Store.getRuns()[0].title') === 'Park loop');
  E("go('hist','hist')"); t = text(a); ck('history lists both with GPS badge, steps and pace', t.includes('Park loop') && t.includes('GPS') && t.includes('/km'));

  /* ---- pace / speed / units ---- */
  const rec = { mov: 1500, km: 5 };
  E("S.units='km';S.pace='pace'"); ck('pace km: 5:00 /km', E('PC(1500,5)') === '5:00 /km'); E("S.pace='speed'"); ck('speed km/h: 12.0', E('PC(1500,5)') === '12.0 km/h');
  E("S.units='mi';S.pace='pace'"); ck('pace per mile', E('PC(1500,5)') === '8:03 /mi'); E("S.pace='speed'"); ck('speed mph', E('PC(1500,5)') === '7.5 mph'); E("S.sec=1;S.pace='pace'"); ck('secondary metric is the other one', E('PS(1500,5)') === '7.5 mph');
  ck('zero distance gives dashes, not Infinity', E('PC(600,0)') === '--:-- /mi' && !text(a).includes('Infinity') && !text(a).includes('NaN'));
  E("S.units='km';S.sec=0");

  /* ---- delete recalculates shoe mileage ---- */
  E("shoeForm()"); a.w.document.querySelector('#sb').value = 'Nike'; a.w.document.querySelector('#sm').value = 'Pegasus'; a.w.document.querySelector('#ss').value = '100'; E("saveShoe('')");
  const sid = E('S.shoes[0].id'); E("Store.updateRun(S.runs[0].id,{sh:'" + sid + "'});S.runs=Store.getRuns()"); const m1 = E('stot(S.shoes[0])');
  ck('shoe mileage = start + its runs', Math.abs(m1 - (100 + E('S.runs[0].km'))) < 1e-9);
  const rid = E('S.runs[0].id'); E("Store.deleteRun('" + rid + "');S.runs=Store.getRuns()"); ck('deleting a run recalculates mileage and removes its route', E('stot(S.shoes[0])') === 100 && E("Store.getRoute('" + rid + "').length") === 0);

  /* ---- midnight rollover while closed ---- */
  const pb = pedMock('granted'); pb.total = 1000; const b = boot({ ped: pb }); await wait(120); b.E("S.u.name='T';S.u.setup=1;S.in=1;go('home','home')");
  b.ped.emit(1000); const d1 = b.E('Store.dayKey()'); b.adv(3600e3 * 2); b.ped.emit(3000);
  const todayCount = b.E('S.stepsToday'); b.adv(864e5); b.E('dayCheck()'); await wait(30);
  ck('after midnight today starts fresh and yesterday is kept', b.E('S.stepsToday') === 0 && b.E("Store.stepsForDay('" + d1 + "')") >= 2000 - 1 && todayCount === 2000);
  b.ped.emit(3500); await wait(10); ck('steps after midnight count for the new day only', b.E('S.stepsToday') > 0 && b.E('S.stepsToday') <= 500);

  /* ---- permission and sensor states ---- */
  const c = boot({ ped: pedMock('denied') }); await wait(100); await c.E('stepsInit(true)'); await wait(20);
  ck('denied step permission shows an honest state, no fake steps', c.E('S.stepState') === 'denied' && c.E('S.live') !== 1);
  c.E("S.u.name='T';S.u.setup=1;S.in=1;S.act='Walking';startRun()"); await wait(60); c.geo.fix(1, 1, 5, c.now()); for (let i = 0; i < 6; i++) { c.adv(8000); c.geo.fix(1 + 0.0001 * (i + 1), 1, 5, c.now()); }
  ck('GPS-only tracking works when steps are denied', c.E('run.gpsKm') > 0.05 && c.E('run.hasSteps') === false);
  const dn = boot({ geo: geoMock(true), ped: pedMock('granted') }); await wait(100); dn.E("S.u.name='T';S.u.setup=1;S.in=1;S.act='Walking';startRun()"); await wait(80);
  ck('denied location shows the GPS state and falls back to a labelled estimate', dn.E('run.gps') === 'denied' && dn.E('runDist(run).src') === 'steps');
  const nosensor = boot({ ped: (() => { const p = pedMock('granted'); p.available = false; return p; })() }); await wait(100);
  ck('unavailable sensor reported', nosensor.E('S.stepState') === 'nosensor');
  const browser = boot({ ped: null, geo: null }); await wait(60); ck('plain browser reports unsupported instead of inventing steps', browser.E('S.stepState') === 'unsupported' && browser.E('S.stepsToday') === 0);

  /* ---- crash recovery ---- */
  const d = boot({}); await wait(100); d.E("S.u.name='T';S.u.setup=1;S.in=1;S.act='Walking';startRun()"); await wait(80); d.adv(30000); d.ped.emit(d.ped.total + 40); d.geo.fix(5, 5, 5, d.now()); d.E('tick();persistRun(true)');
  const store = d.dump(); const d2 = boot({ items: store }); await wait(2300);
  ck('an unfinished activity is offered for recovery after a restart', !!d2.w.document.querySelector('#sh') && text(d2).includes('Unfinished activity'));
  d2.E('resumeSession()'); ck('recovered activity keeps its steps and route and starts paused', d2.E('run.steps') >= 0 && d2.E('run.paused') === true && d2.E('run.pts.length') === 1);

  /* ---- themes + persistence ---- */
  const th = boot({}); await wait(100); th.E("S.u.name='T';S.u.setup=1;S.in=1;go('settings')");
  const root = th.w.document.documentElement, probe = () => [root.dataset.style, root.dataset.theme, root.style.getPropertyValue('--rd')];
  ck('default is Classic + dark + red', probe().join() === 'classic,dark,#E10600');
  const combos = [['classic', 'light', '#48D6B0'], ['stardust', 'dark', '#D98A66'], ['stardust', 'light', '#C9A45C'], ['stardust', 'system', '#8B5CF6']];
  for (const [s, m, ac] of combos) { th.E("S.style='" + s + "';S.theme='" + m + "';S.acc='" + ac + "';R()"); const want = m === 'system' ? 'dark' : m; ck('style ' + s + ' / mode ' + m + ' / accent ' + ac + ' applied', probe().join() === s + ',' + want + ',' + ac); }
  for (const ac of th.E('ACC')) { th.E("S.acc='" + ac + "';R()"); if (root.style.getPropertyValue('--rd') !== ac || !root.style.getPropertyValue('--rt') || !root.style.getPropertyValue('--on')) { ck('accent ' + ac, false); } }
  ck('all accent presets apply with readable text colours', true);
  th.E("S.acc='#8B5CF6';R()"); ck('settings screen shows the three theme controls and the palette', ['Theme style', 'Appearance mode', 'Accent color', 'Stardust', 'System'].every(x => text(th).includes(x)) && th.w.document.querySelectorAll('.swb').length === th.E('ACC.length'));
  const th2 = boot({ items: th.dump() }); await wait(100); ck('theme choices survive a restart', [th2.w.document.documentElement.dataset.style, th2.w.document.documentElement.style.getPropertyValue('--rd')].join() === 'stardust,#8B5CF6');
  const th3 = boot({ items: { 'stride.settings': JSON.stringify({ theme: 'neon', style: 'x', acc: 'banana', units: 'furlongs', pace: 'z' }) } }); await wait(100);
  ck('corrupt saved theme values fall back to the default theme', [th3.E('S.theme'), th3.E('S.style'), th3.E('S.acc'), th3.E('S.units'), th3.E('S.pace')].join() === 'dark,classic,#E10600,km,pace');

  /* ---- dashboard customizer + every screen renders ---- */
  th.E("S.dash.Steps=0;go('dash')"); ck('customizer preview reflects hidden widgets', !th.w.document.querySelector('.pvi .hero')); th.E("S.dash.Steps=1;S.lay='Graph Focus';R()"); ck('layout change rearranges the preview', th.w.document.querySelector('.pvi .hero') !== null);
  const bad = []; ['splash', 'login', 'reg', 'home', 'run', 'start', 'summary', 'rundetail', 'hist', 'insights', 'profile', 'editprof', 'settings', 'shoes', 'shoe', 'dash', 'gear', 'plan', 'plansetup', 'progress'].forEach(k => { try { E("S.s='" + k + "';R()"); } catch (e) { bad.push(k + ': ' + e.message); } });
  ck('every screen renders (' + bad.join('; ') + ')', bad.length === 0);
  ck('no console errors', errs.length === 0, errs.join(' | '));
  console.log('\n' + (n - fails) + '/' + n + ' checks passed'); process.exit(fails ? 1 : 0);
})();
