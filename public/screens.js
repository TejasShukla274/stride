/* Stride screens: dashboard, calendar, live activity, activity details with map, history, settings, appearance. */
const keyDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const dayLabel = x => x.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' });
const onColor = hex => ((.299 * parseInt(hex.slice(1, 3), 16) + .587 * parseInt(hex.slice(3, 5), 16) + .114 * parseInt(hex.slice(5, 7), 16)) / 255 > .62 ? '#111' : '#fff');

/* ---------- one source of truth for a day: sensor steps + recorded activities + the goal that applied that day ---------- */
const sd = x => {
  const key = Store.dayKey(+x), td = Store.dayKey();
  if (key > td) return null;
  const steps = key === td ? (S.stepsToday || 0) : Store.stepsForDay(key);
  const rs = S.runs.filter(r => Store.dayKey(r.start) === key), aS = sum(rs, r => r.steps || 0), aK = sum(rs, r => r.km);
  const km = +(Track.estKm(Math.max(0, steps - aS), strideM(), false) + aK).toFixed(3); // activity steps are not counted twice
  const g = Track.goalFor(S.goalHist, S.g, key);
  return { key, x: keyDate(key), s: steps, d: km, a: rs.length ? 1 : 0, g, has: steps > 0 || rs.length > 0, sp: Track.pct(steps, g.steps), dp: Track.pct(km, g.km), full: Track.done(steps, g.steps) && Track.done(km, g.km) };
};
const selRec = () => sd(keyDate(S.selKey && S.selKey <= Store.dayKey() ? S.selKey : Store.dayKey()));
const selectDate = k => { S.selKey = !k || k === Store.dayKey() ? null : k; R(); };
const WK = () => [6, 5, 4, 3, 2, 1, 0].map(k => { const x = ago(k); return Object.assign({ l: x.toLocaleDateString('en', { weekday: 'short' }) }, sd(x)); });
const streak = () => { let k = sd(ago(0)).full ? 0 : 1, n = 0; while (k < 400) { const o = sd(ago(k)); if (!o || !o.full) break; n++; k++; } return n; };
const longest = () => { let b = 0, n = 0; for (let k = 365; k >= 0; k--) { const o = sd(ago(k)); if (o && o.full) { n++; b = Math.max(b, n); } else n = 0; } return b; };
const dayCard = o => `<div class="row sb"><b>${dayLabel(o.x)}</b><span class="${o.full ? 'rt' : 'mu'}" style="font-weight:700;font-size:12px">${o.full ? 'Goals completed' : 'Goals not completed'}</span></div><div class="g g3" style="margin-top:10px;text-align:center">${[[fmt(o.s), 'STEPS · ' + o.sp + '%'], [distNum(o.d), S.units.toUpperCase() + ' · ' + o.dp + '%'], [o.a ? 'Yes' : 'No', 'ACTIVITY']].map(([a, b]) => `<div><div class="big" style="font-size:20px;color:var(--tx)">${a}</div><div class="mu" style="font-size:11px">${b}</div></div>`).join('')}</div>${o.has ? '' : '<div class="mu" style="margin-top:8px;font-size:12px">No steps or activity recorded this day.</div>'}`;

/* Progress screen bars (select a day to see its numbers; does not change the dashboard date) */
function pick(i) { S.day = i; document.querySelectorAll('[data-i]').forEach(e => e.classList.toggle('on', e.dataset.i == i)); const e = $('#dd'); if (e) e.innerHTML = dayCard(WK()[i]); }
function bars(a) { const m = Math.max(...a, 0.0001), w = WK(), i0 = S.day ?? 6; return `<div class="bars">${a.map((v, i) => `<div data-i="${i}" class="${i == i0 ? 'on' : ''}" onclick="pick(${i})" onmouseenter="pick(${i})"><i style="height:${Math.max(v / m * 80, v > 0 ? 4 : 0)}%"></i>${w[i].l[0]}</div>`).join('')}</div><div id="dd" style="margin-top:12px;border-top:1px solid var(--bd);padding-top:10px">${dayCard(w[i0])}</div>`; }

/* ---------- calendar ---------- */
const hm = x => { const o = sd(x), k = Store.dayKey(+x); return [o && o.full ? 'd' : '', o && o.has && !o.full ? 'h' : '', k === Store.dayKey() ? 't' : '', k === (S.selKey || Store.dayKey()) ? 'sl' : '', o ? '' : 'fu'].join(' '); };
function cal(m, mark, click) {
  const n = new Date(), dt = new Date(n.getFullYear(), n.getMonth() + m, 1), days = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate(), off = (dt.getDay() + 6) % 7;
  let h = DAYS.map(d => `<b>${d[0]}</b>`).join('') + '<i></i>'.repeat(off);
  for (let d = 1; d <= days; d++) {
    const x = new Date(dt.getFullYear(), dt.getMonth(), d), k = Store.dayKey(+x), c = mark(x, d), ok = click && k <= Store.dayKey();
    h += `<span class="${c}" ${ok ? `role="button" tabindex="0" aria-label="${dayLabel(x)}" onclick="selectDate('${k}')"` : ''}>${d}</span>`;
  }
  return `<div class="row sb" style="margin-bottom:8px"><b>${dt.toLocaleString('en', { month: 'long', year: 'numeric' })}</b></div><div class="cal">${h}</div>`;
}
const legend = () => `<div class="leg"><span><i class="lg d"></i>Goals completed</span><span><i class="lg h"></i>Activity, goals not met</span><span><i class="lg t"></i>Today</span><span><i class="lg sl"></i>Selected</span></div>`;
function monthCard(m) {
  const n = new Date(), dt = new Date(n.getFullYear(), n.getMonth() + m, 1), days = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  let s = 0, k = 0, g = 0, dy = 0, act = 0;
  for (let d = 1; d <= days; d++) { const o = sd(new Date(dt.getFullYear(), dt.getMonth(), d)); if (!o) continue; dy++; s += o.s; k += o.d; g += o.full ? 1 : 0; act += o.a; }
  const b = (l, v) => `<div><div class="mu">${l}</div><div class="big" style="font-size:20px">${v}</div></div>`;
  return `<div class="c"><b>${dt.toLocaleString('en', { month: 'long' })} summary</b><div class="g g2" style="margin-top:10px">${b('STEPS', fmt(s))}${b('DISTANCE', distNum(k) + ' ' + S.units)}${b('GOAL DAYS', g + ' / ' + dy)}${b('DAILY AVG', dy ? fmt(Math.round(s / dy)) : '—')}</div><div class="row sb" style="margin-top:12px"><span class="mu">Current streak</span><b>${streak()} ${streak() === 1 ? 'day' : 'days'}</b></div><div class="row sb"><span class="mu">Longest streak (last year)</span><b>${longest()} ${longest() === 1 ? 'day' : 'days'}</b></div></div>`;
}

/* ---------- dashboard ---------- */
const ringW = (p, full) => { const c = 2 * Math.PI * 44; return `<div style="position:relative;width:112px;height:112px;flex:none" role="img" aria-label="${p}% of goal"><svg width="112" height="112" style="transform:rotate(-90deg)"><circle cx="56" cy="56" r="44" style="stroke:var(--on,#fff);stroke-opacity:.3;stroke-width:12"/><circle class="rg" style="--c:${c};stroke:var(--on,#fff);stroke-width:12" cx="56" cy="56" r="44" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}"/></svg><div style="position:absolute;inset:0;display:grid;place-content:center;text-align:center;color:var(--on,#fff)"><b style="font-size:26px">${p}%</b><span style="font-size:12px;opacity:.9">${full ? 'Goal met' : 'Goal'}</span></div></div>`; };
const stepCard = () => {
  if (S.live) return `<div class="c row sb" style="margin-bottom:12px"><span class="mu">${ci('run')} Step counter active</span><b>${fmt(S.stepsToday || 0)} steps today</b></div>`;
  const m = { unsupported: 'Step counting works in the Android app only.', nosensor: 'This phone has no step counter sensor.', denied: 'Permission denied. Allow Physical activity for Stride in Android Settings, then tap Enable.', error: 'Could not start the step counter. Try again.' }[S.stepState] || "Count steps with the phone's built-in step sensor. This needs the Physical activity permission.";
  return `<div class="c" style="margin-bottom:12px"><b>Step counter is off</b><p class="mu" style="margin:4px 0 0">${m}</p>${S.stepState === 'unsupported' || S.stepState === 'nosensor' ? '' : '<button class="btn o" style="margin-top:10px" onclick="stepsInit(true)">ENABLE STEP COUNTER</button>'}</div>`;
};
V.home = pv => {
  const d = S.dash, w = WK(), L = S.lay, sel = selRec(), isT = sel.key === Store.dayKey(), i0 = w.findIndex(o => o.key === sel.key), mx = Math.max(...w.map(x => x.s), 1), X = i => 20 + i * 43.3, Y = v => 78 - v / mx * 58, ov = d.Steps && (L == 'Classic' || L == 'Compact');
  let path = `M${X(0)},${Y(w[0].s)}`;
  for (let i = 1; i < 7; i++) { const mid = (X(i - 1) + X(i)) / 2; path += `C${mid},${Y(w[i - 1].s)} ${mid},${Y(w[i].s)} ${X(i)},${Y(w[i].s)}`; }
  const hero = d.Steps ? `<div class="hero" style="padding-bottom:${ov ? 46 : 18}px"><div><div class="o">${isT ? 'Steps today' : 'Steps · ' + dayLabel(sel.x)}</div><div class="hb">${fmt(sel.s)}</div><button class="o hl" onclick="goalSheet()">Goal: ${fmt(sel.g.steps)} steps</button>${d.Distance ? `<div class="o" style="margin-top:14px">Distance</div><div class="hb" style="font-size:30px">${distNum(sel.d)} <small>${S.units}</small></div><button class="o hl" onclick="goalSheet()">Goal: ${distNum(sel.g.km)} ${S.units} · ${sel.dp}%</button>` : ''}</div>${ringW(sel.sp, Track.done(sel.s, sel.g.steps))}</div>` : '';
  const gr = d['Weekly Graph'] ? `<div class="c" style="margin:${ov ? '-30px 6px 10px' : '12px 0'};padding:14px 10px 10px;box-shadow:0 8px 24px #0002"><svg viewBox="0 0 300 90" width="100%"><path d="${path}" style="stroke:var(--rd);stroke-width:2.5"/>${w.map((o, i) => `<circle class="pt ${i == i0 ? 'on' : ''}" cx="${X(i)}" cy="${Y(o.s)}"/>`).join('')}${w.map((o, i) => `<rect x="${X(i) - 21}" y="0" width="43" height="90" style="fill:transparent;stroke:none;cursor:pointer" onclick="selectDate('${o.key}')"/>`).join('')}</svg><div class="row" style="justify-content:space-around">${w.map((o, i) => `<button class="dl ${i == i0 ? 'on' : ''}" onclick="selectDate('${o.key}')">${o.l.toUpperCase()}</button>`).join('')}</div><div id="dd" style="margin:10px 4px 2px;border-top:1px solid var(--bd);padding-top:10px">${dayCard(sel)}</div></div>` : '';
  const card = (a, v, u, f) => `<div class="c" ${f ? `role="button" tabindex="0" onclick="${f}"` : ''} style="margin:0"><div class="row sb"><span class="mu">${a}</span><span class="mu">${ci('cr')}</span></div><div class="big" style="color:var(--rt);font-size:22px">${v} <small class="mu" style="font-size:12px;font-weight:600">${u}</small></div></div>`;
  const avg = Math.round(w.reduce((a, x) => a + x.s, 0) / 7);
  const grid = L == 'Compact' ? '' : `<div class="g g2">${card('Calories', '—', 'needs device', "go('gear','gear')")}${card('7 days average', fmt(avg), 'steps')}${card('Floors', '—', 'needs device', "go('gear','gear')")}${d.Distance ? card('Distance', distNum(sel.d), S.units, "S.pt='DISTANCE';go('insights','insights')") : ''}${d.Streak ? card('Streak', ci('fl') + ' ' + streak(), streak() === 1 ? 'day' : 'days', "S.pt='STREAK';go('insights','insights')") : ''}</div>`;
  const pg = d['Daily Progress'] ? `<h2>${isT ? "Today's" : 'Daily'} progress</h2><div class="c g">${[['Steps goal', Track.done(sel.s, sel.g.steps)], ['Distance goal', Track.done(sel.d, sel.g.km)], ['Activity recorded', !!sel.a]].map(([a, i]) => `<div class="row sb"><span>${a}</span><span class="ck ${i ? 'on' : ''}" aria-label="${i ? 'done' : 'not done'}">${i ? ci('chk') : ''}</span></div>`).join('')}</div>` : '';
  const ca = d.Calendar ? `<h2>Consistency</h2><div class="c">${cal(S.hm, hm, 1)}${calNav('hm')}${legend()}</div>${monthCard(S.hm)}` : '';
  const head = pv ? '' : `<div class="row sb" style="margin-bottom:14px"><div><h1 style="font-size:30px">${isT ? 'Today' : 'History'} <span class="mu">${sel.x.toLocaleDateString('en', { day: 'numeric', month: 'long' })}</span></h1><div class="mu">${isT ? 'Good morning, ' + E(S.u.name.split(' ')[0]) : 'Viewing a past day'}</div></div>${isT ? '' : '<button class="chip on" onclick="selectDate(null)">Today</button>'}</div>`;
  const foot = pv ? '' : `<h2>Recent activity</h2>${recent()}<h2>Training</h2>${row('Custom Plan', S.plan ? 'Week 1 of ' + S.plan.w + ' ›' : 'Set up ›', "go('plan')")}${row('Customize dashboard', null, "go('dash')")}<p class="mu">${S.live ? 'Steps come from your phone sensor. Distance outside recorded activities is estimated from steps.' : 'No step data yet. Enable the step counter to start recording.'}</p>`;
  const inner = head + (pv ? '' : startCard() + stepCard()) + (L == 'Graph Focus' ? gr + hero + grid : L == 'Stats Focus' ? hero + grid + pg + gr : hero + gr + grid) + (L == 'Stats Focus' ? '' : pg) + ca + foot;
  const w2 = `<div class="${L == 'Compact' ? 'cmp' : ''}">${inner}</div>`;
  return pv ? w2 : `<main>${w2}</main>`;
};

/* ---------- goals ---------- */
function goalSheet() {
  sheet('Daily goals', `<label>Steps per day<input id="gs" type="number" inputmode="numeric" min="1" max="200000" value="${S.g.steps}"></label><label>Distance per day (${S.units})<input id="gd" type="number" inputmode="decimal" min="0.1" step="0.1" value="${distNum(S.g.dist)}"></label><p class="mu">Changes apply from today. Earlier days keep the goal they had.</p><button class="btn" onclick="saveGoals()">SAVE GOALS</button>`);
}
function saveGoals() {
  const s = Math.round(+$('#gs').value), dk = +$('#gd').value;
  if (!(s >= 1 && s <= 200000)) { toast('Enter a step goal between 1 and 200,000'); return; }
  if (!(dk >= 0.1 && dk <= 500)) { toast('Enter a distance goal between 0.1 and 500'); return; }
  const km = +(S.units === 'mi' ? dk * Track.MI : dk).toFixed(3), key = Store.dayKey();
  if (!S.goalHist.length) S.goalHist.push({ d: '0000-00-00', s: S.g.steps, k: S.g.dist });
  S.goalHist = S.goalHist.filter(e => e.d !== key).concat([{ d: key, s, k: km }]);
  S.g = { steps: s, dist: km };
  closeSh(); R(); toast('Goals saved');
}

/* ---------- activity screen ---------- */
V.start = () => {
  if (S.st.rs == 'completed') S.st.rs = 'idle';
  const sh = selShoe();
  if (!live()) {
    const a = S.shoes.filter(s => !s.ret);
    return `<main><button class="back" onclick="go('run','run')">${ci('ar')} Back</button><h2 style="margin-top:4px">Activity type</h2><div class="g g2">${['Walking', 'Running'].map(t => `<button class="chip ${S.act == t ? 'on' : ''}" style="min-height:48px" onclick="S.act='${t}';R()">${t}</button>`).join('')}</div><h2>Tracking</h2><div class="c"><div class="row sb"><span>Steps</span><span class="mu">${S.live ? 'Ready' : 'Permission asked on Start'}</span></div><div class="row sb" style="margin-top:8px"><span>GPS route and distance</span><span class="mu">Permission asked on Start</span></div><p class="mu" style="margin:10px 0 0;font-size:12px">Location is only used while an activity is recording, and stays on this phone. If GPS is unavailable, distance is estimated from steps and labelled as an estimate.</p></div><h2>Choose shoes</h2>${a.length ? a.map(s => `<div class="c row ${sh && sh.id == s.id ? 'sel' : ''}" onclick="S.sel='${s.id}';R()"><span class="av" style="border-radius:10px;width:44px;height:44px">${s.img ? `<img src="${s.img}" alt="">` : ci('shoe')}</span><div style="flex:1"><b>${sname(s)}</b><div class="mu">${DU(since(s, mon0().getTime()))} this week · ${DU(stot(s))} total</div></div><span class="rad ${sh && sh.id == s.id ? 'on' : ''}"></span></div>`).join('') : `<div class="c"><p class="mu">No shoes yet. Add a pair to track mileage automatically, or go without.</p></div>`}<button class="btn o" style="margin-top:0" onclick="shoeForm()">${ci('plus')} ADD SHOE</button><div class="stk"><div class="mu" style="text-align:center;padding-bottom:4px">${sh ? sname(sh) : 'No shoes selected'}</div><button class="btn" style="margin:0;min-height:72px;font-size:18px" onclick="startRun()">START ${S.act == 'Running' ? 'RUN' : 'WALK'}</button></div></main>`;
  }
  const p = S.st.rs == 'paused', n = Date.now(), d = runDist(run), mv = movSec(run, n), rs = shoe(run.sh);
  return `<main style="display:flex;flex-direction:column;min-height:100%"><div class="row sb"><button class="back" style="padding:0" onclick="backRun()">${ci('ar')} Back</button><span class="chip on" style="${p ? 'background:var(--tx);border-color:var(--tx);color:var(--bg)' : ''}">${run.t == 'Running' ? 'RUN' : 'WALK'} · ${p ? 'PAUSED' : 'RECORDING'}</span></div><div class="row" style="gap:6px;flex-wrap:wrap;margin:8px 0 0"><span class="pill" id="gc">${gpsStatus()}</span><span class="pill" id="sc">${stepStatus()}</span></div><div style="text-align:center;margin:10px 0 4px"><div class="mu lbl">TIME</div><div class="m" id="t" style="font-size:72px">${dur(Math.floor(elapsed(run, n)))}</div></div><div class="g g2"><div class="c" style="text-align:center"><div class="mu lbl">ACTIVITY STEPS</div><div class="big" id="st" style="font-size:44px">${fmt(run.steps)}</div></div><div class="c" style="text-align:center"><div class="mu lbl">DISTANCE (${S.units.toUpperCase()})</div><div class="big" id="d" style="font-size:44px">${distNum(d.km)}</div></div></div><div class="mu" id="ds" style="text-align:center;font-size:12px;margin:-2px 0 8px">${d.src == 'gps' ? 'Distance measured by GPS' : 'Distance estimated from steps'}</div><div class="g g3"><div class="c"><div class="mu lbl">${avgLbl().toUpperCase()}</div><b id="ap">${PC(mv, d.km)}</b><div class="mu" id="as" style="font-size:12px">${S.sec ? PS(mv, d.km) : ''}</div></div><div class="c"><div class="mu lbl">${curLbl().toUpperCase()}</div><b id="cp">${curPace()}</b></div><div class="c"><div class="mu lbl">TODAY STEPS</div><b id="td">${fmt(S.stepsToday || 0)}</b></div></div><div class="mu row" style="justify-content:center;font-size:12px">${ci('shoe')} ${rs ? sname(rs) : 'No shoes'}</div><div class="row" style="margin-top:auto;padding-top:18px"><button class="rb" onclick="pauseRun()">${p ? 'RESUME' : 'PAUSE'}</button><button id="hs" class="hold" onpointerdown="hold(1)" onpointerup="hold(0)" onpointerleave="hold(0)" onpointercancel="hold(0)" oncontextmenu="return false"><i id="hf"></i><span>HOLD TO FINISH</span></button></div><button class="link" style="margin:12px auto 0;padding:10px" onclick="discardRun()">Discard activity</button></main>`;
};

/* ---------- activity details + route map ---------- */
let leafP = null;
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafP) return leafP;
  leafP = new Promise((ok, no) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = './leaflet/leaflet.css'; document.head.append(l);
    const s = document.createElement('script'); s.src = './leaflet/leaflet.js'; s.onload = ok; s.onerror = () => { leafP = null; no(new Error('map library')); }; document.head.append(s);
  });
  return leafP;
}
function svgRoute(lines) {
  const all = lines.flat(), la = all.map(p => p[0]), lo = all.map(p => p[1]), k = Math.cos(la[0] * Math.PI / 180) || 1;
  const x0 = Math.min(...lo), y0 = Math.min(...la), w = (Math.max(...lo) - x0) * k || 1e-6, h = Math.max(...la) - y0 || 1e-6, sc = Math.min(280 / w, 160 / h), P = p => `${10 + (p[1] - x0) * k * sc},${170 - (p[0] - y0) * sc}`;
  return `<svg viewBox="0 0 300 180" width="100%" height="100%" style="stroke:var(--rd);stroke-width:3;fill:none">${lines.map(l => `<polyline points="${l.map(P).join(' ')}"/>`).join('')}</svg>`;
}
async function drawMap(el, id) {
  const pts = Store.getRoute(id), lines = [];
  pts.forEach(p => { (lines[p[5]] = lines[p[5]] || []).push([p[0], p[1]]); });
  const segs = lines.filter(Boolean);
  if (pts.length < 2) { el.className = 'map none'; el.innerHTML = '<p class="mu">Too few GPS points were recorded to draw a route.</p>'; return; }
  el.innerHTML = svgRoute(segs); // plain route first, so something useful shows while the map library loads (or if it cannot load)
  try {
    await loadLeaflet();
    if (!el.isConnected) return;
    el.innerHTML = '';
    const m = L.map(el, { attributionControl: true });
    if (S.tiles.on) L.tileLayer(S.tiles.url || OSM, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    const b = [];
    segs.forEach(l => { if (l.length > 1) L.polyline(l, { color: S.acc, weight: 5, opacity: .95 }).addTo(m); l.forEach(c => b.push(c)); });
    L.circleMarker(b[0], { radius: 8, color: '#fff', weight: 3, fillColor: '#1DA851', fillOpacity: 1 }).addTo(m).bindTooltip('Start');
    L.circleMarker(b[b.length - 1], { radius: 8, color: '#fff', weight: 3, fillColor: '#E10600', fillOpacity: 1 }).addTo(m).bindTooltip('Finish');
    m.fitBounds(b, { padding: [28, 28], maxZoom: 17 });
  } catch (e) { if (el.isConnected && !el.querySelector('svg')) el.innerHTML = svgRoute(segs); }
}
function afterRender() { const m = $('#map'); if (m && S.st.vid) drawMap(m, S.st.vid); }
const srcLbl = r => (r.src == 'gps' ? 'Distance measured by GPS' : r.src == 'sim' ? 'Simulated (recorded by an earlier version)' : 'Distance estimated from steps');
const runView = (r, fresh) => {
  if (!r) return V.hist();
  const sh = shoe(r.sh), f = t => new Date(t).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }), mv = r.mov || r.sec, has = Store.getRoute(r.id).length > 0;
  const cells = [['Distance', DU(r.km)], r.elev ? ['Elevation gain', r.elev.gain + ' m'] : null, ['Moving time', dur(mv)], [avgLbl(), PC(mv, r.km) + (S.sec ? `<small>${PS(mv, r.km)}</small>` : '')], r.elev ? ['Max elevation', r.elev.max + ' m'] : null, ['Elapsed time', dur(r.sec)], ['Steps', r.hasSteps === false || r.src == 'sim' ? '—' : fmt(r.steps || 0)], ['Calories', r.cal + ' kcal (est.)']].filter(Boolean);
  return `<main>${fresh ? `<div class="row" style="margin-bottom:8px"><span class="ck on pulse" style="width:30px;height:30px">${ci('chk')}</span><b>Activity saved</b></div>` : bk('hist')}${has ? '<div id="map" class="map"></div>' : `<div class="map none"><p class="mu">${r.src == 'gps' ? 'The route is no longer available.' : 'No GPS route was recorded for this activity.'}</p></div>`}<div class="row sb" style="margin-top:12px"><div><h1 style="font-size:22px">${E(r.title || defaultTitle(r.t, r.start))}</h1><div class="mu">${new Date(r.start).toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })} · ${f(r.start)}–${f(r.ts)}</div></div><button class="ib" onclick="renameRun('${r.id}')" aria-label="Rename activity">${ci('pen')}</button></div><div class="stg">${cells.map(([a, b]) => `<div><div class="mu lbl">${a.toUpperCase()}</div><b>${b}</b></div>`).join('')}</div><p class="mu" style="font-size:12px">${srcLbl(r)}.</p><h2>Shoe used</h2><div class="c row sb" ${sh ? `onclick="S.st.sid='${sh.id}';go('shoe')"` : ''}><div><b>${sh ? sname(sh) : r.shn ? E(r.shn) + ' (removed)' : 'No shoe'}</b>${sh ? `<div class="mu">+${DU(r.km)} added to shoe mileage</div>` : ''}</div>${sh ? ci('cr') : ''}</div>${fresh ? `<button class="btn" onclick="go('home','home')">DONE</button><button class="btn o" onclick="go('run','run')">START ANOTHER</button>` : ''}<button class="btn o" onclick="delRun('${r.id}')">DELETE ACTIVITY</button></main>`;
};
V.summary = () => { S.st.vid = S.st.last ? S.st.last.id : S.st.vid; return runView(S.runs.find(x => x.id == S.st.vid) || S.st.last, 1); };
V.rundetail = () => runView(S.runs.find(x => x.id == S.st.vid));
function renameRun(id) { const r = S.runs.find(x => x.id == id); sheet('Rename activity', `<input id="ev" value="${E(r.title || defaultTitle(r.t, r.start))}" maxlength="60"><button class="btn" onclick="const v=$('#ev').value.trim();if(!v){toast('Enter a name');return}Store.updateRun('${id}',{title:v});S.runs=Store.getRuns();closeSh();R()">SAVE</button>`); }
V.hist = () => `<main><h1>Activity</h1><p class="mu">${S.runs.length} activities · ${DU(sum(S.runs, r => r.km))}</p>${S.runs.length ? S.runs.map(r => { const mv = r.mov || r.sec; return `<div class="c" role="button" tabindex="0" onclick="S.st.vid='${r.id}';go('rundetail')"><div class="row sb"><b>${E(r.title || defaultTitle(r.t, r.start))}</b><span class="pill">${r.src == 'gps' ? 'GPS' : r.src == 'sim' ? 'Simulated' : 'Estimated'}</span></div><div class="mu" style="font-size:12px">${new Date(r.start).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })} · ${new Date(r.start).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</div><div class="row sb" style="margin-top:8px"><span class="big" style="font-size:22px">${DU(r.km)}</span><span>${dur(r.sec)}</span><span>${PC(mv, r.km)}</span><span class="mu">${r.src == 'sim' || r.hasSteps === false ? '—' : fmt(r.steps || 0)} steps</span></div><div class="mu" style="margin-top:6px">${ci('shoe')} ${shoe(r.sh) ? sname(shoe(r.sh)) : r.shn ? E(r.shn) : 'No shoe'}</div></div>`; }).join('') : `<div class="c ctr"><p class="mu">No activities yet.</p><button class="btn" onclick="S.act='Walking';go('start')">START YOUR FIRST ACTIVITY</button></div>`}</main>`;

/* ---------- appearance, dashboard customization, settings ---------- */
const segB = (k, o) => `<div class="g" style="grid-template-columns:repeat(${o.length},1fr)" role="radiogroup">${o.map(([v, l]) => `<button role="radio" aria-checked="${S[k] == v}" class="chip ${S[k] == v ? 'on' : ''}" style="min-height:44px" onclick="S.${k}='${v}';R()">${l}</button>`).join('')}</div>`;
const sw = () => `<div class="sw" role="radiogroup" aria-label="Accent color">${ACC.map((c, i) => `<button role="radio" aria-checked="${S.acc === c}" title="${ACCN[i]}" aria-label="${ACCN[i]}" class="swb ${S.acc === c ? 'on' : ''}" style="background:${c};color:${onColor(c)}" onclick="S.acc='${c}';R()">${S.acc === c ? ci('chk') : ''}</button>`).join('')}</div>`;
const appearance = () => `<div class="c"><div class="mu" style="margin-bottom:8px">Theme style</div>${segB('style', [['classic', 'Classic'], ['stardust', 'Stardust']])}<div class="mu" style="margin:14px 0 8px">Appearance mode</div>${segB('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])}<div class="mu" style="margin:14px 0 10px">Accent color · <b style="color:var(--rt)">${ACCN[ACC.indexOf(S.acc)] || 'Custom'}</b></div>${sw()}</div>`;
const LAY = [['Classic', 'Balanced stats and graph'], ['Compact', 'More info, less scrolling'], ['Stats Focus', 'Numbers first'], ['Graph Focus', 'Trends first']];
const pvh = () => (Object.values(S.dash).some(x => x) ? V.home(1) : '<p class="mu" style="font-size:22px">Select at least one widget.</p>');
function pvr() { const e = $('.pvi'); if (e) { e.innerHTML = pvh(); e.classList.remove('fx'); void e.offsetWidth; e.classList.add('fx'); } save(); }
V.dash = () => `<main>${bk('home')}<h1>Customize Dashboard</h1><p class="mu">Choose what appears and how it looks.</p><h2>Widgets</h2>${Object.keys(S.dash).map(k => `<div class="c row sb"><span>${k}</span><button class="tg ${S.dash[k] ? 'on' : ''}" role="switch" aria-checked="${!!S.dash[k]}" aria-label="${k}" onclick="S.dash['${k}']=S.dash['${k}']?0:1;this.classList.toggle('on');pvr()"></button></div>`).join('')}<h2>Layout</h2><div class="g g2">${LAY.map(([l, d]) => `<button class="lay ${S.lay == l ? 'on' : ''}" onclick="S.lay='${l}';R()"><b>${l}</b><span>${d}</span></button>`).join('')}</div><h2>Appearance</h2>${appearance()}<h2>Live preview</h2><div class="pv"><div class="pvi">${pvh()}</div></div><button class="btn" onclick="save();toast('Dashboard saved');go('home','home')">SAVE</button></main>`;
function strideSheet() {
  const best = S.runs.find(r => r.src == 'gps' && r.steps >= 500 && r.km >= .5), cal = best ? Math.round(best.km * 1000 / best.steps * 100 / (best.t == 'Running' ? Track.RUN_FACTOR : 1)) : 0;
  sheet('Stride length', `<p class="mu">Used to estimate distance from steps when GPS is not available. Leave empty to use your height (${S.u.h ? S.u.h + ' cm' : 'not set'}).</p><label>Walking stride (cm)<input id="sl" type="number" inputmode="numeric" min="30" max="200" value="${S.stride || ''}" placeholder="auto: ${Math.round(Track.strideM(+S.u.h, 0) * 100)}"></label>${cal >= 30 && cal <= 200 ? `<button class="btn o" onclick="$('#sl').value=${cal}">USE ${cal} CM FROM YOUR LAST GPS ACTIVITY</button>` : ''}<button class="btn" onclick="const v=$('#sl').value;if(v&&!(+v>=30&&+v<=200)){toast('Enter 30 to 200 cm, or leave empty');return}S.stride=v?Math.round(+v):0;closeSh();R();toast('Stride saved')">SAVE</button>`);
}
function mapSheet() {
  sheet('Route map', `<div class="row sb" style="padding:6px 0"><span>Show map background</span><button class="tg ${S.tiles.on ? 'on' : ''}" role="switch" aria-checked="${!!S.tiles.on}" aria-label="Show map background" onclick="S.tiles.on=S.tiles.on?0:1;this.classList.toggle('on');save()"></button></div><label>Custom tile URL (optional)<input id="tu" value="${E(S.tiles.url || '')}" placeholder="${OSM}"></label><p class="mu" style="font-size:12px">Routes are drawn on the phone. Only the map pictures are downloaded, so the tile server can see roughly which area you view. The default is the community OpenStreetMap server, which is fine for personal use but not for a public release. Use a provider whose terms allow your use, or turn the background off for a plain route.</p><button class="btn" onclick="const u=$('#tu').value.trim();if(u&&!(/^https:\\/\\//.test(u)&&u.includes('{z}')&&u.includes('{x}')&&u.includes('{y}'))){toast('Use an https URL containing {z}, {x} and {y}');return}S.tiles.url=u;closeSh();R();toast('Map settings saved')">SAVE</button>`);
}
V.settings = () => { const d = shoe(S.def); return `<main>${bk('profile')}<h1>Settings</h1><p class="mu">Set colors. Change units. Manage shoes.</p><h2>Account</h2><div class="c row" onclick="go('editprof')">${av(46, S.u.img, S.u.name)}<div style="flex:1"><b>${E(S.u.name)}</b><div class="mu">My Profile</div></div>${ci('cr')}</div><h2>Appearance</h2>${appearance()}<h2>Goals</h2>${row('Daily goals', fmt(S.g.steps) + ' steps · ' + distNum(S.g.dist) + ' ' + S.units, 'goalSheet()')}<h2>Running</h2><div class="c"><div class="mu" style="margin-bottom:8px">Distance units</div>${segB('units', [['km', 'Kilometres'], ['mi', 'Miles']])}<div class="mu" style="margin:14px 0 8px">Primary metric</div>${segB('pace', [['pace', 'Pace (min per ' + (S.units == 'mi' ? 'mile' : 'km') + ')'], ['speed', 'Speed (' + (S.units == 'mi' ? 'mph' : 'km/h') + ')']])}<div class="row sb" style="margin-top:14px"><span>Also show the other metric</span><button class="tg ${S.sec ? 'on' : ''}" role="switch" aria-checked="${!!S.sec}" aria-label="Show secondary metric" onclick="S.sec=S.sec?0:1;R()"></button></div></div>${row('Stride length', S.stride ? S.stride + ' cm' : 'Auto', 'strideSheet()')}${row('Route map', S.tiles.on ? 'On' : 'Off', 'mapSheet()')}<h2>Shoes</h2>${row('My Shoes', S.shoes.length + '', "go('shoes')")}${row('Default shoe', d ? sname(d) : 'None', 'defShoe()')}<h2>App</h2>${row('Notifications', null, 'notif()')}${row('Preferences', null, 'priv()')}${row('Health Permissions', null, 'perm()')}${row('Dashboard Customization', null, "go('dash')")}<button class="btn o" style="color:var(--rt)" onclick="logout()">LOGOUT</button></main>`; };
