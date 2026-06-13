import { describe, expect, it } from 'vitest';
import { IppWriter } from '../writer.js';

describe('IppWriter', () => {
  describe('basic writes', () => {
    it('writes U8', () => {
      const w = new IppWriter();
      w.writeU8(0xAB);
      expect(w.toUint8Array()).toEqual(new Uint8Array([0xAB]));
    });

    it('writes U16 big-endian', () => {
      const w = new IppWriter();
      w.writeU16(0x000B); // 11
      expect(w.toUint8Array()).toEqual(new Uint8Array([0x00, 0x0B]));
    });

    it('writes I32 big-endian', () => {
      const w = new IppWriter();
      w.writeI32(4);
      expect(w.toUint8Array()).toEqual(new Uint8Array([0x00, 0x00, 0x00, 0x04]));
    });

    it('writes negative I32', () => {
      const w = new IppWriter();
      w.writeI32(-1);
      expect(w.toUint8Array()).toEqual(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]));
    });

    it('supports method chaining', () => {
      const w = new IppWriter();
      w.writeU8(0x02).writeU8(0x00).writeU16(0x000B);
      expect(w.toUint8Array()).toHaveLength(4);
    });
  });

  describe('writeBytes', () => {
    it('appends byte array', () => {
      const w = new IppWriter();
      w.writeBytes(new Uint8Array([0x01, 0x02, 0x03]));
      expect(w.toUint8Array()).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
    });
  });

  describe('writeLengthPrefixedString', () => {
    it('writes [u16 length][utf8 bytes]', () => {
      const w = new IppWriter();
      w.writeLengthPrefixedString('hello');
      const out = w.toUint8Array();
      expect(out[0]).toBe(0x00);
      expect(out[1]).toBe(0x05); // 'hello' = 5 bytes
      expect(out.slice(2)).toEqual(new TextEncoder().encode('hello'));
    });

    it('writes ASCII-encoded string', () => {
      const w = new IppWriter();
      w.writeLengthPrefixedString('utf-8', 'ascii');
      const out = w.toUint8Array();
      expect(out[1]).toBe(5); // length
      expect(String.fromCharCode(...out.slice(2))).toBe('utf-8');
    });

    it('handles empty string', () => {
      const w = new IppWriter();
      w.writeLengthPrefixedString('');
      expect(w.toUint8Array()).toEqual(new Uint8Array([0x00, 0x00]));
    });
  });

  describe('writeLengthPrefixedBytes', () => {
    it('writes [u16 length][bytes]', () => {
      const w = new IppWriter();
      w.writeLengthPrefixedBytes(new Uint8Array([0xAA, 0xBB]));
      expect(w.toUint8Array()).toEqual(new Uint8Array([0x00, 0x02, 0xAA, 0xBB]));
    });
  });

  describe('auto growth', () => {
    it('grows beyond initial size', () => {
      const w = new IppWriter(4); // tiny initial size
      for (let i = 0; i < 100; i++) w.writeU8(i);
      const out = w.toUint8Array();
      expect(out).toHaveLength(100);
      expect(out[50]).toBe(50);
    });
  });

  describe('position tracking', () => {
    it('tracks written bytes count', () => {
      const w = new IppWriter();
      expect(w.position).toBe(0);
      w.writeU8(0x01);
      expect(w.position).toBe(1);
      w.writeU32(0);
      expect(w.position).toBe(5);
    });
  });
});
