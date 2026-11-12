/**
 * TLS sockets to Cast devices for watch parties. The only place the app
 * imports react-native-tcp-socket. On web, partySocket.web.ts simulates TVs.
 */
import TcpSocket from 'react-native-tcp-socket';

import type { SocketFactory } from '../lib/castv2/client';
import { utf8Encode } from '../lib/castv2/protocol';

type TlsOptions = Parameters<typeof TcpSocket.connectTLS>[0];

export const connectCastSocket: SocketFactory = (host, port, handlers) =>
  new Promise((resolve, reject) => {
    let connected = false;
    let closed = false;
    const close = (error?: string) => {
      if (closed) return;
      closed = true;
      handlers.onClose(error);
    };

    const socket = TcpSocket.connectTLS(
      // Cast devices present self-signed certificates, so they can't be validated.
      { host, port, connectTimeout: 8000, rejectUnauthorized: false } as TlsOptions,
      () => {
        connected = true;
        resolve({
          write: (bytes) => {
            socket.write(bytes);
          },
          close: () => socket.destroy(),
        });
      },
    );

    socket.on('data', (data) => handlers.onData(typeof data === 'string' ? utf8Encode(data) : new Uint8Array(data)));
    socket.on('error', (err) => {
      if (!connected) {
        closed = true;
        reject(new Error(`Couldn't reach the TV (${err.message})`));
      } else {
        close(err.message);
      }
    });
    socket.on('close', () => close());
  });
