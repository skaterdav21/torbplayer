/**
 * Wire format of the Google Cast v2 protocol (what Chromecasts speak on TCP
 * port 8009, over TLS). Each message is a protobuf `CastMessage` prefixed by
 * its length as a 4-byte big-endian integer.
 *
 *   message CastMessage {
 *     required ProtocolVersion protocol_version = 1;  // CASTV2_1_0 = 0
 *     required string source_id = 2;
 *     required string destination_id = 3;
 *     required string namespace = 4;
 *     required PayloadType payload_type = 5;          // STRING = 0
 *     optional string payload_utf8 = 6;
 *     optional bytes payload_binary = 7;
 *   }
 *
 * Hand-rolled because it's one small message type, and it avoids pulling a
 * protobuf runtime into the app. Only JSON (string) payloads are used.
 */

export interface CastMessage {
  sourceId: string;
  destinationId: string;
  namespace: string;
  payload: string;
}

/* UTF-8 by hand: Hermes' TextDecoder support has varied between versions. */
export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i++];
    let cp: number;
    if (c < 0x80) cp = c;
    else if (c < 0xe0) cp = ((c & 31) << 6) | (b[i++] & 63);
    else if (c < 0xf0) cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    s += String.fromCodePoint(cp);
  }
  return s;
}

function pushVarint(out: number[], n: number) {
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

function pushString(out: number[], field: number, value: string) {
  const bytes = utf8Encode(value);
  out.push((field << 3) | 2);
  pushVarint(out, bytes.length);
  for (const b of bytes) out.push(b);
}

export function encodeMessage(m: CastMessage): Uint8Array {
  const out: number[] = [];
  out.push(0x08, 0); // protocol_version = CASTV2_1_0
  pushString(out, 2, m.sourceId);
  pushString(out, 3, m.destinationId);
  pushString(out, 4, m.namespace);
  out.push(0x28, 0); // payload_type = STRING
  pushString(out, 6, m.payload);
  return Uint8Array.from(out);
}

export function decodeMessage(b: Uint8Array): CastMessage {
  const m: CastMessage = { sourceId: '', destinationId: '', namespace: '', payload: '' };
  let i = 0;
  const varint = () => {
    let result = 0;
    let mul = 1;
    for (;;) {
      if (i >= b.length) throw new Error('Truncated varint');
      const byte = b[i++];
      result += (byte & 0x7f) * mul;
      if (byte < 0x80) return result;
      mul *= 128;
    }
  };
  while (i < b.length) {
    const tag = varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 0) {
      varint();
    } else if (wire === 2) {
      const len = varint();
      if (i + len > b.length) throw new Error('Truncated field');
      const bytes = b.subarray(i, i + len);
      i += len;
      if (field === 2) m.sourceId = utf8Decode(bytes);
      else if (field === 3) m.destinationId = utf8Decode(bytes);
      else if (field === 4) m.namespace = utf8Decode(bytes);
      else if (field === 6) m.payload = utf8Decode(bytes);
    } else if (wire === 5) {
      i += 4;
    } else if (wire === 1) {
      i += 8;
    } else {
      throw new Error(`Unsupported wire type ${wire}`);
    }
  }
  return m;
}

/** Length-prefixed message, ready to write to the socket. */
export function frame(m: CastMessage): Uint8Array {
  const body = encodeMessage(m);
  const out = new Uint8Array(4 + body.length);
  const n = body.length;
  out[0] = (n >>> 24) & 0xff;
  out[1] = (n >>> 16) & 0xff;
  out[2] = (n >>> 8) & 0xff;
  out[3] = n & 0xff;
  out.set(body, 4);
  return out;
}

const MAX_MESSAGE = 64 * 1024;

/** Reassembles messages from socket chunks, which can split or merge frames. */
export class Deframer {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): CastMessage[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const messages: CastMessage[] = [];
    while (this.buf.length >= 4) {
      const len = ((this.buf[0] << 24) | (this.buf[1] << 16) | (this.buf[2] << 8) | this.buf[3]) >>> 0;
      if (len > MAX_MESSAGE) throw new Error(`Cast message too large (${len} bytes)`);
      if (this.buf.length < 4 + len) break;
      messages.push(decodeMessage(this.buf.subarray(4, 4 + len)));
      this.buf = this.buf.slice(4 + len);
    }
    return messages;
  }
}
