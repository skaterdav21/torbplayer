/**
 * Cinemeta is Stremio's free metadata addon: search, posters and episode
 * lists, keyed by IMDb id, which is what stream addons expect. No API key.
 */
import { fetchJson } from './http';
import type { ContentType } from './stremio';

export const CINEMETA_URL = 'https://v3-cinemeta.strem.io';

export interface MetaPreview {
  id: string;
  type: ContentType;
  name: string;
  poster?: string;
  releaseInfo?: string;
  year?: string | number;
  imdbRating?: string;
}

export interface CinemetaVideo {
  id: string;
  name?: string;
  title?: string;
  season?: number;
  episode?: number;
  number?: number;
  released?: string;
  firstAired?: string;
  thumbnail?: string;
  overview?: string;
  description?: string;
}

export interface MetaDetail extends MetaPreview {
  background?: string;
  logo?: string;
  description?: string;
  runtime?: string;
  genres?: string[];
  videos?: CinemetaVideo[];
}

export interface Episode {
  /** Stream id, e.g. `tt0944947:1:2`. */
  id: string;
  season: number;
  episode: number;
  title: string;
  released?: string;
  thumbnail?: string;
  overview?: string;
}

export interface Season {
  season: number;
  episodes: Episode[];
}

export async function searchCatalog(
  type: ContentType,
  query: string,
  signal?: AbortSignal,
): Promise<MetaPreview[]> {
  const url = `${CINEMETA_URL}/catalog/${type}/top/search=${encodeURIComponent(query.trim())}.json`;
  const data = await fetchJson<{ metas?: MetaPreview[] }>(url, { signal });
  return (data?.metas ?? [])
    .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string')
    .map((m) => ({ ...m, type }));
}

export async function getMeta(type: ContentType, id: string, signal?: AbortSignal): Promise<MetaDetail> {
  const data = await fetchJson<{ meta?: MetaDetail }>(
    `${CINEMETA_URL}/meta/${type}/${encodeURIComponent(id)}.json`,
    { signal },
  );
  if (!data?.meta) throw new Error('Title not found.');
  return { ...data.meta, type };
}

export function yearLabel(meta: Pick<MetaPreview, 'releaseInfo' | 'year'>): string {
  return String(meta.releaseInfo ?? meta.year ?? '').trim();
}

/** Group Cinemeta videos into seasons. Specials (season 0) go last. */
export function groupEpisodes(metaId: string, videos: CinemetaVideo[] = []): Season[] {
  const bySeason = new Map<number, Episode[]>();

  for (const v of videos) {
    const season = Number(v.season);
    const episode = Number(v.episode ?? v.number);
    if (!Number.isFinite(season) || !Number.isFinite(episode)) continue;

    const list = bySeason.get(season) ?? [];
    list.push({
      id: v.id || `${metaId}:${season}:${episode}`,
      season,
      episode,
      title: v.name || v.title || `Episode ${episode}`,
      released: v.released || v.firstAired,
      thumbnail: v.thumbnail,
      overview: v.overview || v.description,
    });
    bySeason.set(season, list);
  }

  return [...bySeason.entries()]
    .sort(([a], [b]) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
    .map(([season, episodes]) => ({
      season,
      episodes: episodes.sort((a, b) => a.episode - b.episode),
    }));
}

export function hasAired(ep: Episode, now = Date.now()): boolean {
  if (!ep.released) return true;
  const t = Date.parse(ep.released);
  return Number.isNaN(t) || t <= now;
}
