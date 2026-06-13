import { describe, expect, it } from 'vitest';
import { IppReader } from '../reader.js';

function makeReader(...bytes: number[]): IppReader {
  return new IppReader(new Uint8Array(bytes));
}

describe('IppReader', () => {
  describe('position / remaining / done', () => {
    it('starts at position 0', () => {
      const r = makeReader(0x01, 0x02);
      expect(r.position).toBe(0);
      expect(r.remaining).toBe(2);
      expect(r.done).toBe(false);
    });

    it('marks done when buffer exhausted', () => {
      const r = makeReader(0xFF);
      r.readU8();
      expect(r.done).toBe(true);
      expect(r.remaining).toBe(0);
    });
  });

  describe('readU8', () => {
    it('reads single byte and advances position', () => {
      const r = makeReader(0xAB, 0xCD);
      expect(r.readU8()).toBe(0xAB);
      expect(r.position).toBe(1);
      expect(r.readU8()).toBe(0xCD);
    });

    it('throws RangeError when past end', () => {
      const r = makeReader();
      expect(() => r.readU8()).toThrow(RangeError);
    });
  });

  describe('readU16 / readI16', () => {
    it('reads big-endian uint16', () => {
      const r = makeReader(0x00, 0x0B); // 11
      expect(r.readU16()).toBe(11);
    });

    it('reads big-endian int16 (negative)', () => {
      const r = makeReader(0xFF, 0xFF); // -1 as int16
      expect(r.readI16()).toBe(-1);
    });
  });

  describe('readI32 / readU32', () => {
    it('reads big-endian int32', () => {
      const r = makeReader(0x00, 0x00, 0x00, 0x04);
      expect(r.readI32()).toBe(4);
    });

    it('reads big-endian int32 (negative)', () => {
      const r = makeReader(0xFF, 0xFF, 0xFF, 0xFF);
      expect(r.readI32()).toBe(-1);
    });

    it('reads large uint32', () => {
      const r = makeReader(0xFF, 0xFF, 0xFF, 0xFF);
      expect(r.readU32()).toBe(4294967295);
    });
  });

  describe('readBytes', () => {
    it('returns exact slice without copying buffer memory', () => {
      const r = makeReader(0x01, 0x02, 0x03, 0x04);
      const bytes = r.readBytes(2);
      expect(bytes).toEqual(new Uint8Array([0x01, 0x02]));
      expect(r.position).toBe(2);
    });
  });

  describe('readString', () => {
    it('reads UTF-8 string', () => {
      const str = '你好'; // 6 bytes in UTF-8
      const encoded = new TextEncoder().encode(str);
      const r = new IppReader(encoded);
      expect(r.readString(encoded.length, 'utf8')).toBe(str);
    });

    it('reads ASCII string', () => {
      const r = makeReader(0x75, 0x74, 0x66, 0x2D, 0x38); // 'utf-8'
      expect(r.readString(5, 'ascii')).toBe('utf-8');
    });
  });

  describe('readLengthPrefixedString', () => {
    it('reads [u16 length][utf8 string]', () => {
      // length=5, 'hello'
      const r = makeReader(0x00, 0x05, 0x68, 0x65, 0x6C, 0x6C, 0x6F);
      expect(r.readLengthPrefixedString()).toBe('hello');
    });

    it('handles zero-length string', () => {
      const r = makeReader(0x00, 0x00);
      expect(r.readLengthPrefixedString()).toBe('');
    });
  });

  describe('readLengthPrefixedBytes', () => {
    it('reads [u16 length][bytes]', () => {
      const r = makeReader(0x00, 0x03, 0xAA, 0xBB, 0xCC);
      const bytes = r.readLengthPrefixedBytes();
      expect(bytes).toEqual(new Uint8Array([0xAA, 0xBB, 0xCC]));
    });
  });

  describe('peekU8', () => {
    it('reads without advancing', () => {
      const r = makeReader(0x42);
      expect(r.peekU8()).toBe(0x42);
      expect(r.position).toBe(0);
    });

    it('throws at end', () => {
      const r = makeReader();
      expect(() => r.peekU8()).toThrow(RangeError);
    });
  });

  describe('peekU16At', () => {
    it('reads u16 at arbitrary offset', () => {
      const r = makeReader(0x00, 0x01, 0x00, 0x00);
      // Advance by 1, then peek at offset 1 (absolute in underlying DataView)
      r.readU8();
      // peekU16At uses absolute buffer offset
      expect(r.peekU16At(1)).toBe(0x0100);
    });
  });

  describe('sliceRemaining', () => {
    it('returns remaining bytes', () => {
      const r = makeReader(0x01, 0x02, 0x03);
      r.readU8();
      expect(r.sliceRemaining()).toEqual(new Uint8Array([0x02, 0x03]));
    });
  });
});
