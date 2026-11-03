import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { DB } from './types';
import { load, persist, requestPersistence, type LoadResult } from './store';

interface Ctx {
  db: DB;
  /** Apply a change. The mutator receives a deep copy it may mutate. */
  update: (fn: (d: DB) => void) => void;
  replace: (d: DB) => void;
  source: LoadResult['source'];
  saveError: string | null;
  persisted: boolean | null;
}
const DBCtx = createContext<Ctx | null>(null);
export const useDB = () => {
  const c = useContext(DBCtx);
  if (!c) throw new Error('DB not loaded');
  return c;
};

export function DBProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ db: DB; source: LoadResult['source'] } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const first = useRef(true);

  useEffect(() => {
    load().then((r) => setState(r));
    requestPersistence().then(setPersisted);
  }, []);

  useEffect(() => {
    if (!state) return;
    if (first.current) { first.current = false; if (state.source !== 'legacy' && state.source !== 'mirror') return; }
    setSaveError(persist(state.db));
  }, [state]);

  // Re-render periodically so "this month" rolls over if the app stays open across midnight.
  const [, tick] = useState(0);
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && tick((x) => x + 1);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const update = useCallback((fn: (d: DB) => void) => {
    setState((s) => {
      if (!s) return s;
      const next = structuredClone(s.db);
      fn(next);
      return { ...s, db: next };
    });
  }, []);
  const replace = useCallback((d: DB) => setState((s) => ({ db: d, source: s?.source ?? 'local' })), []);

  if (!state) return <div className="boot">Monthly Expense Tracker</div>;
  return <DBCtx.Provider value={{ db: state.db, update, replace, source: state.source, saveError, persisted }}>{children}</DBCtx.Provider>;
}
