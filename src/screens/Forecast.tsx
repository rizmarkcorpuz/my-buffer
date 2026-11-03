import { useState } from 'react';
import { useDB } from '../state';
import { avgExtraSpend, debtGroups, forecast, type ForecastRow } from '../calc';
import type { Debt } from '../types';
import { AmountInput, Field, LargeTitle, Progress, Section, Segmented, Sheet, Toggle, useConfirm, useToast } from '../ui';
import { addMonths, compact, money, moneyExact, monthLabel, parseAmount, stampLabel, thisMonth, uid } from '../util';

function RunwayChart({ rows }: { rows: ForecastRow[] }) {
  const W = 340, H = 150, pad = 4;
  const vals = rows.map((r) => r.end);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const span = max - min || 1;
  const y = (v: number) => pad + ((max - v) / span) * (H - pad * 2);
  const bw = (W - pad * 2) / rows.length;
  const zero = y(0);
  const pick = [0, Math.floor(rows.length / 2), rows.length - 1];
  return (
    <figure className="chart" aria-label="Projected end-of-month balance">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img">
        <line x1={pad} x2={W - pad} y1={zero} y2={zero} className="chart-zero" />
        {rows.map((r, i) => {
          const top = Math.min(y(r.end), zero), h = Math.max(1.5, Math.abs(y(r.end) - zero));
          return <rect key={r.month} x={pad + i * bw + bw * 0.14} width={bw * 0.72} y={top} height={h} rx={Math.min(3, bw * 0.3)} className={r.end < 0 ? 'bar-neg' : 'bar-pos'}><title>{`${monthLabel(r.month)}: ${money(r.end)}`}</title></rect>;
        })}
        {pick.map((i) => rows[i] && <text key={i} x={pad + i * bw + bw / 2} y={H + 14} textAnchor={i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'} className="chart-label">{monthLabel(rows[i].month)}</text>)}
        <text x={W - pad} y={y(max) + 11} textAnchor="end" className="chart-label">{compact(max)}</text>
      </svg>
    </figure>
  );
}

type DebtDraft = { id: string; name: string; month: string; amount: string; note: string; count: string; isNew: boolean };

export default function Forecast() {
  const { db, update } = useDB();
  const toast = useToast();
  const confirm = useConfirm();
  const [useExtra, setUseExtra] = useState(true);
  const [draft, setDraft] = useState<DebtDraft | null>(null);
  const [showAll, setShowAll] = useState(false);
  const avgExtra = Math.round(avgExtraSpend(db, 3));
  const F = forecast(db, { extraPerMonth: useExtra ? avgExtra : 0 });
  const sc = db.scenario;
  const groups = debtGroups(db);
  const m = thisMonth();

  const setScenario = (patch: Partial<typeof sc>) => update((d) => { d.scenario = { ...d.scenario, ...patch }; });

  const editDebt = (d?: Debt) => setDraft(d
    ? { id: d.id, name: d.name, month: d.month, amount: String(d.amount), note: d.note || '', count: '1', isNew: false }
    : { id: uid(), name: '', month: addMonths(m, 1), amount: '', note: '', count: '1', isNew: true });
  const saveDebt = () => {
    if (!draft) return;
    const amount = parseAmount(draft.amount), count = Math.max(1, Math.min(360, Math.floor(Number(draft.count) || 1)));
    if (!draft.name.trim() || !draft.month || !Number.isFinite(amount) || amount < 0) { toast('Name, month and amount are required'); return; }
    update((d) => {
      if (!draft.isNew) {
        const x = d.debts.find((y) => y.id === draft.id);
        if (x) Object.assign(x, { name: draft.name.trim(), month: draft.month, amount, note: draft.note });
      } else for (let i = 0; i < count; i++) d.debts.push({ id: uid(), name: draft.name.trim(), month: addMonths(draft.month, i), amount, note: draft.note, paidAt: null });
    });
    toast(draft.isNew && count > 1 ? `${count} monthly payments added` : 'Saved');
    setDraft(null);
  };
  const togglePaid = (d: Debt) => {
    update((x) => { const y = x.debts.find((z) => z.id === d.id); if (y) y.paidAt = y.paidAt ? null : new Date().toISOString(); });
    toast(d.paidAt ? `${d.name} marked unpaid` : `${d.name} paid · ${moneyExact(d.amount)}`);
  };
  const removeDebt = async () => {
    if (!draft || !(await confirm({ title: 'Delete this payment?', confirm: 'Delete', destructive: true }))) return;
    update((d) => { d.debts = d.debts.filter((x) => x.id !== draft.id); });
    setDraft(null);
  };

  const rows = showAll ? F.rows : F.rows.slice(0, 13);
  const sortedDebts = [...db.debts].sort((a, b) => a.month.localeCompare(b.month));

  return (
    <div className="screen">
      <LargeTitle title="Forecast" subtitle="Cash runway & obligations" />

      <div className={`hero small ${F.shortfall ? 'warn' : ''}`}>
        <div className="hero-label">{F.shortfall ? 'Cash runs short in' : 'Cash stays positive'}</div>
        <div className="hero-amount">{F.shortfall ? monthLabel(F.shortfall, true) : `${db.settings.horizon}+ months`}</div>
        <div className="hero-sub">
          {F.shortfall ? `${F.monthsCovered} full month${F.monthsCovered === 1 ? '' : 's'} covered after this one` : `Lowest point ${money(F.lowest.value)} in ${monthLabel(F.lowest.month)}`}
          {' · '}starts from {money(F.start)}
        </div>
      </div>

      <Section header="Scenario" footer={sc.mode === 'none'
        ? 'Worst case: no job income at all from now on.'
        : sc.mode === 'custom' ? 'Your planned jobs plus a new monthly income from the chosen month.' : 'Uses your jobs’ rates, weekly hours and dates from the Work tab.'}>
        <div className="row"><Segmented value={sc.mode} onChange={(v) => setScenario({ mode: v })}
          options={[{ value: 'planned', label: 'Current jobs' }, { value: 'none', label: 'No income' }, { value: 'custom', label: 'New job' }]} /></div>
        {sc.mode === 'custom' && <>
          <Field label="New income / month"><AmountInput value={String(sc.customMonthly || '')} onChange={(v) => setScenario({ customMonthly: parseAmount(v || '0') || 0 })} /></Field>
          <Field label="Starting"><input type="month" value={sc.customStart} onChange={(e) => e.target.value && setScenario({ customStart: e.target.value })} /></Field>
        </>}
        <Toggle label="Include extra spending" hint={`Your 3-month average: ${money(avgExtra)}/mo`} checked={useExtra} onChange={setUseExtra} />
        <Field label="Months to project">
          <Segmented value={String(db.settings.horizon)} onChange={(v) => update((d) => { d.settings.horizon = Number(v); })}
            options={['12', '24', '36', '60'].map((v) => ({ value: v, label: v }))} />
        </Field>
      </Section>

      <Section header="Balance at end of each month">
        <div className="row chart-row"><RunwayChart rows={F.rows} /></div>
      </Section>

      <div className="tiles">
        <div className="tile"><span className="tile-label">Avg monthly outflow</span><span className="tile-value">{money(F.avgOutflow)}</span><span className="tile-sub">Bills + obligations{useExtra ? ' + extra' : ''}</span></div>
        <div className="tile"><span className="tile-label">Lowest balance</span><span className={`tile-value ${F.lowest.value < 0 ? 'bad' : ''}`}>{money(F.lowest.value)}</span><span className="tile-sub">{monthLabel(F.lowest.month)}</span></div>
      </div>

      <Section header="Month by month" footer="This month counts only bills not yet marked Paid and income not yet recorded. Job income is gross.">
        {rows.map((r) => (
          <div className="row fc" key={r.month}>
            <span className="row-main">
              <span className="row-title">{r.isCurrent ? `${monthLabel(r.month)} (rest of month)` : monthLabel(r.month, true)}</span>
              <span className="row-sub">+{money(r.income)} in · −{money(r.bills)} bills{r.debts ? ` · −${money(r.debts)} obligations` : ''}{r.extra ? ` · −${money(r.extra)} extra` : ''}</span>
            </span>
            <span className={`row-value ${r.end < 0 ? 'bad' : ''}`}>{money(r.end)}</span>
          </div>
        ))}
        {F.rows.length > 13 && <button className="row as-btn accent-text" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show less' : `Show all ${F.rows.length} months`}</button>}
      </Section>

      <Section header="Debts & obligations" aside={<button className="link" onClick={() => editDebt()}>Add</button>}>
        {groups.length === 0 && <div className="row"><span className="row-sub">No scheduled payments. Add installments, wedding costs, etc.</span></div>}
        {groups.map((g) => (
          <div className="row debt-group" key={g.name}>
            <span className="row-main">
              <span className="row-title">{g.name}</span>
              <span className="row-sub">{g.paidCount}/{g.count} paid · {money(g.remaining)} left{g.next ? ` · next ${monthLabel(g.next)}` : ''}</span>
              <Progress value={g.paid} max={g.total} />
            </span>
            <span className="row-value">{money(g.total)}</span>
          </div>
        ))}
      </Section>

      {sortedDebts.length > 0 && (
        <Section header="Scheduled payments" footer="Tap Paid when a payment is made — it’s deducted from available cash and removed from the forecast. Tap a name to edit the month or amount.">
          {sortedDebts.map((d) => (
            <div className={`row bill ${d.paidAt ? 'is-paid' : ''}`} key={d.id}>
              <button className="row-main as-btn" onClick={() => editDebt(d)}>
                <span className="row-title">{d.name}</span>
                <span className={`row-sub ${!d.paidAt && d.month < m ? 'bad' : ''}`}>{monthLabel(d.month)} · {moneyExact(d.amount)}{d.paidAt ? ` · paid ${stampLabel(d.paidAt)}` : d.month < m ? ' · overdue' : ''}</span>
              </button>
              <button className={`pay-btn ${d.paidAt ? 'paid' : ''}`} onClick={() => togglePaid(d)}>{d.paidAt ? 'Undo' : 'Paid'}</button>
            </div>
          ))}
        </Section>
      )}

      <Sheet open={!!draft} title={draft?.isNew ? 'New obligation' : 'Edit payment'} onClose={() => setDraft(null)} onDone={saveDebt}>
        {draft && <>
          <Section>
            <Field label="Name"><input value={draft.name} maxLength={70} placeholder="e.g. Installment, loan" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Amount"><AmountInput value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} /></Field>
            <Field label={draft.isNew ? 'First month' : 'Month due'}><input type="month" value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} /></Field>
            {draft.isNew && <Field label="Number of monthly payments" hint={Number(draft.count) > 1 ? `Creates ${draft.count} payments of ${moneyExact(parseAmount(draft.amount || '0') || 0)} (total ${money((parseAmount(draft.amount || '0') || 0) * Number(draft.count))})` : undefined}>
              <input inputMode="numeric" value={draft.count} onChange={(e) => setDraft({ ...draft, count: e.target.value.replace(/\D/g, '') })} />
            </Field>}
            <Field label="Note"><input value={draft.note} maxLength={120} placeholder="Optional" onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
          </Section>
          {!draft.isNew && <Section><button className="row as-btn destructive-text" onClick={removeDebt}>Delete payment</button></Section>}
        </>}
      </Sheet>
    </div>
  );
}
