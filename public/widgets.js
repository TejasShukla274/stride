/* Stride home-screen widgets (Android). The app computes its numbers once and publishes a small snapshot to the
   native widgets. Nothing leaves the phone; no name, email or photo is included. */
const WGT = () => window.Capacitor?.Plugins?.StrideWidgets;
const wPub = { body: '', t: 0, timer: 0 };

/* Same functions and rules as the dashboard: sd() is the single source of truth for a day. */
function widgetSnapshot() {
  if (!S.in) return { v: 1, signedOut: true };
  const w = WK(), t = w[w.length - 1], td = Store.dayKey();
  const days = w.map(o => {
    const has = o.has || (o.key === td && !!S.live); // a missing day is "no data", not a confirmed zero
    return { k: o.key, l: o.l, s: has ? o.s : null, g: o.g.steps, done: has && Track.done(o.s, o.g.steps), today: o.key === td };
  });
  const withData = days.filter(d => d.s != null);
  const best = withData.reduce((a, d) => (!a || d.s > a.s ? d : a), null);
  return {
    v: 1, day: td, theme: S.theme, style: S.style, acc: S.acc, units: S.units, live: !!S.live, hasToday: !!(t.has || S.live),
    steps: t.s, goal: t.g.steps, km: +t.d.toFixed(3), goalKm: t.g.km, pct: t.sp, done: Track.done(t.s, t.g.steps), streak: streak(),
    days, avg: withData.length ? Math.round(sum(withData, d => d.s) / withData.length) : null, best: best ? { l: best.l, k: best.k, s: best.s } : null
  };
}

/* now=true sends immediately; otherwise at most one update every 8 s, and an unchanged snapshot is resent at most every 10 min. */
function publishWidgets(now) {
  const P = WGT();
  if (!P) return;
  const send = () => {
    wPub.timer = 0;
    const o = widgetSnapshot(), body = JSON.stringify(o);
    if (body === wPub.body && Date.now() - wPub.t < 600000) return;
    wPub.body = body; wPub.t = Date.now();
    if (!o.signedOut) o.at = Date.now();
    P.update({ json: JSON.stringify(o) }).catch(() => {});
  };
  if (now) { clearTimeout(wPub.timer); send(); } else if (!wPub.timer) wPub.timer = setTimeout(send, 8000);
}

/* Links opened from a widget: stride://home, stride://insights, stride://day/YYYY-MM-DD */
function routeLink(u) {
  const m = /^stride:\/\/(home|insights|day)(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/.exec(String(u || ''));
  if (!m || !S.in || live()) return false; // never pull the user off an active activity
  if (m[1] === 'day') {
    if (!m[2] || m[2] > Store.dayKey()) return false;
    S.selKey = m[2] === Store.dayKey() ? null : m[2]; go('home', 'home');
  } else if (m[1] === 'insights') go('insights', 'insights');
  else { S.selKey = null; go('home', 'home'); }
  return true;
}

async function pinWidget(t) {
  const P = WGT();
  if (!P) { toast('Widgets work in the Android app only'); return; }
  try {
    const r = await P.pin({ type: t });
    toast(r.supported ? 'Confirm on your home screen' : 'Your launcher cannot add it from here. Long-press the home screen, tap Widgets, then Stride.');
  } catch (e) { toast('Could not add the widget'); }
}
async function widgetStatus() {
  const P = WGT();
  if (!P) return;
  try { S.wst = await P.status(); } catch (e) { S.wst = null; }
  if (S.s === 'widgets') R();
}
const WGT_LIST = [['steps', 'Steps', 'Today\u2019s steps and goal progress ring. Fits 2\u00d72.'], ['overview', 'Overview', 'Steps, distance and streak. Fits 4\u00d72.'], ['graph', 'Week graph', 'Last seven days with your goal line. Tap a bar to see that day. Fits 4\u00d73.']];
V.widgets = () => `<main>${bk('settings')}<h1>Home-screen widgets</h1><p class="mu" style="margin-bottom:12px">See your progress without opening Stride. Widgets show data stored on this phone.</p>${WGT() ? '' : '<div class="c"><b>Android app only</b><p class="mu" style="margin:4px 0 0">Widgets are available in the installed Android app.</p></div>'}${WGT_LIST.map(([k, n, d]) => `<div class="c"><div class="row sb"><div><b>${n}</b><div class="mu" style="font-size:12px">${d}</div></div>${S.wst ? `<span class="pill">${S.wst[k]} added</span>` : ''}</div><button class="btn o" style="margin-top:10px" onclick="pinWidget('${k}')" ${WGT() ? '' : 'disabled'}>ADD TO HOME SCREEN</button></div>`).join('')}<h2>Add them yourself</h2><div class="c"><p class="mu" style="margin:0">Long-press an empty area of your home screen, tap Widgets, find Stride, and drag a widget onto the screen. Long-press it again to resize.</p></div><h2>Good to know</h2><div class="c"><p class="mu" style="margin:0">Android decides when widgets redraw. Stride sends new numbers when you open it, walk, finish an activity or change a setting, and the widgets also refresh when the date changes. If a widget says Open Stride to sync, open the app once. A day counts toward your streak when both your steps and distance goals are met.</p></div><button class="btn" onclick="publishWidgets(true);widgetStatus();toast('Widgets updated')">UPDATE WIDGETS NOW</button></main>`;
