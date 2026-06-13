// Platform-agnostic binary writer with automatic growth (no Node.js Buffer dependency)

export class IppWriter {
  private buf: Uint8Array;
  private view: DataView;
  private pos: number = 0;

  constructor(initialSize: number = 4096) {
    this.buf = new Uint8Array(initialSize);
    this.view = new DataView(this.buf.buffer);
  }

  get position(): number {
    return this.pos;
  }

  writeU8(value: number): this {
    this.grow(1);
    this.view.setUint8(this.pos, value);
    this.pos++;
    return this;
  }

  writeU16(value: number): this {
    this.grow(2);
    this.view.setUint16(this.pos, value);
    this.pos += 2;
    return this;
  }

  writeI32(value: number): this {
    this.grow(4);
    this.view.setInt32(this.pos, value);
    this.pos += 4;
    return this;
  }

  writeU32(value: number): this {
    this.grow(4);
    this.view.setUint32(this.pos, value);
    this.pos += 4;
    return this;
  }

  writeBytes(bytes: Uint8Array): this {
    this.grow(bytes.length);
    this.buf.set(bytes, this.pos);
    this.pos += bytes.length;
    return this;
  }

  writeString(s: string, encoding: 'utf8' | 'ascii' = 'utf8'): this {
    return this.writeBytes(encodeString(s, encoding));
  }

  /** Write [u16 length][string] */
  writeLengthPrefixedString(s: string, encoding: 'utf8' | 'ascii' = 'utf8'): this {
    const bytes = encodeString(s, encoding);
    this.writeU16(bytes.length);
    return this.writeBytes(bytes);
  }

  /** Write [u16 length][bytes] */
  writeLengthPrefixedBytes(bytes: Uint8Array): this {
    this.writeU16(bytes.length);
    return this.writeBytes(bytes);
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }

  private grow(needed: number): void {
    if (this.pos + needed <= this.buf.length) return;
    const nextSize = Math.max(this.buf.length * 2, this.pos + needed);
    const next = new Uint8Array(nextSize);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }
}

const textEncoder = new TextEncoder();

export function encodeString(s: string, encoding: 'utf8' | 'ascii'): Uint8Array {
  if (encoding === 'ascii') {
    // ASCII: direct charCode mapping, one byte per char
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      bytes[i] = s.charCodeAt(i) & 0xFF;
    }
    return bytes;
  }
  return textEncoder.encode(s);
}
