import { describe, expect, it } from '@jest/globals';

import { baseUrlFromManifestUrl, normalizeManifestUrl, streamsUrl, supportsResource, type AddonManifest } from './stremio';
import { groupEpisodes } from './cinemeta';
import { hostOf } from './http';

describe('normalizeManifestUrl', () => {
  it('converts stremio:// install links', () => {
    expect(normalizeManifestUrl('stremio://torrentio.strem.fun/debrid=key/manifest.json')).toBe(
      'https://torrentio.strem.fun/debrid=key/manifest.json',
    );
  });

  it('adds scheme and manifest.json', () => {
    expect(normalizeManifestUrl('  example.com/addon/ ')).toBe('https://example.com/addon/manifest.json');
    expect(normalizeManifestUrl('http://192.168.1.5:7000')).toBe('http://192.168.1.5:7000/manifest.json');
  });

  it('drops query strings', () => {
    expect(normalizeManifestUrl('https://a.b/manifest.json?x=1')).toBe('https://a.b/manifest.json');
  });

  it('rejects junk', () => {
    expect(() => normalizeManifestUrl('')).toThrow();
    expect(() => normalizeManifestUrl('ftp://a.b/manifest.json')).toThrow();
    expect(() => normalizeManifestUrl('https:// spaces in it')).toThrow();
  });

  it('round-trips the base url', () => {
    expect(baseUrlFromManifestUrl('https://a.b/cfg/manifest.json')).toBe('https://a.b/cfg');
  });
});

describe('supportsResource', () => {
  const manifest: AddonManifest = {
    id: 'x',
    version: '1',
    name: 'X',
    types: ['movie', 'series'],
    resources: ['stream'],
    idPrefixes: ['tt'],
  };

  it('honours top-level types and prefixes', () => {
    expect(supportsResource(manifest, 'stream', 'movie', 'tt123')).toBe(true);
    expect(supportsResource(manifest, 'stream', 'movie', 'kitsu:1')).toBe(false);
    expect(supportsResource(manifest, 'stream', 'tv', 'tt123')).toBe(false);
    expect(supportsResource(manifest, 'meta', 'movie', 'tt123')).toBe(false);
  });

  it('honours per-resource descriptors', () => {
    const m: AddonManifest = {
      ...manifest,
      resources: [{ name: 'stream', types: ['series'], idPrefixes: ['tt', 'kitsu'] }],
    };
    expect(supportsResource(m, 'stream', 'series', 'kitsu:1')).toBe(true);
    expect(supportsResource(m, 'stream', 'movie', 'tt1')).toBe(false);
  });
});

describe('streamsUrl', () => {
  it('keeps colons in series ids', () => {
    expect(streamsUrl('https://a.b/cfg', 'series', 'tt0944947:1:2')).toBe(
      'https://a.b/cfg/stream/series/tt0944947:1:2.json',
    );
  });
});

describe('groupEpisodes', () => {
  it('groups, sorts, and puts specials last', () => {
    const seasons = groupEpisodes('tt1', [
      { id: 'tt1:1:2', season: 1, episode: 2, name: 'Two' },
      { id: 'tt1:0:1', season: 0, episode: 1, name: 'Special' },
      { id: 'tt1:1:1', season: 1, number: 1, name: 'One' } as never,
      { id: 'tt1:2:1', season: 2, episode: 1 },
    ]);
    expect(seasons.map((s) => s.season)).toEqual([1, 2, 0]);
    expect(seasons[0].episodes.map((e) => e.title)).toEqual(['One', 'Two']);
    expect(seasons[1].episodes[0].title).toBe('Episode 1');
  });
});

describe('hostOf', () => {
  it('extracts host and hides credentials', () => {
    expect(hostOf('https://user:pw@stremio.example.com/abc/manifest.json')).toBe('stremio.example.com');
    expect(hostOf('http://192.168.1.5:7000/x')).toBe('192.168.1.5:7000');
  });
});
