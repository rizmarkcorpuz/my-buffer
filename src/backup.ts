import type { DB } from './types';
import { migrate } from './store';
import { todayISO } from './util';

/** Shares a file through the iOS share sheet (Save to Files / iCloud Drive), falling back to a download. */
export async function shareOrDownload(name: string, content: string, mime: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([content], { type: mime });
  try {
    const file = new File([blob], name, { type: mime });
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

export const backupJSON = (db: DB) => JSON.stringify(db, null, 2);
export const backupName = () => `my-buffer-backup-${todayISO()}.json`;

export function transactionsCSV(db: DB): string {
  const rows: (string | number)[][] = [['Date', 'Type', 'Category / bill', 'Amount PHP', 'Note', 'Month']];
  for (const t of db.transactions) rows.push([t.date, t.type === 'expense' ? 'Extra expense' : 'Income received', t.category, t.amount, t.note ?? '', t.date.slice(0, 7)]);
  for (const p of db.billPayments) rows.push([p.paidAt.slice(0, 10), 'Monthly bill paid', db.budget.find((b) => b.id === p.budgetId)?.name ?? 'Deleted bill', p.amount, '', p.month]);
  for (const d of db.debts) if (d.paidAt) rows.push([d.paidAt.slice(0, 10), 'Obligation paid', d.name, d.amount, d.note ?? '', d.month]);
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

export async function readBackupFile(file: File): Promise<DB> {
  const text = await file.text();
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  return migrate(raw);
}
