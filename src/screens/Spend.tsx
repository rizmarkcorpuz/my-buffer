import { useMemo, useState } from 'react';
import { useDB } from '../state';
import type { Transaction } from '../types';
import { AmountInput, Empty, Field, Icon, LargeTitle, MonthStepper, Progress, Section, Segmented, Sheet, Toggle, useConfirm, useToast } from '../ui';
import { LimitSheet } from './Limits';
import { dayLabel, moneyExact, money, parseAmount, thisMonth, todayISO, uid } from '../util';

export const EXPENSE_CATS = ['Food', 'Commute', 'Going out', 'Shopping', 'Health', 'Gifts', 'Household', 'Other'];
export const INCOME_CATS = ['Salary', 'Freelance', 'Severance', 'Refund', 'Other income'];

type Draft = { id: string; type: 'expense' | 'income'; amount: string; category: string; date: string; note: string; inSavings: boolean; isNew: boolean; createdAt: string; jobId?: string };

export function useEntrySheet() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const open = (type: 'expense' | 'income' = 'expense', t?: Transaction) => setDraft(t
    ? { id: t.id, type: t.type, amount: String(t.amount), category: t.category, date: t.date, note: t.note || '', inSavings: !!t.inSavings, isNew: false, createdAt: t.createdAt, jobId: t.jobId }
    : { id: uid(), type, amount: '', category: type === 'expense' ? 'Food' : 'Salary', date: todayISO(), note: '', inSavings: false, isNew: true, createdAt: '' });
  return { draft, setDraft, open };
}

export function EntrySheet({ draft, setDraft }: { draft: Draft | null; setDraft: (d: Draft | null) => void }) {
  const { db, update } = useDB();
  const toast = useToast();
  const confirm = useConfirm();
  const used = useMemo(() => new Set(db.transactions.map((t) => t.category)), [db.transactions]);
  if (!draft) return null;
  const base = draft.type === 'expense' ? EXPENSE_CATS : INCOME_CATS;
  const extraCats = [...used].filter((c) => !base.includes(c) && db.transactions.some((t) => t.category === c && t.type === draft.type));
  const cats = [...base, ...extraCats];
  const amount = parseAmount(draft.amount);
  const valid = Number.isFinite(amount) && amount > 0 && !!draft.date && !!draft.category.trim();
  const billNames = db.budget.map((b) => b.name.toLowerCase());
  const looksLikeBill = draft.type === 'expense' && billNames.includes(draft.category.trim().toLowerCase());

  const save = () => {
    if (!valid) return;
    const rec: Transaction = {
      id: draft.id, type: draft.type, amount, category: draft.category.trim(), date: draft.date, note: draft.note.trim(),
      inSavings: draft.inSavings, createdAt: draft.createdAt || new Date().toISOString(), jobId: draft.jobId,
    };
    update((d) => {
      const i = d.transactions.findIndex((t) => t.id === rec.id);
      if (i >= 0) d.transactions[i] = { ...d.transactions[i], ...rec }; else d.transactions.push(rec);
    });
    toast(draft.isNew ? `${draft.type === 'expense' ? 'Expense' : 'Income'} saved · ${moneyExact(amount)}` : 'Updated');
    setDraft(null);
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this entry?', confirm: 'Delete', destructive: true }))) return;
    update((d) => { d.transactions = d.transactions.filter((t) => t.id !== draft.id); });
    setDraft(null);
    toast('Deleted');
  };

  return (
    <Sheet open title={draft.isNew ? (draft.type === 'expense' ? 'Extra expense' : 'Income received') : 'Edit entry'} onClose={() => setDraft(null)} onDone={save} doneDisabled={!valid}>
      <Segmented value={draft.type} onChange={(v) => setDraft({ ...draft, type: v, category: v === 'expense' ? 'Food' : 'Salary' })}
        options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
      <div className="big-amount-wrap"><AmountInput big autoFocus={draft.isNew} value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} /></div>
      <div className="chips">
        {cats.map((c) => <button key={c} className={`chip ${draft.category === c ? 'on' : ''}`} onClick={() => setDraft({ ...draft, category: c })}>{c}</button>)}
      </div>
      {looksLikeBill && <div className="callout warn">“{draft.category}” is one of your monthly bills. Mark it Paid on the Bills tab instead so it isn’t counted twice.</div>}
      <Section>
        <Field label="Category"><input value={draft.category} maxLength={40} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
        <Field label="Note"><input value={draft.note} maxLength={160} placeholder={draft.type === 'expense' ? 'Lunch with friends, Grab…' : 'Payout for…'} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
      </Section>
      <Section footer={draft.inSavings
        ? 'Kept as a record only — your available cash won’t change.'
        : draft.type === 'expense' ? 'This will be subtracted from your available cash.' : 'This will be added to your available cash.'}>
        <Toggle label="Already in my savings balance" hint="Turn on if your last savings update already reflects this" checked={draft.inSavings} onChange={(v) => setDraft({ ...draft, inSavings: v })} />
      </Section>
      {!draft.isNew && <Section><button className="row as-btn destructive-text" onClick={remove}>Delete entry</button></Section>}
    </Sheet>
  );
}

export default function Spend({ openEntry }: { openEntry: (type: 'expense' | 'income', t?: Transaction) => void }) {
  const { db } = useDB();
  const [month, setMonth] = useState(thisMonth());
  const [filter, setFilter] = useState<'expense' | 'income' | 'all'>('expense');
  const [limits, setLimits] = useState(false);
  const limit = db.settings.extraLimit;
  const list = db.transactions.filter((t) => t.date.startsWith(month) && (filter === 'all' || t.type === filter))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const exp = db.transactions.filter((t) => t.type === 'expense' && t.date.startsWith(month));
  const totalExp = exp.reduce((s, t) => s + t.amount, 0);
  const totalInc = db.transactions.filter((t) => t.type === 'income' && t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0);
  const byCat = Object.entries(exp.reduce<Record<string, number>>((a, t) => ((a[t.category] = (a[t.category] || 0) + t.amount), a), {})).sort((a, b) => b[1] - a[1]);
  const days = [...new Set(list.map((t) => t.date))];

  return (
    <div className="screen">
      <LargeTitle title="Spending" subtitle="Purchases outside your monthly bills"
        right={<button className="icon-btn" aria-label="Add expense" onClick={() => openEntry('expense')}><Icon name="plus" /></button>} />
      <MonthStepper value={month} onChange={setMonth} />

      <div className="summary-card">
        <div className="summary-top">
          <div><span className="summary-label">Extra spent</span><span className="summary-value">{money(totalExp)}</span></div>
          <div className="right"><span className="summary-label">Income recorded</span><span className="summary-value good">{money(totalInc)}</span></div>
        </div>
        {limit > 0
          ? <><Progress value={totalExp} max={limit} tone={totalExp > limit ? 'bad' : totalExp > limit * 0.8 ? 'warn' : 'accent'} />
              <button className="summary-foot link-like" onClick={() => setLimits(true)}>{totalExp > limit ? `${money(totalExp - limit)} over` : `${money(limit - totalExp)} left`} of your {money(limit)} monthly limit · Edit</button></>
          : <button className="summary-foot link-like accent-text" onClick={() => setLimits(true)}>Set a monthly limit for extra spending →</button>}
        {byCat.length > 0 && <div className="cat-bars">
          {byCat.slice(0, 6).map(([c, v]) => (
            <div className="cat-bar" key={c}>
              <span className="cat-name">{c}</span>
              <span className="cat-track"><span style={{ width: `${(v / byCat[0][1]) * 100}%` }} /></span>
              <span className="cat-val">{money(v)}</span>
            </div>
          ))}
        </div>}
      </div>

      <Segmented value={filter} onChange={setFilter} options={[{ value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }, { value: 'all', label: 'All' }]} />

      <LimitSheet open={limits} onClose={() => setLimits(false)} />
      {list.length === 0 && <Empty>Nothing recorded for this month.<br /><button className="link" onClick={() => openEntry(filter === 'income' ? 'income' : 'expense')}>Add one</button></Empty>}
      {days.map((day) => {
        const items = list.filter((t) => t.date === day);
        return (
          <Section key={day} header={dayLabel(day)} aside={<span className="section-total">{money(items.reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.amount), 0))}</span>}>
            {items.map((t) => (
              <button className="row as-btn" key={t.id} onClick={() => openEntry(t.type, t)}>
                <span className="row-main"><span className="row-title">{t.category}</span>{(t.note || t.inSavings) && <span className="row-sub">{t.note}{t.inSavings && <span className="badge">record only</span>}</span>}</span>
                <span className={`row-value ${t.type === 'income' ? 'good' : ''}`}>{t.type === 'expense' ? '−' : '+'}{moneyExact(t.amount)}</span>
              </button>
            ))}
          </Section>
        );
      })}
    </div>
  );
}
