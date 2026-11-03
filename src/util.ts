export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const pad = (n: number) => String(n).padStart(2, '0');
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const thisMonth = (d = new Date()) => todayISO(d).slice(0, 7);

export function addMonths(ym: string, add: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + add, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export const daysInMonth = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
export const monthsBetween = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

const peso0 = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const peso2 = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n: number) => peso0.format(Math.round(Number(n) || 0));
export const moneyExact = (n: number) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? peso0.format(v) : peso2.format(v);
};
export const compact = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : String(Math.round(a));
  return (n < 0 ? '−₱' : '₱') + s;
};

export const monthLabel = (ym: string, long = false) =>
  new Date(`${ym}-01T12:00:00`).toLocaleDateString('en-US', { month: long ? 'long' : 'short', year: 'numeric' });
export const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const stampLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const parseAmount = (s: string) => {
  const v = Number(String(s).replace(/[,₱\s]/g, ''));
  return Number.isFinite(v) ? v : NaN;
};

export function haptic() {
  try { (navigator as any).vibrate?.(8); } catch { /* iOS ignores */ }
}
