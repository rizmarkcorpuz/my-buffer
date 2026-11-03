import { useState } from 'react';
import { useDB } from '../state';
import { earned, jobMonthIncome } from '../calc';
import type { Job } from '../types';
import { AmountInput, Empty, Field, Icon, LargeTitle, MonthStepper, Section, Segmented, Sheet, Toggle, useConfirm, useToast } from '../ui';
import { dayLabel, money, moneyExact, monthLabel, parseAmount, thisMonth, todayISO, uid } from '../util';

type JobDraft = { id: string; name: string; rate: string; currency: 'PHP' | 'USD'; weekly: string; active: boolean; start: string; end: string; isNew: boolean };
type HoursDraft = { id: string; jobId: string; date: string; hours: string; note: string; isNew: boolean };

export default function Work() {
  const { db, update } = useDB();
  const toast = useToast();
  const confirm = useConfirm();
  const [month, setMonth] = useState(thisMonth());
  const [job, setJob] = useState<JobDraft | null>(null);
  const [hrs, setHrs] = useState<HoursDraft | null>(null);
  const [payout, setPayout] = useState<{ jobId: string; amount: string; date: string } | null>(null);

  const logs = db.hours.filter((h) => h.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const totalH = logs.reduce((s, h) => s + h.hours, 0);
  const totalP = logs.reduce((s, h) => s + earned(db, db.jobs.find((j) => j.id === h.jobId), h.hours), 0);
  const sym = (j: Job) => (j.currency === 'USD' ? '$' : '₱');

  const editJob = (j?: Job) => setJob(j
    ? { id: j.id, name: j.name, rate: String(j.rate), currency: j.currency, weekly: String(j.weekly), active: j.active, start: j.start, end: j.end, isNew: false }
    : { id: uid(), name: '', rate: '', currency: 'PHP', weekly: '40', active: true, start: '', end: '', isNew: true });
  const saveJob = () => {
    if (!job) return;
    const rate = parseAmount(job.rate), weekly = parseAmount(job.weekly || '0');
    if (!job.name.trim() || !Number.isFinite(rate) || rate < 0 || !Number.isFinite(weekly) || weekly < 0 || weekly > 168) { toast('Check the name, rate and hours'); return; }
    if (job.start && job.end && job.end < job.start) { toast('Last day is before start date'); return; }
    const rec: Job = { id: job.id, name: job.name.trim(), rate, currency: job.currency, weekly, active: job.active, start: job.start, end: job.end };
    update((d) => { const i = d.jobs.findIndex((x) => x.id === rec.id); if (i >= 0) d.jobs[i] = rec; else d.jobs.push(rec); });
    toast(job.isNew ? 'Job added' : 'Job updated');
    setJob(null);
  };
  const deleteJob = async () => {
    if (!job) return;
    const n = db.hours.filter((h) => h.jobId === job.id).length;
    if (!(await confirm({ title: `Delete ${job.name}?`, message: n ? `${n} logged hour entries will also be deleted. To keep history, set it Inactive instead.` : undefined, confirm: 'Delete', destructive: true }))) return;
    update((d) => { d.jobs = d.jobs.filter((x) => x.id !== job.id); d.hours = d.hours.filter((h) => h.jobId !== job.id); });
    setJob(null);
  };

  const logHours = (h?: (typeof db.hours)[number]) => {
    if (!db.jobs.length) { toast('Add a job first'); editJob(); return; }
    setHrs(h ? { id: h.id, jobId: h.jobId, date: h.date, hours: String(h.hours), note: h.note || '', isNew: false }
      : { id: uid(), jobId: (db.jobs.find((j) => j.active) ?? db.jobs[0]).id, date: todayISO(), hours: '', note: '', isNew: true });
  };
  const saveHours = () => {
    if (!hrs) return;
    const v = parseAmount(hrs.hours);
    if (!Number.isFinite(v) || v <= 0 || v > 24) { toast('Enter between 0 and 24 hours'); return; }
    update((d) => {
      const rec = { id: hrs.id, jobId: hrs.jobId, date: hrs.date, hours: v, note: hrs.note.trim() };
      const i = d.hours.findIndex((x) => x.id === hrs.id); if (i >= 0) d.hours[i] = rec; else d.hours.push(rec);
    });
    const j = db.jobs.find((x) => x.id === hrs.jobId);
    toast(`${v} h logged · ${money(earned(db, j, v))}`);
    setHrs(null);
  };
  const deleteHours = async () => {
    if (!hrs || !(await confirm({ title: 'Delete this work log?', confirm: 'Delete', destructive: true }))) return;
    update((d) => { d.hours = d.hours.filter((h) => h.id !== hrs.id); });
    setHrs(null);
  };

  const savePayout = () => {
    if (!payout) return;
    const v = parseAmount(payout.amount);
    if (!Number.isFinite(v) || v <= 0) return;
    const j = db.jobs.find((x) => x.id === payout.jobId);
    update((d) => { d.transactions.push({ id: uid(), type: 'income', category: 'Salary', amount: v, date: payout.date, note: `${j?.name ?? 'Job'} pay · ${monthLabel(month)}`, createdAt: new Date().toISOString(), jobId: payout.jobId, payFor: month }); });
    toast(`Pay recorded · +${moneyExact(v)} to available cash`);
    setPayout(null);
  };

  const selJob = hrs ? db.jobs.find((j) => j.id === hrs.jobId) : undefined;
  const hrsVal = hrs ? parseAmount(hrs.hours) : NaN;

  return (
    <div className="screen">
      <LargeTitle title="Work" subtitle="Jobs, rates & logged hours"
        right={<button className="icon-btn" aria-label="Log hours" onClick={() => logHours()}><Icon name="clock" /></button>} />

      <Section header="Jobs" aside={<button className="link" onClick={() => editJob()}>Add job</button>}
        footer="Forecasts use each active job’s rate × expected weekly hours, within its dates. Amounts are gross (before tax).">
        {db.jobs.length === 0 && <div className="row"><span className="row-sub">No jobs yet.</span></div>}
        {db.jobs.map((j) => (
          <button className="row as-btn" key={j.id} onClick={() => editJob(j)}>
            <span className="row-main">
              <span className="row-title">{j.name} <span className={`badge ${j.active ? 'ok' : ''}`}>{j.active ? 'Active' : 'Inactive'}</span></span>
              <span className="row-sub">{sym(j)}{j.rate.toLocaleString('en-US')}/h · {j.weekly} h/wk{j.end ? ` · until ${j.end}` : ''}</span>
            </span>
            <span className="row-value">{money(jobMonthIncome(db, { ...j, start: '', end: '' }, thisMonth()))}<span className="row-unit">/mo</span></span>
          </button>
        ))}
      </Section>

      <MonthStepper value={month} onChange={setMonth} />
      <div className="summary-card">
        <div className="summary-top">
          <div><span className="summary-label">Hours logged</span><span className="summary-value">{totalH.toFixed(totalH % 1 ? 1 : 0)} h</span></div>
          <div className="right"><span className="summary-label">Gross earned</span><span className="summary-value good">{money(totalP)}</span></div>
        </div>
        <button className="wide-btn" onClick={() => logHours()}><Icon name="plus" size={18} /> Log hours</button>
      </div>

      {db.jobs.filter((j) => logs.some((h) => h.jobId === j.id)).map((j) => {
        const jl = logs.filter((h) => h.jobId === j.id);
        const pay = jl.reduce((s, h) => s + earned(db, j, h.hours), 0);
        const received = db.transactions.filter((t) => t.jobId === j.id && t.payFor === month).reduce((s, t) => s + t.amount, 0);
        return (
          <Section key={j.id} header={j.name} aside={<span className="section-total">{jl.reduce((s, h) => s + h.hours, 0)} h · {money(pay)}</span>}
            footer={received > 0 ? `${moneyExact(received)} recorded as received for ${monthLabel(month)}.` : 'Logged hours are earnings, not cash. Record pay when it actually lands in your account.'}>
            {jl.map((h) => (
              <button className="row as-btn" key={h.id} onClick={() => logHours(h)}>
                <span className="row-main"><span className="row-title">{dayLabel(h.date)}</span>{h.note && <span className="row-sub">{h.note}</span>}</span>
                <span className="row-value">{h.hours} h<span className="row-unit"> · {money(earned(db, j, h.hours))}</span></span>
              </button>
            ))}
            <button className="row as-btn accent-text" onClick={() => setPayout({ jobId: j.id, amount: String(Math.round(Math.max(0, pay - received) * 100) / 100), date: todayISO() })}>
              Record pay received…
            </button>
          </Section>
        );
      })}
      {logs.length === 0 && <Empty>No hours logged in {monthLabel(month, true)}.</Empty>}

      <Sheet open={!!job} title={job?.isNew ? 'New job' : 'Edit job'} onClose={() => setJob(null)} onDone={saveJob}>
        {job && <>
          <Section>
            <Field label="Job / client"><input value={job.name} maxLength={70} placeholder="e.g. Rare Candy" onChange={(e) => setJob({ ...job, name: e.target.value })} /></Field>
            <Field label="Currency"><Segmented value={job.currency} onChange={(v) => setJob({ ...job, currency: v })} options={[{ value: 'PHP', label: '₱ PHP' }, { value: 'USD', label: '$ USD' }]} /></Field>
            <Field label="Hourly rate">
              <span className="amount-input"><span className="cur">{job.currency === 'USD' ? '$' : '₱'}</span><input inputMode="decimal" value={job.rate} placeholder="0" onChange={(e) => setJob({ ...job, rate: e.target.value.replace(/[^\d.,]/g, '') })} /></span>
            </Field>
            <Field label="Expected hours / week"><input inputMode="decimal" value={job.weekly} onChange={(e) => setJob({ ...job, weekly: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Toggle label="Active" hint="Turn off if the job ended — forecasts stop counting it" checked={job.active} onChange={(v) => setJob({ ...job, active: v })} />
          </Section>
          <Section header="Dates (optional)" footer={job.currency === 'USD' ? `Converted at ₱${db.settings.usdPhp}/USD (edit in Settings).` : undefined}>
            <Field label="Start date"><input type="date" value={job.start} onChange={(e) => setJob({ ...job, start: e.target.value })} /></Field>
            <Field label="Last working day"><input type="date" value={job.end} onChange={(e) => setJob({ ...job, end: e.target.value })} /></Field>
          </Section>
          {!job.isNew && <Section><button className="row as-btn destructive-text" onClick={deleteJob}>Delete job</button></Section>}
        </>}
      </Sheet>

      <Sheet open={!!hrs} title={hrs?.isNew ? 'Log hours' : 'Edit hours'} onClose={() => setHrs(null)} onDone={saveHours}>
        {hrs && <>
          <div className="chips">
            {db.jobs.map((j) => <button key={j.id} className={`chip ${hrs.jobId === j.id ? 'on' : ''}`} onClick={() => setHrs({ ...hrs, jobId: j.id })}>{j.name}</button>)}
          </div>
          <div className="big-amount-wrap">
            <span className="amount-input big"><input inputMode="decimal" autoFocus={hrs.isNew} placeholder="0" value={hrs.hours} onChange={(e) => setHrs({ ...hrs, hours: e.target.value.replace(/[^\d.]/g, '') })} /><span className="cur after">h</span></span>
          </div>
          <div className="chips center">
            {[1, 2, 4, 6, 8].map((v) => <button key={v} className="chip" onClick={() => setHrs({ ...hrs, hours: String(v) })}>{v} h</button>)}
          </div>
          {selJob && Number.isFinite(hrsVal) && hrsVal > 0 && <p className="sheet-lead center">≈ {moneyExact(earned(db, selJob, hrsVal))} gross</p>}
          <Section>
            <Field label="Date"><input type="date" value={hrs.date} onChange={(e) => setHrs({ ...hrs, date: e.target.value })} /></Field>
            <Field label="Note"><input value={hrs.note} maxLength={120} placeholder="Optional" onChange={(e) => setHrs({ ...hrs, note: e.target.value })} /></Field>
          </Section>
          {!hrs.isNew && <Section><button className="row as-btn destructive-text" onClick={deleteHours}>Delete log</button></Section>}
        </>}
      </Sheet>

      <Sheet open={!!payout} title="Pay received" onClose={() => setPayout(null)} onDone={savePayout}>
        {payout && <>
          <p className="sheet-lead">Enter the amount that actually arrived (after fees/tax). It’s added to your available cash.</p>
          <div className="big-amount-wrap"><AmountInput big autoFocus value={payout.amount} onChange={(v) => setPayout({ ...payout, amount: v })} /></div>
          <Section><Field label="Date received"><input type="date" value={payout.date} onChange={(e) => setPayout({ ...payout, date: e.target.value })} /></Field></Section>
        </>}
      </Sheet>
    </div>
  );
}
