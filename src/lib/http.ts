/**
 * fetch() + JSON with a timeout. React Native has AbortController but not
 * AbortSignal.timeout(), so the timeout is wired up by hand.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function fetchJson<T>(
  url: string,
  { timeoutMs = 15000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new HttpError(`HTTP ${res.status}`, res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new HttpError('Timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/** Host part of a URL, without relying on the URL class (RN's is incomplete). */
export function hostOf(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1].replace(/^[^@]*@/, '') : url;
}
