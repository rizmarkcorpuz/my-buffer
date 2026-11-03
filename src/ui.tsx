import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { addMonths, monthLabel } from './util';

/* ---------------------------------- icons ---------------------------------- */
const P = (d: string) => <path d={d} />;
const ICONS: Record<string, React.ReactNode> = {
  home: P('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'),
  bills: <>{P('M6 3h12v18l-3-2-3 2-3-2-3 2z')}{P('M9 8h6M9 12h6')}</>,
  spend: <>{P('M3 7h18v12H3z')}{P('M3 11h18')}{P('M16 15h2')}</>,
  work: <>{P('M4 8h16v11H4z')}{P('M9 8V5h6v3')}{P('M4 13h16')}</>,
  chart: <>{P('M4 20V4')}{P('M4 20h16')}{P('M7 15l4-4 3 3 5-6')}</>,
  gear: <><circle cx="12" cy="12" r="3" />{P('M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')}</>,
  plus: P('M12 5v14M5 12h14'),
  check: P('M5 12.5l4.5 4.5L19 7.5'),
  chevL: P('M15 18l-6-6 6-6'),
  chevR: P('M9 18l6-6-6-6'),
  pencil: P('M4 20h4L19 9l-4-4L4 16zM14 6l4 4'),
  up: P('M12 19V5M6 11l6-6 6 6'),
  down: P('M12 5v14M6 13l6 6 6-6'),
  share: <>{P('M12 3v13')}{P('M7 8l5-5 5 5')}{P('M5 13v7h14v-7')}</>,
  restore: <>{P('M12 16V3')}{P('M7 11l5 5 5-5')}{P('M5 20h14')}</>,
  clock: <><circle cx="12" cy="12" r="9" />{P('M12 7v5l3 2')}</>,
  alert: <>{P('M12 3 2 20h20z')}{P('M12 10v4M12 17v.5')}</>,
  x: P('M6 6l12 12M18 6 6 18'),
  sun: <><circle cx="12" cy="12" r="4" />{P('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')}</>,
  moon: P('M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'),
};
export function Icon({ name, size = 22, stroke = 2 }: { name: keyof typeof ICONS | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/* ---------------------------------- toast ---------------------------------- */
type ToastMsg = { text: string; action?: { label: string; run: () => void }; id: number };
const ToastCtx = createContext<(text: string, action?: ToastMsg['action']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number>();
  const show = (text: string, action?: ToastMsg['action']) => {
    window.clearTimeout(timer.current);
    setMsg({ text, action, id: Date.now() });
    timer.current = window.setTimeout(() => setMsg(null), action ? 4500 : 2400);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status" key={msg.id}>
          <span>{msg.text}</span>
          {msg.action && <button onClick={() => { msg.action!.run(); setMsg(null); }}>{msg.action.label}</button>}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ------------------------------ confirm dialog ------------------------------ */
type ConfirmReq = { title: string; message?: string; confirm: string; destructive?: boolean; resolve: (v: boolean) => void };
const ConfirmCtx = createContext<(o: Omit<ConfirmReq, 'resolve'>) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmHost({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const ask = (o: Omit<ConfirmReq, 'resolve'>) => new Promise<boolean>((resolve) => setReq({ ...o, resolve }));
  const done = (v: boolean) => { req?.resolve(v); setReq(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {req && (
        <div className="alert-backdrop" onClick={() => done(false)}>
          <div className="alert" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="alert-body">
              <div className="alert-title">{req.title}</div>
              {req.message && <div className="alert-msg">{req.message}</div>}
            </div>
            <div className="alert-actions">
              <button onClick={() => done(false)}>Cancel</button>
              <button className={req.destructive ? 'destructive' : 'bold'} onClick={() => done(true)}>{req.confirm}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

/* ---------------------------------- sheet ---------------------------------- */
export function Sheet({ open, title, onClose, onDone, doneLabel = 'Save', doneDisabled, children }: {
  open: boolean; title: string; onClose: () => void; onDone?: () => void; doneLabel?: string; doneDisabled?: boolean; children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-bar">
          <button className="link" onClick={onClose}>Cancel</button>
          <div className="sheet-title">{title}</div>
          {onDone ? <button className="link bold" disabled={doneDisabled} onClick={onDone}>{doneLabel}</button> : <span style={{ width: 56 }} />}
        </div>
        <div className="sheet-content">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------ grouped lists ------------------------------ */
export function Section({ header, footer, children, aside }: { header?: React.ReactNode; footer?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="section">
      {(header || aside) && <div className="section-header"><span>{header}</span>{aside}</div>}
      <div className="group">{children}</div>
      {footer && <div className="section-footer">{footer}</div>}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">{children}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="row toggle-row">
      <span className="row-main"><span className="row-title">{label}</span>{hint && <span className="row-sub">{hint}</span>}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function MonthStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="month-stepper">
      <button aria-label="Previous month" onClick={() => onChange(addMonths(value, -1))}><Icon name="chevL" /></button>
      <label className="month-label">
        {monthLabel(value, true)}
        <input type="month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Pick month" />
      </label>
      <button aria-label="Next month" onClick={() => onChange(addMonths(value, 1))}><Icon name="chevR" /></button>
    </div>
  );
}

export function Progress({ value, max, tone = 'accent' }: { value: number; max: number; tone?: 'accent' | 'warn' | 'bad' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div className={`progress ${tone}`}><div style={{ width: `${pct}%` }} /></div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function LargeTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="large-title">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

/** Text input that edits numbers without fighting the user's typing. */
export function AmountInput({ value, onChange, placeholder = '0', autoFocus, big }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; big?: boolean }) {
  return (
    <span className={`amount-input ${big ? 'big' : ''}`}>
      <span className="cur">₱</span>
      <input inputMode="decimal" enterKeyHint="done" autoFocus={autoFocus} placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))} />
    </span>
  );
}
