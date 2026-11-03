import { useState } from 'react';
import { useDB } from '../state';
import { billActive, paymentFor } from '../calc';
import type { BudgetLine } from '../types';
import { AmountInput, Field, Icon, LargeTitle, MonthStepper, Progress, Section, Sheet, Toggle, useConfirm, useToast } from '../ui';
import { haptic, moneyExact, money, parseAmount, stampLabel, thisMonth, uid } from '../util';

type Draft = { id: string; name: string; amount: string; estimated: boolean; startMonth: string; endMonth: string; note: string; isNew: boolean };

export default function Bills() {
  const { db, update } = useDB();
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState(thisMonth());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [actual, setActual] = useState<{ id: string; budgetId: string; name: string; value: string } | null>(null);

  const active = db.budget.filter((b) => billActive(b, month));
  const inactive = db.budget.filter((b) => !billActive(b, month));
  const planned = active.reduce((s, b) => s + b.amount, 0);
  const payments = db.billPayments.filter((p) => p.month === month);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const paidCount = active.filter((b) => paymentFor(db, b.id, month)).length;

  const toggle = (b: BudgetLine) => {
    haptic();
    const existing = paymentFor(db, b.id, month);
    if (existing) {
      update((d) => { d.billPayments = d.billPayments.filter((p) => p.id !== existing.id); });
      toast(`${b.name} marked unpaid`, { label: 'Redo', run: () => update((d) => { d.billPayments.push(existing); }) });
    } else {
      const p = { id: uid(), budgetId: b.id, month, amount: b.amount, paidAt: new Date().toISOString() };
      update((d) => { d.billPayments.push(p); });
      toast(`${b.name} paid · ${moneyExact(b.amount)}`, { label: 'Undo', run: () => update((d) => { d.billPayments = d.billPayments.filter((x) => x.id !== p.id); }) });
    }
  };

  const openEdit = (b?: BudgetLine) => setDraft(b
    ? { id: b.id, name: b.name, amount: String(b.amount), estimated: !!b.estimated, startMonth: b.startMonth || '', endMonth: b.endMonth || '', note: b.note || '', isNew: false }
    : { id: uid(), name: '', amount: '', estimated: false, startMonth: '', endMonth: '', note: '', isNew: true });

  const saveDraft = () => {
    if (!draft) return;
    const amount = parseAmount(draft.amount || '0');
    if (!draft.name.trim() || !Number.isFinite(amount) || amount < 0) return;
    if (draft.startMonth && draft.endMonth && draft.endMonth < draft.startMonth) { toast('End month is before start month'); return; }
    update((d) => {
      const i = d.budget.findIndex((b) => b.id === draft.id);
      const fields = { name: draft.name.trim(), amount, estimated: draft.estimated, startMonth: draft.startMonth, endMonth: draft.endMonth, note: draft.note };
      if (i >= 0) d.budget[i] = { ...d.budget[i], ...fields }; // edit in place: keeps spreadsheet position
      else d.budget.push({ id: draft.id, sheetValue: null, sourceRow: null, ...fields });
    });
    toast(draft.isNew ? 'Bill added' : 'Bill updated');
    setDraft(null);
  };

  const move = (dir: -1 | 1) => {
    if (!draft) return;
    update((d) => {
      const i = d.budget.findIndex((b) => b.id === draft.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.budget.length) return;
      [d.budget[i], d.budget[j]] = [d.budget[j], d.budget[i]];
    });
  };

  const remove = async () => {
    if (!draft) return;
    const hist = db.billPayments.filter((p) => p.budgetId === draft.id).length;
    const ok = await confirm({
      title: `Delete “${draft.name}”?`,
      message: hist ? `Its ${hist} paid record(s) stay in your history and exports. To stop a bill from a month onward, set an End month instead.` : 'This removes the bill from every month.',
      confirm: 'Delete', destructive: true,
    });
    if (!ok) return;
    update((d) => { d.budget = d.budget.filter((b) => b.id !== draft.id); });
    setDraft(null);
    toast('Bill deleted');
  };

  const saveActual = () => {
    if (!actual) return;
    const v = parseAmount(actual.value);
    if (!Number.isFinite(v) || v < 0) return;
    update((d) => { const p = d.billPayments.find((x) => x.id === actual.id); if (p) p.amount = v; });
    toast('Paid amount updated');
    setActual(null);
  };

  const idx = draft ? db.budget.findIndex((b) => b.id === draft.id) : -1;

  return (
    <div className="screen">
      <LargeTitle title="Bills" right={<button className="icon-btn" aria-label="Add bill" onClick={() => openEdit()}><Icon name="plus" /></button>} />
      <MonthStepper value={month} onChange={setMonth} />

      <div className="summary-card">
        <div className="summary-top">
          <div><span className="summary-label">Paid</span><span className="summary-value">{money(paid)}</span></div>
          <div className="right"><span className="summary-label">Planned</span><span className="summary-value muted">{money(planned)}</span></div>
        </div>
        <Progress value={paid} max={planned} />
        <div className="summary-foot">{paidCount} of {active.length} bills paid · {money(Math.max(0, planned - paid))} left</div>
      </div>

      <Section footer="Each line matches your spreadsheet. Tap Paid / Undo — each month is tracked separately. Tap a bill’s name to edit it; tap a paid amount to record what you actually paid.">
        {active.length === 0 && <div className="row"><span className="row-sub">No bills for this month. Tap + to add one, or restore your backup in Settings.</span></div>}
        {active.map((b) => {
          const p = paymentFor(db, b.id, month);
          return (
            <div className={`row bill ${p ? 'is-paid' : ''}`} key={b.id}>
              <button className="row-main as-btn" onClick={() => openEdit(b)}>
                <span className="row-title">{b.name}</span>
                <span className="row-sub">
                  {p ? <>Paid {stampLabel(p.paidAt)}</> : <>{moneyExact(b.amount)}{b.estimated && <span className="badge">estimate</span>}</>}
                </span>
              </button>
              {p && <button className="paid-amt" onClick={() => setActual({ id: p.id, budgetId: b.id, name: b.name, value: String(p.amount) })}>{moneyExact(p.amount)}</button>}
              <button className={`pay-btn ${p ? 'paid' : ''}`} onClick={() => toggle(b)} aria-pressed={!!p}>
                {p ? <><Icon name="check" size={16} stroke={2.6} /> Undo</> : 'Paid'}
              </button>
            </div>
          );
        })}
        {active.length > 0 && <div className="row total"><span className="row-title">Monthly planned total</span><span className="row-value">{moneyExact(planned)}</span></div>}
      </Section>

      {inactive.length > 0 && (
        <Section header="Not scheduled this month">
          {inactive.map((b) => (
            <button className="row as-btn dim" key={b.id} onClick={() => openEdit(b)}>
              <span className="row-main"><span className="row-title">{b.name}</span><span className="row-sub">{b.startMonth && `From ${b.startMonth}`} {b.endMonth && `Until ${b.endMonth}`}</span></span>
              <span className="row-value">{moneyExact(b.amount)}</span>
            </button>
          ))}
        </Section>
      )}

      <Sheet open={!!draft} title={draft?.isNew ? 'New bill' : 'Edit bill'} onClose={() => setDraft(null)} onDone={saveDraft} doneDisabled={!draft?.name.trim()}>
        {draft && <>
          <Section>
            <Field label="Name"><input value={draft.name} maxLength={60} placeholder="e.g. Electric Bill (Kawit)" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Monthly amount"><AmountInput value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} /></Field>
            <Toggle label="Amount is an estimate" hint="For bills that vary (your sheet says TBA)" checked={draft.estimated} onChange={(v) => setDraft({ ...draft, estimated: v })} />
          </Section>
          <Section header="Schedule (optional)" footer="Leave blank to repeat every month. Use End month when a bill stops (e.g. braces finished) — past months keep their history.">
            <Field label="Starts"><input type="month" value={draft.startMonth} onChange={(e) => setDraft({ ...draft, startMonth: e.target.value })} /></Field>
            <Field label="Ends"><input type="month" value={draft.endMonth} onChange={(e) => setDraft({ ...draft, endMonth: e.target.value })} /></Field>
            <Field label="Note"><input value={draft.note} maxLength={120} placeholder="Optional" onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
          </Section>
          {!draft.isNew && <>
            <Section header="Order in list">
              <div className="row">
                <span className="row-sub">Position {idx + 1} of {db.budget.length}</span>
                <span className="btn-pair">
                  <button className="chip" disabled={idx <= 0} onClick={() => move(-1)}><Icon name="up" size={16} /> Up</button>
                  <button className="chip" disabled={idx >= db.budget.length - 1} onClick={() => move(1)}><Icon name="down" size={16} /> Down</button>
                </span>
              </div>
            </Section>
            <Section><button className="row as-btn destructive-text" onClick={remove}>Delete bill</button></Section>
          </>}
        </>}
      </Sheet>

      <Sheet open={!!actual} title="Amount paid" onClose={() => setActual(null)} onDone={saveActual}>
        {actual && <>
          <p className="sheet-lead">What did you actually pay for <b>{actual.name}</b> this month?</p>
          <div className="big-amount-wrap"><AmountInput big autoFocus value={actual.value} onChange={(v) => setActual({ ...actual, value: v })} /></div>
          <p className="fineprint">Only this month’s record changes. The planned amount stays the same.</p>
        </>}
      </Sheet>
    </div>
  );
}
