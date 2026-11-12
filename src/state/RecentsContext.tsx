import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ContentType } from '../lib/stremio';
import { KEYS, loadJson, saveJson } from '../lib/storage';

export interface RecentItem {
  type: ContentType;
  /** Cinemeta id of the movie or show (not the episode). */
  metaId: string;
  name: string;
  poster?: string;
  /** e.g. "S2 · E5 · The Rains of Castamere" */
  episodeLabel?: string;
  /** Episode stream id for series, so the row can jump straight back to sources. */
  videoId?: string;
  deviceName?: string;
  sentAt: number;
}

const MAX_RECENTS = 15;

interface RecentsState {
  recents: RecentItem[];
  add: (item: Omit<RecentItem, 'sentAt'>) => void;
  clear: () => void;
}

const RecentsContext = createContext<RecentsState | null>(null);

export function RecentsProvider({ children }: { children: ReactNode }) {
  const [recents, setRecents] = useState<RecentItem[]>([]);

  useEffect(() => {
    loadJson<RecentItem[]>(KEYS.recents, []).then((saved) => setRecents(Array.isArray(saved) ? saved : []));
  }, []);

  const add = useCallback((item: Omit<RecentItem, 'sentAt'>) => {
    setRecents((prev) => {
      const sameThing = (r: RecentItem) => r.metaId === item.metaId && r.videoId === item.videoId;
      const next = [{ ...item, sentAt: Date.now() }, ...prev.filter((r) => !sameThing(r))].slice(0, MAX_RECENTS);
      saveJson(KEYS.recents, next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecents([]);
    saveJson(KEYS.recents, []);
  }, []);

  const value = useMemo(() => ({ recents, add, clear }), [recents, add, clear]);
  return <RecentsContext.Provider value={value}>{children}</RecentsContext.Provider>;
}

export function useRecents(): RecentsState {
  const ctx = useContext(RecentsContext);
  if (!ctx) throw new Error('useRecents must be used inside RecentsProvider');
  return ctx;
}
