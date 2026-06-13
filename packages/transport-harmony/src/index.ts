// HarmonyOS Next transport for IPP
// Uses @ohos.net.http (available in HarmonyOS API Level 6+)
//
// Usage in an ArkTS/ArkUI app:
//   import { HarmonyTransport } from '@ipp/transport-harmony';
//   import { Printer } from '@ipp/client';
//   const printer = new Printer('ipp://192.168.1.10:631/ipp', {}, new HarmonyTransport());

import type { ITransport, TransportOptions } from '@ipp/client';
import { IppTransportError } from '@ipp/client';

// ─── @ohos.net.http shim types ─────────────────────────────────────────────
// These types mirror the HarmonyOS Next API surface. The actual module is
// loaded via dynamic import so this package compiles without the HarmonyOS SDK.

interface OhosHttpRequest {
  request(
    url: string,
    options: OhosRequestOptions,
    callback: (err: Error | null, data: OhosResponse) => void,
  ): void;
  destroy(): void;
}

interface OhosRequestOptions {
  method: string;
  header: Record<string, string>;
  extraData?: ArrayBuffer | string;
  connectTimeout?: number;
  readTimeout?: number;
  caPath?: string;
  clientCert?: { certPath: string; keyPath: string; keyPassword?: string };
  usingProtocol?: number; // 1=TLS1.2, 2=TLS1.3
}

interface OhosResponse {
  responseCode: number;
  result: string | ArrayBuffer | Object;
}

interface OhosHttp {
  createHttp(): OhosHttpRequest;
}

// ─── HarmonyTransport ──────────────────────────────────────────────────────

export interface HarmonyTransportOptions {
  /**
   * Timeout for connection establishment (ms). Default: 10000.
   */
  connectTimeout?: number;
  /**
   * Timeout for read operations (ms). Default: 30000.
   */
  readTimeout?: number;
  /**
   * Custom CA certificate path for IPPS (self-signed).
   * Corresponds to @ohos.net.http RequestOptions.caPath.
   */
  caPath?: string;
  /**
   * Client certificate for mutual TLS authentication.
   */
  clientCert?: {
    certPath: string;
    keyPath: string;
    keyPassword?: string;
  };
}

/**
 * IPP transport for HarmonyOS Next.
 *
 * Converts ipp:// → http:// and ipps:// → https://, then uses
 * `@ohos.net.http` to make the POST request.
 *
 * @example
 * ```ts
 * import { HarmonyTransport } from '@ipp/transport-harmony';
 * import { Printer } from '@ipp/client';
 *
 * const transport = new HarmonyTransport({ connectTimeout: 5000 });
 * const printer   = new Printer('ipp://192.168.1.10:631/ipp/print', {}, transport);
 * const attrs     = await printer.getPrinterAttributes();
 * ```
 */
export class HarmonyTransport implements ITransport {
  private readonly opts: Required<HarmonyTransportOptions>;

  constructor(opts?: HarmonyTransportOptions) {
    this.opts = {
      connectTimeout: opts?.connectTimeout ?? 10_000,
      readTimeout:    opts?.readTimeout    ?? 30_000,
      caPath:         opts?.caPath         ?? '',
      clientCert:     opts?.clientCert     ?? { certPath: '', keyPath: '' },
    };
  }

  async send(
    url: string,
    body: Uint8Array,
    transportOpts?: TransportOptions,
  ): Promise<Uint8Array> {
    const httpUrl = url.replace(/^ipps?:\/\//, (m) =>
      m === 'ipps://' ? 'https://' : 'http://',
    );

    // Load @ohos.net.http lazily — this module only exists in HarmonyOS runtime
    let ohosHttp: OhosHttp;
    try {
      // Dynamic import keeps this module compilable in non-HarmonyOS environments.
      // @ts-expect-error @ohos.net.http is only resolvable in the HarmonyOS runtime.
      ohosHttp = await import('@ohos.net.http') as unknown as OhosHttp;
    } catch {
      throw new IppTransportError(
        '[HarmonyTransport] @ohos.net.http is not available in this environment.',
        0,
      );
    }

    const httpRequest = ohosHttp.createHttp();

    const timeout = transportOpts?.timeout ?? this.opts.readTimeout;
    const headers: Record<string, string> = {
      'Content-Type':   'application/ipp',
      'Content-Length': String(body.length),
    };
    if (transportOpts?.auth) {
      const creds = btoa(`${transportOpts.auth.username}:${transportOpts.auth.password}`);
      headers['Authorization'] = `Basic ${creds}`;
    }

    const requestOptions: OhosRequestOptions = {
      method:         'POST',
      header:         headers,
      // @ohos.net.http accepts ArrayBuffer as body
      extraData:      body.buffer as ArrayBuffer,
      connectTimeout: this.opts.connectTimeout,
      readTimeout:    timeout,
    };

    // Add TLS options for ipps://
    if (httpUrl.startsWith('https://')) {
      if (this.opts.caPath) {
        requestOptions.caPath = this.opts.caPath;
      }
      if (this.opts.clientCert.certPath) {
        requestOptions.clientCert = this.opts.clientCert;
      }
    }

    return new Promise<Uint8Array>((resolve, reject) => {
      // Respect the AbortSignal if provided
      if (transportOpts?.signal?.aborted) {
        httpRequest.destroy();
        reject(new IppTransportError('Request aborted', 0));
        return;
      }

      const onAbort = () => {
        httpRequest.destroy();
        reject(new IppTransportError('Request aborted', 0));
      };
      transportOpts?.signal?.addEventListener('abort', onAbort);

      httpRequest.request(httpUrl, requestOptions, (err, data) => {
        transportOpts?.signal?.removeEventListener('abort', onAbort);
        httpRequest.destroy();

        if (err) {
          reject(new IppTransportError(`@ohos.net.http error: ${err.message}`, 0));
          return;
        }

        if (data.responseCode < 200 || data.responseCode >= 300) {
          reject(new IppTransportError(
            `HTTP ${data.responseCode}`,
            data.responseCode,
          ));
          return;
        }

        // @ohos.net.http may return result as ArrayBuffer or string
        const result = data.result;
        if (result instanceof ArrayBuffer) {
          resolve(new Uint8Array(result));
        } else if (typeof result === 'string') {
          // Fallback: decode base64 or treat as binary string
          const bytes = new Uint8Array(result.length);
          for (let i = 0; i < result.length; i++) {
            bytes[i] = result.charCodeAt(i) & 0xFF;
          }
          resolve(bytes);
        } else {
          reject(new IppTransportError(
            '[HarmonyTransport] Unexpected response result type',
            data.responseCode,
          ));
        }
      });
    });
  }
}
