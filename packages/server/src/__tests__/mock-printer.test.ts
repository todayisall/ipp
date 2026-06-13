import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildGetPrinterAttributes, buildPrintJob } from '@ipp/client';
import { getGroup } from '@ipp/protocol';
import { v } from '@ipp/protocol';
import type { IppRequestMessage } from '@ipp/protocol';
import { MockPrinter } from '../mock-printer.js';

const PRINTER_URI = 'ipp://test.local:631/ipp/printer';
const DEFAULT_OPTS = { printerUri: PRINTER_URI };

const MIN_OP = (operation: IppRequestMessage['operation']): IppRequestMessage => ({
  version:   '2.0',
  operation,
  requestId: 1,
  groups: [{
    tag: 'operation-attributes-tag',
    attributes: [
      { name: 'attributes-charset',          values: [v.charset('utf-8')]         },
      { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')] },
      { name: 'printer-uri',                 values: [v.uri(PRINTER_URI)]          },
    ],
  }],
});

const JOB_OP = (operation: IppRequestMessage['operation'], jobId: number): IppRequestMessage => ({
  version:   '2.0',
  operation,
  requestId: 1,
  groups: [{
    tag: 'operation-attributes-tag',
    attributes: [
      { name: 'attributes-charset',          values: [v.charset('utf-8')]         },
      { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')] },
      { name: 'printer-uri',                 values: [v.uri(PRINTER_URI)]          },
      { name: 'job-id',                      values: [v.integer(jobId)]            },
    ],
  }],
});

// ─── Get-Printer-Attributes ───────────────────────────────────────────────────

describe('Get-Printer-Attributes', () => {
  it('returns successful-ok', () => {
    const printer = new MockPrinter(DEFAULT_OPTS);
    const resp = printer.handle(
      buildGetPrinterAttributes({ printerUri: PRINTER_URI, version: '2.0', charset: 'utf-8', language: 'en-us' }),
    );
    expect(resp.statusCode).toBe('successful-ok');
  });

  it('includes printer-state=idle initially', () => {
    const printer = new MockPrinter(DEFAULT_OPTS);
    const resp = printer.handle(MIN_OP('Get-Printer-Attributes'));
    const group = resp.groups.find((g) => g.tag === 'printer-attributes-tag')!;
    const state = group.attributes.find((a) => a.name === 'printer-state');
    expect(state?.values[0]).toEqual({ tag: 'enum', value: 'idle' });
  });

  it('includes printer-is-accepting-jobs=true initially', () => {
    const printer = new MockPrinter(DEFAULT_OPTS);
    const resp = printer.handle(MIN_OP('Get-Printer-Attributes'));
    const group = resp.groups.find((g) => g.tag === 'printer-attributes-tag')!;
    const attr  = group.attributes.find((a) => a.name === 'printer-is-accepting-jobs');
    expect(attr?.values[0]).toEqual({ tag: 'boolean', value: true });
  });

  it('respects custom printer name', () => {
    const printer = new MockPrinter({ ...DEFAULT_OPTS, printerName: 'My Laser' });
    const resp    = printer.handle(MIN_OP('Get-Printer-Attributes'));
    const group   = resp.groups.find((g) => g.tag === 'printer-attributes-tag')!;
    const attr    = group.attributes.find((a) => a.name === 'printer-name');
    expect(attr?.values[0]).toMatchObject({ tag: 'nameWithoutLanguage', value: 'My Laser' });
  });

  it('returns client-error-not-found for unknown printer URI', () => {
    const printer = new MockPrinter(DEFAULT_OPTS);
    const req: IppRequestMessage = {
      ...MIN_OP('Get-Printer-Attributes'),
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')]                          },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')]                  },
          { name: 'printer-uri',                 values: [v.uri('ipp://other.local/ipp')]               },
        ],
      }],
    };
    const resp = printer.handle(req);
    expect(resp.statusCode).toBe('client-error-not-found');
  });
});

// ─── Print-Job ────────────────────────────────────────────────────────────────

describe('Print-Job', () => {
  let printer: MockPrinter;
  beforeEach(() => { printer = new MockPrinter({ ...DEFAULT_OPTS, autoProcessJobs: false }); });
  afterEach(() => printer.destroy());

  it('returns job-id and job-state=pending', () => {
    const resp = printer.handle(
      buildPrintJob(
        { printerUri: PRINTER_URI, version: '2.0', charset: 'utf-8', language: 'en-us' },
        new Uint8Array([1, 2, 3]),
      ),
    );
    expect(resp.statusCode).toBe('successful-ok');
    const jobGroup = resp.groups.find((g) => g.tag === 'job-attributes-tag')!;
    const jobId = jobGroup.attributes.find((a) => a.name === 'job-id');
    const jobState = jobGroup.attributes.find((a) => a.name === 'job-state');
    expect(jobId?.values[0]).toMatchObject({ tag: 'integer' });
    expect(jobState?.values[0]).toEqual({ tag: 'enum', value: 'pending' });
  });

  it('increments job-id for each job', () => {
    const data = new Uint8Array([1]);
    const opts = { printerUri: PRINTER_URI, version: '2.0' as const, charset: 'utf-8', language: 'en-us' };
    const r1 = printer.handle(buildPrintJob(opts, data));
    const r2 = printer.handle(buildPrintJob(opts, data));
    const id1 = r1.groups.find((g) => g.tag === 'job-attributes-tag')!
      .attributes.find((a) => a.name === 'job-id')!.values[0] as { value: number };
    const id2 = r2.groups.find((g) => g.tag === 'job-attributes-tag')!
      .attributes.find((a) => a.name === 'job-id')!.values[0] as { value: number };
    expect(id2.value).toBe(id1.value + 1);
  });

  it('rejects when not accepting jobs', () => {
    printer.handle(MIN_OP('Pause-Printer'));
    const resp = printer.handle(
      buildPrintJob(
        { printerUri: PRINTER_URI, version: '2.0', charset: 'utf-8', language: 'en-us' },
        new Uint8Array([1]),
      ),
    );
    expect(resp.statusCode).toBe('server-error-not-accepting-jobs');
  });
});

// ─── Validate-Job ─────────────────────────────────────────────────────────────

describe('Validate-Job', () => {
  it('returns successful-ok for a valid job', () => {
    const printer = new MockPrinter(DEFAULT_OPTS);
    const resp = printer.handle(MIN_OP('Validate-Job'));
    expect(resp.statusCode).toBe('successful-ok');
  });

  it('rejects unsupported document format', () => {
    const printer = new MockPrinter({
      ...DEFAULT_OPTS,
      documentFormats: ['application/pdf'],
    });
    const req: IppRequestMessage = {
      ...MIN_OP('Validate-Job'),
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')]              },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')]      },
          { name: 'printer-uri',                 values: [v.uri(PRINTER_URI)]               },
          { name: 'document-format',             values: [v.mimeMediaType('text/plain')]    },
        ],
      }],
    };
    const resp = printer.handle(req);
    expect(resp.statusCode).toBe('client-error-document-format-not-supported');
  });
});

// ─── Create-Job / Send-Document / Close-Job ───────────────────────────────────

describe('Create-Job + Send-Document', () => {
  let printer: MockPrinter;
  beforeEach(() => { printer = new MockPrinter({ ...DEFAULT_OPTS, autoProcessJobs: false }); });
  afterEach(() => printer.destroy());

  it('full Create-Job → Send-Document(last=true) flow', () => {
    const createResp = printer.handle(MIN_OP('Create-Job'));
    expect(createResp.statusCode).toBe('successful-ok');
    const jobId = createResp.groups.find((g) => g.tag === 'job-attributes-tag')!
      .attributes.find((a) => a.name === 'job-id')!.values[0] as { value: number };

    const sendResp = printer.handle({
      version:   '2.0',
      operation: 'Send-Document',
      requestId: 2,
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')]            },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')]    },
          { name: 'printer-uri',                 values: [v.uri(PRINTER_URI)]             },
          { name: 'job-id',                      values: [v.integer(jobId.value)]         },
          { name: 'last-document',               values: [v.boolean(true)]                },
        ],
      }],
      data: new Uint8Array([1, 2, 3]),
    });
    expect(sendResp.statusCode).toBe('successful-ok');

    const job = printer.jobs.get(jobId.value)!;
    expect(job.state).toBe('pending');
    expect(job.closed).toBe(true);
    expect(job.documentCount).toBe(1);
  });
});

// ─── Cancel-Job ───────────────────────────────────────────────────────────────

describe('Cancel-Job', () => {
  let printer: MockPrinter;
  beforeEach(() => { printer = new MockPrinter({ ...DEFAULT_OPTS, autoProcessJobs: false }); });
  afterEach(() => printer.destroy());

  it('cancels a pending job', () => {
    const createResp = printer.handle(
      buildPrintJob(
        { printerUri: PRINTER_URI, version: '2.0', charset: 'utf-8', language: 'en-us' },
        new Uint8Array([1]),
      ),
    );
    const jobId = (createResp.groups.find((g) => g.tag === 'job-attributes-tag')!
      .attributes.find((a) => a.name === 'job-id')!.values[0] as { value: number }).value;

    const cancelResp = printer.handle(JOB_OP('Cancel-Job', jobId));
    expect(cancelResp.statusCode).toBe('successful-ok');
    expect(printer.jobs.get(jobId)!.state).toBe('canceled');
  });

  it('returns client-error-not-found for unknown job', () => {
    const resp = printer.handle(JOB_OP('Cancel-Job', 9999));
    expect(resp.statusCode).toBe('client-error-not-found');
  });
});

// ─── Get-Job-Attributes ───────────────────────────────────────────────────────

describe('Get-Job-Attributes', () => {
  let printer: MockPrinter;
  beforeEach(() => { printer = new MockPrinter({ ...DEFAULT_OPTS, autoProcessJobs: false }); });
  afterEach(() => printer.destroy());

  it('returns all job attributes', () => {
    const printResp = printer.handle(
      buildPrintJob(
        { printerUri: PRINTER_URI, version: '2.0', charset: 'utf-8', language: 'en-us' },
        new Uint8Array([1]),
        { jobName: 'TestDoc', copies: 3 },
      ),
    );
    const jobId = (printResp.groups.find((g) => g.tag === 'job-attributes-tag')!
      .attributes.find((a) => a.name === 'job-id')!.values[0] as { value: number }).value;

    const getResp = printer.handle(JOB_OP('Get-Job-Attributes', jobId));
    expect(getResp.statusCode).toBe('successful-ok');
    const grp = getResp.groups.find((g) => g.tag === 'job-attributes-tag')!;
    expect(grp.attributes.find((a) => a.name === 'job-name')?.values[0])
      .toMatchObject({ tag: 'nameWithoutLanguage', value: 'TestDoc' });
    expect(grp.attributes.find((a) => a.name === 'copies')?.values[0])
      .toEqual({ tag: 'integer', value: 3 });
  });
});

// ─── Get-Jobs ─────────────────────────────────────────────────────────────────

describe('Get-Jobs', () => {
  let printer: MockPrinter;
  beforeEach(() => { printer = new MockPrinter({ ...DEFAULT_OPTS, autoProcessJobs: false }); });
  afterEach(() => printer.destroy());

  it('returns all pending jobs', () => {
    const opts = { printerUri: PRINTER_URI, version: '2.0' as const, charset: 'utf-8', language: 'en-us' };
    printer.handle(buildPrintJob(opts, new Uint8Array([1])));
    printer.handle(buildPrintJob(opts, new Uint8Array([2])));

    const resp = printer.handle(MIN_OP('Get-Jobs'));
    expect(resp.statusCode).toBe('successful-ok');
    const jobGroups = resp.groups.filter((g) => g.tag === 'job-attributes-tag');
    expect(jobGroups).toHaveLength(2);
  });

  it('respects limit', () => {
    const opts = { printerUri: PRINTER_URI, version: '2.0' as const, charset: 'utf-8', language: 'en-us' };
    for (let i = 0; i < 5; i++) printer.handle(buildPrintJob(opts, new Uint8Array([i])));

    const req: IppRequestMessage = {
      ...MIN_OP('Get-Jobs'),
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')]         },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')] },
          { name: 'printer-uri',                 values: [v.uri(PRINTER_URI)]          },
          { name: 'limit',                       values: [v.integer(3)]                },
        ],
      }],
    };
    const resp = printer.handle(req);
    expect(resp.groups.filter((g) => g.tag === 'job-attributes-tag')).toHaveLength(3);
  });
});

// ─── Hold-Job / Release-Job ───────────────────────────────────────────────────

describe('Hold-Job / Release-Job', () => {
  let printer: MockPrinter;
  beforeEach(() => { printer = new MockPrinter({ ...DEFAULT_OPTS, autoProcessJobs: false }); });
  afterEach(() => printer.destroy());

  it('holds a pending job and releases it', () => {
    const printResp = printer.handle(
      buildPrintJob(
        { printerUri: PRINTER_URI, version: '2.0', charset: 'utf-8', language: 'en-us' },
        new Uint8Array([1]),
      ),
    );
    const jobId = (printResp.groups.find((g) => g.tag === 'job-attributes-tag')!
      .attributes.find((a) => a.name === 'job-id')!.values[0] as { value: number }).value;

    printer.handle(JOB_OP('Hold-Job', jobId));
    expect(printer.jobs.get(jobId)!.state).toBe('pending-held');

    printer.handle(JOB_OP('Release-Job', jobId));
    expect(printer.jobs.get(jobId)!.state).toBe('pending');
  });
});

// ─── Pause-Printer / Resume-Printer ──────────────────────────────────────────

describe('Pause-Printer / Resume-Printer', () => {
  it('pauses and resumes the printer', () => {
    const printer = new MockPrinter(DEFAULT_OPTS);
    printer.handle(MIN_OP('Pause-Printer'));
    expect(printer.printerState).toBe('stopped');
    expect(printer.isAcceptingJobs).toBe(false);

    printer.handle(MIN_OP('Resume-Printer'));
    expect(printer.printerState).toBe('idle');
    expect(printer.isAcceptingJobs).toBe(true);
  });
});

// ─── Purge-Jobs ───────────────────────────────────────────────────────────────

describe('Purge-Jobs', () => {
  it('cancels all non-terminal jobs', () => {
    const printer = new MockPrinter({ ...DEFAULT_OPTS, autoProcessJobs: false });
    const opts = { printerUri: PRINTER_URI, version: '2.0' as const, charset: 'utf-8', language: 'en-us' };
    printer.handle(buildPrintJob(opts, new Uint8Array([1])));
    printer.handle(buildPrintJob(opts, new Uint8Array([2])));

    printer.handle(MIN_OP('Purge-Jobs'));
    for (const job of printer.jobs.values()) {
      expect(job.state).toBe('canceled');
    }
  });
});

// ─── Auto-processing ─────────────────────────────────────────────────────────

describe('auto-processing', () => {
  it('job transitions to completed after delays', async () => {
    const printer = new MockPrinter({
      ...DEFAULT_OPTS,
      autoProcessJobs: true,
      processingDelay: 0,
      completionDelay: 10,
    });

    const resp = printer.handle(
      buildPrintJob(
        { printerUri: PRINTER_URI, version: '2.0', charset: 'utf-8', language: 'en-us' },
        new Uint8Array([1]),
      ),
    );
    const jobId = (resp.groups.find((g) => g.tag === 'job-attributes-tag')!
      .attributes.find((a) => a.name === 'job-id')!.values[0] as { value: number }).value;

    await new Promise((r) => setTimeout(r, 50));

    expect(printer.jobs.get(jobId)!.state).toBe('completed');
    expect(printer.printerState).toBe('idle');
    printer.destroy();
  });
});

// ─── Subscriptions ────────────────────────────────────────────────────────────

describe('subscriptions', () => {
  it('creates and cancels a printer subscription', () => {
    const printer = new MockPrinter(DEFAULT_OPTS);
    const createResp = printer.handle({
      version:   '2.0',
      operation: 'Create-Printer-Subscriptions',
      requestId: 1,
      groups: [
        {
          tag: 'operation-attributes-tag',
          attributes: [
            { name: 'attributes-charset',          values: [v.charset('utf-8')]         },
            { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')] },
            { name: 'printer-uri',                 values: [v.uri(PRINTER_URI)]          },
          ],
        },
        {
          tag: 'subscription-attributes-tag',
          attributes: [
            { name: 'notify-events',         values: [v.keyword('job-completed')]  },
            { name: 'notify-pull-method',    values: [v.keyword('ippget')]         },
            { name: 'notify-lease-duration', values: [v.integer(3600)]             },
          ],
        },
      ],
    });
    expect(createResp.statusCode).toBe('successful-ok');
    const subId = createResp.groups.find((g) => g.tag === 'subscription-attributes-tag')!
      .attributes.find((a) => a.name === 'notify-subscription-id')!
      .values[0] as { value: number };
    expect(subId.value).toBeGreaterThan(0);

    const cancelResp = printer.handle({
      version:   '2.0',
      operation: 'Cancel-Subscription',
      requestId: 2,
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')]         },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')] },
          { name: 'printer-uri',                 values: [v.uri(PRINTER_URI)]          },
          { name: 'notify-subscription-id',      values: [v.integer(subId.value)]     },
        ],
      }],
    });
    expect(cancelResp.statusCode).toBe('successful-ok');
    expect(printer.subscriptions.size).toBe(0);
  });
});

// ─── Identify-Printer ────────────────────────────────────────────────────────

describe('Identify-Printer', () => {
  it('returns successful-ok', () => {
    const printer = new MockPrinter(DEFAULT_OPTS);
    const resp = printer.handle(MIN_OP('Identify-Printer'));
    expect(resp.statusCode).toBe('successful-ok');
  });
});

// ─── Unsupported operation ────────────────────────────────────────────────────

describe('unsupported operation', () => {
  it('returns server-error-operation-not-supported', () => {
    const printer = new MockPrinter(DEFAULT_OPTS);
    const resp = printer.handle({
      ...MIN_OP('Get-Printer-Attributes'),
      operation: '0x9999' as never,
    });
    expect(resp.statusCode).toBe('server-error-operation-not-supported');
  });
});
