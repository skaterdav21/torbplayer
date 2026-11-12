import { describe, expect, it } from '@jest/globals';

import { analyzeStream, formatBytes, guessContentType, parseSize, sortStreams } from './streamInfo';

describe('analyzeStream', () => {
  it('parses a cached Torrentio debrid stream', () => {
    const info = analyzeStream(
      {
        name: '[TB+] Torrentio\n1080p',
        title: 'Some.Movie.2010.1080p.BluRay.x264.DTS-HD.MA.5.1-GRP\n👤 312 💾 9.8 GB ⚙️ ThePirateBay',
        url: 'https://torrentio.strem.fun/resolve/torbox/KEY/abc/null/0/Some.Movie.2010.1080p.mkv',
        behaviorHints: { bingeGroup: 'torrentio|1080p' },
      },
      'Torrentio',
      0,
    );
    expect(info.title).toBe('Some.Movie.2010.1080p.BluRay.x264.DTS-HD.MA.5.1-GRP');
    expect(info.quality).toBe('1080p');
    expect(info.cached).toBe(true);
    expect(info.codec).toBe('H.264');
    expect(info.audio).toContain('DTS');
    expect(info.seeders).toBe(312);
    expect(info.sizeBytes).toBe(9.8e9);
    expect(info.container).toBe('mkv');
    expect(info.send).toBe('maybe');
    expect(info.notes.join(' ')).toMatch(/DTS/);
    expect(info.contentType).toBe('video/mp4');
  });

  it('marks uncached debrid links as not cached', () => {
    const info = analyzeStream(
      { name: '[RD download] Torrentio\n4k DV | HDR', title: 'X.2160p.WEB-DL.DDP5.1.Atmos.DV.HEVC\n👤 9 💾 18 GB', url: 'https://x/y' },
      'Torrentio',
      1,
    );
    expect(info.cached).toBe(false);
    expect(info.quality).toBe('4K');
    expect(info.hdr).toBe('DV');
    expect(info.codec).toBe('HEVC');
    expect(info.audio).toEqual(expect.arrayContaining(['Atmos', 'DD+']));
  });

  it('treats torrent-only streams as unsendable', () => {
    const info = analyzeStream({ name: 'Torrentio\n720p', title: 'A.720p', infoHash: 'abc', fileIdx: 0 }, 'Torrentio', 2);
    expect(info.send).toBe('no');
    expect(info.url).toBeUndefined();
    expect(info.notes[0]).toMatch(/debrid/);
  });

  it('flags streams that need proxy headers', () => {
    const info = analyzeStream(
      {
        url: 'https://cdn/x.mp4',
        name: 'Addon',
        behaviorHints: { proxyHeaders: { request: { Referer: 'https://site' } } },
      },
      'Addon',
      0,
    );
    expect(info.send).toBe('maybe');
  });

  it('is good for a plain H.264 MP4', () => {
    const info = analyzeStream(
      { url: 'https://cdn/file.mp4', name: 'TorBox\n1080p', description: 'File.1080p.WEB.x264.AAC2.0.mp4\n⚡ Cached' },
      'TorBox',
      0,
    );
    expect(info.send).toBe('good');
    expect(info.cached).toBe(true);
    expect(info.audio).toContain('AAC');
    expect(info.title).toBe('File.1080p.WEB.x264.AAC2.0.mp4');
  });

  it('prefers behaviorHints.filename and videoSize', () => {
    const info = analyzeStream(
      {
        url: 'https://cdn/abc',
        name: 'X',
        description: '👤 4 💾 1 GB',
        behaviorHints: { filename: 'Show.S01E02.720p.mkv', videoSize: 123456789 },
      },
      'X',
      0,
    );
    expect(info.title).toBe('Show.S01E02.720p.mkv');
    expect(info.sizeBytes).toBe(123456789);
    expect(info.quality).toBe('720p');
  });

  it('does not read DTS-HD as a 720p hint', () => {
    const info = analyzeStream({ url: 'https://a/b', title: 'Movie.BluRay.DTS-HD' }, 'A', 0);
    expect(info.quality).toBeUndefined();
  });

  it('ignores non-http urls', () => {
    const info = analyzeStream({ url: 'magnet:?xt=urn:btih:abc' }, 'A', 0);
    expect(info.send).toBe('no');
  });
});

describe('sortStreams', () => {
  it('puts sendable, cached, higher quality first', () => {
    const a = analyzeStream({ name: '720p', url: 'https://a/1.mp4', title: '[TB+]' }, 'A', 0);
    const b = analyzeStream({ name: '4k', url: 'https://a/2.mp4', title: '[TB download]' }, 'A', 1);
    const c = analyzeStream({ name: '1080p', url: 'https://a/3.mp4', title: '[TB+]' }, 'A', 2);
    const d = analyzeStream({ name: '4k', infoHash: 'x' }, 'A', 3);
    expect(sortStreams([d, b, a, c]).map((s) => s.stream.name)).toEqual(['1080p', '720p', '4k', '4k']);
    expect(sortStreams([d, b, a, c])[3].send).toBe('no');
  });
});

describe('helpers', () => {
  it('parses sizes', () => {
    expect(parseSize('💾 2.1 GB')).toBe(2.1e9);
    expect(parseSize('Size: 700MB')).toBe(700e6);
    expect(parseSize('1,5 GiB')).toBe(Math.round(1.5 * 1024 ** 3));
    expect(parseSize('nothing')).toBeUndefined();
  });

  it('formats bytes', () => {
    expect(formatBytes(2.14e9)).toBe('2.1 GB');
    expect(formatBytes(18.4e9)).toBe('18 GB');
    expect(formatBytes(700e6)).toBe('700 MB');
    expect(formatBytes(undefined)).toBe('');
  });

  it('guesses cast content types', () => {
    expect(guessContentType('https://x/master.m3u8?token=1')).toBe('application/x-mpegURL');
    expect(guessContentType('https://x/manifest.mpd')).toBe('application/dash+xml');
    expect(guessContentType('https://x/resolve/abc', 'Movie.webm')).toBe('video/webm');
    expect(guessContentType('https://x/file.mkv')).toBe('video/mp4');
  });
});
