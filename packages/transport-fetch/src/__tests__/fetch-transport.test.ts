import { describe, expect, it, vi, afterEach } from 'vitest';
import { serialize } from '@ipp/codec';
import { v } from '@ipp/protocol';
import { IppTransportError } from '@ipp/client';
import { FetchTransport } from '../index.js';

const mockResponse = serialize({
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FetchTransport', () => {
  it('converts ipp:// to http://', async () => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url as string);
      return new Response(mockResponse as unknown as BodyInit, { status: 200 });
    });

    const t = new FetchTransport();
    await t.send('ipp://printer:631/ipp', new Uint8Array([1, 2, 3]));
    expect(fetched[0]).toBe('http://printer:631/ipp');
  });

  it('converts ipps:// to https://', async () => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url as string);
      return new Response(mockResponse as unknown as BodyInit, { status: 200 });
    });

    const t = new FetchTransport();
    await t.send('ipps://printer:443/ipp', new Uint8Array([1]));
    expect(fetched[0]).toBe('https://printer:443/ipp');
  });

  it('sets Content-Type: application/ipp', async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      capturedInit = init;
      return new Response(mockResponse as unknown as BodyInit, { status: 200 });
    });

    const t = new FetchTransport();
    await t.send('ipp://printer/ipp', new Uint8Array([1]));
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/ipp');
  });

  it('sets Authorization header when auth provided', async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      capturedInit = init;
      return new Response(mockResponse as unknown as BodyInit, { status: 200 });
    });

    const t = new FetchTransport();
    await t.send('ipp://printer/ipp', new Uint8Array([1]), {
      auth: { username: 'admin', password: 'secret' },
    });
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Basic ${btoa('admin:secret')}`);
  });

  it('throws IppTransportError on non-200 response', async () => {
    vi.stubGlobal('fetch', async () => new Response('Not Found', { status: 404 }));

    const t = new FetchTransport();
    await expect(t.send('ipp://printer/ipp', new Uint8Array([1]))).rejects.toMatchObject({
      name: 'IppTransportError',
      httpStatusCode: 404,
    });
  });

  it('returns Uint8Array of response body', async () => {
    vi.stubGlobal('fetch', async () => new Response(mockResponse as unknown as BodyInit, { status: 200 }));

    const t = new FetchTransport();
    const result = await t.send('ipp://printer/ipp', new Uint8Array([1]));
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });
});
