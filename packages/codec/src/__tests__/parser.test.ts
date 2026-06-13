import { describe, expect, it } from 'vitest';
import { parse } from '../parser.js';

// ─── Minimal message builder helpers ─────────────────────────────────────────

/** Build a minimal valid IPP Get-Printer-Attributes request with given extra attribute bytes */
function buildMessage(attrBytes: number[]): Uint8Array {
  return new Uint8Array([
    0x02, 0x00,         // version 2.0
    0x00, 0x0B,         // operation: Get-Printer-Attributes
    0x00, 0x00, 0x00, 0x01, // request-id: 1
    0x01,               // operation-attributes-tag
    // attributes-charset
    0x47, 0x00, 0x12,   // tag=charset, name-len=18
    ...Array.from(new TextEncoder().encode('attributes-charset')),
    0x00, 0x05,         // value-len=5
    ...Array.from(new TextEncoder().encode('utf-8')),
    // attributes-natural-language
    0x48, 0x00, 0x1B,   // tag=naturalLanguage, name-len=27
    ...Array.from(new TextEncoder().encode('attributes-natural-language')),
    0x00, 0x02,         // value-len=2
    ...Array.from(new TextEncoder().encode('en')),
    ...attrBytes,
    0x03,               // end-of-attributes-tag
  ]);
}

/** Encode a string as [u16 len][bytes] */
function strAttr(tag: number, name: string, value: string, ascii = false): number[] {
  const nameBytes  = Array.from(new TextEncoder().encode(name));
  const valueBytes = ascii
    ? Array.from(value, (c) => c.charCodeAt(0))
    : Array.from(new TextEncoder().encode(value));
  return [
    tag,
    (nameBytes.length >> 8) & 0xFF, nameBytes.length & 0xFF,
    ...nameBytes,
    (valueBytes.length >> 8) & 0xFF, valueBytes.length & 0xFF,
    ...valueBytes,
  ];
}

function intAttr(name: string, value: number): number[] {
  const nameBytes = Array.from(new TextEncoder().encode(name));
  return [
    0x21, // integer
    (nameBytes.length >> 8) & 0xFF, nameBytes.length & 0xFF,
    ...nameBytes,
    0x00, 0x04, // value-len=4
    (value >>> 24) & 0xFF, (value >>> 16) & 0xFF, (value >>> 8) & 0xFF, value & 0xFF,
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parse — message header', () => {
  it('parses version, operation, and requestId', () => {
    const buf = buildMessage([]);
    const msg = parse(buf);
    expect(msg.version).toBe('2.0');
    expect('operation' in msg ? msg.operation : undefined).toBe('Get-Printer-Attributes');
    expect(msg.requestId).toBe(1);
  });

  it('parses 2.0 response status code', () => {
    const buf = new Uint8Array([
      0x02, 0x00,
      0x00, 0x00, // status: successful-ok
      0x00, 0x00, 0x00, 0x01,
      0x03, // end-of-attributes-tag immediately
    ]);
    const msg = parse(buf);
    expect('statusCode' in msg ? msg.statusCode : undefined).toBe('successful-ok');
  });
});

describe('parse — integer', () => {
  it('parses integer attribute', () => {
    const buf = buildMessage(intAttr('copies', 3));
    const msg = parse(buf);
    const opGroup = msg.groups[0]!;
    const copies = opGroup.attributes.find((a) => a.name === 'copies');
    expect(copies?.values[0]).toEqual({ tag: 'integer', value: 3 });
  });
});

describe('parse — boolean', () => {
  it('parses boolean true', () => {
    const nameBytes = Array.from(new TextEncoder().encode('printer-is-accepting-jobs'));
    const buf = buildMessage([
      0x22, // boolean
      (nameBytes.length >> 8) & 0xFF, nameBytes.length & 0xFF,
      ...nameBytes,
      0x00, 0x01, 0x01, // value-len=1, value=true
    ]);
    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'printer-is-accepting-jobs');
    expect(attr?.values[0]).toEqual({ tag: 'boolean', value: true });
  });
});

describe('parse — enum', () => {
  it('resolves known enum to string name', () => {
    const nameBytes = Array.from(new TextEncoder().encode('printer-state'));
    const buf = buildMessage([
      0x23, // enum
      (nameBytes.length >> 8) & 0xFF, nameBytes.length & 0xFF,
      ...nameBytes,
      0x00, 0x04,
      0x00, 0x00, 0x00, 0x03, // idle = 3
    ]);
    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'printer-state');
    expect(attr?.values[0]).toEqual({ tag: 'enum', value: 'idle' });
  });

  it('returns string representation for unknown enum code', () => {
    const nameBytes = Array.from(new TextEncoder().encode('printer-state'));
    const buf = buildMessage([
      0x23,
      (nameBytes.length >> 8) & 0xFF, nameBytes.length & 0xFF,
      ...nameBytes,
      0x00, 0x04,
      0x00, 0x00, 0x00, 0x2A, // code 42, unknown
    ]);
    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'printer-state');
    expect(attr?.values[0]).toEqual({ tag: 'enum', value: '42' });
  });
});

describe('parse — rangeOfInteger', () => {
  it('parses range correctly', () => {
    const nameBytes = Array.from(new TextEncoder().encode('copies-supported'));
    const buf = buildMessage([
      0x33, // rangeOfInteger
      (nameBytes.length >> 8) & 0xFF, nameBytes.length & 0xFF,
      ...nameBytes,
      0x00, 0x08, // value-len=8
      0x00, 0x00, 0x00, 0x01, // lower = 1
      0x00, 0x00, 0x00, 0x63, // upper = 99
    ]);
    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'copies-supported');
    expect(attr?.values[0]).toEqual({ tag: 'rangeOfInteger', value: [1, 99] });
  });
});

describe('parse — resolution', () => {
  it('parses dpi resolution', () => {
    const nameBytes = Array.from(new TextEncoder().encode('printer-resolution'));
    const buf = buildMessage([
      0x32, // resolution
      (nameBytes.length >> 8) & 0xFF, nameBytes.length & 0xFF,
      ...nameBytes,
      0x00, 0x09, // value-len=9
      0x00, 0x00, 0x02, 0x58, // x = 600
      0x00, 0x00, 0x02, 0x58, // y = 600
      0x03,                   // dpi
    ]);
    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'printer-resolution');
    expect(attr?.values[0]).toEqual({ tag: 'resolution', value: { x: 600, y: 600, unit: 'dpi' } });
  });
});

describe('parse — string types', () => {
  it('parses keyword', () => {
    const buf = buildMessage(strAttr(0x44, 'sides', 'one-sided', true));
    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'sides');
    expect(attr?.values[0]).toEqual({ tag: 'keyword', value: 'one-sided' });
  });

  it('parses uri', () => {
    const buf = buildMessage(strAttr(0x45, 'printer-uri', 'ipp://printer/ipp', true));
    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'printer-uri');
    expect(attr?.values[0]).toEqual({ tag: 'uri', value: 'ipp://printer/ipp' });
  });

  it('parses textWithoutLanguage (utf-8)', () => {
    const buf = buildMessage(strAttr(0x41, 'printer-name', '测试打印机'));
    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'printer-name');
    expect(attr?.values[0]).toEqual({ tag: 'textWithoutLanguage', value: '测试打印机' });
  });

  it('parses mimeMediaType', () => {
    const buf = buildMessage(strAttr(0x49, 'document-format', 'application/pdf', true));
    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'document-format');
    expect(attr?.values[0]).toEqual({ tag: 'mimeMediaType', value: 'application/pdf' });
  });
});

describe('parse — textWithLanguage / nameWithLanguage', () => {
  it('parses textWithLanguage', () => {
    const lang   = 'zh-cn';
    const text   = '你好';
    const langBytes  = Array.from(new TextEncoder().encode(lang));
    const textBytes  = Array.from(new TextEncoder().encode(text));
    const nameBytes  = Array.from(new TextEncoder().encode('printer-info'));
    const outerLen   = 2 + langBytes.length + 2 + textBytes.length;

    const buf = buildMessage([
      0x35, // textWithLanguage
      (nameBytes.length >> 8) & 0xFF, nameBytes.length & 0xFF,
      ...nameBytes,
      (outerLen >> 8) & 0xFF, outerLen & 0xFF,
      (langBytes.length >> 8) & 0xFF, langBytes.length & 0xFF,
      ...langBytes,
      (textBytes.length >> 8) & 0xFF, textBytes.length & 0xFF,
      ...textBytes,
    ]);

    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'printer-info');
    expect(attr?.values[0]).toEqual({
      tag: 'textWithLanguage',
      value: { lang: 'zh-cn', text: '你好' },
    });
  });
});

describe('parse — out-of-band values', () => {
  it('parses no-value', () => {
    const nameBytes = Array.from(new TextEncoder().encode('media-default'));
    const buf = buildMessage([
      0x13, // no-value
      (nameBytes.length >> 8) & 0xFF, nameBytes.length & 0xFF,
      ...nameBytes,
      0x00, 0x00, // value-len=0
    ]);
    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'media-default');
    expect(attr?.values[0]).toEqual({ tag: 'no-value' });
  });
});

describe('parse — multi-value attributes', () => {
  it('parses multiple values for the same attribute', () => {
    const nameBytes = Array.from(new TextEncoder().encode('finishings-supported'));
    // First value: staple (4)
    // Second value: punch (5) — empty name
    const buf = buildMessage([
      0x23,
      (nameBytes.length >> 8) & 0xFF, nameBytes.length & 0xFF,
      ...nameBytes,
      0x00, 0x04,
      0x00, 0x00, 0x00, 0x04, // 4 = staple
      0x23, 0x00, 0x00,       // additional value, empty name
      0x00, 0x04,
      0x00, 0x00, 0x00, 0x05, // 5 = punch
    ]);
    const msg = parse(buf);
    const attr = msg.groups[0]!.attributes.find((a) => a.name === 'finishings-supported');
    expect(attr?.values).toHaveLength(2);
    expect(attr?.values[0]).toEqual({ tag: 'enum', value: 'staple' });
    expect(attr?.values[1]).toEqual({ tag: 'enum', value: 'punch' });
  });
});

describe('parse — document data', () => {
  it('captures trailing data as Uint8Array', () => {
    const buf = new Uint8Array([
      0x02, 0x00,
      0x00, 0x02, // Print-Job
      0x00, 0x00, 0x00, 0x01,
      0x01, // operation-attributes-tag
      0x47, 0x00, 0x12, ...Array.from(new TextEncoder().encode('attributes-charset')),
      0x00, 0x05, ...Array.from(new TextEncoder().encode('utf-8')),
      0x48, 0x00, 0x1B, ...Array.from(new TextEncoder().encode('attributes-natural-language')),
      0x00, 0x02, ...Array.from(new TextEncoder().encode('en')),
      0x03, // end-of-attributes
      0xDE, 0xAD, 0xBE, 0xEF, // "document data"
    ]);
    const msg = parse(buf);
    expect(msg.data).toEqual(new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]));
  });
});
