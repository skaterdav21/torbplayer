import { describe, expect, it } from '@jest/globals';

import { CastV2Client, type LoadMedia } from './client';
import { createFakeCastNetwork } from './fakeReceiver';
import { memberState, parseDeviceHost, WatchParty } from './party';
import { decodeMessage, Deframer, encodeMessage, frame, utf8Decode, utf8Encode, type CastMessage } from './protocol';

const MEDIA: LoadMedia = {
  contentId: 'https://cdn.test/movie.mp4',
  contentType: 'video/mp4',
  streamType: 'BUFFERED',
  metadata: { metadataType: 1, title: 'Amélie 🎬' },
};

describe('protocol', () => {
  const msg: CastMessage = {
    sourceId: 'sender-0',
    destinationId: 'receiver-0',
    namespace: 'urn:x-cast:com.google.cast.tp.connection',
    payload: '{"type":"CONNECT"}',
  };

  it('encodes the exact protobuf bytes', () => {
    const bytes = encodeMessage(msg);
    // protocol_version=0, then source_id (field 2, len 8)
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x08, 0x00, 0x12, 8]);
    expect(utf8Decode(bytes.slice(4, 12))).toBe('sender-0');
    // payload_type=STRING sits just before payload_utf8 (field 6)
    const payloadTagAt = bytes.indexOf(0x32);
    expect(bytes[payloadTagAt - 2]).toBe(0x28);
    expect(bytes[payloadTagAt - 1]).toBe(0x00);
  });

  it('round-trips messages, including long and non-ASCII payloads', () => {
    const long = { ...msg, payload: JSON.stringify({ title: 'Amélie 🎬 '.repeat(40) }) };
    expect(decodeMessage(encodeMessage(msg))).toEqual(msg);
    expect(decodeMessage(encodeMessage(long))).toEqual(long);
  });

  it('round-trips UTF-8', () => {
    for (const s of ['plain', 'Amélie', '日本語', '🎬🍿', '']) {
      expect(utf8Decode(utf8Encode(s))).toBe(s);
    }
    expect(Array.from(utf8Encode('é'))).toEqual([0xc3, 0xa9]);
  });

  it('reassembles frames split and merged across chunks', () => {
    const a = frame(msg);
    const b = frame({ ...msg, payload: '{"type":"PING"}' });
    const all = new Uint8Array([...a, ...b]);
    const d = new Deframer();
    const out = [...d.push(all.slice(0, 3)), ...d.push(all.slice(3, a.length + 5)), ...d.push(all.slice(a.length + 5))];
    expect(out.map((m) => m.payload)).toEqual(['{"type":"CONNECT"}', '{"type":"PING"}']);
  });
});

describe('CastV2Client', () => {
  it('launches the receiver, loads paused, then plays, seeks and stops', async () => {
    const net = createFakeCastNetwork();
    const client = await CastV2Client.connect('10.0.0.2', net);
    await client.launch();
    await client.load(MEDIA, { autoplay: false });
    await client.waitForStatus((s) => s?.playerState === 'PAUSED', 1000);
    expect(client.status?.media?.duration).toBe(7200);

    await client.play();
    expect(client.status?.playerState).toBe('PLAYING');
    await client.seek(600, 'PLAYBACK_PAUSE');
    expect(client.status?.playerState).toBe('PAUSED');
    expect(client.position()).toBeCloseTo(600, 0);

    await client.setVolume(0.8);
    expect(client.volume).toBe(0.8);

    await client.stop();
    expect(client.status?.playerState).toBe('IDLE');
    client.close(true);
    expect(net.device('10.0.0.2')?.log).toEqual(
      expect.arrayContaining(['CONNECT', 'GET_STATUS', 'LAUNCH', 'LOAD', 'PLAY', 'SEEK', 'SET_VOLUME', 'STOP', 'CLOSE']),
    );
  });

  it('joins a receiver that is already running instead of relaunching', async () => {
    const net = createFakeCastNetwork();
    const first = await CastV2Client.connect('10.0.0.3', net);
    await first.launch();
    first.close();
    const second = await CastV2Client.connect('10.0.0.3', net);
    await second.launch();
    expect(net.device('10.0.0.3')?.log.filter((t) => t === 'LAUNCH')).toHaveLength(1);
    second.close();
  });

  it('rejects when the TV refuses the media', async () => {
    const client = await CastV2Client.connect('10.0.0.4', createFakeCastNetwork({ failLoad: true }));
    await client.launch();
    await expect(client.load(MEDIA)).rejects.toThrow('LOAD_FAILED');
    client.close();
  });
});

describe('WatchParty', () => {
  const devices = [
    { id: 'a', name: 'Living Room', host: '10.0.1.1' },
    { id: 'b', name: 'Bedroom', host: '10.0.1.2' },
  ];

  it('starts every TV only after all have buffered', async () => {
    // The bedroom TV buffers much more slowly.
    const net = createFakeCastNetwork((host) => ({ loadDelayMs: host === '10.0.1.2' ? 80 : 5 }));
    const party = new WatchParty(devices, net);
    expect(await party.start(MEDIA)).toBe(2);

    const [a, b] = party.members;
    expect(memberState(a)).toBe('playing');
    expect(memberState(b)).toBe('playing');
    // Both PLAYs went out after the slow TV was ready, so they're in step.
    expect(party.maxDrift()).toBeLessThan(0.05);
    // Neither TV started on its own.
    for (const host of ['10.0.1.1', '10.0.1.2']) {
      expect(net.device(host)?.log.filter((t) => t === 'PLAY')).toHaveLength(1);
    }

    await party.pauseAll();
    expect(party.isPlaying()).toBe(false);
    await party.seekAll(1200);
    expect(party.position()).toBeCloseTo(1200, 0);
    expect(memberState(a)).toBe('paused');

    await party.playAll();
    await party.seekBy(30);
    expect(party.isPlaying()).toBe(true);
    expect(party.position()).toBeGreaterThanOrEqual(1230);

    await party.end();
    expect(net.device('10.0.1.1')?.running).toBe(false);
  });

  it('keeps going when one TV is unreachable', async () => {
    const net = createFakeCastNetwork((host) => ({ unreachable: host === '10.0.1.2' }));
    const party = new WatchParty(devices, net);
    expect(await party.start(MEDIA)).toBe(1);
    expect(memberState(party.members[0])).toBe('playing');
    expect(memberState(party.members[1])).toBe('error');
    expect(party.members[1].error).toMatch(/reach/);
    await party.end();
  });

  it('throws when no TV can play the source', async () => {
    const party = new WatchParty(devices, createFakeCastNetwork({ failLoad: true }));
    await expect(party.start(MEDIA)).rejects.toThrow('LOAD_FAILED');
    await party.end();
  });

  it('sends a new source to a running party over the same connections', async () => {
    const net = createFakeCastNetwork();
    const party = new WatchParty(devices, net);
    await party.start(MEDIA);
    const clients = party.members.map((m) => m.client);
    await party.start({ ...MEDIA, contentId: 'https://cdn.test/next.mp4' });
    expect(party.members.map((m) => m.client)).toEqual(clients);
    expect(party.leader()?.client?.status?.media?.contentId).toBe('https://cdn.test/next.mp4');
    await party.end();
  });
});

describe('parseDeviceHost', () => {
  it('handles the formats the Cast SDK reports', () => {
    expect(parseDeviceHost('/192.168.1.23')).toBe('192.168.1.23');
    expect(parseDeviceHost('living-room.local/192.168.1.23')).toBe('192.168.1.23');
    expect(parseDeviceHost('192.168.1.23')).toBe('192.168.1.23');
    expect(parseDeviceHost('/fe80::1')).toBe('fe80::1');
    expect(parseDeviceHost('')).toBeUndefined();
    expect(parseDeviceHost(undefined)).toBeUndefined();
  });
});
