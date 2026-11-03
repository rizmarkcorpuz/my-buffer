import { describe, expect, it } from 'vitest';
import { forecast, ledger, jobMonthIncome, safeToSpend, incomeNeeded } from '../src/calc';
import { migrate, emptyDB } from '../src/store';

const anchor = '2026-11-03T10:00:00.000Z';
function base() {
  const d = emptyDB();
  d.settings.cash = 100000; d.settings.cashAsOf = anchor;
  d.budget = [{ id: 'a', name: 'Rent', amount: 2000 }, { id: 'b', name: 'Food', amount: 6000 }];
  return d;
}

describe('ledger', () => {
  it('deducts bills paid, extra spending and adds income only after the savings anchor', () => {
    const d = base();
    d.billPayments.push({ id: '1', budgetId: 'a', month: '2026-11', amount: 2000, paidAt: '2026-11-03T11:00:00.000Z' });
    d.billPayments.push({ id: '2', budgetId: 'b', month: '2026-10', amount: 6000, paidAt: '2026-10-01T00:00:00.000Z' }); // before anchor
    d.transactions.push({ id: 't', type: 'expense', amount: 500, category: 'Food', date: '2026-11-03', createdAt: '2026-11-03T12:00:00.000Z' });
    d.transactions.push({ id: 'u', type: 'expense', amount: 999, category: 'Food', date: '2026-11-03', createdAt: '2026-11-03T12:00:00.000Z', inSavings: true });
    d.transactions.push({ id: 'i', type: 'income', amount: 10000, category: 'Salary', date: '2026-11-03', createdAt: '2026-11-03T12:00:00.000Z' });
    d.debts.push({ id: 'd', name: 'Inst', month: '2026-12', amount: 15650, paidAt: '2026-11-03T13:00:00.000Z' });
    const L = ledger(d);
    expect(L.current).toBe(100000 - 2000 - 500 + 10000 - 15650);
  });
});

describe('forecast', () => {
  it('counts only unpaid bills this month and does not double count paid ones', () => {
    const d = base();
    d.billPayments.push({ id: '1', budgetId: 'a', month: '2026-11', amount: 2000, paidAt: '2026-11-03T11:00:00.000Z' });
    const F = forecast(d, { now: '2026-11' });
    expect(F.start).toBe(98000);
    expect(F.rows[0].bills).toBe(6000); // only Food left
    expect(F.rows[0].end).toBe(92000);
    expect(F.rows[1].bills).toBe(8000);
    expect(F.rows[1].end).toBe(84000);
  });
  it('respects bill end months, overdue debts and the no-income scenario', () => {
    const d = base();
    d.budget[1].endMonth = '2026-12';
    d.debts.push({ id: 'x', name: 'Late', month: '2026-10', amount: 1000, paidAt: null });
    d.jobs.push({ id: 'j', name: 'RC', rate: 565, currency: 'PHP', weekly: 40, active: true, start: '', end: '' });
    d.scenario.mode = 'none';
    const F = forecast(d, { now: '2026-11' });
    expect(F.start).toBe(100000);
    expect(F.rows[0].debts).toBe(1000);
    expect(F.rows[0].income).toBe(0);
    expect(F.rows[2].bills).toBe(2000); // Jan: food ended
  });
  it('finds the shortfall month', () => {
    const d = base(); d.settings.cash = 10000;
    const F = forecast(d, { now: '2026-11' });
    expect(F.shortfall).toBe('2026-12');
  });
});

describe('jobs', () => {
  it('prorates income by last working day', () => {
    const d = emptyDB();
    const j = { id: 'j', name: 'RC', rate: 565, currency: 'PHP' as const, weekly: 40, active: true, start: '', end: '2026-12-15' };
    const full = 565 * 40 * 52 / 12;
    expect(jobMonthIncome(d, j, '2026-11')).toBeCloseTo(full);
    expect(jobMonthIncome(d, j, '2026-12')).toBeCloseTo(full * 15 / 31);
    expect(jobMonthIncome(d, j, '2027-01')).toBe(0);
  });
});

describe('migration', () => {
  it('imports a v2 backup without double counting old records and keeps bill order', () => {
    const v2 = { version: 2, settings: { cash: 330000, severance: 70000, countSeverance: true, usdPhp: 58, goalDate: '2027-01-31' },
      budget: [{ id: 'sheet-3', name: 'Rent', amount: 2000 }, { id: 'sheet-7', name: 'Electric Bill (Kawit)', amount: 4112, estimated: true }],
      billPayments: [{ id: 'p', budgetId: 'sheet-3', month: '2026-11', amount: 2000, paidAt: '2026-11-02' }],
      debts: [], jobs: [], hours: [], transactions: [{ id: 't', type: 'expense', amount: 300, category: 'Food', date: '2026-11-02' }] };
    const d = migrate(v2);
    expect(d.version).toBe(3);
    expect(d.budget.map((b) => b.id)).toEqual(['sheet-3', 'sheet-7']);
    expect(ledger(d).current).toBe(330000);
    expect(() => migrate({ version: 9 })).toThrow();
  });
});

describe('decision helpers', () => {
  it('safe to spend respects bills left, buffer floor and the monthly limit', () => {
    const d = base();
    d.settings.bufferFloor = 20000;
    d.transactions.push({ id: 't', type: 'expense', amount: 1500, category: 'Food', date: '2026-11-03', createdAt: '2026-11-03T12:00:00.000Z' });
    let s = safeToSpend(d, new Date('2026-11-04T12:00:00'));
    expect(s.cash).toBe(98500);
    expect(s.free).toBe(98500 - 8000 - 20000);
    expect(s.safe).toBe(s.free); // no limit
    d.settings.extraLimit = 5000;
    s = safeToSpend(d, new Date('2026-11-04T12:00:00'));
    expect(s.safe).toBe(3500);
    expect(s.daysLeft).toBe(27);
  });
  it('lean mode skips optional bills and income target closes the gap', () => {
    const d = base(); d.settings.cash = 20000;
    d.budget.push({ id: 'n', name: 'Netflix', amount: 619, optional: true });
    const normal = forecast(d, { now: '2026-11' });
    const lean = forecast(d, { now: '2026-11', lean: true });
    expect(lean.rows[1].bills).toBe(8000);
    expect(normal.rows[1].bills).toBe(8619);
    const need = incomeNeeded(d, '2026-12', { now: '2026-11' } as any);
    expect(need).toBeGreaterThan(0);
    const ok = forecast({ ...d, scenario: { mode: 'custom', customMonthly: need, customStart: '2026-12' } }, { now: '2026-11' });
    expect(ok.shortfall).toBeNull();
  });
});
