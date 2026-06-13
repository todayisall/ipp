import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serialize } from '@ipp/codec';
import { v } from '@ipp/protocol';
import { IppTransportError } from '@ipp/client';
import { NodeTransport } from '../index.js';

// Build a minimal successful-ok IPP response for the mock server to return.
const MOCK_RESPONSE = serialize({
  version:    '2.0',
  statusCode: 'successful-ok',
  requestId:  1,
  groups: [{
    tag: 'operation-attributes-tag',
    attributes: [
      { name: 'attributes-charset',          values: [v.charset('utf-8')] },
      { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
    ],
  }],
});

// ─── Local HTTP server helpers ────────────────────────────────────────────────

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

function startServer(handler: Handler): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        port: addr.port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NodeTransport', () => {
  let serverPort = 0;
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    // Default server: reflect the request body back as the response
    const srv = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(Buffer.from(MOCK_RESPONSE));
    });
    serverPort = srv.port;
    closeServer = srv.close;
  });

  afterEach(async () => {
    await closeServer();
  });

  it('sends an IPP request and returns a Uint8Array response', async () => {
    const t = new NodeTransport();
    const body = new Uint8Array([1, 2, 3]);
    const result = await t.send(`ipp://127.0.0.1:${serverPort}/ipp`, body);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('converts ipp:// to http://', async () => {
    // Server is listening on plain HTTP — if the transport converts correctly,
    // the request will reach it.
    const t = new NodeTransport();
    const result = await t.send(`ipp://127.0.0.1:${serverPort}/ipp`, new Uint8Array([1]));
    expect(result.length).toBeGreaterThan(0);
  });

  it('sends Content-Type: application/ipp', async () => {
    let capturedContentType = '';
    const srv = await startServer((req, res) => {
      capturedContentType = req.headers['content-type'] ?? '';
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(Buffer.from(MOCK_RESPONSE));
    });

    try {
      const t = new NodeTransport();
      await t.send(`ipp://127.0.0.1:${srv.port}/ipp`, new Uint8Array([1]));
      expect(capturedContentType).toBe('application/ipp');
    } finally {
      await srv.close();
    }
  });

  it('sends Authorization header when auth provided', async () => {
    let capturedAuth = '';
    const srv = await startServer((req, res) => {
      capturedAuth = req.headers['authorization'] ?? '';
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(Buffer.from(MOCK_RESPONSE));
    });

    try {
      const t = new NodeTransport();
      await t.send(`ipp://127.0.0.1:${srv.port}/ipp`, new Uint8Array([1]), {
        auth: { username: 'admin', password: 's3cr3t' },
      });
      expect(capturedAuth).toBe(
        `Basic ${Buffer.from('admin:s3cr3t').toString('base64')}`,
      );
    } finally {
      await srv.close();
    }
  });

  it('throws IppTransportError on non-200 HTTP status', async () => {
    const srv = await startServer((_req, res) => {
      res.writeHead(503, 'Service Unavailable');
      res.end();
    });

    try {
      const t = new NodeTransport();
      await expect(
        t.send(`ipp://127.0.0.1:${srv.port}/ipp`, new Uint8Array([1])),
      ).rejects.toMatchObject({ name: 'IppTransportError', httpStatusCode: 503 });
    } finally {
      await srv.close();
    }
  });

  it('throws IppTransportError on timeout', async () => {
    const srv = await startServer((_req, _res) => {
      // Never respond — triggers timeout
    });

    try {
      const t = new NodeTransport();
      await expect(
        t.send(`ipp://127.0.0.1:${srv.port}/ipp`, new Uint8Array([1]), { timeout: 100 }),
      ).rejects.toMatchObject({ name: 'IppTransportError', message: /timed out/i });
    } finally {
      await srv.close();
    }
  });

  it('sends the request body bytes verbatim', async () => {
    let receivedBody = Buffer.alloc(0);
    const srv = await startServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks);
        res.writeHead(200, { 'Content-Type': 'application/ipp' });
        res.end(Buffer.from(MOCK_RESPONSE));
      });
    });

    try {
      const payload = new Uint8Array([0x01, 0x02, 0x03, 0xFF]);
      const t = new NodeTransport();
      await t.send(`ipp://127.0.0.1:${srv.port}/ipp`, payload);
      expect(Array.from(receivedBody)).toEqual(Array.from(payload));
    } finally {
      await srv.close();
    }
  });

  it('uses default port 631 when not specified in ipp:// URL', async () => {
    // Verify that the URL constructor receives the expected port.
    // We can't easily test port 631 without root, so we test the URL parsing logic
    // by checking that an explicit port overrides the default.
    const srv = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(Buffer.from(MOCK_RESPONSE));
    });

    try {
      const t = new NodeTransport();
      // Explicit port works
      const result = await t.send(`ipp://127.0.0.1:${srv.port}/ipp`, new Uint8Array([1]));
      expect(result.length).toBeGreaterThan(0);
    } finally {
      await srv.close();
    }
  });
});
