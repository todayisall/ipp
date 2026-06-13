/**
 * Snapshot tests against committed binary fixtures.
 *
 * Each .bin file is a static RFC 8010-compliant IPP message.  If the parser
 * output for a known-good binary ever changes, the snapshot will fail and
 * force an intentional review + update.
 *
 * To regenerate the .bin files (only needed after deliberate format changes):
 *   node packages/codec/src/__tests__/generate-fixtures.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parser.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

function loadFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

// ─── Helpers for readable snapshots ───────────────────────────────────────────

/** Replace Uint8Array buffers in a parsed message with a readable hex string. */
function normalizeForSnapshot(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return `<Uint8Array ${value.length}b: ${Buffer.from(value).toString('hex')}>`;
  }
  if (value instanceof Date) {
    return `<Date ${value.toISOString()}>`;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeForSnapshot);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normalizeForSnapshot(v)]),
    );
  }
  return value;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('fixture: get-printer-attrs-req.bin', () => {
  it('parses to the expected structure (snapshot)', () => {
    const msg = parse(loadFixture('get-printer-attrs-req.bin'));
    expect(normalizeForSnapshot(msg)).toMatchSnapshot();
  });

  it('is a request with operation Get-Printer-Attributes', () => {
    const msg = parse(loadFixture('get-printer-attrs-req.bin'));
    expect('operation' in msg && msg.operation).toBe('Get-Printer-Attributes');
    expect(msg.version).toBe('1.1');
    expect(msg.requestId).toBe(1);
  });

  it('contains expected operation attributes', () => {
    const msg = parse(loadFixture('get-printer-attrs-req.bin'));
    const opGroup = msg.groups.find((g) => g.tag === 'operation-attributes-tag')!;
    expect(opGroup).toBeDefined();

    const charset = opGroup.attributes.find((a) => a.name === 'attributes-charset');
    expect(charset?.values[0]).toEqual({ tag: 'charset', value: 'utf-8' });

    const lang = opGroup.attributes.find((a) => a.name === 'attributes-natural-language');
    expect(lang?.values[0]).toEqual({ tag: 'naturalLanguage', value: 'en-us' });

    const printerUri = opGroup.attributes.find((a) => a.name === 'printer-uri');
    expect(printerUri?.values[0]).toEqual({
      tag: 'uri',
      value: 'ipp://printer.local:631/ipp/printer',
    });

    const requested = opGroup.attributes.find((a) => a.name === 'requested-attributes');
    expect(requested?.values).toHaveLength(5);
    expect(requested?.values.map((v) => (v as { value: string }).value)).toContain('printer-state');
  });
});

describe('fixture: get-printer-attrs-res.bin', () => {
  it('parses to the expected structure (snapshot)', () => {
    const msg = parse(loadFixture('get-printer-attrs-res.bin'));
    expect(normalizeForSnapshot(msg)).toMatchSnapshot();
  });

  it('is a successful-ok response', () => {
    const msg = parse(loadFixture('get-printer-attrs-res.bin'));
    expect('statusCode' in msg && msg.statusCode).toBe('successful-ok');
    expect(msg.version).toBe('1.1');
    expect(msg.requestId).toBe(1);
  });

  it('contains printer-attributes-tag with printer-state=idle', () => {
    const msg = parse(loadFixture('get-printer-attrs-res.bin'));
    const printerGroup = msg.groups.find((g) => g.tag === 'printer-attributes-tag')!;
    expect(printerGroup).toBeDefined();

    const state = printerGroup.attributes.find((a) => a.name === 'printer-state');
    expect(state?.values[0]).toEqual({ tag: 'enum', value: 'idle' });

    const reasons = printerGroup.attributes.find((a) => a.name === 'printer-state-reasons');
    expect(reasons?.values[0]).toEqual({ tag: 'keyword', value: 'none' });

    const model = printerGroup.attributes.find((a) => a.name === 'printer-make-and-model');
    expect(model?.values[0]).toEqual({ tag: 'textWithoutLanguage', value: 'HP LaserJet Pro MFP M428' });

    const mediaReady = printerGroup.attributes.find((a) => a.name === 'media-ready');
    expect(mediaReady?.values).toHaveLength(2);
    expect(mediaReady?.values[0]).toEqual({ tag: 'keyword', value: 'iso_a4_210x297mm' });

    const copies = printerGroup.attributes.find((a) => a.name === 'copies-supported');
    expect(copies?.values[0]).toEqual({ tag: 'rangeOfInteger', value: [1, 99] });
  });
});

describe('fixture: print-job-req.bin', () => {
  it('parses to the expected structure (snapshot)', () => {
    const msg = parse(loadFixture('print-job-req.bin'));
    expect(normalizeForSnapshot(msg)).toMatchSnapshot();
  });

  it('is a Print-Job request with job and document data', () => {
    const msg = parse(loadFixture('print-job-req.bin'));
    expect('operation' in msg && msg.operation).toBe('Print-Job');
    expect(msg.version).toBe('2.0');
    expect(msg.requestId).toBe(42);
    expect(msg.data).toBeDefined();
    expect(msg.data!.length).toBeGreaterThan(0);
  });

  it('carries job attributes', () => {
    const msg = parse(loadFixture('print-job-req.bin'));
    const jobGroup = msg.groups.find((g) => g.tag === 'job-attributes-tag')!;
    expect(jobGroup).toBeDefined();

    const copies = jobGroup.attributes.find((a) => a.name === 'copies');
    expect(copies?.values[0]).toEqual({ tag: 'integer', value: 2 });

    const sides = jobGroup.attributes.find((a) => a.name === 'sides');
    expect(sides?.values[0]).toEqual({ tag: 'keyword', value: 'two-sided-long-edge' });
  });
});

describe('fixture: print-job-res.bin', () => {
  it('parses to the expected structure (snapshot)', () => {
    const msg = parse(loadFixture('print-job-res.bin'));
    expect(normalizeForSnapshot(msg)).toMatchSnapshot();
  });

  it('contains job-id and job-state in job-attributes-tag', () => {
    const msg = parse(loadFixture('print-job-res.bin'));
    const jobGroup = msg.groups.find((g) => g.tag === 'job-attributes-tag')!;
    expect(jobGroup).toBeDefined();

    const jobId = jobGroup.attributes.find((a) => a.name === 'job-id');
    expect(jobId?.values[0]).toEqual({ tag: 'integer', value: 7 });

    const jobState = jobGroup.attributes.find((a) => a.name === 'job-state');
    expect(jobState?.values[0]).toEqual({ tag: 'enum', value: 'pending' });
  });
});

describe('fixture: collection-media-col.bin', () => {
  it('parses to the expected structure (snapshot)', () => {
    const msg = parse(loadFixture('collection-media-col.bin'));
    expect(normalizeForSnapshot(msg)).toMatchSnapshot();
  });

  it('contains a media-col collection with nested media-size', () => {
    const msg = parse(loadFixture('collection-media-col.bin'));
    const jobGroup = msg.groups.find((g) => g.tag === 'job-attributes-tag')!;
    expect(jobGroup).toBeDefined();

    const mediaCol = jobGroup.attributes.find((a) => a.name === 'media-col');
    expect(mediaCol?.values[0]?.tag).toBe('collection');

    const col = (mediaCol?.values[0] as { tag: 'collection'; value: object }).value as Record<string, unknown>;
    expect(col['media-type']).toEqual({ tag: 'keyword', value: 'stationery' });
    expect(col['media-source']).toEqual({ tag: 'keyword', value: 'main' });

    const mediaSize = col['media-size'] as { tag: 'collection'; value: Record<string, unknown> };
    expect(mediaSize.tag).toBe('collection');
    expect(mediaSize.value['x-dimension']).toEqual({ tag: 'integer', value: 21000 });
    expect(mediaSize.value['y-dimension']).toEqual({ tag: 'integer', value: 29700 });
  });
});
