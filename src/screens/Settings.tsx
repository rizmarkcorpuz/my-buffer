import { useRef, useState } from 'react';
import { useDB } from '../state';
import { backupJSON, backupName, readBackupFile, shareOrDownload, transactionsCSV } from '../backup';
import { emptyDB, migrate, snapshots } from '../store';
import type { DB } from '../types';
import { AmountInput, Field, Icon, Section, Sheet, useConfirm, useToast } from '../ui';
import { money, parseAmount, stampLabel } from '../util';
import { SavingsSheet } from './Home';
import { ThemePicker } from '../theme';

export function RestoreFlow() {
  const { db, replace } = useDB();
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);

  const apply = async (next: DB, label: string) => {
    const ok = await confirm({
      title: 'Replace data on this iPhone?',
      message: `${label}: ${next.budget.length} bills, ${next.transactions.length} entries, ${next.jobs.length} jobs, savings ${money(next.settings.cash)}. Your current data is kept as an automatic snapshot.`,
      confirm: 'Restore', destructive: true,
    });
    if (!ok) return;
    try { localStorage.setItem('mybuffer_before_restore', JSON.stringify(db)); } catch { /* */ }
    replace(next);
    toast('Backup restored');
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    try { await apply(await readBackupFile(f), f.name); } catch (e: any) { toast(`Couldn’t restore: ${e.message}`); }
    if (input.current) input.current.value = '';
  };
  return {
    pick: () => input.current?.click(),
    el: <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />,
    apply,
  };
}

export default function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, update, replace, saveError, persisted } = useDB();
  const toast = useToast();
  const confirm = useConfirm();
  const restore = RestoreFlow();
  const [savings, setSavings] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const s = db.settings;

  const exportJSON = async () => {
    const r = await shareOrDownload(backupName(), backupJSON({ ...db, settings: { ...s, lastBackupAt: new Date().toISOString() } }), 'application/json');
    if (r !== 'cancelled') { update((d) => { d.settings.lastBackupAt = new Date().toISOString(); }); toast(r === 'shared' ? 'Backup ready — choose “Save to Files”' : 'Backup downloaded'); }
  };
  const exportCSV = () => shareOrDownload('my-buffer-transactions.csv', transactionsCSV(db), 'text/csv');
  const reset = async () => {
    if (!(await confirm({ title: 'Erase all app data?', message: 'Everything on this iPhone will be deleted. Export a backup first.', confirm: 'Erase', destructive: true }))) return;
    replace(emptyDB());
    onClose();
  };
  const setNum = (k: 'usdPhp', v: string) => { const x = parseAmount(v || '0'); if (Number.isFinite(x) && x >= 0) update((d) => { d.settings[k] = x; }); };

  return (
    <Sheet open={open} title="Settings" onClose={onClose} onDone={onClose} doneLabel="Done">
      {restore.el}
      <Section header="Money">
        <button className="row as-btn" onClick={() => setSavings(true)}>
          <span className="row-main"><span className="row-title">Savings in accounts</span><span className="row-sub">Confirmed {stampLabel(s.cashAsOf)}</span></span>
          <span className="row-value accent-text">{money(s.cash)} <Icon name="chevR" size={16} /></span>
        </button>
        <Field label="USD → PHP rate" hint="Used for USD jobs. An estimate, not a live rate."><input inputMode="decimal" value={String(s.usdPhp)} onChange={(e) => setNum('usdPhp', e.target.value)} /></Field>
        <Field label="Income goal date"><input type="date" value={s.goalDate} onChange={(e) => update((d) => { d.settings.goalDate = e.target.value; })} /></Field>
      </Section>

      <Section header="Appearance" footer="System follows your iPhone’s Light/Dark setting and switches automatically.">
        <div className="row"><ThemePicker /></div>
      </Section>

      <Section header="Backup" footer={`Last backup: ${s.lastBackupAt ? stampLabel(s.lastBackupAt) : 'never'}. Save to iCloud Drive weekly and before deleting the app or changing its web address.`}>
        <button className="row as-btn accent-text" onClick={exportJSON}><Icon name="share" size={19} /> Back up now (JSON)</button>
        <button className="row as-btn accent-text" onClick={restore.pick}><Icon name="restore" size={19} /> Restore from backup file…</button>
        <button className="row as-btn accent-text" onClick={() => setSnapOpen(true)}><Icon name="clock" size={19} /> Automatic snapshots…</button>
        <button className="row as-btn accent-text" onClick={exportCSV}><Icon name="share" size={19} /> Export transactions (CSV)</button>
      </Section>

      <Section header="Storage" footer="Your data never leaves this iPhone — there’s no account or cloud sync. The app keeps a second copy in the browser database and rolling snapshots. Installing it to the Home Screen keeps storage from being cleared by Safari.">
        <div className="row"><span className="row-title">Status</span><span className={`row-value ${saveError ? 'bad' : 'good'}`}>{saveError ? 'Save failed' : 'Saved on device'}</span></div>
        {saveError && <div className="row"><span className="row-sub bad">{saveError}. Export a backup now.</span></div>}
        <div className="row"><span className="row-title">Protected storage</span><span className="row-value">{persisted ? 'On' : persisted === false ? 'Not granted' : 'Unknown'}</span></div>
      </Section>

      <Section><button className="row as-btn destructive-text" onClick={reset}>Erase all data</button></Section>
      <p className="fineprint">Monthly Expense Tracker 4.1 · Reads all My Buffer backups from the earlier web and Xcode versions.</p>

      <SavingsSheet open={savings} onClose={() => setSavings(false)} />
      <Sheet open={snapOpen} title="Snapshots" onClose={() => setSnapOpen(false)}>
        <Section footer="Taken automatically while you use the app (up to 12). Restoring one replaces current data.">
          {snapshots().length === 0 && <div className="row"><span className="row-sub">No snapshots yet.</span></div>}
          {snapshots().map((sn) => (
            <button className="row as-btn" key={sn.at} onClick={async () => { try { await restore.apply(migrate(JSON.parse(sn.data)), `Snapshot ${stampLabel(sn.at)}`); setSnapOpen(false); } catch { toast('Snapshot unreadable'); } }}>
              <span className="row-title">{stampLabel(sn.at)}</span><Icon name="chevR" size={16} />
            </button>
          ))}
        </Section>
      </Sheet>
    </Sheet>
  );
}
