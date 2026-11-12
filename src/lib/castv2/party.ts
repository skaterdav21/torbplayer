/**
 * Watch party: the same stream on several TVs, kept in step.
 *
 * Every TV loads the stream paused. Once all of them have buffered, PLAY goes
 * to all at once, so they start within a network round-trip of each other.
 * Seeks work the same way (seek paused, wait for every TV, then play), and
 * "re-sync" lines everyone up with the first TV again.
 */
import { CastV2Client, type LoadMedia, type MediaStatus, type SocketFactory } from './client';

export interface PartyDevice {
  id: string;
  name: string;
  host: string;
}

export type MemberState =
  | 'connecting'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'finished'
  | 'stopped'
  | 'error'
  | 'disconnected';

export interface PartyMember {
  device: PartyDevice;
  client?: CastV2Client;
  phase: 'connecting' | 'loading' | 'ready' | 'live' | 'error';
  error?: string;
}

const READY_TIMEOUT_MS = 45000;
/** Above this, the remote suggests re-syncing. */
export const DRIFT_WARNING_S = 1.5;

/** The Cast SDK reports addresses like "/192.168.1.23" (Java's InetAddress.toString()). */
export function parseDeviceHost(ipAddress: string | undefined): string | undefined {
  if (!ipAddress) return undefined;
  const host = ipAddress.split('/').pop()?.trim().replace(/^\[|\]$/g, '');
  return host || undefined;
}

export function memberState(m: PartyMember): MemberState {
  if (m.phase === 'error') return 'error';
  if (m.client?.closed) return 'disconnected';
  if (m.phase === 'connecting' || m.phase === 'loading' || m.phase === 'ready') return m.phase;
  const s = m.client?.status;
  if (!s) return 'stopped';
  switch (s.playerState) {
    case 'PLAYING':
      return 'playing';
    case 'PAUSED':
      return 'paused';
    case 'BUFFERING':
    case 'LOADING':
      return 'buffering';
    default:
      return s.idleReason === 'FINISHED' ? 'finished' : s.idleReason === 'ERROR' ? 'error' : 'stopped';
  }
}

const isPaused = (s: MediaStatus | null) => s?.playerState === 'PAUSED';
const failedToPlay = (s: MediaStatus | null) => s?.playerState === 'IDLE' && s.idleReason === 'ERROR';

export class WatchParty {
  readonly members: PartyMember[];
  media: LoadMedia | null = null;
  ended = false;
  private listeners = new Set<() => void>();

  constructor(
    devices: PartyDevice[],
    private readonly openSocket: SocketFactory,
  ) {
    this.members = devices.map((device) => ({ device, phase: 'connecting' }));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Members that are connected and have media loaded. */
  live(): PartyMember[] {
    return this.members.filter((m) => m.phase === 'live' && m.client && !m.client.closed && m.client.status);
  }

  /** The TV everyone else is synced to: the first one that's live. */
  leader(): PartyMember | undefined {
    return this.live()[0];
  }

  position(now = Date.now()): number {
    return this.leader()?.client?.position(now) ?? 0;
  }

  duration(): number {
    return this.leader()?.client?.status?.media?.duration ?? 0;
  }

  isPlaying(): boolean {
    return this.live().some((m) => m.client!.status!.playerState === 'PLAYING');
  }

  /** Seconds each live TV is ahead (+) or behind (−) the leader. */
  drift(now = Date.now()): Map<PartyMember, number> {
    const base = this.position(now);
    return new Map(this.live().map((m) => [m, m.client!.position(now) - base]));
  }

  maxDrift(now = Date.now()): number {
    return Math.max(0, ...[...this.drift(now).values()].map(Math.abs));
  }

  /**
   * Load `media` on every TV and start them together. Reuses open
   * connections, so sending a new source to a running party is quick.
   * Resolves with how many TVs are playing; throws if none could.
   */
  async start(media: LoadMedia): Promise<number> {
    this.media = media;
    await Promise.all(this.members.map((m) => this.prepare(m, media)));
    if (this.ended) return 0;

    const ready = this.members.filter((m) => m.phase === 'ready');
    if (ready.length === 0) {
      throw new Error(this.members.find((m) => m.error)?.error ?? 'No TV could load this source');
    }
    await Promise.allSettled(ready.map((m) => m.client!.play()));
    for (const m of ready) m.phase = 'live';
    this.emit();
    return ready.length;
  }

  private async prepare(m: PartyMember, media: LoadMedia) {
    try {
      if (!m.client || m.client.closed) {
        m.phase = 'connecting';
        this.emit();
        m.client = await CastV2Client.connect(m.device.host, this.openSocket);
        m.client.subscribe(() => this.emit());
      }
      if (this.ended) return;
      m.phase = 'loading';
      m.error = undefined;
      this.emit();
      await m.client.launch();
      await m.client.load(media, { autoplay: false, currentTime: 0 });
      const s = await m.client.waitForStatus((x) => isPaused(x) || failedToPlay(x), READY_TIMEOUT_MS);
      if (failedToPlay(s)) throw new Error('The TV could not play this source');
      m.phase = 'ready';
    } catch (err) {
      m.phase = 'error';
      m.error = err instanceof Error ? err.message : String(err);
    }
    this.emit();
  }

  async playAll() {
    await Promise.allSettled(this.live().map((m) => m.client!.play()));
  }

  async pauseAll() {
    await Promise.allSettled(this.live().map((m) => m.client!.pause()));
  }

  /** Move every TV to `position`, wait until they've all buffered, then resume together. */
  async seekAll(position: number) {
    const members = this.live();
    if (members.length === 0) return;
    const resume = this.isPlaying();
    const target = Math.max(0, Math.min(position, this.duration() || position));
    await Promise.allSettled(members.map((m) => m.client!.seek(target, 'PLAYBACK_PAUSE')));
    await Promise.allSettled(members.map((m) => m.client!.waitForStatus(isPaused, 20000)));
    if (resume) await this.playAll();
  }

  seekBy(delta: number) {
    return this.seekAll(this.position() + delta);
  }

  /** Line every TV up with the leader's current position. */
  resync() {
    return this.seekAll(this.position());
  }

  async changeVolume(member: PartyMember, delta: number) {
    const c = member.client;
    if (!c || c.closed) return;
    await c.setVolume(Math.round(((c.volume ?? 0.5) + delta) * 20) / 20);
  }

  /** Ask every TV for fresh positions; called on a timer while the remote is open. */
  async refresh() {
    await Promise.allSettled(this.live().map((m) => m.client!.refresh()));
  }

  /** Stop playback, close the player on each TV and disconnect. */
  async end({ stopTvs = true } = {}) {
    this.ended = true;
    if (stopTvs) await Promise.allSettled(this.live().map((m) => m.client!.stop()));
    for (const m of this.members) m.client?.close(stopTvs);
    this.emit();
  }

  private emit() {
    for (const l of [...this.listeners]) l();
  }
}
