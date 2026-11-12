import { useCallback, useEffect, useMemo, useState } from 'react';

import { isAbortError } from '../lib/http';
import { analyzeStream, sortStreams, type StreamInfo } from '../lib/streamInfo';
import { fetchStreams, supportsResource, type ContentType } from '../lib/stremio';
import { useAddons } from '../state/AddonsContext';

export interface AddonResult {
  baseUrl: string;
  name: string;
  status: 'loading' | 'done' | 'error';
  count: number;
  error?: string;
}

type Outcome = { status: 'done'; infos: StreamInfo[] } | { status: 'error'; error: string };

/**
 * Asks every enabled stream addon for sources in parallel. Results show up
 * as each addon answers, so one slow addon doesn't hold up the list.
 */
export function useSources(type: ContentType, id: string | undefined) {
  const { addons, loaded } = useAddons();
  const [nonce, setNonce] = useState(0);
  // Outcomes are tagged with the request they belong to, so switching titles
  // never shows the previous title's sources.
  const [state, setState] = useState<{ key: string; byAddon: Record<string, Outcome> }>({ key: '', byAddon: {} });

  const eligible = useMemo(
    () => (id ? addons.filter((a) => a.enabled && supportsResource(a.manifest, 'stream', type, id)) : []),
    [addons, type, id],
  );
  const requestKey = `${type}|${id}|${nonce}|${eligible.map((a) => a.baseUrl).join(',')}`;

  useEffect(() => {
    if (!id || !loaded) return;
    const controller = new AbortController();
    const record = (baseUrl: string, outcome: Outcome) =>
      setState((prev) => ({
        key: requestKey,
        byAddon: { ...(prev.key === requestKey ? prev.byAddon : {}), [baseUrl]: outcome },
      }));

    for (const addon of eligible) {
      fetchStreams(addon, type, id, controller.signal)
        .then((streams) => {
          if (controller.signal.aborted) return;
          record(addon.baseUrl, {
            status: 'done',
            infos: streams.map((s, i) => analyzeStream(s, addon.manifest.name, i)),
          });
        })
        .catch((err) => {
          if (controller.signal.aborted || isAbortError(err)) return;
          record(addon.baseUrl, { status: 'error', error: err instanceof Error ? err.message : String(err) });
        });
    }
    return () => controller.abort();
  }, [requestKey, eligible, type, id, loaded]);

  const byAddon = useMemo(() => (state.key === requestKey ? state.byAddon : {}), [state, requestKey]);

  const statuses = useMemo<AddonResult[]>(
    () =>
      eligible.map((a) => {
        const o = byAddon[a.baseUrl];
        return {
          baseUrl: a.baseUrl,
          name: a.manifest.name,
          status: o?.status ?? 'loading',
          count: o?.status === 'done' ? o.infos.length : 0,
          error: o?.status === 'error' ? o.error : undefined,
        };
      }),
    [eligible, byAddon],
  );

  const items = useMemo(
    () => sortStreams(eligible.flatMap((a) => (byAddon[a.baseUrl]?.status === 'done' ? (byAddon[a.baseUrl] as { infos: StreamInfo[] }).infos : []))),
    [eligible, byAddon],
  );

  const loading = !loaded || statuses.some((s) => s.status === 'loading');
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { items, statuses, loading, reload, hasAddons: eligible.length > 0, addonsLoaded: loaded };
}
