import type { IncomingMessage } from 'node:http';
import http from 'node:http';
import https from 'node:https';
import type { ITransport, TransportOptions } from '@ipp/client';
import { IppTransportError } from '@ipp/client';

/**
 * IPP transport backed by Node.js built-in http/https modules.
 * Use this when targeting Node.js < 18 (no native fetch) or when you need
 * fine-grained TLS control (custom CA, self-signed cert acceptance).
 *
 * For Node.js 18+ prefer @ipp/transport-fetch.
 */
export class NodeTransport implements ITransport {
  send(url: string, body: Uint8Array, opts?: TransportOptions): Promise<Uint8Array> {
    const parsed = new URL(
      url.replace(/^ipps:/, 'https:').replace(/^ipp:/, 'http:'),
    );

    // RFC 2910 §5.1: default IPP port is 631
    if (!parsed.port) parsed.port = '631';

    const isSecure = parsed.protocol === 'https:';

    const baseOptions = {
      hostname: parsed.hostname,
      port:     Number(parsed.port),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  this.buildHeaders(body, opts),
      timeout:  opts?.timeout ?? 30_000,
    };

    const requestOptions: https.RequestOptions = isSecure
      ? {
          ...baseOptions,
          rejectUnauthorized: opts?.tls?.rejectUnauthorized ?? true,
          ...(opts?.tls?.ca ? { ca: Buffer.from(opts.tls.ca) } : {}),
        }
      : baseOptions;

    const requestFn = isSecure ? https.request : http.request;

    return new Promise<Uint8Array>((resolve, reject) => {
      const req = requestFn(requestOptions, (res: IncomingMessage) => {
        if (res.statusCode !== 200) {
          res.resume(); // drain to free the socket
          reject(
            new IppTransportError(
              `HTTP ${res.statusCode} ${res.statusMessage ?? ''}`,
              res.statusCode ?? 0,
            ),
          );
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
        });
        res.on('error', reject);
      });

      req.on('error', reject);

      req.on('timeout', () => {
        req.destroy();
        reject(new IppTransportError('Request timed out', 0));
      });

      req.write(body);
      req.end();
    });
  }

  private buildHeaders(
    body: Uint8Array,
    opts?: TransportOptions,
  ): Record<string, string | number> {
    const headers: Record<string, string | number> = {
      'Content-Type':   'application/ipp',
      'Content-Length': body.length,
    };

    if (opts?.auth) {
      const creds = Buffer.from(
        `${opts.auth.username}:${opts.auth.password}`,
      ).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
    }

    return headers;
  }
}
