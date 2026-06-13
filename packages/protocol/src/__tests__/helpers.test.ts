import { describe, expect, it } from 'vitest';
import { v } from '../helpers.js';

describe('v helpers', () => {
  it('creates integer value', () => {
    expect(v.integer(42)).toEqual({ tag: 'integer', value: 42 });
  });

  it('creates boolean value', () => {
    expect(v.boolean(true)).toEqual({ tag: 'boolean', value: true });
    expect(v.boolean(false)).toEqual({ tag: 'boolean', value: false });
  });

  it('creates enum value', () => {
    expect(v.enum('idle')).toEqual({ tag: 'enum', value: 'idle' });
  });

  it('creates keyword value', () => {
    expect(v.keyword('auto')).toEqual({ tag: 'keyword', value: 'auto' });
  });

  it('creates uri value', () => {
    expect(v.uri('ipp://printer:631/ipp')).toEqual({ tag: 'uri', value: 'ipp://printer:631/ipp' });
  });

  it('creates charset value', () => {
    expect(v.charset('utf-8')).toEqual({ tag: 'charset', value: 'utf-8' });
  });

  it('creates naturalLanguage value', () => {
    expect(v.naturalLanguage('en-us')).toEqual({ tag: 'naturalLanguage', value: 'en-us' });
  });

  it('creates mimeMediaType value', () => {
    expect(v.mimeMediaType('application/pdf')).toEqual({ tag: 'mimeMediaType', value: 'application/pdf' });
  });

  it('creates text (textWithoutLanguage) value', () => {
    expect(v.text('hello')).toEqual({ tag: 'textWithoutLanguage', value: 'hello' });
  });

  it('creates textLang (textWithLanguage) value', () => {
    expect(v.textLang('zh-cn', '你好')).toEqual({
      tag: 'textWithLanguage',
      value: { lang: 'zh-cn', text: '你好' },
    });
  });

  it('creates name (nameWithoutLanguage) value', () => {
    expect(v.name('printer-1')).toEqual({ tag: 'nameWithoutLanguage', value: 'printer-1' });
  });

  it('creates nameLang (nameWithLanguage) value', () => {
    expect(v.nameLang('en', 'My Printer')).toEqual({
      tag: 'nameWithLanguage',
      value: { lang: 'en', text: 'My Printer' },
    });
  });

  it('creates dateTime value', () => {
    const d = new Date('2024-01-15T10:30:00Z');
    expect(v.dateTime(d)).toEqual({ tag: 'dateTime', value: d });
  });

  it('creates resolution value', () => {
    expect(v.resolution(600, 600, 'dpi')).toEqual({
      tag: 'resolution',
      value: { x: 600, y: 600, unit: 'dpi' },
    });
  });

  it('creates range value', () => {
    expect(v.range(1, 99)).toEqual({ tag: 'rangeOfInteger', value: [1, 99] });
  });

  it('creates collection value', () => {
    const col = { 'media-type': v.keyword('stationery') };
    expect(v.collection(col)).toEqual({ tag: 'collection', value: col });
  });

  it('creates out-of-band values', () => {
    expect(v.noValue()).toEqual({ tag: 'no-value' });
    expect(v.unknown()).toEqual({ tag: 'unknown' });
    expect(v.unsupported()).toEqual({ tag: 'unsupported' });
    expect(v.notSettable()).toEqual({ tag: 'not-settable' });
    expect(v.deleteAttribute()).toEqual({ tag: 'delete-attribute' });
    expect(v.adminDefine()).toEqual({ tag: 'admin-define' });
  });
});
