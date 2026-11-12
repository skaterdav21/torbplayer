/**
 * Turns raw addon streams into something you can pick from on a phone:
 * quality, size, cache status, codecs, and a guess at whether a Chromecast
 * will actually play it.
 *
 * Addons don't share a format for any of this. It's all in free text
 * (`name`, `title`, `description`), so it's parsed with patterns that cover
 * the common addons (Torrentio, Comet, MediaFusion, TorBox, AIOStreams).
 */
import type { Stream } from './stremio';

export type Quality = '4K' | '1440p' | '1080p' | '720p' | 'SD';
export type Sendability = 'good' | 'maybe' | 'no';

export interface StreamInfo {
  key: string;
  addonName: string;
  stream: Stream;
  url?: string;
  /** Best single-line label: usually the release/file name. */
  title: string;
  /** Short label the addon put in `name`, e.g. "Torrentio 1080p". */
  label: string;
  filename?: string;
  quality?: Quality;
  qualityRank: number;
  sizeBytes?: number;
  seeders?: number;
  /** true = cached on the debrid service, false = would need downloading, undefined = unknown. */
  cached?: boolean;
  hdr?: 'DV' | 'HDR10+' | 'HDR';
  codec?: 'HEVC' | 'H.264' | 'AV1';
  audio: string[];
  container?: string;
  send: Sendability;
  /** Why `send` isn't `good`. */
  notes: string[];
  contentType: string;
}

const QUALITY_RANK: Record<Quality, number> = { '4K': 5, '1440p': 4, '1080p': 3, '720p': 2, SD: 1 };
export const QUALITY_ORDER: Quality[] = ['4K', '1080p', '720p', 'SD'];

const DEBRID_TAGS = 'RD|TB|AD|PM|DL|ED|OC|PD|PKP|DLS|EN|TRB|SR|IT';
const CACHED_RE = new RegExp(`\\[(?:${DEBRID_TAGS})\\+\\]|⚡|\\binstant\\b`, 'i');
const UNCACHED_RE = new RegExp(`\\[(?:${DEBRID_TAGS})\\s*(?:download|⏳)\\]|⏳|\\buncached\\b|\\bnot cached\\b`, 'i');

function parseQuality(text: string): Quality | undefined {
  if (/\b(2160p|4k|uhd)\b/i.test(text)) return '4K';
  if (/\b1440p\b/i.test(text)) return '1440p';
  if (/\b1080[pi]\b|\bfhd\b/i.test(text)) return '1080p';
  if (/\b720p\b/i.test(text)) return '720p';
  if (/\b(576p|540p|480p|360p|240p|sd|dvdrip|dvd|cam|hdcam|telesync)\b/i.test(text)) return 'SD';
  return undefined;
}

const UNIT: Record<string, number> = {
  KB: 1e3,
  KIB: 1024,
  MB: 1e6,
  MIB: 1024 ** 2,
  GB: 1e9,
  GIB: 1024 ** 3,
  TB: 1e12,
  TIB: 1024 ** 4,
};

export function parseSize(text: string): number | undefined {
  const m = /(\d+(?:[.,]\d+)?)\s*(TiB|TB|GiB|GB|MiB|MB|KiB|KB)\b/i.exec(text);
  if (!m) return undefined;
  const value = parseFloat(m[1].replace(',', '.'));
  return Math.round(value * UNIT[m[2].toUpperCase()]);
}

function parseCached(text: string): boolean | undefined {
  if (UNCACHED_RE.test(text)) return false;
  if (CACHED_RE.test(text)) return true;
  if (/\bcached\b/i.test(text)) return true;
  return undefined;
}

function parseHdr(text: string): StreamInfo['hdr'] {
  if (/\b(dv|dovi|dolby[ .-]?vision)\b/i.test(text)) return 'DV';
  if (/\bhdr10(\+|plus)/i.test(text)) return 'HDR10+';
  if (/\bhdr(10)?\b/i.test(text)) return 'HDR';
  return undefined;
}

function parseCodec(text: string): StreamInfo['codec'] {
  if (/\b(x\.?265|h\.?265|hevc)\b/i.test(text)) return 'HEVC';
  if (/\bav1\b/i.test(text)) return 'AV1';
  if (/\b(x\.?264|h\.?264|avc)\b/i.test(text)) return 'H.264';
  return undefined;
}

function parseAudio(text: string): string[] {
  const found: string[] = [];
  if (/\batmos\b/i.test(text)) found.push('Atmos');
  if (/\btrue[ .-]?hd\b/i.test(text)) found.push('TrueHD');
  if (/\bdts(?:[ .-]?(?:hd|x|ma|es))?\b/i.test(text)) found.push('DTS');
  if (/\b(ddp|dd\+|e-?ac-?3)/i.test(text)) found.push('DD+');
  else if (/\b(dd|ac-?3)(?=[\s.\d_-]|$)/im.test(text)) found.push('DD');
  if (/\baac(?=[\s.\d_-]|$)/im.test(text)) found.push('AAC');
  return found;
}

function extOf(s?: string): string | undefined {
  if (!s) return undefined;
  const m = /\.([a-z0-9]{2,5})$/i.exec(s.split(/[?#]/)[0]);
  return m ? m[1].toLowerCase() : undefined;
}

const VIDEO_EXTS = new Set(['mkv', 'mp4', 'm4v', 'avi', 'webm', 'mov', 'ts', 'wmv', 'flv', 'm3u8', 'mpd']);

/**
 * Content type for the Cast load request. Progressive files are all sent as
 * video/mp4: the receiver's <video> element sniffs the real container, and
 * some receivers refuse a load outright when given a type like video/x-matroska.
 */
export function guessContentType(url: string, filename?: string): string {
  const ext = extOf(filename) ?? extOf(url);
  const path = url.split(/[?#]/)[0];
  if (ext === 'm3u8' || /\.m3u8$/i.test(path) || /\/(hls|playlist)\b.*m3u8/i.test(url)) {
    return 'application/x-mpegURL';
  }
  if (ext === 'mpd' || /\.mpd$/i.test(path)) return 'application/dash+xml';
  if (ext === 'webm') return 'video/webm';
  return 'video/mp4';
}

function splitLines(...parts: (string | undefined)[]): string[] {
  return parts
    .filter((p): p is string => !!p)
    .flatMap((p) => p.split(/\r?\n/))
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Lines that are only stats ("👤 12 💾 1.2 GB ⚙️ Site") don't make good titles. */
function isStatsLine(line: string): boolean {
  // Checked by code point, not a \p{...} regex, to stay safe on Hermes.
  const c = line.codePointAt(0) ?? 0;
  const symbol = (c >= 0x2190 && c <= 0x2bff) || c >= 0x1f000;
  return symbol || /^(size|seeds?|peers?)\b/i.test(line);
}

export function analyzeStream(stream: Stream, addonName: string, index: number): StreamInfo {
  const hints = stream.behaviorHints ?? {};
  const filename = hints.filename;
  const descLines = splitLines(stream.description ?? stream.title);
  const nameLines = splitLines(stream.name);
  const text = [stream.name, stream.title, stream.description, filename].filter(Boolean).join('\n');

  const title =
    filename ||
    descLines.find((l) => !isStatsLine(l)) ||
    nameLines.join(' ') ||
    `${addonName} stream ${index + 1}`;

  const quality = parseQuality(text);
  const codec = parseCodec(text);
  const hdr = parseHdr(text);
  const audio = parseAudio(text);
  const url = stream.url && /^https?:\/\//i.test(stream.url) ? stream.url : undefined;
  const containerExt = extOf(filename) ?? (url ? extOf(url) : undefined);
  const container = containerExt && VIDEO_EXTS.has(containerExt) ? containerExt : undefined;
  const seeders = /👤\s*(\d+)/.exec(text)?.[1];

  const notes: string[] = [];
  let send: Sendability = 'good';

  if (!url) {
    send = 'no';
    if (stream.infoHash) {
      notes.push('Torrent only. Set up a debrid service in this addon to get direct links.');
    } else if (stream.externalUrl) {
      notes.push('Opens a website, nothing to send.');
    } else if (stream.ytId) {
      notes.push('YouTube video, not supported yet.');
    } else {
      notes.push('No playable link.');
    }
  } else {
    if (hints.proxyHeaders?.request && Object.keys(hints.proxyHeaders.request).length > 0) {
      notes.push('Needs special request headers that a Chromecast cannot send.');
    }
    if (hints.notWebReady) notes.push('Addon marks this as not web-ready.');
    if (audio.includes('DTS') || audio.includes('TrueHD')) {
      notes.push(`${audio.includes('TrueHD') ? 'TrueHD' : 'DTS'} audio: the TV may play no sound.`);
    }
    if (hdr === 'DV') notes.push('Dolby Vision may show odd colours on non-DV TVs.');
    if (container === 'avi' || container === 'wmv' || container === 'flv') {
      notes.push(`.${container} files usually don't play on Chromecast.`);
    }
    if (notes.length > 0) send = 'maybe';
  }

  return {
    key: `${addonName}#${index}#${url ?? stream.infoHash ?? stream.externalUrl ?? ''}`,
    addonName,
    stream,
    url,
    title,
    label: nameLines.join(' '),
    filename,
    quality,
    qualityRank: quality ? QUALITY_RANK[quality] : 0,
    sizeBytes: hints.videoSize ?? parseSize(text),
    seeders: seeders ? Number(seeders) : undefined,
    cached: parseCached(text),
    hdr,
    codec,
    audio,
    container,
    send,
    notes,
    contentType: url ? guessContentType(url, filename) : '',
  };
}

const SEND_RANK: Record<Sendability, number> = { good: 0, maybe: 1, no: 2 };
const cachedRank = (c?: boolean) => (c === true ? 0 : c === undefined ? 1 : 2);

/**
 * Sendable first, then cached, then highest quality, then fewer warnings,
 * then bigger files (usually better bitrate at the same resolution).
 */
export function sortStreams(list: StreamInfo[]): StreamInfo[] {
  return [...list].sort(
    (a, b) =>
      Number(a.send === 'no') - Number(b.send === 'no') ||
      cachedRank(a.cached) - cachedRank(b.cached) ||
      b.qualityRank - a.qualityRank ||
      SEND_RANK[a.send] - SEND_RANK[b.send] ||
      (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0),
  );
}

export function qualityBucket(q?: Quality): Quality {
  if (!q) return 'SD';
  return q === '1440p' ? '1080p' : q;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}
