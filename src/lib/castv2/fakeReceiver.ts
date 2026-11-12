/**
 * A pretend Chromecast running the Default Media Receiver, speaking the real
 * Cast v2 wire format. Used by the unit tests and by the browser preview
 * (`npm run web`), never on the phone.
 */
import type { SocketFactory } from './client';
import { Deframer, frame, type CastMessage } from './protocol';
import { DEFAULT_MEDIA_RECEIVER, NS } from './client';

export interface FakeDeviceOptions {
  /** Network delay for each reply. */
  latencyMs?: number;
  /** How long LOAD takes to buffer. */
  loadDelayMs?: number;
  /** Reply LOAD_FAILED instead of playing. */
  failLoad?: boolean;
  /** Refuse connections, like a TV that's off. */
  unreachable?: boolean;
  duration?: number;
}

type Json = Record<string, any>;

class FakeDevice {
  running = false;
  volume = 0.5;
  mediaSessionId = 0;
  media: Json | null = null;
  playerState: 'IDLE' | 'PLAYING' | 'PAUSED' | 'BUFFERING' = 'IDLE';
  idleReason?: string;
  basePosition = 0;
  baseAt = 0;
  /** Every command the device received, for tests. */
  log: string[] = [];

  constructor(readonly opts: FakeDeviceOptions) {}

  position() {
    const live = this.playerState === 'PLAYING' ? (Date.now() - this.baseAt) / 1000 : 0;
    return Math.min(this.basePosition + live, this.opts.duration ?? 7200);
  }

  setState(state: FakeDevice['playerState'], position = this.position()) {
    this.basePosition = position;
    this.baseAt = Date.now();
    this.playerState = state;
  }

  mediaStatus(): Json[] {
    if (!this.media) return [];
    return [
      {
        mediaSessionId: this.mediaSessionId,
        playerState: this.playerState,
        currentTime: this.position(),
        playbackRate: 1,
        ...(this.idleReason ? { idleReason: this.idleReason } : {}),
        media: { ...this.media, duration: this.opts.duration ?? 7200 },
      },
    ];
  }

  receiverStatus(): Json {
    return {
      applications: this.running
        ? [{ appId: DEFAULT_MEDIA_RECEIVER, sessionId: 'session-1', transportId: 'transport-1', displayName: 'Default Media Receiver' }]
        : [],
      volume: { level: this.volume, muted: false },
    };
  }
}

/** One simulated network: each host gets its own device, kept across reconnects. */
export function createFakeCastNetwork(
  options: FakeDeviceOptions | ((host: string) => FakeDeviceOptions) = {},
): SocketFactory & { device(host: string): FakeDevice | undefined } {
  const devices = new Map<string, FakeDevice>();

  const factory = (async (host, _port, handlers) => {
    const opts = typeof options === 'function' ? options(host) : options;
    if (opts.unreachable) {
      await new Promise((r) => setTimeout(r, opts.latencyMs ?? 1));
      throw new Error(`Couldn't reach ${host}`);
    }
    const dev = devices.get(host) ?? new FakeDevice(opts);
    devices.set(host, dev);
    const deframer = new Deframer();
    let open = true;
    const latency = opts.latencyMs ?? 1;

    const reply = (to: CastMessage, payload: Json, delay = latency) =>
      setTimeout(() => {
        if (!open) return;
        handlers.onData(
          frame({ sourceId: to.destinationId, destinationId: to.sourceId, namespace: to.namespace, payload: JSON.stringify(payload) }),
        );
      }, delay);

    const handle = (m: CastMessage) => {
      const p = JSON.parse(m.payload) as Json;
      dev.log.push(p.type);
      const requestId = p.requestId;

      if (m.namespace === NS.heartbeat && p.type === 'PING') return reply(m, { type: 'PONG' });
      if (m.namespace === NS.connection) return;

      if (m.namespace === NS.receiver) {
        if (p.type === 'LAUNCH') dev.running = true;
        if (p.type === 'STOP') {
          dev.running = false;
          dev.media = null;
        }
        if (p.type === 'SET_VOLUME') dev.volume = p.volume.level;
        return reply(m, { type: 'RECEIVER_STATUS', requestId, status: dev.receiverStatus() });
      }

      if (m.namespace === NS.media) {
        const status = () => reply(m, { type: 'MEDIA_STATUS', requestId, status: dev.mediaStatus() });
        switch (p.type) {
          case 'LOAD':
            if (opts.failLoad) return reply(m, { type: 'LOAD_FAILED', requestId });
            dev.mediaSessionId++;
            dev.media = p.media;
            dev.idleReason = undefined;
            dev.setState('BUFFERING', p.currentTime ?? 0);
            setTimeout(() => {
              dev.setState(p.autoplay === false ? 'PAUSED' : 'PLAYING', p.currentTime ?? 0);
              reply(m, { type: 'MEDIA_STATUS', requestId, status: dev.mediaStatus() }, 0);
            }, opts.loadDelayMs ?? 5);
            return;
          case 'PLAY':
            dev.setState('PLAYING');
            return status();
          case 'PAUSE':
            dev.setState('PAUSED');
            return status();
          case 'SEEK': {
            const resume = p.resumeState === 'PLAYBACK_PAUSE' ? 'PAUSED' : p.resumeState === 'PLAYBACK_START' ? 'PLAYING' : dev.playerState;
            dev.setState(resume === 'IDLE' ? 'PAUSED' : resume, p.currentTime);
            return status();
          }
          case 'STOP':
            dev.setState('IDLE');
            dev.media = null;
            return status();
          case 'GET_STATUS':
            return status();
        }
      }
    };

    return {
      write(bytes: Uint8Array) {
        for (const m of deframer.push(bytes)) handle(m);
      },
      close() {
        open = false;
        setTimeout(() => handlers.onClose(), 0);
      },
    };
  }) as SocketFactory & { device(host: string): FakeDevice | undefined };

  factory.device = (host: string) => devices.get(host);
  return factory;
}
