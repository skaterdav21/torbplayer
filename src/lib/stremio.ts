/**
 * Minimal client for the Stremio addon protocol.
 * Spec: https://github.com/Stremio/stremio-addon-sdk/tree/master/docs/api
 *
 * Only the `stream` resource is used here. Metadata (search, posters,
 * episode lists) comes from Cinemeta, see ./cinemeta.ts.
 */
import { fetchJson } from './http';

export type ContentType = 'movie' | 'series';

export type ResourceDescriptor =
  | string
  | { name: string; types?: string[]; idPrefixes?: string[] };

export interface AddonManifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  logo?: string;
  types: string[];
  resources: ResourceDescriptor[];
  idPrefixes?: string[] | null;
  behaviorHints?: {
    configurable?: boolean;
    configurationRequired?: boolean;
    adult?: boolean;
    p2p?: boolean;
  };
}

export interface InstalledAddon {
  /** Addon root, i.e. the manifest URL minus `/manifest.json`. May contain the user's config/API key. */
  baseUrl: string;
  manifest: AddonManifest;
  enabled: boolean;
}

export interface Stream {
  url?: string;
  ytId?: string;
  infoHash?: string;
  fileIdx?: number;
  externalUrl?: string;
  name?: string;
  /** Deprecated by the spec in favour of `description`, still used by many addons. */
  title?: string;
  description?: string;
  subtitles?: { id?: string; url: string; lang: string }[];
  behaviorHints?: {
    bingeGroup?: string;
    notWebReady?: boolean;
    countryWhitelist?: string[];
    proxyHeaders?: {
      request?: Record<string, string>;
      response?: Record<string, string>;
    };
    videoHash?: string;
    videoSize?: number;
    filename?: string;
  };
}

const MANIFEST_SUFFIX = '/manifest.json';

/**
 * Turn whatever the user pasted into a manifest URL.
 * Accepts `stremio://` links (what addon "Install" buttons open), URLs
 * without a scheme, and addon roots without `/manifest.json`.
 */
export function normalizeManifestUrl(input: string): string {
  let url = input.trim();
  if (!url) throw new Error('Paste an addon URL first.');

  url = url.replace(/^stremio:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(url)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      throw new Error('Addon URLs start with https://, http:// or stremio://');
    }
    url = `https://${url}`;
  }

  url = url.replace(/[?#].*$/, '');
  if (!url.toLowerCase().endsWith(MANIFEST_SUFFIX)) {
    url = url.replace(/\/+$/, '') + MANIFEST_SUFFIX;
  }

  if (!/^https?:\/\/[^/\s?#]+\/\S*$/i.test(url)) {
    throw new Error("That doesn't look like a valid URL.");
  }
  return url;
}

export function baseUrlFromManifestUrl(manifestUrl: string): string {
  return manifestUrl.slice(0, manifestUrl.length - MANIFEST_SUFFIX.length);
}

function isManifest(value: unknown): value is AddonManifest {
  const m = value as AddonManifest;
  return (
    !!m &&
    typeof m === 'object' &&
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    Array.isArray(m.resources) &&
    Array.isArray(m.types)
  );
}

export async function fetchManifest(manifestUrl: string, signal?: AbortSignal): Promise<AddonManifest> {
  const data = await fetchJson<unknown>(manifestUrl, { signal });
  if (!isManifest(data)) {
    throw new Error("That URL didn't return a Stremio addon manifest.");
  }
  return data;
}

/** Whether the addon claims to serve `resource` for this content type and id. */
export function supportsResource(
  manifest: AddonManifest,
  resource: string,
  type: string,
  id?: string,
): boolean {
  for (const r of manifest.resources) {
    const name = typeof r === 'string' ? r : r.name;
    if (name !== resource) continue;

    const types = (typeof r === 'object' && r.types) || manifest.types;
    if (!types.includes(type)) continue;

    const prefixes = (typeof r === 'object' && r.idPrefixes) || manifest.idPrefixes;
    if (id && prefixes && prefixes.length > 0 && !prefixes.some((p) => id.startsWith(p))) {
      continue;
    }
    return true;
  }
  return false;
}

export function providesStreams(manifest: AddonManifest): boolean {
  return manifest.resources.some((r) => (typeof r === 'string' ? r : r.name) === 'stream');
}

/**
 * Encode an id for a path segment. Colons are left alone because series ids
 * look like `tt0944947:1:2` and that's the form addons expect.
 */
function encodeId(id: string): string {
  return encodeURIComponent(id).replace(/%3A/gi, ':');
}

export function streamsUrl(baseUrl: string, type: ContentType, id: string): string {
  return `${baseUrl}/stream/${encodeURIComponent(type)}/${encodeId(id)}.json`;
}

export async function fetchStreams(
  addon: InstalledAddon,
  type: ContentType,
  id: string,
  signal?: AbortSignal,
): Promise<Stream[]> {
  const data = await fetchJson<{ streams?: Stream[] }>(streamsUrl(addon.baseUrl, type, id), {
    signal,
    // Debrid addons often check cache status live, which can be slow.
    timeoutMs: 30000,
  });
  return Array.isArray(data?.streams) ? data.streams : [];
}
