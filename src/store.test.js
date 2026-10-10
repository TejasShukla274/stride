import { describe, it, expect, beforeEach } from 'vitest';
import Store from '../public/store.js';

const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, removeItem: k => { delete m[k]; }, _m: m }; };
let ls;
beforeEach(() => { ls = mem(); Store.init(ls); });
const run = (id, km, sh, ts = Date.now()) => ({ id, ts, start: ts - 1000, sec: 600, km, cal: 100, sh });

describe('shoe mileage', () => {
  it('adds a run to the selected shoe only', () => {
    const a = Store.saveShoe({ brand: 'Nike', model: 'Pegasus', start: 250 });
    const b = Store.saveShoe({ brand: 'ASICS', model: 'Nova', start: 0 });
    Store.saveRun(run('r1', 7.4, a.id));
    expect(Store.shoeMileage(a)).toBeCloseTo(257.4);
    expect(Store.shoeMileage(b)).toBe(0);
  });
  it('recalculates after a run is deleted', () => {
    const a = Store.saveShoe({ brand: 'N', model: 'P', start: 100 });
    Store.saveRun(run('r1', 5, a.id)); Store.saveRun(run('r2', 3, a.id));
    Store.deleteRun('r1');
    expect(Store.shoeMileage(a)).toBe(103);
  });
  it('keeps runs when a shoe is deleted', () => {
    const a = Store.saveShoe({ brand: 'N', model: 'P' });
    Store.saveRun(run('r1', 5, a.id)); Store.deleteShoe(a.id);
    expect(Store.getRuns()).toHaveLength(1);
  });
  it('retire keeps history and sets status', () => {
    const a = Store.saveShoe({ brand: 'N', model: 'P' });
    Store.saveRun(run('r1', 5, a.id));
    expect(Store.updateShoe(a.id, { ret: true }).status).toBe('RETIRED');
    expect(Store.shoeMileage(Store.getShoes()[0])).toBe(5);
  });
});

describe('runs', () => {
  it('ignores duplicate saves', () => {
    Store.saveRun(run('r1', 5, null)); Store.saveRun(run('r1', 5, null));
    expect(Store.getRuns()).toHaveLength(1);
  });
  it('rejects invalid runs', () => {
    expect(Store.saveRun({ id: 'x', km: -1, sec: 5 })).toBe(false);
    expect(Store.saveRun(null)).toBe(false);
  });
  it('sorts newest first', () => {
    Store.saveRun(run('a', 1, null, 100)); Store.saveRun(run('b', 1, null, 200));
    expect(Store.getRuns().map(r => r.id)).toEqual(['b', 'a']);
  });
});

describe('safety', () => {
  it('survives corrupt data', () => {
    ls.setItem('stride.runs', '{not json');
    expect(Store.getRuns()).toEqual([]);
    expect(Store.corrupt).toContain('stride.runs');
  });
  it('reports storage failure', () => {
    ls.setItem = () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); };
    expect(Store.saveRun(run('r1', 1, null))).toBe(false);
    expect(Store.error).toBe('QuotaExceededError');
  });
  it('loads and persists settings and profile', () => {
    const S = { u: { name: 'A' }, theme: 'dark', shoes: [], runs: [] };
    S.theme = 'light'; S.u.name = 'Bo'; Store.persist(S);
    const T = { u: { name: '' }, theme: 'dark' }; Store.load(T);
    expect(T.theme).toBe('light'); expect(T.u.name).toBe('Bo');
  });
  it('exports and imports a backup', () => {
    Store.saveRun(run('r1', 5, null)); const j = Store.exportAll();
    Store.reset(); expect(Store.getRuns()).toHaveLength(0);
    expect(Store.importAll(j)).toBe(true); expect(Store.getRuns()).toHaveLength(1);
    expect(Store.importAll('garbage')).toBe(false);
  });
  it('session round trip', () => {
    Store.saveSession({ sec: 5 }, 'Running'); expect(Store.getSession().run.sec).toBe(5);
    Store.clearSession(); expect(Store.getSession()).toBeNull();
  });
});

describe('step counting', () => {
  const day = 864e5, at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
  it('starts at zero and counts from the first reading', () => {
    expect(Store.stepsUpdate(1000, at(8, 10))).toBe(0);
    expect(Store.stepsUpdate(1500, at(8, 10, 1))).toBe(500);
    expect(Store.stepsToday(at(8, 11))).toBe(500);
  });
  it('keeps counting across an app restart (steps taken while closed)', () => {
    Store.stepsUpdate(1000, at(8, 10)); Store.init(ls);
    expect(Store.stepsUpdate(4200, at(8, 11))).toBe(3200);
  });
  it('handles a phone reboot (counter restarts from zero)', () => {
    Store.stepsUpdate(1000, at(8, 10)); Store.stepsUpdate(1500, at(8, 11));
    expect(Store.stepsUpdate(100, at(8, 12))).toBe(600);
  });
  it('splits steps taken while closed across midnight by time, instead of losing them', () => {
    Store.stepsUpdate(10000, at(8, 21)); // last reading 21:00
    const t = Store.stepsUpdate(10600, at(9, 7, 30)); // next reading 07:30 -> 600 steps over 10.5 h, 3 h before midnight
    expect(Store.getSteps().hist['2026-10-08']).toBe(171);
    expect(t).toBe(429);
    expect(Store.stepsToday(at(9, 8))).toBe(429);
  });
  it('a 10 minute walk just before the first morning open is not lost', () => {
    Store.stepsUpdate(5000, at(8, 23, 55));
    Store.stepsUpdate(5000, at(9, 7, 0)); // still same total: no steps overnight
    expect(Store.stepsToday(at(9, 7, 1))).toBe(0);
    expect(Store.stepsUpdate(6200, at(9, 7, 10))).toBe(1200);
  });
  it('stale yesterday count is not shown as today', () => {
    Store.stepsUpdate(1000, at(8, 10)); Store.stepsUpdate(3000, at(8, 20));
    expect(Store.stepsToday(at(9, 6))).toBe(0);
    expect(Store.stepsForDay('2026-10-08', at(9, 6))).toBe(2000);
  });
  it('multi-day gap keeps totals consistent and history intact', () => {
    Store.stepsUpdate(0, at(8, 0)); const t = Store.stepsUpdate(3000, at(11, 6));
    const h = Store.getSteps().hist; expect(h['2026-10-08'] + h['2026-10-09'] + h['2026-10-10'] + t).toBe(3000);
  });
  it('clock moving backwards (timezone change) does not lose or duplicate steps', () => {
    Store.stepsUpdate(1000, at(8, 12)); expect(Store.stepsUpdate(1200, at(8, 11))).toBe(200);
  });
  it('does not double count when the same total is reported again', () => {
    Store.stepsUpdate(1000, at(8, 10)); Store.stepsUpdate(1300, at(8, 11));
    expect(Store.stepsUpdate(1300, at(8, 11, 5))).toBe(300);
  });
});

describe('run edits', () => {
  it('renames a run without touching others or its id', () => {
    Store.saveRun(run('a', 1, null)); Store.saveRun(run('b', 2, null));
    expect(Store.updateRun('a', { title: 'Morning Walk', id: 'zzz' })).toBe(true);
    expect(Store.getRuns().find(r => r.id === 'a').title).toBe('Morning Walk');
    expect(Store.getRuns().find(r => r.id === 'b').title).toBeUndefined();
    expect(Store.updateRun('nope', {})).toBe(false);
  });
});

describe('routes', () => {
  it('stores each route separately and removes it with the run', () => {
    Store.saveRun(run('a', 1, null)); Store.saveRun(run('b', 2, null));
    Store.saveRoute('a', [[1, 2, 0, 5, null, 0]]); Store.saveRoute('b', [[3, 4, 0, 5, null, 0], [3, 4.1, 5, 5, null, 0]]);
    expect(Store.getRoute('a')).toHaveLength(1); expect(Store.getRoute('b')).toHaveLength(2);
    Store.deleteRun('a'); expect(Store.getRoute('a')).toEqual([]); expect(Store.getRoute('b')).toHaveLength(2);
  });
  it('routes survive export and import', () => {
    Store.saveRun(run('a', 1, null)); Store.saveRoute('a', [[1, 2, 0, 5, null, 0]]);
    const j = Store.exportAll(); Store.reset(); expect(Store.getRoute('a')).toEqual([]);
    Store.importAll(j); expect(Store.getRoute('a')).toHaveLength(1);
  });
});
