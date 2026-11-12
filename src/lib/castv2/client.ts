/**
 * A small Google Cast v2 sender: connect to one TV, start the Default Media
 * Receiver, load a URL, and control playback.
 *
 * The Android Cast SDK only allows one session at a time, so watch parties
 * talk to each TV directly with this instead. TVs accept several senders at
 * once, so this works alongside the SDK's normal session.
 *
 * Message reference: https://developers.google.com/cast/docs/media/messages
 */
import { Deframer, frame, type CastMessage } from './protocol';

export const NS = {
  connection: 'urn:x-cast:com.google.cast.tp.connection',
  heartbeat: 'urn:x-cast:com.google.cast.tp.heartbeat',
  receiver: 'urn:x-cast:com.google.cast.receiver',
  media: 'urn:x-cast:com.google.cast.media',
} as const;

export const DEFAULT_MEDIA_RECEIVER = 'CC1AD845';
export const CAST_PORT = 8009;
const SENDER = 'sender-0';
const RECEIVER = 'receiver-0';
const HEARTBEAT_MS = 5000;

export interface CastSocket {
  write(bytes: Uint8Array): void;
  close(): void;
}
export interface SocketHandlers {
  onData(bytes: Uint8Array): void;
  onClose(error?: string): void;
}
/** Opens a TLS connection to a Cast device. Native and simulated versions exist. */
export type SocketFactory = (host: string, port: number, handlers: SocketHandlers) => Promise<CastSocket>;

export type PlayerState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'LOADING';

export interface MediaStatus {
  mediaSessionId: number;
  playerState: PlayerState;
  currentTime: number;
  playbackRate?: number;
  idleReason?: 'CANCELLED' | 'INTERRUPTED' | 'FINISHED' | 'ERROR';
  media?: { contentId?: string; duration?: number };
}

export interface LoadMedia {
  contentId: string;
  contentUrl?: string;
  contentType: string;
  streamType: 'BUFFERED' | 'LIVE';
  metadata?: Record<string, unknown>;
}

type Json = Record<string, any>;

const ERROR_TYPES = new Set([
  'LOAD_FAILED',
  'LOAD_CANCELLED',
  'INVALID_REQUEST',
  'INVALID_PLAYER_STATE',
  'LAUNCH_ERROR',
  'ERROR',
]);

function findApp(p: Json | undefined, appId: string): { transportId: string; sessionId: string } | undefined {
  const apps: Json[] = p?.status?.applications ?? [];
  return apps.find((a) => a.appId === appId && typeof a.transportId === 'string') as never;
}

export class CastV2Client {
  status: MediaStatus | null = null;
  /** When `status` was last updated, for estimating the live position. */
  statusAt = 0;
  volume?: number;
  closed = false;
  closeReason?: string;

  private socket?: CastSocket;
  private transportId?: string;
  private sessionId?: string;
  private requestId = 0;
  private pending = new Map<number, { resolve: (p: Json) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private waiters: { test: (p: Json, ns: string) => boolean; resolve: (p: Json) => void }[] = [];
  private deframer = new Deframer();
  private heartbeat?: ReturnType<typeof setInterval>;
  private listeners = new Set<() => void>();

  static async connect(host: string, openSocket: SocketFactory, port = CAST_PORT): Promise<CastV2Client> {
    const client = new CastV2Client();
    client.socket = await openSocket(host, port, {
      onData: (bytes) => client.onData(bytes),
      onClose: (error) => client.handleClose(error),
    });
    client.send(NS.connection, RECEIVER, { type: 'CONNECT' });
    client.heartbeat = setInterval(() => client.send(NS.heartbeat, RECEIVER, { type: 'PING' }), HEARTBEAT_MS);
    return client;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Join the Default Media Receiver if it's already running on the TV, otherwise launch it. */
  async launch(appId = DEFAULT_MEDIA_RECEIVER): Promise<void> {
    const current = await this.request(NS.receiver, RECEIVER, { type: 'GET_STATUS' });
    let app = findApp(current, appId);
    if (!app) {
      // The app can show up in the LAUNCH reply or in a later status broadcast.
      const ready = this.waitFor((p) => p.type === 'RECEIVER_STATUS' && !!findApp(p, appId), 25000);
      this.request(NS.receiver, RECEIVER, { type: 'LAUNCH', appId }, 25000).catch(ready.fail);
      app = findApp(await ready.promise, appId)!;
    }
    this.transportId = app.transportId;
    this.sessionId = app.sessionId;
    this.send(NS.connection, this.transportId, { type: 'CONNECT' });
  }

  async load(media: LoadMedia, { autoplay = true, currentTime = 0 } = {}): Promise<MediaStatus | null> {
    if (!this.transportId) throw new Error('Receiver not launched');
    this.status = null;
    await this.request(NS.media, this.transportId, { type: 'LOAD', media, autoplay, currentTime }, 30000);
    return this.status;
  }

  play() {
    return this.mediaCommand('PLAY');
  }
  pause() {
    return this.mediaCommand('PAUSE');
  }
  stop() {
    return this.mediaCommand('STOP');
  }
  seek(currentTime: number, resumeState?: 'PLAYBACK_START' | 'PLAYBACK_PAUSE') {
    return this.mediaCommand('SEEK', { currentTime: Math.max(0, currentTime), ...(resumeState ? { resumeState } : {}) });
  }
  async refresh(): Promise<void> {
    if (this.transportId) await this.request(NS.media, this.transportId, { type: 'GET_STATUS' });
  }
  async setVolume(level: number): Promise<void> {
    await this.request(NS.receiver, RECEIVER, { type: 'SET_VOLUME', volume: { level: Math.max(0, Math.min(1, level)) } });
  }

  /** Playback position now, extrapolated from the last status while playing. */
  position(now = Date.now()): number {
    const s = this.status;
    if (!s) return 0;
    if (s.playerState !== 'PLAYING') return s.currentTime;
    return s.currentTime + ((now - this.statusAt) / 1000) * (s.playbackRate ?? 1);
  }

  /** Resolves once the media status matches, e.g. the TV finished buffering. */
  waitForStatus(test: (s: MediaStatus | null) => boolean, timeoutMs: number): Promise<MediaStatus | null> {
    if (test(this.status)) return Promise.resolve(this.status);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error('Timed out waiting for the TV'));
      }, timeoutMs);
      const unsubscribe = this.subscribe(() => {
        if (this.closed) {
          clearTimeout(timer);
          unsubscribe();
          reject(new Error(this.closeReason ?? 'Disconnected'));
        } else if (test(this.status)) {
          clearTimeout(timer);
          unsubscribe();
          resolve(this.status);
        }
      });
    });
  }

  /** Disconnect. With `stopApp`, also closes the player on the TV. */
  close(stopApp = false) {
    if (this.closed) return;
    try {
      if (stopApp && this.sessionId) this.send(NS.receiver, RECEIVER, { type: 'STOP', sessionId: this.sessionId, requestId: ++this.requestId });
      if (this.transportId) this.send(NS.connection, this.transportId, { type: 'CLOSE' });
      this.send(NS.connection, RECEIVER, { type: 'CLOSE' });
    } catch {
      // Socket already gone.
    }
    this.socket?.close();
    this.handleClose('Closed');
  }

  private mediaCommand(type: string, extra: Json = {}): Promise<Json> {
    if (!this.transportId || !this.status) return Promise.reject(new Error('Nothing loaded'));
    return this.request(NS.media, this.transportId, { type, mediaSessionId: this.status.mediaSessionId, ...extra });
  }

  private send(namespace: string, destinationId: string, payload: Json) {
    if (this.closed || !this.socket) throw new Error(this.closeReason ?? 'Disconnected');
    const message: CastMessage = { sourceId: SENDER, destinationId, namespace, payload: JSON.stringify(payload) };
    this.socket.write(frame(message));
  }

  private request(namespace: string, destinationId: string, payload: Json, timeoutMs = 10000): Promise<Json> {
    const requestId = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${payload.type} timed out`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.send(namespace, destinationId, { ...payload, requestId });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(err);
      }
    });
  }

  private waitFor(test: (p: Json, ns: string) => boolean, timeoutMs: number) {
    let fail: (e: Error) => void = () => {};
    const promise = new Promise<Json>((resolve, reject) => {
      const waiter = { test, resolve: (p: Json) => (clearTimeout(timer), resolve(p)) };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error('Timed out waiting for the TV'));
      }, timeoutMs);
      fail = (e) => {
        clearTimeout(timer);
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(e);
      };
      this.waiters.push(waiter);
    });
    return { promise, fail };
  }

  private onData(bytes: Uint8Array) {
    let messages: CastMessage[];
    try {
      messages = this.deframer.push(bytes);
    } catch (err) {
      this.handleClose(err instanceof Error ? err.message : String(err));
      return;
    }
    for (const m of messages) this.onMessage(m);
  }

  private onMessage(m: CastMessage) {
    let p: Json;
    try {
      p = JSON.parse(m.payload);
    } catch {
      return;
    }

    if (m.namespace === NS.heartbeat) {
      if (p.type === 'PING') this.send(NS.heartbeat, m.sourceId, { type: 'PONG' });
      return;
    }
    if (m.namespace === NS.connection && p.type === 'CLOSE') {
      if (m.sourceId === RECEIVER) this.handleClose('The TV closed the connection');
      else if (m.sourceId === this.transportId) {
        this.transportId = undefined;
        this.status = null;
        this.emit();
      }
      return;
    }
    if (m.namespace === NS.receiver && p.type === 'RECEIVER_STATUS') {
      const level = p.status?.volume?.level;
      if (typeof level === 'number') this.volume = level;
      // Someone else stopped the player on the TV.
      if (this.transportId && !findApp(p, DEFAULT_MEDIA_RECEIVER)) {
        this.transportId = undefined;
        this.status = null;
      }
      this.emit();
    }
    if (m.namespace === NS.media && p.type === 'MEDIA_STATUS') {
      this.applyMediaStatus(p.status);
    }

    for (const w of [...this.waiters]) {
      if (w.test(p, m.namespace)) {
        this.waiters = this.waiters.filter((x) => x !== w);
        w.resolve(p);
      }
    }

    const id = p.requestId;
    const pending = typeof id === 'number' && id > 0 ? this.pending.get(id) : undefined;
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      if (ERROR_TYPES.has(p.type)) {
        pending.reject(new Error([p.type, p.reason, p.detailedErrorCode].filter(Boolean).join(': ')));
      } else {
        pending.resolve(p);
      }
    }
  }

  private applyMediaStatus(list: unknown) {
    const next = Array.isArray(list) ? (list[0] as Partial<MediaStatus> | undefined) : undefined;
    if (!next) {
      // Empty list: nothing loaded any more (stopped).
      if (this.status) this.status = { ...this.status, playerState: 'IDLE' };
    } else {
      // Updates can be partial (e.g. `media` is only sent once), so merge.
      const prev = this.status && this.status.mediaSessionId === next.mediaSessionId ? this.status : null;
      this.status = { ...(prev ?? {}), ...next } as MediaStatus;
    }
    this.statusAt = Date.now();
    this.emit();
  }

  private handleClose(reason?: string) {
    if (this.closed) return;
    this.closed = true;
    this.closeReason = reason;
    clearInterval(this.heartbeat);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason ?? 'Disconnected'));
    }
    this.pending.clear();
    this.emit();
  }

  private emit() {
    for (const l of [...this.listeners]) l();
  }
}
