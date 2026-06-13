import { describe, expect, it, vi } from 'vitest';
import { parse, serialize } from '@ipp/codec';
import { v, getAttr, getGroup } from '@ipp/protocol';
import type { ITransport } from '../transport.js';
import { Printer } from '../printer.js';

// ─── Mock transport helpers ───────────────────────────────────────────────────

/** Records the most recent request and returns a fixed response */
function mockTransport(responseMsg: object): { transport: ITransport; lastRequest: () => object } {
  let lastReq: object = {};
  const transport: ITransport = {
    async send(_url: string, body: Uint8Array): Promise<Uint8Array> {
      lastReq = parse(body);
      return serialize(responseMsg as Parameters<typeof serialize>[0]);
    },
  };
  return { transport, lastRequest: () => lastReq };
}

function successResponse(printerAttrs: Record<string, ReturnType<typeof v.enum>>) {
  return {
    version:    '2.0' as const,
    statusCode: 'successful-ok' as const,
    requestId:  1,
    groups: [
      {
        tag: 'operation-attributes-tag' as const,
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
        ],
      },
      {
        tag: 'printer-attributes-tag' as const,
        attributes: Object.entries(printerAttrs).map(([name, val]) => ({ name, values: [val] })),
      },
    ],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Printer.execute', () => {
  it('sends a serialized IPP request and returns parsed response', async () => {
    const response = successResponse({ 'printer-state': v.enum('idle') });
    const { transport } = mockTransport(response);
    const printer = new Printer('ipp://printer.local:631/ipp', {}, transport);

    const resp = await printer.getPrinterAttributes();

    expect(resp.version).toBe('2.0');
    expect(resp.statusCode).toBe('successful-ok');
  });

  it('throws IppOperationError on error status', async () => {
    const errorResponse = {
      version:    '2.0' as const,
      statusCode: 'client-error-not-found' as const,
      requestId:  1,
      groups: [{
        tag: 'operation-attributes-tag' as const,
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
          { name: 'status-message',              values: [v.text('Printer not found')] },
        ],
      }],
    };
    const { transport } = mockTransport(errorResponse);
    const printer = new Printer('ipp://printer.local:631/ipp', {}, transport);

    await expect(printer.getPrinterAttributes()).rejects.toMatchObject({
      name:       'IppOperationError',
      statusCode: 'client-error-not-found',
    });
  });
});

describe('Printer.getPrinterAttributes', () => {
  it('sends Get-Printer-Attributes with correct operation group', async () => {
    const { transport, lastRequest } = mockTransport(
      successResponse({ 'printer-state': v.enum('idle') }),
    );
    const printer = new Printer('ipp://printer.local/ipp', {}, transport);
    await printer.getPrinterAttributes();

    const req = lastRequest() as ReturnType<typeof parse>;
    expect('operation' in req ? req.operation : '').toBe('Get-Printer-Attributes');

    const opGroup = getGroup(req as Parameters<typeof getGroup>[0], 'operation-attributes-tag');
    const charset = getAttr(opGroup!, 'attributes-charset');
    expect(charset?.values[0]).toEqual({ tag: 'charset', value: 'utf-8' });

    const printerUri = getAttr(opGroup!, 'printer-uri');
    expect(printerUri?.values[0]?.tag).toBe('uri');
  });

  it('includes requested-attributes when specified', async () => {
    const { transport, lastRequest } = mockTransport(
      successResponse({ 'printer-state': v.enum('idle') }),
    );
    const printer = new Printer('ipp://printer/ipp', {}, transport);
    await printer.getPrinterAttributes({ requestedAttributes: ['printer-state'] });

    const req = lastRequest() as ReturnType<typeof parse>;
    const opGroup = getGroup(req as Parameters<typeof getGroup>[0], 'operation-attributes-tag');
    const reqAttrs = getAttr(opGroup!, 'requested-attributes');
    expect(reqAttrs?.values[0]).toEqual({ tag: 'keyword', value: 'printer-state' });
  });
});

describe('Printer.printJob', () => {
  const jobResponse = {
    version:    '2.0' as const,
    statusCode: 'successful-ok' as const,
    requestId:  1,
    groups: [{
      tag: 'operation-attributes-tag' as const,
      attributes: [
        { name: 'attributes-charset',          values: [v.charset('utf-8')] },
        { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
      ],
    }, {
      tag: 'job-attributes-tag' as const,
      attributes: [
        { name: 'job-id',    values: [v.integer(42)] },
        { name: 'job-state', values: [v.enum('pending')] },
      ],
    }],
  };

  it('sends Print-Job with document data', async () => {
    const { transport, lastRequest } = mockTransport(jobResponse);
    const printer = new Printer('ipp://printer/ipp', {}, transport);
    const data = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

    await printer.printJob(data, { jobName: 'Test Job', documentFormat: 'application/pdf' });

    const req = lastRequest() as ReturnType<typeof parse>;
    expect('operation' in req ? req.operation : '').toBe('Print-Job');
    expect(req.data).toEqual(data);

    const opGroup = getGroup(req as Parameters<typeof getGroup>[0], 'operation-attributes-tag');
    const jobName = getAttr(opGroup!, 'job-name');
    expect(jobName?.values[0]).toEqual({ tag: 'nameWithoutLanguage', value: 'Test Job' });

    const fmt = getAttr(opGroup!, 'document-format');
    expect(fmt?.values[0]).toEqual({ tag: 'mimeMediaType', value: 'application/pdf' });
  });

  it('includes job-attributes-tag when copies/sides provided', async () => {
    const { transport, lastRequest } = mockTransport(jobResponse);
    const printer = new Printer('ipp://printer/ipp', {}, transport);
    const data = new Uint8Array([1, 2, 3]);

    await printer.printJob(data, { copies: 2, sides: 'two-sided-long-edge' });

    const req = lastRequest() as ReturnType<typeof parse>;
    const jobGroup = getGroup(req as Parameters<typeof getGroup>[0], 'job-attributes-tag');
    expect(jobGroup).toBeDefined();

    const copies = getAttr(jobGroup!, 'copies');
    expect(copies?.values[0]).toEqual({ tag: 'integer', value: 2 });

    const sides = getAttr(jobGroup!, 'sides');
    expect(sides?.values[0]).toEqual({ tag: 'keyword', value: 'two-sided-long-edge' });
  });
});

describe('Printer.cancelJob', () => {
  it('sends Cancel-Job with job-id', async () => {
    const { transport, lastRequest } = mockTransport({
      version:    '2.0' as const,
      statusCode: 'successful-ok' as const,
      requestId:  1,
      groups: [{
        tag: 'operation-attributes-tag' as const,
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
        ],
      }],
    });
    const printer = new Printer('ipp://printer/ipp', {}, transport);
    await printer.cancelJob(99);

    const req = lastRequest() as ReturnType<typeof parse>;
    expect('operation' in req ? req.operation : '').toBe('Cancel-Job');

    const opGroup = getGroup(req as Parameters<typeof getGroup>[0], 'operation-attributes-tag');
    const jobId = getAttr(opGroup!, 'job-id');
    expect(jobId?.values[0]).toEqual({ tag: 'integer', value: 99 });
  });
});

describe('Printer version options', () => {
  it('uses specified version in request', async () => {
    const { transport, lastRequest } = mockTransport(
      successResponse({ 'printer-state': v.enum('idle') }),
    );
    const printer = new Printer('ipp://printer/ipp', { version: '1.1' }, transport);
    await printer.getPrinterAttributes();

    const req = lastRequest() as ReturnType<typeof parse>;
    expect(req.version).toBe('1.1');
  });
});
