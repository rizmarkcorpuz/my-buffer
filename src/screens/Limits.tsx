import { useEffect, useState } from 'react';
import { useDB } from '../state';
import { avgExtraSpend, safeToSpend } from '../calc';
import { AmountInput, Field, Icon, Progress, Section, Sheet, useToast } from '../ui';
import { money, parseAmount } from '../util';

/** Sheet to set the monthly limit for extra spending and the minimum buffer to keep. */
export function LimitSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, update } = useDB();
  const toast = useToast();
  const [limit, setLimit] = useState('');
  const [floor, setFloor] = useState('');
  useEffect(() => {
    if (open) { setLimit(db.settings.extraLimit ? String(db.settings.extraLimit) : ''); setFloor(db.settings.bufferFloor ? String(db.settings.bufferFloor) : ''); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const avg = Math.round(avgExtraSpend(db, 3));
  const save = () => {
    const l = parseAmount(limit || '0'), f = parseAmount(floor || '0');
    if (!Number.isFinite(l) || l < 0 || !Number.isFinite(f) || f < 0) { toast('Enter valid amounts'); return; }
    update((d) => { d.settings.extraLimit = l; d.settings.bufferFloor = f; });
    toast(l ? `Extra spending limit: ${money(l)}/month` : 'Limit removed');
    onClose();
  };
  return (
    <Sheet open={open} title="Spending limit" onClose={onClose} onDone={save}>
      <p className="sheet-lead">How much can you spend each month on things outside your bills — food out, commute, going out, shopping?</p>
      <div className="big-amount-wrap"><AmountInput big value={limit} onChange={setLimit} placeholder="0" /></div>
      <div className="chips center">
        {[3000, 5000, 8000, 10000].map((v) => <button key={v} className={`chip ${parseAmount(limit) === v ? 'on' : ''}`} onClick={() => setLimit(String(v))}>{money(v)}</button>)}
      </div>
      <p className="fineprint">{avg > 0 ? `Your average over the last 3 months: ${money(avg)}/month.` : 'No past extra spending recorded yet.'} Leave empty for no limit. The forecast uses this limit as your expected extra spending.</p>
      <Section header="Buffer floor" footer="The amount you never want to go below. Safe to spend and the forecast treat this money as untouchable — e.g. one month of bills as an emergency cushion.">
        <Field label="Always keep at least"><AmountInput value={floor} onChange={setFloor} /></Field>
      </Section>
    </Sheet>
  );
}

/** Home card: what can be spent on extras for the rest of the month without touching bills or the buffer. */
export function SafeToSpendCard({ onEdit }: { onEdit: () => void }) {
  const { db } = useDB();
  const s = safeToSpend(db);
  const over = s.limitLeft !== null && s.limitLeft < 0;
  const tight = s.free < 0;
  return (
    <button className={`safe-card ${tight || over ? 'warn' : ''}`} onClick={onEdit}>
      <span className="safe-top">
        <span>
          <span className="tile-label">{s.limit > 0 ? 'Safe to spend this month' : 'Free after this month’s bills'}</span>
          <span className="safe-value">{money(s.safe)}</span>
          <span className="tile-sub">
            {tight ? 'Bills and obligations due now exceed your cash'
              : over ? `${money(-s.limitLeft!)} over your ${money(s.limit)} limit`
              : s.limit > 0 ? `About ${money(s.perDay)}/day for ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}`
              : 'This is your whole runway, not this month’s allowance'}
          </span>
        </span>
        <Icon name="chevR" size={18} />
      </span>
      {s.limit > 0 && <><Progress value={s.spent} max={s.limit} tone={over ? 'bad' : s.spent > s.limit * 0.8 ? 'warn' : 'accent'} />
        <span className="tile-sub">{money(s.spent)} of {money(s.limit)} extra spending used</span></>}
      <span className="safe-math">
        {money(s.cash)} cash − {money(s.billsLeft)} bills left{s.obligationsNow ? ` − ${money(s.obligationsNow)} due now` : ''}{s.floor ? ` − ${money(s.floor)} buffer` : ''} = {money(s.free)} free
      </span>
      {s.futureObligations > 0 && <span className="safe-math">{money(s.futureObligations)} more already committed to upcoming obligations</span>}
      {s.limit === 0 && <span className="safe-cta">Set a monthly limit for extras →</span>}
    </button>
  );
}
