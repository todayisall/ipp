import { describe, expect, it } from 'vitest';
import { v } from '@ipp/protocol';
import type { IppRequestMessage } from '@ipp/protocol';
import { serialize } from '../serializer.js';
import { parse } from '../parser.js';

function makeRequest(overrides: Partial<IppRequestMessage> = {}): IppRequestMessage {
  return {
    version:   '2.0',
    operation: 'Get-Printer-Attributes',
    requestId: 1,
    groups: [{
      tag: 'operation-attributes-tag',
      attributes: [
        { name: 'attributes-charset',          values: [v.charset('utf-8')] },
        { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')] },
        { name: 'printer-uri',                 values: [v.uri('ipp://printer/ipp')] },
      ],
    }],
    ...overrides,
  };
}

describe('serialize — header', () => {
  it('writes version bytes', () => {
    const buf = serialize(makeRequest({ version: '2.0' }));
    expect(buf[0]).toBe(2);
    expect(buf[1]).toBe(0);
  });

  it('writes operation code for Get-Printer-Attributes (0x000B)', () => {
    const buf = serialize(makeRequest());
    const op = (buf[2]! << 8) | buf[3]!;
    expect(op).toBe(0x000B);
  });

  it('writes request-id', () => {
    const buf = serialize(makeRequest({ requestId: 42 }));
    const id = (buf[4]! << 24) | (buf[5]! << 16) | (buf[6]! << 8) | buf[7]!;
    expect(id).toBe(42);
  });

  it('ends with end-of-attributes-tag (0x03)', () => {
    const buf = serialize(makeRequest());
    expect(buf[buf.length - 1]).toBe(0x03);
  });
});

describe('serialize — charset/naturalLanguage ordering', () => {
  it('places attributes-charset first regardless of input order', () => {
    const msg: IppRequestMessage = {
      ...makeRequest(),
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          // Put printer-uri first intentionally
          { name: 'printer-uri',                 values: [v.uri('ipp://printer/ipp')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')] },
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
        ],
      }],
    };
    // Round-trip: parse the serialized output and check attribute order
    const parsed = parse(serialize(msg));
    const opGroup = parsed.groups[0]!;
    expect(opGroup.attributes[0]?.name).toBe('attributes-charset');
    expect(opGroup.attributes[1]?.name).toBe('attributes-natural-language');
  });
});

describe('serialize — value types', () => {
  it('round-trips integer', () => {
    const msg = makeRequest({
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
          { name: 'copies',                      values: [v.integer(5)] },
        ],
      }],
    });
    const parsed = parse(serialize(msg));
    const attr = parsed.groups[0]!.attributes.find((a) => a.name === 'copies');
    expect(attr?.values[0]).toEqual({ tag: 'integer', value: 5 });
  });

  it('round-trips boolean', () => {
    const msg = makeRequest({
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
          { name: 'last-document',               values: [v.boolean(true)] },
        ],
      }],
    });
    const parsed = parse(serialize(msg));
    const attr = parsed.groups[0]!.attributes.find((a) => a.name === 'last-document');
    expect(attr?.values[0]).toEqual({ tag: 'boolean', value: true });
  });

  it('round-trips keyword', () => {
    const msg = makeRequest({
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
          { name: 'sides',                       values: [v.keyword('two-sided-long-edge')] },
        ],
      }],
    });
    const parsed = parse(serialize(msg));
    const attr = parsed.groups[0]!.attributes.find((a) => a.name === 'sides');
    expect(attr?.values[0]).toEqual({ tag: 'keyword', value: 'two-sided-long-edge' });
  });

  it('round-trips rangeOfInteger', () => {
    const msg = makeRequest({
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
          { name: 'copies-supported',            values: [v.range(1, 99)] },
        ],
      }],
    });
    const parsed = parse(serialize(msg));
    const attr = parsed.groups[0]!.attributes.find((a) => a.name === 'copies-supported');
    expect(attr?.values[0]).toEqual({ tag: 'rangeOfInteger', value: [1, 99] });
  });

  it('round-trips resolution', () => {
    const msg = makeRequest({
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
          { name: 'printer-resolution',          values: [v.resolution(600, 600, 'dpi')] },
        ],
      }],
    });
    const parsed = parse(serialize(msg));
    const attr = parsed.groups[0]!.attributes.find((a) => a.name === 'printer-resolution');
    expect(attr?.values[0]).toEqual({ tag: 'resolution', value: { x: 600, y: 600, unit: 'dpi' } });
  });

  it('round-trips textWithLanguage', () => {
    const msg = makeRequest({
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
          { name: 'printer-info',                values: [v.textLang('zh-cn', '打印机')] },
        ],
      }],
    });
    const parsed = parse(serialize(msg));
    const attr = parsed.groups[0]!.attributes.find((a) => a.name === 'printer-info');
    expect(attr?.values[0]).toEqual({ tag: 'textWithLanguage', value: { lang: 'zh-cn', text: '打印机' } });
  });

  it('round-trips no-value', () => {
    const msg = makeRequest({
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
          { name: 'media-default',               values: [v.noValue()] },
        ],
      }],
    });
    const parsed = parse(serialize(msg));
    const attr = parsed.groups[0]!.attributes.find((a) => a.name === 'media-default');
    expect(attr?.values[0]).toEqual({ tag: 'no-value' });
  });

  it('round-trips multi-value attribute', () => {
    const msg = makeRequest({
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
          { name: 'requested-attributes',        values: [v.keyword('printer-state'), v.keyword('copies-supported')] },
        ],
      }],
    });
    const parsed = parse(serialize(msg));
    const attr = parsed.groups[0]!.attributes.find((a) => a.name === 'requested-attributes');
    expect(attr?.values).toHaveLength(2);
    expect(attr?.values[0]).toEqual({ tag: 'keyword', value: 'printer-state' });
    expect(attr?.values[1]).toEqual({ tag: 'keyword', value: 'copies-supported' });
  });

  it('appends document data', () => {
    const data = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const msg: IppRequestMessage = {
      ...makeRequest({ operation: 'Print-Job' }),
      data,
    };
    const buf = serialize(msg);
    // data is appended after end-of-attributes-tag
    const endIdx = buf.indexOf(0x03); // first 0x03 in the IPP body
    // Find the actual end-of-attributes by scanning from the end
    const tail = buf.slice(buf.length - 4);
    expect(tail).toEqual(data);
  });

  it('round-trips enum (printer-state=idle)', () => {
    const msg: IppRequestMessage = {
      version:    '2.0',
      operation:  'Get-Printer-Attributes',
      requestId:  1,
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
          { name: 'printer-state',               values: [v.enum('idle')] },
        ],
      }],
    };
    const parsed = parse(serialize(msg));
    const attr = parsed.groups[0]!.attributes.find((a) => a.name === 'printer-state');
    expect(attr?.values[0]).toEqual({ tag: 'enum', value: 'idle' });
  });
});

describe('serialize — collection', () => {
  it('round-trips a collection value', () => {
    const msg: IppRequestMessage = {
      version:   '2.0',
      operation: 'Print-Job',
      requestId: 1,
      groups: [{
        tag: 'operation-attributes-tag',
        attributes: [
          { name: 'attributes-charset',          values: [v.charset('utf-8')] },
          { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
          { name: 'printer-uri',                 values: [v.uri('ipp://printer/ipp')] },
        ],
      }, {
        tag: 'job-attributes-tag',
        attributes: [
          {
            name: 'media-col',
            values: [v.collection({
              'media-type':   v.keyword('stationery'),
              'media-source': v.keyword('auto'),
            })],
          },
        ],
      }],
    };
    const parsed = parse(serialize(msg));
    const jobGroup = parsed.groups.find((g) => g.tag === 'job-attributes-tag');
    const mediaCol = jobGroup?.attributes.find((a) => a.name === 'media-col');
    expect(mediaCol?.values[0]?.tag).toBe('collection');
    if (mediaCol?.values[0]?.tag === 'collection') {
      expect(mediaCol.values[0].value['media-type']).toEqual({ tag: 'keyword', value: 'stationery' });
      expect(mediaCol.values[0].value['media-source']).toEqual({ tag: 'keyword', value: 'auto' });
    }
  });
});
