/* Stride data layer. All persistent data goes through this module. */
(function (root) {
  const KEYS = { profile: 'stride.profile', settings: 'stride.settings', shoes: 'stride.shoes', runs: 'stride.runs', session: 'stride.session', steps: 'stride.steps', ver: 'stride.version' };
  const VERSION = 1;
  const SETTING_KEYS = ['theme', 'style', 'acc', 'units', 'pace', 'sec', 'stride', 'tiles', 'goalHist', 'def', 'sel', 'dash', 'lay', 'pf', 'g', 'in'];
  const ROUTE = 'stride.route.';
  let ls = null;

  const Store = {
    corrupt: [],
    error: null,

    init(storage) {
      ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      Store.corrupt = [];
      const v = Store._get(KEYS.ver, 0);
      if (v < VERSION) Store._set(KEYS.ver, VERSION); // future migrations go here
      return Store;
    },
    _get(key, def) {
      try {
        const raw = ls && ls.getItem(key);
        return raw == null ? def : JSON.parse(raw);
      } catch (e) {
        Store.corrupt.push(key);
        return def;
      }
    },
    _set(key, val) {
      try { ls.setItem(key, JSON.stringify(val)); Store.error = null; return true; }
      catch (e) { Store.error = e && e.name || 'StorageError'; return false; }
    },

    /* ---- runs ---- */
    getRuns() {
      const r = Store._get(KEYS.runs, []);
      return Array.isArray(r) ? r.filter(x => x && x.id && isFinite(x.km)).sort((a, b) => b.ts - a.ts) : [];
    },
    saveRun(run) {
      if (!run || !run.id || !(run.km >= 0) || !(run.sec >= 0)) return false;
      const runs = Store.getRuns();
      if (runs.some(x => x.id === run.id)) return true; // idempotent: no duplicate saves
      runs.push(run);
      return Store._set(KEYS.runs, runs);
    },
    deleteRun(id) {
      Store.deleteRoute(id);
      return Store._set(KEYS.runs, Store.getRuns().filter(r => r.id !== id));
    },
    updateRun(id, patch) {
      const runs = Store.getRuns(), i = runs.findIndex(r => r.id === id);
      if (i < 0) return false;
      runs[i] = Object.assign(runs[i], patch, { id });
      return Store._set(KEYS.runs, runs);
    },
    /* Routes are stored per activity so activities never share location points. Points: [lat, lon, t, acc, alt|null, seg] */
    getRoute(id) { const r = Store._get(ROUTE + id, []); return Array.isArray(r) ? r : []; },
    saveRoute(id, pts) { return Store._set(ROUTE + id, pts); },
    deleteRoute(id) { try { ls.removeItem(ROUTE + id); } catch (e) { /* ignore */ } },

    /* ---- shoes ---- */
    getShoes() {
      const s = Store._get(KEYS.shoes, []);
      return Array.isArray(s) ? s.filter(x => x && x.id) : [];
    },
    _normShoe(s) {
      s.name = ((s.brand || '') + ' ' + (s.model || '')).trim();
      s.status = s.ret ? 'RETIRED' : 'ACTIVE';
      return s;
    },
    saveShoe(shoe) {
      const shoes = Store.getShoes();
      const s = Store._normShoe(Object.assign({ id: 'sh' + Date.now() + Math.random().toString(36).slice(2, 6), created: Date.now() }, shoe));
      shoes.push(s);
      return Store._set(KEYS.shoes, shoes) ? s : null;
    },
    updateShoe(id, patch) {
      const shoes = Store.getShoes(), i = shoes.findIndex(s => s.id === id);
      if (i < 0) return null;
      shoes[i] = Store._normShoe(Object.assign(shoes[i], patch, { id }));
      return Store._set(KEYS.shoes, shoes) ? shoes[i] : null;
    },
    deleteShoe(id) {
      return Store._set(KEYS.shoes, Store.getShoes().filter(s => s.id !== id)); // runs keep their shoe name snapshot
    },
    /* Mileage is always derived: starting mileage + runs recorded in this shoe. */
    shoeMileage(shoe, runs) {
      const rs = runs || Store.getRuns();
      return (+shoe.start || 0) + rs.filter(r => r.sh === shoe.id).reduce((a, r) => a + r.km, 0);
    },

    /* ---- profile & settings ---- */
    getProfile() { return Store._get(KEYS.profile, null); },
    saveProfile(p) { return Store._set(KEYS.profile, p); },
    getSettings() { return Store._get(KEYS.settings, {}); },
    saveSettings(s) { return Store._set(KEYS.settings, s); },

    /* ---- active run recovery ---- */
    getSession() { return Store._get(KEYS.session, null); },
    saveSession(run, act) { return Store._set(KEYS.session, { run, act, at: Date.now() }); },
    clearSession() { try { ls.removeItem(KEYS.session); } catch (e) { /* ignore */ } },

    /* ---- daily step counting (from the phone's since-boot step counter) ---- */
    dayKey(t) {
      const d = new Date(t == null ? Date.now() : t);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },
    /* State: { hist: {dayKey: steps}, day, today, last (since-boot total), lastT (ms) } */
    getSteps() {
      const s = Store._get(KEYS.steps, null);
      if (!s || typeof s !== 'object' || !s.hist) return { hist: {}, day: null, today: 0, last: null, lastT: null };
      if (s.today == null && s.last != null) s.today = (s.acc || 0) + (s.last - (s.base || 0)); // migrate older format
      if (s.lastT == null) s.lastT = Date.now();
      return s;
    },
    /* Steps for a local day. Today's value is only trusted if the stored day is still today. */
    stepsForDay(key, now) {
      const s = Store.getSteps();
      if (key === s.day) return key === Store.dayKey(now) ? s.today : s.today;
      return s.hist[key] || 0;
    },
    stepsToday(now) {
      const s = Store.getSteps();
      return s.day === Store.dayKey(now) ? s.today : 0;
    },
    _split(t0, t1, delta) {
      const total = t1 - t0, parts = [];
      if (!(total > 0)) return [{ key: Store.dayKey(t1), v: delta }];
      let cur = t0, n = 0;
      while (cur < t1 && n++ < 400) {
        const d = new Date(cur), next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(), end = Math.min(next, t1);
        parts.push({ key: Store.dayKey(cur), v: delta * (end - cur) / total }); cur = end;
      }
      let acc = 0;
      parts.forEach((p, i) => { p.v = i === parts.length - 1 ? delta - acc : Math.round(p.v); acc += p.v; });
      return parts;
    },
    /* total = steps since the phone booted. Steps taken since the previous reading (even while the app was closed)
       are split across the local days they spanned, in proportion to time. A lower total means the phone rebooted. */
    stepsUpdate(total, now) {
      now = now == null ? Date.now() : now;
      const s = Store.getSteps();
      if (s.last == null) {
        Store._set(KEYS.steps, { hist: s.hist, day: Store.dayKey(now), today: 0, last: total, lastT: now });
        return 0;
      }
      const delta = total >= s.last ? total - s.last : total;
      const parts = Store._split(Math.min(s.lastT, now), now, delta);
      for (const p of parts) {
        if (p.key !== s.day) { s.hist[s.day] = s.today; s.day = p.key; s.today = s.hist[p.key] || 0; }
        s.today += p.v;
      }
      s.last = total; s.lastT = now;
      Store._set(KEYS.steps, s);
      return s.today;
    },

    /* ---- app-state helpers ---- */
    load(S) {
      const p = Store.getProfile(), st = Store.getSettings();
      if (p) S.u = Object.assign(S.u, p);
      SETTING_KEYS.forEach(k => { if (st[k] !== undefined) S[k] = st[k]; });
      S.shoes = Store.getShoes();
      S.runs = Store.getRuns();
    },
    persist(S) {
      const st = {};
      SETTING_KEYS.forEach(k => { st[k] = S[k]; });
      return Store.saveProfile(S.u) && Store.saveSettings(st);
    },

    /* ---- backup ---- */
    exportAll() {
      const runs = Store.getRuns(), routes = {};
      runs.forEach(r => { const p = Store.getRoute(r.id); if (p.length) routes[r.id] = p; });
      return JSON.stringify({ app: 'stride', version: VERSION, profile: Store.getProfile(), settings: Store.getSettings(), shoes: Store.getShoes(), runs, routes, steps: Store.getSteps() });
    },
    importAll(json) {
      let d;
      try { d = JSON.parse(json); } catch (e) { return false; }
      if (!d || d.app !== 'stride' || !Array.isArray(d.runs) || !Array.isArray(d.shoes)) return false;
      Object.keys(d.routes || {}).forEach(id => Store.saveRoute(id, d.routes[id]));
      if (d.steps) Store._set(KEYS.steps, d.steps);
      return Store._set(KEYS.profile, d.profile) && Store._set(KEYS.settings, d.settings || {}) && Store._set(KEYS.shoes, d.shoes) && Store._set(KEYS.runs, d.runs);
    },
    reset() { Store.getRuns().forEach(r => Store.deleteRoute(r.id)); Object.values(KEYS).forEach(k => { try { ls.removeItem(k); } catch (e) { /* ignore */ } }); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
  else root.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
