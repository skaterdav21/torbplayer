import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { KEYS, loadJson, saveJson } from '../lib/storage';
import {
  baseUrlFromManifestUrl,
  fetchManifest,
  normalizeManifestUrl,
  providesStreams,
  type InstalledAddon,
} from '../lib/stremio';

interface AddonsState {
  addons: InstalledAddon[];
  loaded: boolean;
  install: (input: string) => Promise<InstalledAddon>;
  remove: (baseUrl: string) => void;
  setEnabled: (baseUrl: string, enabled: boolean) => void;
  move: (baseUrl: string, delta: -1 | 1) => void;
  refresh: (baseUrl: string) => Promise<void>;
}

const AddonsContext = createContext<AddonsState | null>(null);

export function AddonsProvider({ children }: { children: ReactNode }) {
  const [addons, setAddons] = useState<InstalledAddon[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadJson<InstalledAddon[]>(KEYS.addons, []).then((saved) => {
      setAddons(Array.isArray(saved) ? saved : []);
      setLoaded(true);
    });
  }, []);

  const update = useCallback((fn: (prev: InstalledAddon[]) => InstalledAddon[]) => {
    setAddons((prev) => {
      const next = fn(prev);
      saveJson(KEYS.addons, next);
      return next;
    });
  }, []);

  const install = useCallback(
    async (input: string) => {
      const manifestUrl = normalizeManifestUrl(input);
      const manifest = await fetchManifest(manifestUrl);
      if (!providesStreams(manifest)) {
        throw new Error(`${manifest.name} doesn't provide streams, so it can't be used as a source.`);
      }
      if (manifest.behaviorHints?.configurationRequired) {
        throw new Error(
          `${manifest.name} needs to be configured first. Open its configure page, then copy the manifest URL it gives you.`,
        );
      }
      const addon: InstalledAddon = { baseUrl: baseUrlFromManifestUrl(manifestUrl), manifest, enabled: true };
      update((prev) => {
        const i = prev.findIndex((a) => a.baseUrl === addon.baseUrl);
        if (i === -1) return [...prev, addon];
        const copy = [...prev];
        copy[i] = { ...addon, enabled: prev[i].enabled };
        return copy;
      });
      return addon;
    },
    [update],
  );

  const remove = useCallback((baseUrl: string) => update((prev) => prev.filter((a) => a.baseUrl !== baseUrl)), [update]);

  const setEnabled = useCallback(
    (baseUrl: string, enabled: boolean) =>
      update((prev) => prev.map((a) => (a.baseUrl === baseUrl ? { ...a, enabled } : a))),
    [update],
  );

  const move = useCallback(
    (baseUrl: string, delta: -1 | 1) =>
      update((prev) => {
        const i = prev.findIndex((a) => a.baseUrl === baseUrl);
        const j = i + delta;
        if (i === -1 || j < 0 || j >= prev.length) return prev;
        const copy = [...prev];
        [copy[i], copy[j]] = [copy[j], copy[i]];
        return copy;
      }),
    [update],
  );

  const refresh = useCallback(
    async (baseUrl: string) => {
      const manifest = await fetchManifest(`${baseUrl}/manifest.json`);
      update((prev) => prev.map((a) => (a.baseUrl === baseUrl ? { ...a, manifest } : a)));
    },
    [update],
  );

  const value = useMemo(
    () => ({ addons, loaded, install, remove, setEnabled, move, refresh }),
    [addons, loaded, install, remove, setEnabled, move, refresh],
  );

  return <AddonsContext.Provider value={value}>{children}</AddonsContext.Provider>;
}

export function useAddons(): AddonsState {
  const ctx = useContext(AddonsContext);
  if (!ctx) throw new Error('useAddons must be used inside AddonsProvider');
  return ctx;
}
