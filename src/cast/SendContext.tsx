/**
 * "Send this stream to a device": the core action of the app.
 *
 * If a Chromecast session is already open, the stream goes straight to it.
 * Otherwise the device picker opens; picking a device starts a session, and
 * once its media client shows up the queued stream is loaded onto it.
 */
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

import type { ContentType } from '../lib/stremio';
import type { StreamInfo } from '../lib/streamInfo';
import { KEYS, loadJson, saveJson } from '../lib/storage';
import { useToast } from '../components/Toast';
import { useRecents } from '../state/RecentsContext';
import {
  CastContext,
  MediaStreamType,
  useCastDevice,
  useRemoteMediaClient,
  type Device,
  type MediaLoadRequest,
  type RemoteMediaClient,
} from './cast';

export interface SendMeta {
  type: ContentType;
  metaId: string;
  name: string;
  poster?: string;
  year?: string;
  episode?: { id: string; season: number; episode: number; title: string };
}

export interface SendRequest {
  info: StreamInfo;
  meta: SendMeta;
}

/**
 * picking    – our device sheet is open
 * connecting – a session is starting on the device picked in our sheet
 * waiting    – the system Cast dialog is open; deliver if a session appears
 * loading    – the load request is in flight
 */
type Phase = 'idle' | 'picking' | 'connecting' | 'waiting' | 'loading';

interface SendState {
  phase: Phase;
  /** Stream currently being sent, for row spinners. */
  pendingKey?: string;
  connectingTo?: string;
  lastDeviceId?: string;
  send: (req: SendRequest, opts?: { chooseDevice?: boolean }) => void;
  pickDevice: (device: Device) => void;
  openSystemDialog: () => void;
  cancel: () => void;
}

const SendContext = createContext<SendState | null>(null);

const CONNECT_TIMEOUT_MS = 25000;

export function buildLoadRequest({ info, meta }: SendRequest): MediaLoadRequest {
  const images = meta.poster ? [{ url: meta.poster }] : [];
  const metadata = meta.episode
    ? {
        type: 'tvShow' as const,
        seriesTitle: meta.name,
        title: meta.episode.title,
        seasonNumber: meta.episode.season,
        episodeNumber: meta.episode.episode,
        images,
      }
    : { type: 'movie' as const, title: meta.name, subtitle: meta.year, images };

  return {
    autoplay: true,
    mediaInfo: {
      contentUrl: info.url!,
      contentType: info.contentType,
      streamType: MediaStreamType.BUFFERED,
      metadata,
      customData: { addon: info.addonName, metaId: meta.metaId, videoId: meta.episode?.id },
    },
  };
}

function episodeLabel(ep: NonNullable<SendMeta['episode']>): string {
  return `S${ep.season} · E${ep.episode} · ${ep.title}`;
}

export function SendProvider({ children }: { children: ReactNode }) {
  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const toast = useToast();
  const { add: addRecent } = useRecents();

  const [phase, setPhase] = useState<Phase>('idle');
  const [pending, setPending] = useState<SendRequest | null>(null);
  const [connectingTo, setConnectingTo] = useState<string>();
  const [lastDeviceId, setLastDeviceId] = useState<string>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const deviceNameRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    deviceNameRef.current = castDevice?.friendlyName;
  }, [castDevice]);
  // The session that was open before connecting, so a queued stream is never
  // delivered to it by mistake, and the device we're waiting for.
  const staleClientRef = useRef<RemoteMediaClient | null>(null);
  const targetDeviceRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    loadJson<string | null>(KEYS.lastDevice, null).then((id) => id && setLastDeviceId(id));
  }, []);

  const clearConnectTimeout = () => clearTimeout(timeoutRef.current);

  const load = useCallback(
    async (target: RemoteMediaClient, req: SendRequest) => {
      clearConnectTimeout();
      setPhase('loading');
      try {
        await target.loadMedia(buildLoadRequest(req));
        const deviceName = deviceNameRef.current;
        addRecent({
          type: req.meta.type,
          metaId: req.meta.metaId,
          name: req.meta.name,
          poster: req.meta.poster,
          videoId: req.meta.episode?.id,
          episodeLabel: req.meta.episode ? episodeLabel(req.meta.episode) : undefined,
          deviceName,
        });
        // The remote screen doubles as the "it worked" confirmation.
        router.push('/remote');
      } catch (err) {
        Alert.alert(
          "The TV couldn't start this source",
          `${err instanceof Error ? err.message : String(err)}\n\nTry another source. MP4 / H.264 files with AAC or Dolby audio are the most reliable on Chromecast.`,
        );
      } finally {
        setPending(null);
        setPhase('idle');
        setConnectingTo(undefined);
      }
    },
    [addRecent],
  );

  // Once a new session comes up, deliver whatever was queued.
  useEffect(() => {
    if (!client || !pending || client === staleClientRef.current) return;
    const rightDevice = !castDevice || !targetDeviceRef.current || castDevice.deviceId === targetDeviceRef.current;
    if ((phase === 'connecting' && rightDevice) || phase === 'waiting') {
      load(client, pending);
    }
  }, [client, castDevice, pending, phase, load]);

  useEffect(() => {
    const sub = CastContext.getSessionManager().onSessionStartFailed((_session, error) => {
      clearConnectTimeout();
      setPhase((p) => {
        if (p === 'connecting') {
          toast(`Couldn't connect${error ? `: ${error}` : ''}`, 'error');
          return 'picking';
        }
        return p;
      });
      setConnectingTo(undefined);
    });
    return () => sub.remove();
  }, [toast]);

  const send = useCallback(
    (req: SendRequest, opts?: { chooseDevice?: boolean }) => {
      if (!req.info.url || phase === 'loading' || phase === 'connecting') return;
      clearConnectTimeout();
      if (client && !opts?.chooseDevice) {
        load(client, req);
        return;
      }
      setPending(req);
      setPhase('picking');
    },
    [client, phase, load],
  );

  const pickDevice = useCallback(
    async (device: Device) => {
      setLastDeviceId(device.deviceId);
      saveJson(KEYS.lastDevice, device.deviceId);

      if (client && castDevice?.deviceId === device.deviceId) {
        if (pending) load(client, pending);
        return;
      }

      staleClientRef.current = client;
      targetDeviceRef.current = device.deviceId;
      setPhase('connecting');
      setConnectingTo(device.friendlyName);
      clearConnectTimeout();
      timeoutRef.current = setTimeout(() => {
        setPhase('picking');
        setConnectingTo(undefined);
        toast(`${device.friendlyName} didn't respond. Is it on and on the same Wi-Fi?`, 'error');
      }, CONNECT_TIMEOUT_MS);

      try {
        const sessions = CastContext.getSessionManager();
        if (client) await sessions.endCurrentSession(false);
        await sessions.startSession(device.deviceId);
      } catch (err) {
        clearConnectTimeout();
        setPhase('picking');
        setConnectingTo(undefined);
        toast(`Couldn't connect: ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [client, castDevice, pending, load, toast],
  );

  const openSystemDialog = useCallback(() => {
    // The system dialog doesn't report back, so keep the request queued and
    // let the session effect above deliver it if a device gets picked.
    staleClientRef.current = client;
    targetDeviceRef.current = undefined;
    setPhase('waiting');
    clearConnectTimeout();
    timeoutRef.current = setTimeout(() => {
      setPhase('idle');
      setPending(null);
    }, 120000);
    CastContext.showCastDialog();
  }, [client]);

  const cancel = useCallback(() => {
    clearConnectTimeout();
    setPending(null);
    setPhase('idle');
    setConnectingTo(undefined);
  }, []);

  useEffect(() => clearConnectTimeout, []);

  const value = useMemo<SendState>(
    () => ({
      phase,
      pendingKey: pending?.info.key,
      connectingTo,
      lastDeviceId,
      send,
      pickDevice,
      openSystemDialog,
      cancel,
    }),
    [phase, pending, connectingTo, lastDeviceId, send, pickDevice, openSystemDialog, cancel],
  );

  return <SendContext.Provider value={value}>{children}</SendContext.Provider>;
}

export function useSend(): SendState {
  const ctx = useContext(SendContext);
  if (!ctx) throw new Error('useSend must be used inside SendProvider');
  return ctx;
}
