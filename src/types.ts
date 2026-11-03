export type YM = string; // "YYYY-MM"
export type ISODate = string; // "YYYY-MM-DD"

export interface Settings {
  /** Savings balance the user last confirmed (actual money in accounts). */
  cash: number;
  /** When `cash` was confirmed. Activity recorded after this moves the live balance. */
  cashAsOf: string; // ISO datetime
  usdPhp: number;
  goalDate: ISODate;
  horizon: number; // forecast months
  lastBackupAt: string | null;
  /** Monthly cap for spending outside the bills list. 0 = no limit. */
  extraLimit: number;
  /** Minimum balance to always keep (your buffer floor). */
  bufferFloor: number;
}

export interface BudgetLine {
  id: string;
  name: string;
  amount: number;
  estimated?: boolean;
  sheetValue?: string | null;
  sourceRow?: number | null;
  /** Optional first/last month this bill applies (inclusive). Blank = always. */
  startMonth?: YM | '';
  endMonth?: YM | '';
  note?: string;
  /** Optional bills (subscriptions etc.) can be skipped in lean mode. Default: essential. */
  optional?: boolean;
}

export interface BillPayment {
  id: string;
  budgetId: string;
  month: YM;
  amount: number;
  /** ISO datetime (v2 backups stored YYYY-MM-DD). */
  paidAt: string;
}

export interface Debt {
  id: string;
  name: string;
  month: YM;
  amount: number;
  paidAt?: string | null;
  note?: string;
}

export interface Job {
  id: string;
  name: string;
  rate: number;
  currency: 'PHP' | 'USD';
  weekly: number;
  active: boolean;
  start: ISODate | '';
  end: ISODate | '';
}

export interface HoursLog {
  id: string;
  jobId: string;
  date: ISODate;
  hours: number;
  note?: string;
}

export interface Transaction {
  id: string;
  type: 'expense' | 'income';
  date: ISODate;
  amount: number;
  category: string;
  note?: string;
  createdAt: string; // ISO datetime
  /** True when this amount is already reflected in the confirmed savings balance. */
  inSavings?: boolean;
  legacyId?: string;
  jobId?: string;
  /** For job pay: which work month this payout covers. */
  payFor?: YM;
}

export interface Scenario {
  mode: 'planned' | 'none' | 'custom';
  customMonthly: number;
  customStart: YM;
}

export interface DB {
  version: 3;
  settings: Settings;
  budget: BudgetLine[];
  billPayments: BillPayment[];
  debts: Debt[];
  jobs: Job[];
  hours: HoursLog[];
  transactions: Transaction[];
  scenario: Scenario;
}
