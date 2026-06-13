import type { ITransport, TransportOptions } from '@ipp/client';
import { IppTransportError } from '@ipp/client';

/**
 * IPP transport using the standard Fetch API.
 * Works in Node.js 18+, Deno, Bun, and modern browsers.
 * Converts ipp:// → http:// and ipps:// → https:// automatically.
 */
export class FetchTransport implements ITransport {
  async send(url: string, body: Uint8Array, opts?: TransportOptions): Promise<Uint8Array> {
    const httpUrl = url.replace(/^ipps?:\/\//, (m) =>
      m === 'ipps://' ? 'https://' : 'http://',
    );

    const controller = new AbortController();
    const signal = opts?.signal ?? controller.signal;

    let timerId: ReturnType<typeof setTimeout> | undefined;
    if (opts?.timeout) {
      timerId = setTimeout(() => controller.abort(), opts.timeout);
    }

    const headers: Record<string, string> = {
      'Content-Type':   'application/ipp',
      'Content-Length': String(body.length),
    };
    if (opts?.auth) {
      const creds = btoa(`${opts.auth.username}:${opts.auth.password}`);
      headers['Authorization'] = `Basic ${creds}`;
    }

    try {
      const res = await fetch(httpUrl, {
        method: 'POST',
        headers,
        body: body as BodyInit,
        signal,
      });

      if (!res.ok) {
        throw new IppTransportError(
          `HTTP ${res.status} ${res.statusText}`,
          res.status,
        );
      }

      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (err instanceof IppTransportError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new IppTransportError('Request timed out', 0);
      }
      throw err;
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  }
}
