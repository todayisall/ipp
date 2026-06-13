import { parse } from '@ipp/codec';
import { serialize } from '@ipp/codec';
import type { IppRequestMessage, IppResponseMessage, IppVersion } from '@ipp/protocol';
import { isErrorStatus } from '@ipp/protocol';
import { buildGetPrinterAttributes } from './builders/get-printer-attributes.js';
import type { GetPrinterAttributesOptions } from './builders/get-printer-attributes.js';
import { buildPrintJob } from './builders/print-job.js';
import type { PrintJobOptions } from './builders/print-job.js';
import {
  buildCancelJob,
  buildCloseJob,
  buildGetJobAttributes,
  buildGetJobs,
  buildIdentifyPrinter,
  buildPrintUri,
  buildValidateJob,
} from './builders/other.js';
import type {
  GetJobAttributesOptions,
  GetJobsOptions,
  IdentifyAction,
  PrintUriOptions,
  ValidateJobOptions,
} from './builders/other.js';
import {
  buildCancelSubscription,
  buildCreateJobSubscriptions,
  buildCreatePrinterSubscriptions,
  buildGetSubscriptions,
  buildRenewSubscription,
} from './builders/subscriptions.js';
import type {
  GetSubscriptionsOptions,
  NotifyEvent,
  SubscriptionSpec,
} from './builders/subscriptions.js';
import { IppOperationError } from './errors.js';
import type { ITransport, TransportOptions } from './transport.js';

export interface PrinterOptions {
  /** IPP version to use in requests. Default: '2.0' */
  version?: IppVersion;
  /** attributes-charset. Default: 'utf-8' */
  charset?: string;
  /** attributes-natural-language. Default: 'en-us' */
  language?: string;
  /** Explicit printer-uri override. Default: derived from the URL argument. */
  printerUri?: string;
  /** Request timeout in milliseconds. Default: 30000 */
  timeout?: number;
}

function normalizeUrl(url: string): string {
  // Keep ipp:/ipps: scheme for transport (FetchTransport converts to http/https)
  return url.replace(/\/$/, '');
}

function deriveIppUri(httpUrl: string): string {
  return httpUrl.replace(/^https?:\/\//, (m) => (m === 'https://' ? 'ipps://' : 'ipp://'));
}

export class Printer {
  private readonly url: string;
  private readonly defaults: {
    version: IppVersion;
    charset: string;
    language: string;
    printerUri: string;
  };
  private readonly transport: ITransport;
  private readonly timeout: number;

  constructor(url: string, opts?: PrinterOptions, transport?: ITransport) {
    this.url = normalizeUrl(url);
    this.defaults = {
      version:    opts?.version    ?? '2.0',
      charset:    opts?.charset    ?? 'utf-8',
      language:   opts?.language   ?? 'en-us',
      printerUri: opts?.printerUri ?? deriveIppUri(this.url),
    };
    this.timeout   = opts?.timeout ?? 30_000;
    // Lazy import of FetchTransport avoids hard dep on transport-fetch in this package.
    // Callers in environments without fetch must pass their own transport explicitly.
    this.transport = transport ?? createDefaultTransport();
  }

  // ─── Low-level generic execute ────────────────────────────────────────────

  async execute(
    msg: IppRequestMessage,
    transportOpts?: TransportOptions,
  ): Promise<IppResponseMessage> {
    const buf  = serialize(msg);
    const opts = { timeout: this.timeout, ...transportOpts };
    const respBuf = await this.transport.send(this.url, buf, opts);
    const resp    = parse(respBuf) as IppResponseMessage;

    if (isErrorStatus(resp.statusCode)) {
      throw new IppOperationError(resp);
    }
    return resp;
  }

  // ─── High-level convenience methods ───────────────────────────────────────

  getPrinterAttributes(opts?: GetPrinterAttributesOptions): Promise<IppResponseMessage> {
    return this.execute(buildGetPrinterAttributes(this.defaults, opts));
  }

  printJob(data: Uint8Array, opts?: PrintJobOptions): Promise<IppResponseMessage> {
    return this.execute(buildPrintJob(this.defaults, data, opts));
  }

  printUri(documentUri: string, opts?: PrintUriOptions): Promise<IppResponseMessage> {
    return this.execute(buildPrintUri(this.defaults, documentUri, opts));
  }

  cancelJob(jobId: number): Promise<IppResponseMessage> {
    return this.execute(buildCancelJob(this.defaults, jobId));
  }

  getJobAttributes(jobId: number, opts?: GetJobAttributesOptions): Promise<IppResponseMessage> {
    return this.execute(buildGetJobAttributes(this.defaults, jobId, opts));
  }

  getJobs(opts?: GetJobsOptions): Promise<IppResponseMessage> {
    return this.execute(buildGetJobs(this.defaults, opts));
  }

  identifyPrinter(actions?: IdentifyAction[]): Promise<IppResponseMessage> {
    return this.execute(buildIdentifyPrinter(this.defaults, actions));
  }

  validateJob(opts?: ValidateJobOptions): Promise<IppResponseMessage> {
    return this.execute(buildValidateJob(this.defaults, opts));
  }

  closeJob(jobId: number): Promise<IppResponseMessage> {
    return this.execute(buildCloseJob(this.defaults, jobId));
  }

  // ─── RFC 3995 subscriptions ────────────────────────────────────────────────

  subscribe(
    subscriptions: SubscriptionSpec[],
    transportOpts?: TransportOptions,
  ): Promise<IppResponseMessage> {
    return this.execute(buildCreatePrinterSubscriptions(this.defaults, subscriptions), transportOpts);
  }

  subscribeToJob(
    jobId: number,
    subscriptions: SubscriptionSpec[],
    transportOpts?: TransportOptions,
  ): Promise<IppResponseMessage> {
    return this.execute(buildCreateJobSubscriptions(this.defaults, jobId, subscriptions), transportOpts);
  }

  getSubscriptions(opts?: GetSubscriptionsOptions): Promise<IppResponseMessage> {
    return this.execute(buildGetSubscriptions(this.defaults, opts));
  }

  renewSubscription(subscriptionId: number, leaseDuration?: number): Promise<IppResponseMessage> {
    return this.execute(buildRenewSubscription(this.defaults, subscriptionId, leaseDuration));
  }

  cancelSubscription(subscriptionId: number): Promise<IppResponseMessage> {
    return this.execute(buildCancelSubscription(this.defaults, subscriptionId));
  }
}

function createDefaultTransport(): ITransport {
  if (typeof fetch === 'function') {
    // Inline minimal fetch transport — avoids a hard dep on @ipp/transport-fetch
    return {
      async send(url: string, body: Uint8Array, opts?: TransportOptions): Promise<Uint8Array> {
        const httpUrl = url.replace(/^ipps?:\/\//, (m) =>
          m === 'ipps://' ? 'https://' : 'http://',
        );
        const controller = new AbortController();
        const signal = opts?.signal ?? controller.signal;
        let timerId: ReturnType<typeof setTimeout> | undefined;
        if (opts?.timeout) timerId = setTimeout(() => controller.abort(), opts.timeout);

        const headers: Record<string, string> = { 'Content-Type': 'application/ipp' };
        if (opts?.auth) {
          headers['Authorization'] =
            `Basic ${btoa(`${opts.auth.username}:${opts.auth.password}`)}`;
        }
        try {
          const res = await fetch(httpUrl, { method: 'POST', headers, body: body as BodyInit, signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        } finally {
          if (timerId) clearTimeout(timerId);
        }
      },
    };
  }
  return {
    send(): Promise<Uint8Array> {
      throw new Error(
        '[ipp/client] No transport available. ' +
        'Pass a transport instance (e.g. new FetchTransport() or new NodeTransport()) ' +
        'as the third argument to new Printer().',
      );
    },
  };
}
