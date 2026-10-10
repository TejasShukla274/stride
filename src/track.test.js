import { describe, it, expect } from 'vitest';
import T from '../public/track.js';

describe('goal progress', () => {
  it('9,900 of 10,000 is 99% and not complete', () => { expect(T.pct(9900, 10000)).toBe(99); expect(T.done(9900, 10000)).toBe(false); });
  it('9,999.6 of 10,000 never shows 100', () => { expect(T.pct(9999.6, 10000)).toBe(99); });
  it('exact target is 100% and complete', () => { expect(T.pct(10000, 10000)).toBe(100); expect(T.done(10000, 10000)).toBe(true); });
  it('over target is clamped to 100', () => { expect(T.pct(12000, 10000)).toBe(100); expect(T.pct(8592, 100)).toBe(100); });
  it('bad targets are safe', () => { expect(T.pct(50, 0)).toBe(0); expect(T.pct(50, NaN)).toBe(0); expect(T.pct(-5, 100)).toBe(0); expect(T.done(5, 0)).toBe(false); });
  it('0.1 + 0.2 style float noise does not round up early', () => { expect(T.pct(0.29999999999999993 * 1000, 300.0000000001)).toBe(99); });
  it('uses the goal that applied on a past date', () => {
    const h = [{ d: '2026-10-01', s: 10000, k: 8 }, { d: '2026-10-09', s: 100, k: 1 }];
    expect(T.goalFor(h, { steps: 100, dist: 1 }, '2026-10-08').steps).toBe(10000);
    expect(T.goalFor(h, { steps: 100, dist: 1 }, '2026-10-09').steps).toBe(100);
    expect(T.goalFor(h, { steps: 7, dist: 2 }, '2026-09-01').steps).toBe(10000);
    expect(T.goalFor([], { steps: 7, dist: 2 }, '2026-09-01')).toEqual({ steps: 7, km: 2 });
  });
});

describe('pace and speed', () => {
  it('5 km in 25:00 -> 5:00 /km and 12.0 km/h', () => {
    expect(T.paceSec(1500, 5, 'km')).toBe(300); expect(T.fmtPace(300)).toBe('5:00'); expect(T.speed(1500, 5, 'km')).toBeCloseTo(12);
  });
  it('miles: pace and speed agree (pace * speed = 3600)', () => {
    const p = T.paceSec(1800, 5, 'mi'), v = T.speed(1800, 5, 'mi'); expect(p * v).toBeCloseTo(3600, 6);
    expect(v).toBeCloseTo(5 / 1.609344 / 0.5, 6);
  });
  it('zero or tiny distance gives no value, not Infinity', () => {
    expect(T.paceSec(600, 0, 'km')).toBeNull(); expect(T.speed(600, 0.005, 'km')).toBeNull(); expect(T.paceSec(0, 5, 'km')).toBeNull();
    expect(T.fmtPace(null)).toBe('--:--'); expect(T.fmtSpeed(null)).toBe('--');
  });
  it('formats seconds rounding up to the next minute', () => { expect(T.fmtPace(359.6)).toBe('6:00'); });
});

describe('distance estimate', () => {
  it('1,000 steps at 0.75 m = 0.75 km walking; running uses a longer stride', () => {
    expect(T.estKm(1000, 0.75, false)).toBeCloseTo(0.75); expect(T.estKm(1000, 0.75, true)).toBeCloseTo(0.75 * 1.45);
  });
  it('stride: override beats height beats default', () => {
    expect(T.strideM(175, 80)).toBeCloseTo(0.8); expect(T.strideM(175, 0)).toBeCloseTo(0.72625); expect(T.strideM(0, 0)).toBe(0.75);
  });
});

describe('GPS filtering', () => {
  const P = (lat, lon, t, acc = 5) => ({ lat, lon, t, acc });
  it('accepts the first good fix and rejects poor accuracy', () => {
    expect(T.acceptFix(null, P(10, 10, 0)).ok).toBe(true); expect(T.acceptFix(null, P(10, 10, 0, 80)).reason).toBe('weak');
  });
  it('about 111 m north in 60 s is real movement', () => {
    const r = T.acceptFix(P(10, 10, 0), P(10.001, 10, 60000)); expect(r.ok).toBe(true); expect(r.d).toBeGreaterThan(110); expect(r.d).toBeLessThan(112);
  });
  it('a 1 km jump in 2 s is rejected', () => { expect(T.acceptFix(P(10, 10, 0), P(10.009, 10, 2000)).reason).toBe('jump'); });
  it('2 m of stationary drift is ignored', () => { expect(T.acceptFix(P(10, 10, 0), P(10.000018, 10, 5000)).reason).toBe('drift'); });
  it('drift threshold scales with accuracy', () => { expect(T.acceptFix(P(10, 10, 0), P(10.00007, 10, 9000, 25)).reason).toBe('drift'); });
  it('time going backwards is rejected', () => { expect(T.acceptFix(P(10, 10, 5000), P(10.001, 10, 5000)).reason).toBe('time'); });
});

describe('route and elevation', () => {
  it('simplify drops collinear points but keeps corners', () => {
    const line = [0, 1, 2, 3, 4].map(i => ({ lat: 10 + i * 0.0001, lon: 10 }));
    expect(T.simplify(line, 3)).toHaveLength(2);
    const L = [{ lat: 10, lon: 10 }, { lat: 10.001, lon: 10 }, { lat: 10.001, lon: 10.001 }];
    expect(T.simplify(L, 3)).toHaveLength(3);
  });
  it('elevation ignores noise under the threshold and needs enough data', () => {
    expect(T.elevation([100, 101, 100, 101, 100, 101], 3).gain).toBe(0);
    expect(T.elevation([100, 105, 110, 108, 115, 112], 3).gain).toBe(15);
    expect(T.elevation([100, 110], 3)).toBeNull(); expect(T.elevation([null, null, null, null, null], 3)).toBeNull();
  });
});
