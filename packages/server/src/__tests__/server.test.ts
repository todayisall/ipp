// Integration tests: IppServer (HTTP) + Printer client (NodeTransport)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Printer } from '@ipp/client';
import { NodeTransport } from '../../../transport-node/src/index.js';
import { MockPrinter } from '../mock-printer.js';
import { IppServer } from '../server.js';

const PRINTER_URI_TPL = (port: number) => `ipp://127.0.0.1:${port}/ipp/printer`;

describe('IppServer end-to-end', () => {
  let mock:    MockPrinter;
  let server:  IppServer;
  let port:    number;
  let client:  Printer;

  beforeEach(async () => {
    mock   = new MockPrinter({
      printerUri:      'PLACEHOLDER',   // overwritten after we know the port
      autoProcessJobs: true,
      processingDelay: 0,
      completionDelay: 20,
    });
    server = new IppServer(mock);
    const addr = await server.listen(0, '127.0.0.1');
    port   = addr.port;

    // Patch the printer URI into the mock after we know the port
    (mock as unknown as { cfg: { printerUri: string } }).cfg.printerUri =
      PRINTER_URI_TPL(port);

    client = new Printer(
      PRINTER_URI_TPL(port),
      { version: '2.0', charset: 'utf-8', language: 'en-us' },
      new NodeTransport(),
    );
  });

  afterEach(async () => {
    mock.destroy();
    await server.close();
  });

  it('Get-Printer-Attributes returns printer-state=idle', async () => {
    const resp = await client.getPrinterAttributes();
    const group = resp.groups.find((g) => g.tag === 'printer-attributes-tag')!;
    const state = group.attributes.find((a) => a.name === 'printer-state');
    expect(state?.values[0]).toEqual({ tag: 'enum', value: 'idle' });
  });

  it('Print-Job returns a job-id', async () => {
    const resp = await client.printJob(new Uint8Array([1, 2, 3]), {
      jobName:        'Integration Test',
      documentFormat: 'application/octet-stream',
    });
    const grp   = resp.groups.find((g) => g.tag === 'job-attributes-tag')!;
    const jobId = grp.attributes.find((a) => a.name === 'job-id');
    expect(jobId?.values[0]).toMatchObject({ tag: 'integer' });
  });

  it('job auto-completes and printer returns to idle', async () => {
    await client.printJob(new Uint8Array([1]), { documentFormat: 'application/octet-stream' });
    // Give the state machine time to run
    await new Promise((r) => setTimeout(r, 100));

    const resp  = await client.getPrinterAttributes({ requestedAttributes: ['printer-state'] });
    const group = resp.groups.find((g) => g.tag === 'printer-attributes-tag')!;
    const state = group.attributes.find((a) => a.name === 'printer-state');
    expect(state?.values[0]).toEqual({ tag: 'enum', value: 'idle' });
  });

  it('Get-Jobs returns submitted jobs', async () => {
    await client.printJob(new Uint8Array([1]), { documentFormat: 'application/octet-stream' });
    await client.printJob(new Uint8Array([2]), { documentFormat: 'application/octet-stream' });
    const resp = await client.getJobs();
    const jobGroups = resp.groups.filter((g) => g.tag === 'job-attributes-tag');
    expect(jobGroups.length).toBeGreaterThanOrEqual(1); // some may already be completed
  });

  it('Cancel-Job succeeds for pending job', async () => {
    const noAutoMock = new MockPrinter({
      printerUri:      PRINTER_URI_TPL(port),
      autoProcessJobs: false,
    });
    const noAutoServer = new IppServer(noAutoMock);
    const { port: p2 } = await noAutoServer.listen(0, '127.0.0.1');
    noAutoMock['cfg'].printerUri = PRINTER_URI_TPL(p2);
    const c2 = new Printer(PRINTER_URI_TPL(p2), { version: '2.0' }, new NodeTransport());

    try {
      const printResp = await c2.printJob(new Uint8Array([1]), {
        documentFormat: 'application/octet-stream',
      });
      const jobId = (printResp.groups.find((g) => g.tag === 'job-attributes-tag')!
        .attributes.find((a) => a.name === 'job-id')!.values[0] as { value: number }).value;

      await c2.cancelJob(jobId);
      expect(noAutoMock.jobs.get(jobId)!.state).toBe('canceled');
    } finally {
      noAutoMock.destroy();
      await noAutoServer.close();
    }
  });

  it('non-POST returns 405', async () => {
    const url = `http://127.0.0.1:${port}/ipp/printer`;
    const res = await fetch(url, { method: 'GET' });
    expect(res.status).toBe(405);
  });

  it('wrong Content-Type returns 415', async () => {
    const url = `http://127.0.0.1:${port}/ipp/printer`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello',
    });
    expect(res.status).toBe(415);
  });
});
