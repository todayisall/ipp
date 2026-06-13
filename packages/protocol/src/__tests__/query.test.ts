import { describe, expect, it } from 'vitest';
import type { IppAttributeGroup, IppMessage } from '../message.js';
import { getAttr, getAttrAllValues, getAttrValue, getAttrValues, getGroup } from '../query.js';
import { v } from '../helpers.js';

const printerGroup: IppAttributeGroup = {
  tag: 'printer-attributes-tag',
  attributes: [
    { name: 'printer-state',       values: [v.enum('idle')] },
    { name: 'printer-make-and-model', values: [v.text('HP LaserJet')] },
    { name: 'copies-supported',    values: [v.range(1, 99)] },
    { name: 'operations-supported', values: [v.enum('Print-Job'), v.enum('Get-Jobs')] },
    { name: 'printer-is-accepting-jobs', values: [v.boolean(true)] },
  ],
};

const mockResponse: IppMessage = {
  version:    '2.0',
  statusCode: 'successful-ok',
  requestId:  1,
  groups: [
    {
      tag: 'operation-attributes-tag',
      attributes: [
        { name: 'attributes-charset',          values: [v.charset('utf-8')] },
        { name: 'attributes-natural-language', values: [v.naturalLanguage('en')] },
      ],
    },
    printerGroup,
  ],
};

describe('getGroup', () => {
  it('finds an existing group', () => {
    const g = getGroup(mockResponse, 'printer-attributes-tag');
    expect(g).toBe(printerGroup);
  });

  it('returns undefined for absent group', () => {
    expect(getGroup(mockResponse, 'job-attributes-tag')).toBeUndefined();
  });
});

describe('getAttr', () => {
  it('finds an attribute by name', () => {
    const a = getAttr(printerGroup, 'printer-state');
    expect(a?.name).toBe('printer-state');
  });

  it('returns undefined for absent attribute', () => {
    expect(getAttr(printerGroup, 'nonexistent')).toBeUndefined();
  });
});

describe('getAttrValue', () => {
  it('returns typed value when tag matches', () => {
    const val = getAttrValue(printerGroup, 'printer-state', 'enum');
    expect(val).toEqual({ tag: 'enum', value: 'idle' });
    // TypeScript should know val.value is string
    if (val) {
      const _s: string = val.value;
      expect(_s).toBe('idle');
    }
  });

  it('returns undefined when tag does not match', () => {
    // 'printer-state' is 'enum', asking for 'keyword' → undefined
    const val = getAttrValue(printerGroup, 'printer-state', 'keyword');
    expect(val).toBeUndefined();
  });

  it('returns undefined for absent attribute', () => {
    expect(getAttrValue(printerGroup, 'nonexistent', 'integer')).toBeUndefined();
  });

  it('reads boolean attribute', () => {
    const val = getAttrValue(printerGroup, 'printer-is-accepting-jobs', 'boolean');
    expect(val?.value).toBe(true);
  });

  it('reads rangeOfInteger attribute', () => {
    const val = getAttrValue(printerGroup, 'copies-supported', 'rangeOfInteger');
    expect(val?.value).toEqual([1, 99]);
  });
});

describe('getAttrValues', () => {
  it('returns all values of matching tag', () => {
    const vals = getAttrValues(printerGroup, 'operations-supported', 'enum');
    expect(vals).toHaveLength(2);
    expect(vals.map((v) => v.value)).toEqual(['Print-Job', 'Get-Jobs']);
  });

  it('returns empty array for absent attribute', () => {
    expect(getAttrValues(printerGroup, 'nonexistent', 'enum')).toEqual([]);
  });

  it('filters out non-matching tags', () => {
    // operations-supported has enum values; asking for keyword should return []
    const vals = getAttrValues(printerGroup, 'operations-supported', 'keyword');
    expect(vals).toHaveLength(0);
  });
});

describe('getAttrAllValues', () => {
  it('returns all values regardless of tag', () => {
    const vals = getAttrAllValues(printerGroup, 'operations-supported');
    expect(vals).toHaveLength(2);
  });

  it('returns empty array for absent attribute', () => {
    expect(getAttrAllValues(printerGroup, 'nonexistent')).toEqual([]);
  });
});
