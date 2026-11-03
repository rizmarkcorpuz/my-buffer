import type { DB, Settings, Transaction } from './types';
import { thisMonth, todayISO, uid } from './util';

export const KEY = 'mybuffer_v3';
const LEGACY_KEY = 'mybuffer_v2';
const SNAP_KEY = 'mybuffer_snapshots';
const IDB_NAME = 'mybuffer';

export function emptyDB(): DB {
  return {
    version: 3,
    settings: {
      cash: 0,
      cashAsOf: new Date().toISOString(),
      usdPhp: 58,
      goalDate: '',
      horizon: 24,
      lastBackupAt: null,
      extraLimit: 0,
      bufferFloor: 0,
    },
    budget: [],
    billPayments: [],
    debts: [],
    jobs: [],
    hours: [],
    transactions: [],
    scenario: { mode: 'planned', customMonthly: 0, customStart: thisMonth() },
  };
}

const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Turns "YYYY-MM-DD" into an ISO timestamp at local midnight so it sorts before any later anchor. */
function asStamp(v: unknown, fallback: string): string {
  if (typeof v !== 'string' || !v) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00`).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? fallback : d.toISOString();
}

export class BackupError extends Error {}

/**
 * Accepts a v2 (original web app / Xcode app) or v3 backup and returns a clean v3 DB.
 * For v2 data the savings anchor is set to *now*: v2 treated cash as a manual snapshot, so every
 * earlier record is assumed to already be reflected in it (prevents double counting).
 */
export function migrate(raw: any): DB {
  if (!raw || typeof raw !== 'object') throw new BackupError('File is not a Monthly Expense Tracker (My Buffer) backup.');
  if (raw.version !== 2 && raw.version !== 3) throw new BackupError(`Unsupported backup version: ${raw.version ?? 'none'}.`);
  if (!raw.settings || !Array.isArray(raw.budget) || !Array.isArray(raw.transactions))
    throw new BackupError('Backup is missing settings, budget or transactions.');

  const base = emptyDB();
  const isV2 = raw.version === 2;
  const now = new Date().toISOString();
  const s = raw.settings;
  const settings: Settings = {
    ...base.settings,
    cash: num(s.cash),
    cashAsOf: isV2 ? now : asStamp(s.cashAsOf, now),
    usdPhp: num(s.usdPhp, 58) || 58,
    goalDate: typeof s.goalDate === 'string' ? s.goalDate : '',
    horizon: Math.min(60, Math.max(6, num(s.horizon, 24))),
    lastBackupAt: s.lastBackupAt ?? null,
    extraLimit: Math.max(0, num(s.extraLimit)),
    bufferFloor: Math.max(0, num(s.bufferFloor)),
  };

  // Budget order is preserved exactly as stored (spreadsheet order).
  const budget = arr(raw.budget).map((b: any) => ({
    id: String(b.id ?? uid()),
    name: String(b.name ?? 'Bill'),
    amount: num(b.amount),
    estimated: !!b.estimated,
    sheetValue: b.sheetValue ?? null,
    sourceRow: b.sourceRow ?? null,
    startMonth: b.startMonth ?? '',
    endMonth: b.endMonth ?? '',
    note: b.note ?? '',
    optional: !!b.optional,
  }));

  const transactions: Transaction[] = arr(raw.transactions).map((t: any) => ({
    id: String(t.id ?? uid()),
    type: t.type === 'income' ? 'income' : 'expense',
    date: String(t.date ?? todayISO()),
    amount: num(t.amount),
    category: String(t.category ?? 'Other'),
    note: t.note ?? '',
    createdAt: isV2 ? asStamp(t.date, now) : asStamp(t.createdAt, asStamp(t.date, now)),
    inSavings: isV2 ? true : !!t.inSavings,
    legacyId: t.legacyId,
    jobId: t.jobId,
    payFor: t.payFor,
  }));

  return {
    version: 3,
    settings,
    budget,
    billPayments: arr(raw.billPayments).map((p: any) => ({
      id: String(p.id ?? uid()),
      budgetId: String(p.budgetId),
      month: String(p.month),
      amount: num(p.amount),
      paidAt: asStamp(p.paidAt, asStamp(`${p.month}-01`, now)),
    })),
    debts: arr(raw.debts).map((d: any) => ({
      id: String(d.id ?? uid()),
      name: String(d.name ?? 'Payment'),
      month: String(d.month),
      amount: num(d.amount),
      paidAt: d.paidAt ? asStamp(d.paidAt, now) : null,
      note: d.note ?? '',
    })),
    jobs: arr(raw.jobs).map((j: any) => ({
      id: String(j.id ?? uid()),
      name: String(j.name ?? 'Job'),
      rate: num(j.rate),
      currency: j.currency === 'USD' ? 'USD' : 'PHP',
      weekly: num(j.weekly),
      active: !!j.active,
      start: j.start ?? '',
      end: j.end ?? '',
    })),
    hours: arr(raw.hours).map((h: any) => ({
      id: String(h.id ?? uid()),
      jobId: String(h.jobId),
      date: String(h.date),
      hours: num(h.hours),
      note: h.note ?? '',
    })),
    transactions,
    scenario: raw.scenario && ['planned', 'none', 'custom'].includes(raw.scenario.mode)
      ? { mode: raw.scenario.mode, customMonthly: num(raw.scenario.customMonthly), customStart: raw.scenario.customStart || thisMonth() }
      : base.scenario,
  };
}

/* ---------- persistence: localStorage primary, IndexedDB mirror, rolling snapshots ---------- */

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(key: string, value: string) {
  try {
    const db = await idb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* mirror is best-effort */ }
}
export async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => res((r.result as string) ?? null);
      r.onerror = () => res(null);
    });
  } catch { return null; }
}

function lsGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }

export type LoadResult = { db: DB; source: 'local' | 'legacy' | 'mirror' | 'new' };

export async function load(): Promise<LoadResult> {
  const local = lsGet(KEY);
  if (local) { try { return { db: migrate(JSON.parse(local)), source: 'local' }; } catch { /* fall through */ } }
  const mirror = await idbGet(KEY);
  if (mirror) { try { return { db: migrate(JSON.parse(mirror)), source: 'mirror' }; } catch { /* */ } }
  const legacy = lsGet(LEGACY_KEY); // same-origin v2 data, if this is hosted where v2 lived
  if (legacy) { try { return { db: migrate(JSON.parse(legacy)), source: 'legacy' }; } catch { /* */ } }
  return { db: emptyDB(), source: 'new' };
}

let lastSnap = 0;
export function persist(db: DB): string | null {
  const json = JSON.stringify(db);
  void idbPut(KEY, json);
  try {
    localStorage.setItem(KEY, json);
    // one rolling snapshot every 10 minutes, keep 12
    if (Date.now() - lastSnap > 10 * 60 * 1000) {
      lastSnap = Date.now();
      const snaps: { at: string; data: string }[] = JSON.parse(lsGet(SNAP_KEY) || '[]');
      snaps.unshift({ at: new Date().toISOString(), data: json });
      localStorage.setItem(SNAP_KEY, JSON.stringify(snaps.slice(0, 12)));
    }
    return null;
  } catch (e: any) {
    return e?.message || 'Storage is full or unavailable';
  }
}

export function snapshots(): { at: string; data: string }[] {
  try { return JSON.parse(lsGet(SNAP_KEY) || '[]'); } catch { return []; }
}

export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* */ }
  return null;
}
