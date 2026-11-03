import type { BudgetLine, DB, Job } from './types';
import { addMonths, daysInMonth, thisMonth } from './util';

const n = (v: unknown) => Number(v) || 0;

export const billActive = (b: BudgetLine, ym: string) =>
  (!b.startMonth || b.startMonth <= ym) && (!b.endMonth || b.endMonth >= ym);

export const budgetFor = (db: DB, ym: string) =>
  db.budget.filter((b) => billActive(b, ym)).reduce((s, b) => s + n(b.amount), 0);

export const paymentFor = (db: DB, budgetId: string, ym: string) =>
  db.billPayments.find((p) => p.budgetId === budgetId && p.month === ym);

export const toPHP = (db: DB, job: Job, amount: number) => amount * (job.currency === 'USD' ? n(db.settings.usdPhp) : 1);
export const earned = (db: DB, job: Job | undefined, hours: number) => (job ? toPHP(db, job, n(job.rate) * n(hours)) : 0);

/** Expected gross income for a job in a month, prorated by its start/end dates. */
export function jobMonthIncome(db: DB, j: Job, ym: string): number {
  if (!j.active) return 0;
  const days = daysInMonth(ym);
  const first = `${ym}-01`;
  const last = `${ym}-${String(days).padStart(2, '0')}`;
  if ((j.start && j.start > last) || (j.end && j.end < first)) return 0;
  const from = j.start && j.start > first ? Number(j.start.slice(8, 10)) : 1;
  const to = j.end && j.end < last ? Number(j.end.slice(8, 10)) : days;
  const share = Math.max(0, to - from + 1) / days;
  return toPHP(db, j, n(j.rate) * n(j.weekly) * (52 / 12)) * share;
}

export function projectedIncome(db: DB, ym: string): number {
  const sc = db.scenario;
  if (sc.mode === 'none') return 0;
  const planned = db.jobs.reduce((s, j) => s + jobMonthIncome(db, j, ym), 0);
  if (sc.mode === 'custom') return planned + (ym >= sc.customStart ? n(sc.customMonthly) : 0);
  return planned;
}

/* ------------------------------ live cash balance ------------------------------ */

export interface Ledger {
  anchor: number;
  anchorAt: string;
  billsPaid: number;
  debtsPaid: number;
  extraSpent: number;
  incomeIn: number;
  current: number;
  count: number;
}

/**
 * Live balance = confirmed savings + everything recorded *after* it was confirmed.
 * Records made before the anchor (or flagged "already in savings") are history only.
 */
export function ledger(db: DB): Ledger {
  const at = db.settings.cashAsOf;
  const after = (stamp?: string | null) => !!stamp && stamp > at;
  let billsPaid = 0, debtsPaid = 0, extraSpent = 0, incomeIn = 0, count = 0;
  for (const p of db.billPayments) if (after(p.paidAt)) { billsPaid += n(p.amount); count++; }
  for (const d of db.debts) if (after(d.paidAt)) { debtsPaid += n(d.amount); count++; }
  for (const t of db.transactions) {
    if (t.inSavings || !after(t.createdAt)) continue;
    count++;
    if (t.type === 'expense') extraSpent += n(t.amount);
    else incomeIn += n(t.amount);
  }
  const anchor = n(db.settings.cash);
  return { anchor, anchorAt: at, billsPaid, debtsPaid, extraSpent, incomeIn, count, current: anchor - billsPaid - debtsPaid - extraSpent + incomeIn };
}

/* ---------------------------------- forecast ---------------------------------- */

export interface ForecastRow {
  month: string;
  income: number;
  bills: number;
  debts: number;
  extra: number;
  start: number;
  end: number;
  isCurrent: boolean;
}

export interface Forecast {
  start: number;
  rows: ForecastRow[];
  /** First month whose ending balance is negative, or null. */
  shortfall: string | null;
  /** Full months covered from today before shortfall (rows before shortfall, excluding current). */
  monthsCovered: number;
  avgOutflow: number;
  lowest: { month: string; value: number };
}

export function incomeReceivedIn(db: DB, ym: string) {
  return db.transactions.filter((t) => t.type === 'income' && t.date.startsWith(ym)).reduce((s, t) => s + n(t.amount), 0);
}

export interface ForecastOpts { extraPerMonth?: number; now?: string; lean?: boolean; floor?: number }

export function forecast(db: DB, opts: ForecastOpts = {}): Forecast {
  const now = opts.now ?? thisMonth();
  const floor = opts.floor ?? n(db.settings.bufferFloor);
  const extra = n(opts.extraPerMonth);
  const L = ledger(db);
  let cash = L.current;
  const start = cash;
  const rows: ForecastRow[] = [];
  const horizon = db.settings.horizon || 24;

  for (let i = 0; i <= horizon; i++) {
    const m = addMonths(now, i);
    const isCurrent = i === 0;
    // Bills: only lines not yet marked paid for that month (paid ones are already in the live balance).
    const bills = db.budget
      .filter((b) => billActive(b, m) && !paymentFor(db, b.id, m) && !(opts.lean && b.optional))
      .reduce((s, b) => s + n(b.amount), 0);
    // Obligations: unpaid ones due this month; the current month also picks up anything overdue.
    const debts = db.debts
      .filter((d) => !d.paidAt && (isCurrent ? d.month <= m : d.month === m))
      .reduce((s, d) => s + n(d.amount), 0);
    // Income: for this month, only what is still expected beyond income already recorded.
    let income = projectedIncome(db, m);
    if (isCurrent) income = Math.max(0, income - incomeReceivedIn(db, m));
    const ex = isCurrent ? 0 : extra;
    const s0 = cash;
    cash = cash + income - bills - debts - ex;
    rows.push({ month: m, income, bills, debts, extra: ex, start: s0, end: cash, isCurrent });
  }

  const failIdx = rows.findIndex((r) => r.end < floor);
  const future = rows.slice(1);
  const avgOutflow = future.length ? future.reduce((s, r) => s + r.bills + r.debts + r.extra, 0) / future.length : 0;
  const low = rows.reduce((a, r) => (r.end < a.end ? r : a), rows[0]);
  return {
    start,
    rows,
    shortfall: failIdx < 0 ? null : rows[failIdx].month,
    monthsCovered: failIdx < 0 ? horizon : Math.max(0, failIdx - 1),
    avgOutflow,
    lowest: { month: low.month, value: low.end },
  };
}

/** Average extra (outside-budget) spending per month over the last `months` full months. */
export function avgExtraSpend(db: DB, months = 3, now = thisMonth()) {
  let total = 0;
  for (let i = 1; i <= months; i++) {
    const m = addMonths(now, -i);
    total += db.transactions.filter((t) => t.type === 'expense' && t.date.startsWith(m)).reduce((s, t) => s + n(t.amount), 0);
  }
  return total / months;
}

/* ----------------------------------- debts ----------------------------------- */

export interface DebtGroup { name: string; total: number; paid: number; remaining: number; next: string | null; count: number; paidCount: number }

export function debtGroups(db: DB): DebtGroup[] {
  const map = new Map<string, DebtGroup>();
  for (const d of [...db.debts].sort((a, b) => a.month.localeCompare(b.month))) {
    const g = map.get(d.name) ?? { name: d.name, total: 0, paid: 0, remaining: 0, next: null, count: 0, paidCount: 0 };
    g.total += n(d.amount); g.count++;
    if (d.paidAt) { g.paid += n(d.amount); g.paidCount++; }
    else { g.remaining += n(d.amount); if (!g.next) g.next = d.month; }
    map.set(d.name, g);
  }
  return [...map.values()];
}

/* --------------------------- decision helpers --------------------------- */

/** Planned extra spending per month for the forecast: the limit if set, otherwise the 3-month average. */
export const plannedExtra = (db: DB) => (n(db.settings.extraLimit) > 0 ? n(db.settings.extraLimit) : Math.round(avgExtraSpend(db, 3)));

export interface SafeToSpend {
  cash: number;
  billsLeft: number;
  obligationsNow: number;
  floor: number;
  /** Cash left after this month's unpaid bills, obligations due now and the buffer floor. */
  free: number;
  limit: number;
  spent: number;
  /** What's left of the monthly limit (null if no limit). */
  limitLeft: number | null;
  /** Amount you can spend on extras for the rest of the month. */
  safe: number;
  perDay: number;
  daysLeft: number;
  /** Unpaid obligations after this month. */
  futureObligations: number;
}

export function safeToSpend(db: DB, now = new Date()): SafeToSpend {
  const m = thisMonth(now);
  const cash = ledger(db).current;
  const billsLeft = db.budget.filter((b) => billActive(b, m) && !paymentFor(db, b.id, m)).reduce((s, b) => s + n(b.amount), 0);
  const obligationsNow = db.debts.filter((d) => !d.paidAt && d.month <= m).reduce((s, d) => s + n(d.amount), 0);
  const futureObligations = db.debts.filter((d) => !d.paidAt && d.month > m).reduce((s, d) => s + n(d.amount), 0);
  const floor = n(db.settings.bufferFloor);
  const free = cash - billsLeft - obligationsNow - floor;
  const limit = n(db.settings.extraLimit);
  const spent = db.transactions.filter((t) => t.type === 'expense' && t.date.startsWith(m)).reduce((s, t) => s + n(t.amount), 0);
  const limitLeft = limit > 0 ? limit - spent : null;
  const safe = Math.max(0, limitLeft === null ? free : Math.min(limitLeft, free));
  const daysLeft = daysInMonth(m) - now.getDate() + 1;
  return { cash, billsLeft, obligationsNow, floor, free, limit, spent, limitLeft, safe, perDay: safe / daysLeft, daysLeft, futureObligations };
}

/**
 * Smallest extra monthly income, starting `from`, that keeps every month at or above the buffer floor.
 * Added on top of current jobs. Returns 0 when no extra income is needed.
 */
export function incomeNeeded(db: DB, from: string, opts: ForecastOpts = {}): number {
  const test = (amt: number) => forecast({ ...db, scenario: { mode: 'custom', customMonthly: amt, customStart: from } }, opts).shortfall === null;
  if (test(0)) return 0;
  let lo = 0, hi = 50000;
  while (!test(hi)) { hi *= 2; if (hi > 1e8) return Infinity; }
  for (let i = 0; i < 40 && hi - lo > 50; i++) { const mid = (lo + hi) / 2; if (test(mid)) hi = mid; else lo = mid; }
  return Math.ceil(hi / 100) * 100;
}

export const optionalMonthly = (db: DB, ym = thisMonth()) =>
  db.budget.filter((b) => b.optional && billActive(b, ym)).reduce((s, b) => s + n(b.amount), 0);
