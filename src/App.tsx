import { useEffect, useState } from 'react';
import { useDB } from './state';
import { Icon } from './ui';
import Home from './screens/Home';
import Bills from './screens/Bills';
import Spend, { EntrySheet, useEntrySheet } from './screens/Spend';
import Work from './screens/Work';
import Forecast from './screens/Forecast';
import Settings, { RestoreFlow } from './screens/Settings';

export type Tab = 'home' | 'bills' | 'spend' | 'work' | 'forecast';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'bills', label: 'Bills', icon: 'bills' },
  { id: 'spend', label: 'Spending', icon: 'spend' },
  { id: 'work', label: 'Work', icon: 'work' },
  { id: 'forecast', label: 'Forecast', icon: 'chart' },
];

function Welcome({ onSkip }: { onSkip: () => void }) {
  const restore = RestoreFlow();
  return (
    <div className="welcome">
      {restore.el}
      <img src="/icon-512.png" alt="" width={88} height={88} />
      <h1>My Buffer</h1>
      <p>Your private bills, spending, work hours and cash runway. Everything stays on this iPhone.</p>
      <button className="primary-btn" onClick={restore.pick}><Icon name="restore" size={20} /> Restore my backup</button>
      <p className="fineprint">Choose your <b>my-buffer-starter.json</b> (built from your spreadsheet) or a backup exported from the earlier My Buffer app.</p>
      <button className="link" onClick={onSkip}>Start empty</button>
    </div>
  );
}

export default function App() {
  const { db } = useDB();
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('tab') as Tab) || 'home');
  const [settings, setSettings] = useState(false);
  const [skipped, setSkipped] = useState(() => { try { return localStorage.getItem('mybuffer_v3') !== null; } catch { return false; } });
  const entry = useEntrySheet();

  useEffect(() => { try { sessionStorage.setItem('tab', tab); } catch { /* */ } window.scrollTo(0, 0); }, [tab]);

  const isEmpty = !db.budget.length && !db.transactions.length && !db.jobs.length && !db.settings.cash;
  if (isEmpty && !skipped) return <Welcome onSkip={() => setSkipped(true)} />;

  return (
    <>
      <main className={`content ${tab === 'spend' ? 'has-fab' : ''}`}>
        {tab === 'home' && <Home go={setTab} openSettings={() => setSettings(true)} addExpense={() => entry.open('expense')} />}
        {tab === 'bills' && <Bills />}
        {tab === 'spend' && <Spend openEntry={entry.open} />}
        {tab === 'work' && <Work />}
        {tab === 'forecast' && <Forecast />}
      </main>
      {tab === 'spend' && (
        <button className="fab" aria-label="Add extra expense" onClick={() => entry.open('expense')}><Icon name="plus" size={26} stroke={2.4} /></button>
      )}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={24} stroke={tab === t.id ? 2.3 : 1.8} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <EntrySheet draft={entry.draft} setDraft={entry.setDraft} />
      <Settings open={settings} onClose={() => setSettings(false)} />
    </>
  );
}
