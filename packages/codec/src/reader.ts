// Platform-agnostic binary reader using DataView (no Node.js Buffer dependency)

export class IppReader {
  private readonly view: DataView;
  private pos: number = 0;

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  get position(): number {
    return this.pos;
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  get done(): boolean {
    return this.pos >= this.buf.length;
  }

  peekU8(): number {
    if (this.done) throw new RangeError(`IppReader: peek past end at ${this.pos}`);
    return this.view.getUint8(this.pos);
  }

  peekU16At(offset: number): number {
    return this.view.getUint16(offset);
  }

  readU8(): number {
    this.assertRemaining(1);
    return this.view.getUint8(this.pos++);
  }

  readI16(): number {
    this.assertRemaining(2);
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }

  readU16(): number {
    this.assertRemaining(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }

  readI32(): number {
    this.assertRemaining(4);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }

  readU32(): number {
    this.assertRemaining(4);
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }

  readBytes(length: number): Uint8Array {
    this.assertRemaining(length);
    const slice = this.buf.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  readString(length: number, encoding: 'utf8' | 'ascii' = 'utf8'): string {
    const bytes = this.readBytes(length);
    return decodeString(bytes, encoding);
  }

  /** Read [u16 length][string] */
  readLengthPrefixedString(encoding: 'utf8' | 'ascii' = 'utf8'): string {
    const length = this.readU16();
    if (length === 0) return '';
    return this.readString(length, encoding);
  }

  /** Read [u16 length][bytes] */
  readLengthPrefixedBytes(): Uint8Array {
    const length = this.readU16();
    return this.readBytes(length);
  }

  /** Return a Uint8Array view of the remaining bytes from the current position */
  sliceRemaining(): Uint8Array {
    return this.buf.subarray(this.pos);
  }

  private assertRemaining(n: number): void {
    if (this.remaining < n) {
      throw new RangeError(
        `IppReader: need ${n} bytes at offset ${this.pos}, only ${this.remaining} remain`,
      );
    }
  }
}

const textDecoder = new TextDecoder('utf-8');

function decodeString(bytes: Uint8Array, encoding: 'utf8' | 'ascii'): string {
  if (encoding === 'ascii') {
    // ASCII: direct charCode mapping (safe for IPP keyword/uri/charset values)
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
      s += String.fromCharCode(bytes[i] as number);
    }
    return s;
  }
  return textDecoder.decode(bytes);
}
