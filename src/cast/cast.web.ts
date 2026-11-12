/**
 * Browser stand-in for react-native-google-cast (which is native-only).
 * It fakes two Chromecasts and a playing video so the whole flow can be
 * clicked through with `npm run web`. Nothing here is used on the phone.
 */
import { createElement, useSyncExternalStore } from 'react';
import { Pressable, Text } from 'react-native';
import type { Device, MediaLoadRequest, MediaStatus } from 'react-native-google-cast';

export type { Device, MediaLoadRequest, MediaStatus };

export const isSimulatedCast = true;

export enum CastState {
  NO_DEVICES_AVAILABLE = 'noDevicesAvailable',
  NOT_CONNECTED = 'notConnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
}
export enum MediaPlayerState {
  BUFFERING = 'buffering',
  IDLE = 'idle',
  LOADING = 'loading',
  PAUSED = 'paused',
  PLAYING = 'playing',
}
export enum MediaPlayerIdleReason {
  CANCELLED = 'cancelled',
  ERROR = 'error',
  FINISHED = 'finished',
  INTERRUPTED = 'interrupted',
}
export enum MediaStreamType {
  BUFFERED = 'buffered',
  LIVE = 'live',
  OTHER = 'other',
}

const device = (deviceId: string, friendlyName: string, modelName: string): Device => ({
  deviceId,
  friendlyName,
  modelName,
  capabilities: ['VideoOut', 'AudioOut'],
  deviceVersion: '1',
  icons: [],
  ipAddress: '192.168.1.50',
  isOnLocalNetwork: true,
});

const DEVICES = [
  device('sim-living-room', 'Living Room TV', 'Google TV Streamer'),
  device('sim-bedroom', 'Bedroom', 'Chromecast with Google TV'),
];

interface SimState {
  castState: CastState;
  device: Device | null;
  status: MediaStatus | null;
  duration: number;
  deviceVolume: number;
}

let state: SimState = {
  castState: CastState.NOT_CONNECTED,
  device: null,
  status: null,
  duration: 0,
  deviceVolume: 0.5,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<SimState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let ticker: ReturnType<typeof setInterval> | undefined;
function patchStatus(patch: Partial<MediaStatus>) {
  if (state.status) set({ status: { ...state.status, ...patch } });
}

const client = {
  async loadMedia(request: MediaLoadRequest) {
    await new Promise((r) => setTimeout(r, 500));
    if (state.castState !== CastState.CONNECTED) throw new Error('Not connected');
    set({
      duration: 2 * 60 * 60,
      status: {
        isMuted: false,
        playbackRate: 1,
        playerState: MediaPlayerState.BUFFERING,
        queueItems: [],
        streamPosition: request.startTime ?? 0,
        volume: 1,
        mediaInfo: { ...request.mediaInfo!, streamDuration: 2 * 60 * 60 },
      },
    });
    clearInterval(ticker);
    setTimeout(() => patchStatus({ playerState: MediaPlayerState.PLAYING }), 1200);
    ticker = setInterval(() => {
      if (state.status?.playerState === MediaPlayerState.PLAYING) {
        patchStatus({ streamPosition: Math.min(state.duration, state.status.streamPosition + 1) });
      }
    }, 1000);
  },
  async play() {
    patchStatus({ playerState: MediaPlayerState.PLAYING });
  },
  async pause() {
    patchStatus({ playerState: MediaPlayerState.PAUSED });
  },
  async stop() {
    clearInterval(ticker);
    set({ status: null });
  },
  async seek({ position = 0, relative }: { position?: number; relative?: boolean }) {
    if (!state.status) return;
    const next = relative ? state.status.streamPosition + position : position;
    patchStatus({ streamPosition: Math.max(0, Math.min(state.duration, next)) });
  },
};

const session = {
  client,
  async getVolume() {
    return state.deviceVolume;
  },
  setVolume(v: number) {
    set({ deviceVolume: Math.max(0, Math.min(1, v)) });
  },
};

const sessionManager = {
  async startSession(deviceId: string) {
    const d = DEVICES.find((x) => x.deviceId === deviceId);
    if (!d) return false;
    set({ castState: CastState.CONNECTING });
    setTimeout(() => set({ castState: CastState.CONNECTED, device: d }), 700);
    return true;
  },
  async endCurrentSession() {
    clearInterval(ticker);
    set({ castState: CastState.NOT_CONNECTED, device: null, status: null });
  },
  onSessionStartFailed() {
    return { remove() {} };
  },
};

const discoveryManager = {
  async startDiscovery() {},
  async stopDiscovery() {},
};

export const CastContext = {
  getSessionManager: () => sessionManager,
  getDiscoveryManager: () => discoveryManager,
  async showCastDialog() {
    return sessionManager.startSession(DEVICES[0].deviceId);
  },
  async showExpandedControls() {
    return false;
  },
};

export function useCastState() {
  return useSyncExternalStore(subscribe, () => state.castState);
}
export function useDevices() {
  return DEVICES;
}
export function useCastDevice() {
  return useSyncExternalStore(subscribe, () => state.device);
}
export function useCastSession() {
  return useSyncExternalStore(subscribe, () => (state.castState === CastState.CONNECTED ? session : null));
}
export function useRemoteMediaClient() {
  return useSyncExternalStore(subscribe, () => (state.castState === CastState.CONNECTED ? client : null));
}
export type RemoteMediaClient = typeof client;
export function useMediaStatus() {
  return useSyncExternalStore(subscribe, () => state.status);
}
export function useStreamPosition() {
  return useSyncExternalStore(subscribe, () => state.status?.streamPosition ?? null);
}

export function CastButton({ tintColor = '#fff' }: { tintColor?: string; style?: unknown }) {
  return createElement(
    Pressable,
    { onPress: () => CastContext.showCastDialog(), accessibilityLabel: 'Cast', hitSlop: 8 },
    createElement(Text, { style: { color: tintColor, fontSize: 18 } }, state.device ? '◉' : '◎'),
  );
}
