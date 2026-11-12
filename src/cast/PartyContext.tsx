/**
 * Holds the active watch party (if any) and connects it to the rest of the
 * app: starting one from the device picker, sending new sources to it, and
 * ending it. The sync logic itself lives in src/lib/castv2/party.ts.
 */
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useToast } from '../components/Toast';
import type { LoadMedia } from '../lib/castv2/client';
import { parseDeviceHost, WatchParty } from '../lib/castv2/party';
import { useRecents } from '../state/RecentsContext';
import { CastContext, type Device } from './cast';
import { connectCastSocket } from './partySocket';
import type { SendMeta, SendRequest } from './SendContext';

const POLL_MS = 3000;

interface PartyState {
  party: WatchParty | null;
  /** What the party is watching. */
  meta?: SendMeta;
  starting: boolean;
  error?: string;
  startParty: (devices: Device[], req: SendRequest) => void;
  sendToParty: (req: SendRequest) => void;
  endParty: (opts?: { stopTvs?: boolean }) => Promise<void>;
}

const PartyContext = createContext<PartyState | null>(null);

export function canJoinParty(device: Device): boolean {
  return !!parseDeviceHost(device.ipAddress);
}

export function buildPartyMedia({ info, meta }: SendRequest): LoadMedia {
  const images = meta.poster ? [{ url: meta.poster }] : [];
  const metadata = meta.episode
    ? {
        metadataType: 2,
        seriesTitle: meta.name,
        title: meta.episode.title,
        season: meta.episode.season,
        episode: meta.episode.episode,
        images,
      }
    : { metadataType: 1, title: meta.name, subtitle: meta.year, images };
  return { contentId: info.url!, contentUrl: info.url!, contentType: info.contentType, streamType: 'BUFFERED', metadata };
}

export function PartyProvider({ children }: { children: ReactNode }) {
  const [party, setParty] = useState<WatchParty | null>(null);
  const [meta, setMeta] = useState<SendMeta>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const [, setVersion] = useState(0);
  const toast = useToast();
  const { add: addRecent } = useRecents();

  // Re-render on any change inside the party (statuses, members, volume).
  useEffect(() => party?.subscribe(() => setVersion((v) => v + 1)), [party]);

  // Keep positions fresh for drift display.
  useEffect(() => {
    if (!party) return;
    const t = setInterval(() => party.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [party]);

  const run = useCallback(
    async (p: WatchParty, req: SendRequest) => {
      setStarting(true);
      setError(undefined);
      try {
        const playing = await p.start(buildPartyMedia(req));
        if (p.ended) return;
        addRecent({
          type: req.meta.type,
          metaId: req.meta.metaId,
          name: req.meta.name,
          poster: req.meta.poster,
          videoId: req.meta.episode?.id,
          episodeLabel: req.meta.episode
            ? `S${req.meta.episode.season} · E${req.meta.episode.episode} · ${req.meta.episode.title}`
            : undefined,
          deviceName: `watch party (${p.members.map((m) => m.device.name).join(', ')})`,
        });
        if (playing < p.members.length) toast(`Playing on ${playing} of ${p.members.length} TVs`, 'error');
      } catch (err) {
        if (!p.ended) setError(err instanceof Error ? err.message : String(err));
      } finally {
        setStarting(false);
      }
    },
    [addRecent, toast],
  );

  const startParty = useCallback(
    (devices: Device[], req: SendRequest) => {
      const partyDevices = devices.flatMap((d) => {
        const host = parseDeviceHost(d.ipAddress);
        return host ? [{ id: d.deviceId, name: d.friendlyName, host }] : [];
      });
      if (partyDevices.length === 0) return;

      party?.end({ stopTvs: false });
      // Let go of the normal single-TV session; the party joins the same player on the TV.
      CastContext.getSessionManager()
        .endCurrentSession(false)
        .catch(() => {});

      const next = new WatchParty(partyDevices, connectCastSocket);
      setParty(next);
      setMeta(req.meta);
      router.push('/remote');
      run(next, req);
    },
    [party, run],
  );

  const sendToParty = useCallback(
    (req: SendRequest) => {
      if (!party) return;
      setMeta(req.meta);
      router.push('/remote');
      run(party, req);
    },
    [party, run],
  );

  const endParty = useCallback(
    async ({ stopTvs = true }: { stopTvs?: boolean } = {}) => {
      const p = party;
      setParty(null);
      setMeta(undefined);
      setError(undefined);
      await p?.end({ stopTvs });
    },
    [party],
  );

  // Deliberately a new object every render: the party mutates in place, and
  // each version bump above has to reach the consumers.
  const value: PartyState = { party, meta, starting, error, startParty, sendToParty, endParty };
  return <PartyContext.Provider value={value}>{children}</PartyContext.Provider>;
}

export function useParty(): PartyState {
  const ctx = useContext(PartyContext);
  if (!ctx) throw new Error('useParty must be used inside PartyProvider');
  return ctx;
}

/** The current time, updated once a second, for positions that move while playing. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
