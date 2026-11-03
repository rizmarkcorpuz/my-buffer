import { useState } from 'react';
import { useDB } from '../state';
import { billActive, budgetFor, earned, forecast, ledger, paymentFor } from '../calc';
import { AmountInput, Icon, LargeTitle, Progress, Section, Sheet, useToast } from '../ui';
import { money, moneyExact, monthLabel, parseAmount, stampLabel, thisMonth, todayISO, uid } from '../util';
import type { Tab } from '../App';
import { ThemeButton } from '../theme';

export function SavingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, update } = useDB();
  const toast = useToast();
  const L = ledger(db);
  const [val, setVal] = useState('');
  const v = parseAmount(val);
  const valid = val.trim() !== '' && Number.isFinite(v) && v >= 0;
  const save = () => {
    if (!valid) return;
    update((d) => { d.settings.cash = v; d.settings.cashAsOf = new Date().toISOString(); });
    toast('Savings updated — balance & forecast recalculated');
    setVal('');
    onClose();
  };
  return (
    <Sheet open={open} title="Update savings" onClose={onClose} onDone={save} doneDisabled={!valid}>
      <p className="sheet-lead">Enter the total actually in your accounts right now.</p>
      <div className="big-amount-wrap"><AmountInput big autoFocus value={val} onChange={setVal} placeholder={String(Math.round(L.current))} /></div>
      <div className="callout">
        From now on, bills you mark <b>Paid</b>, extra spending, obligations paid and income you record will move
        this balance automatically.
      </div>
      <Section header="Current calculation">
        <div className="row"><span className="row-title">Last confirmed</span><span className="row-value">{money(L.anchor)}</span></div>
        <div className="row"><span className="row-sub">{stampLabel(L.anchorAt)}</span></div>
        <div className="row"><span className="row-title">Live balance now</span><span className="row-value">{money(L.current)}</span></div>
      </Section>
    </Sheet>
  );
}

export default function Home({ go, openSettings, addExpense }: { go: (t: Tab) => void; openSettings: () => void; addExpense: () => void }) {
  const { db, update } = useDB();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const m = thisMonth();
  const L = ledger(db);
  const F = forecast(db);
  const planned = budgetFor(db, m);
  const active = db.budget.filter((b) => billActive(b, m));
  const paidLines = active.filter((b) => paymentFor(db, b.id, m));
  const paidAmt = db.billPayments.filter((p) => p.month === m).reduce((s, p) => s + p.amount, 0);
  const unpaid = active.filter((b) => !paymentFor(db, b.id, m));
  const extra = db.transactions.filter((t) => t.type === 'expense' && t.date.startsWith(m)).reduce((s, t) => s + t.amount, 0);
  const hrs = db.hours.filter((h) => h.date.startsWith(m));
  const hrsTotal = hrs.reduce((s, h) => s + h.hours, 0);
  const hrsPay = hrs.reduce((s, h) => s + earned(db, db.jobs.find((j) => j.id === h.jobId), h.hours), 0);
  const nextDebts = db.debts.filter((d) => !d.paidAt).sort((a, b) => a.month.localeCompare(b.month)).slice(0, 3);
  const days = db.settings.lastBackupAt ? Math.floor((Date.now() - new Date(db.settings.lastBackupAt).getTime()) / 864e5) : null;
  const needBackup = days === null || days >= 7;
  const goalDays = db.settings.goalDate ? Math.ceil((new Date(`${db.settings.goalDate}T12:00:00`).getTime() - Date.now()) / 864e5) : null;

  const pay = (id: string, amount: number, name: string) => {
    const pid = uid();
    update((d) => { d.billPayments.push({ id: pid, budgetId: id, month: m, amount, paidAt: new Date().toISOString() }); });
    toast(`${name} paid`, { label: 'Undo', run: () => update((d) => { d.billPayments = d.billPayments.filter((p) => p.id !== pid); }) });
  };

  return (
    <div className="screen">
      <LargeTitle title="Expense Tracker" subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        right={<span className="btn-pair"><ThemeButton /><button className="icon-btn" aria-label="Settings & backup" onClick={openSettings}><Icon name="gear" /></button></span>} />

      <div className="hero">
        <div className="hero-label">Available cash</div>
        <div className={`hero-amount ${L.current < 0 ? 'neg' : ''}`}>{money(L.current)}</div>
        <div className="hero-sub">
          {L.count === 0
            ? <>Confirmed {stampLabel(L.anchorAt)}</>
            : <>{money(L.anchor)} confirmed {stampLabel(L.anchorAt)}
              {L.billsPaid + L.debtsPaid > 0 && <> · −{money(L.billsPaid + L.debtsPaid)} paid</>}
              {L.extraSpent > 0 && <> · −{money(L.extraSpent)} extra</>}
              {L.incomeIn > 0 && <> · +{money(L.incomeIn)} income</>}</>}
        </div>
        <div className="hero-pills">
          <span className={`pill ${F.shortfall ? 'warn' : ''}`}>
            {F.shortfall ? `Runs short ${monthLabel(F.shortfall)}` : `Covered ${db.settings.horizon}+ months`}
          </span>
        </div>
        <button className="hero-btn" onClick={() => setEditing(true)}><Icon name="pencil" size={17} /> Update savings</button>
      </div>

      {needBackup && (
        <button className="banner" onClick={openSettings}>
          <Icon name="alert" size={20} />
          <span><b>{days === null ? 'No backup yet' : `Last backup ${days} days ago`}</b><br />Save a copy to Files / iCloud Drive</span>
          <Icon name="chevR" size={18} />
        </button>
      )}

      <div className="tiles">
        <button className="tile" onClick={() => go('bills')}>
          <span className="tile-label">Bills paid · {monthLabel(m)}</span>
          <span className="tile-value">{paidLines.length}/{active.length}</span>
          <Progress value={paidAmt} max={planned} />
          <span className="tile-sub">{money(Math.max(0, planned - paidAmt))} left of {money(planned)}</span>
        </button>
        <button className="tile" onClick={() => go('spend')}>
          <span className="tile-label">Extra spending</span>
          <span className="tile-value">{money(extra)}</span>
          <span className="tile-sub">Outside the monthly budget</span>
        </button>
        <button className="tile" onClick={() => go('work')}>
          <span className="tile-label">Work this month</span>
          <span className="tile-value">{hrsTotal.toFixed(hrsTotal % 1 ? 1 : 0)} h</span>
          <span className="tile-sub">{money(hrsPay)} gross earned</span>
        </button>
        <button className="tile" onClick={() => go('forecast')}>
          <span className="tile-label">Income goal</span>
          <span className="tile-value">{goalDays === null ? '—' : goalDays >= 0 ? `${goalDays} d` : 'Passed'}</span>
          <span className="tile-sub">{db.settings.goalDate ? new Date(`${db.settings.goalDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Set in Settings'}</span>
        </button>
      </div>

      <button className="wide-btn quick-add" onClick={addExpense}><Icon name="plus" size={18} /> Add extra expense</button>

      <Section header="Still to pay this month" aside={<button className="link" onClick={() => go('bills')}>All bills</button>}
        footer={unpaid.length ? 'Tap Paid when a bill is settled — it’s deducted from your available cash.' : undefined}>
        {unpaid.length === 0 && <div className="row"><span className="row-title done-text"><Icon name="check" size={18} /> {active.length ? 'Every bill is paid' : 'No bills set up yet'}</span></div>}
        {unpaid.slice(0, 6).map((b) => (
          <div className="row" key={b.id}>
            <span className="row-main"><span className="row-title">{b.name}</span><span className="row-sub">{moneyExact(b.amount)}{b.estimated ? ' · estimate' : ''}</span></span>
            <button className="pay-btn" onClick={() => pay(b.id, b.amount, b.name)}>Paid</button>
          </div>
        ))}
        {unpaid.length > 6 && <button className="row more" onClick={() => go('bills')}>{unpaid.length - 6} more…</button>}
      </Section>

      {nextDebts.length > 0 && (
        <Section header="Upcoming obligations" aside={<button className="link" onClick={() => go('forecast')}>Plan</button>}>
          {nextDebts.map((d) => (
            <div className="row" key={d.id}>
              <span className="row-main"><span className="row-title">{d.name}</span><span className={`row-sub ${d.month < m ? 'bad' : ''}`}>{monthLabel(d.month)}{d.month < m ? ' · overdue' : ''}</span></span>
              <span className="row-value">{money(d.amount)}</span>
            </div>
          ))}
        </Section>
      )}

      <Section header="Next months" aside={<button className="link" onClick={() => go('forecast')}>Forecast</button>}>
        {F.rows.slice(0, 4).map((r) => (
          <div className="row" key={r.month}>
            <span className="row-title">{r.isCurrent ? 'End of this month' : monthLabel(r.month, true)}</span>
            <span className={`row-value ${r.end < 0 ? 'bad' : ''}`}>{money(r.end)}</span>
          </div>
        ))}
      </Section>

      <p className="fineprint">Saved on this iPhone · updated {todayISO()} · forecasts are estimates, not guarantees.</p>
      <SavingsSheet open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
