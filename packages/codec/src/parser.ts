// RFC 8010 §3 — IPP binary message parser
// Input: Uint8Array (platform-agnostic)
// Output: IppMessage (fully typed)

import {
  type GroupTagName,
  type IppAttribute,
  type IppAttributeGroup,
  type IppCollection,
  type IppMessage,
  type IppValue,
  type IppVersion,
  type StatusCodeName,
  EnumRegistry,
  GroupTagByte,
  ValueTag,
  byteToGroupTag,
  bytesToVersion,
  resolveOperationName,
  resolveStatusName,
} from '@ipp/protocol';
import { IppReader } from './reader.js';

export class IppParseError extends Error {
  constructor(
    message: string,
    public readonly offset?: number,
  ) {
    super(offset !== undefined ? `${message} (at offset 0x${offset.toString(16)})` : message);
    this.name = 'IppParseError';
  }
}

/** Parse a binary IPP message into a typed IppMessage object. */
export function parse(buf: Uint8Array): IppMessage {
  const r = new IppReader(buf);

  const versionMajor = r.readU8();
  const versionMinor = r.readU8();
  const version: IppVersion = bytesToVersion(versionMajor, versionMinor)
    ?? (`${versionMajor}.${versionMinor}` as IppVersion);

  // Bytes [2-3]: operation code (request) or status code (response)
  // RFC 8010 §3.4: values 0x0002–0x8FFF are operations; 0x0000–0x0FFF are status codes.
  // Six values (0x0002–0x0007) overlap — we emit both fields and let the caller discard one.
  const opOrStatus = r.readU16();
  const requestId = r.readU32();

  const groups = parseGroups(r);
  const data = r.remaining > 0 ? r.sliceRemaining() : undefined;

  const base = { version, requestId, groups, data };

  const isStatusRange = opOrStatus <= 0x00FF || opOrStatus >= 0x0400;
  const isOpRange = opOrStatus >= 0x0002 && opOrStatus <= 0x8FFF;

  if (isOpRange && !isStatusRange) {
    return { ...base, operation: resolveOperationName(opOrStatus) };
  }
  if (isStatusRange && !isOpRange) {
    return { ...base, statusCode: resolveStatusName(opOrStatus) as StatusCodeName };
  }
  // Ambiguous range — provide both; caller discards the irrelevant one
  return {
    ...base,
    operation:  resolveOperationName(opOrStatus),
    statusCode: resolveStatusName(opOrStatus) as StatusCodeName,
  } as unknown as IppMessage;
}

// ─── Group parsing ────────────────────────────────────────────────────────────

function parseGroups(r: IppReader): IppAttributeGroup[] {
  const groups: IppAttributeGroup[] = [];

  while (!r.done) {
    const tagByte = r.peekU8();

    // 0x03 = end-of-attributes-tag
    if (tagByte === GroupTagByte['end-of-attributes-tag']) {
      r.readU8();
      break;
    }

    const tag = byteToGroupTag(tagByte);
    if (tag === undefined) {
      // Not a known group tag and not end-of-attributes — stop (data follows)
      break;
    }

    r.readU8(); // consume group tag byte
    groups.push({ tag, attributes: parseAttributes(r) });
  }

  return groups;
}

function parseAttributes(r: IppReader): IppAttribute[] {
  const attrs: IppAttribute[] = [];

  while (!r.done) {
    const peek = r.peekU8();

    // Group tag byte (0x01–0x0F) or end-of-attributes (0x03) → stop reading this group
    if (peek <= 0x0F) break;

    // memberAttrName (0x4A) is handled inside parseCollection — should not appear here
    if (peek === ValueTag.memberAttrName) break;

    attrs.push(parseAttribute(r));
  }

  return attrs;
}

function parseAttribute(r: IppReader): IppAttribute {
  const offset = r.position;
  const tagByte = r.readU8();
  const name = r.readLengthPrefixedString('ascii');

  if (!name) {
    throw new IppParseError('First attribute value must have a non-empty name', offset);
  }

  const firstValue = parseValue(r, tagByte, name);
  const values: IppValue[] = [firstValue];

  // Additional values for the same attribute: same pattern with empty name (length 0)
  while (!r.done && isAdditionalValue(r)) {
    const nextTag = r.readU8();
    r.readU16(); // empty name length (0x0000)
    values.push(parseValue(r, nextTag, name));
  }

  return { name, values };
}

/**
 * An "additional value" is a value-tag byte followed immediately by a zero-length name.
 * We check: next byte is not a delimiter AND the two bytes after it are 0x00 0x00.
 */
function isAdditionalValue(r: IppReader): boolean {
  const peek = r.peekU8();

  // Delimiters / special bytes that end value sequences
  if (peek <= 0x0F) return false;             // group delimiter
  if (peek === ValueTag.endCollection) return false; // 0x37
  if (peek === ValueTag.memberAttrName) return false; // 0x4A

  // Next two bytes (at pos+1, pos+2) must be 0x0000 (empty name)
  const pos = r.position;
  return r.peekU16At(pos + 1) === 0x0000;
}

// ─── Value parsing ────────────────────────────────────────────────────────────

function parseValue(r: IppReader, tagByte: number, attrName: string): IppValue {
  switch (tagByte) {
    // ── Integer family ──────────────────────────────────────────────────────
    case ValueTag.integer: {
      r.readU16(); // value-length = 4
      return { tag: 'integer', value: r.readI32() };
    }

    case ValueTag.boolean: {
      r.readU16(); // value-length = 1
      return { tag: 'boolean', value: r.readU8() !== 0 };
    }

    case ValueTag.enum: {
      r.readU16(); // value-length = 4
      const code = r.readU32();
      const name = EnumRegistry.lookup(attrName, code);
      // Unknown enum → return string representation of the code (Q1 decision)
      return { tag: 'enum', value: name ?? String(code) };
    }

    // ── Octet-string family ─────────────────────────────────────────────────
    case ValueTag.rangeOfInteger: {
      r.readU16(); // value-length = 8
      const lower = r.readI32();
      const upper = r.readI32();
      return { tag: 'rangeOfInteger', value: [lower, upper] };
    }

    case ValueTag.resolution: {
      r.readU16(); // value-length = 9
      const x    = r.readI32();
      const y    = r.readI32();
      const unit = r.readU8() === 0x03 ? 'dpi' : 'dpcm';
      return { tag: 'resolution', value: { x, y, unit } };
    }

    case ValueTag.dateTime: {
      r.readU16(); // value-length = 11
      return { tag: 'dateTime', value: parseDateTimeBytes(r) };
    }

    case ValueTag.octetString: {
      const bytes = r.readLengthPrefixedBytes();
      return { tag: 'octetString', value: bytes };
    }

    case ValueTag.begCollection: {
      r.readU16(); // value-length (spec says present but can be ignored, always 0)
      return { tag: 'collection', value: parseCollection(r) };
    }

    // ── Language-tagged strings ─────────────────────────────────────────────
    case ValueTag.textWithLanguage: {
      r.readU16(); // outer value-length (sum of inner length fields)
      const lang = r.readLengthPrefixedString('ascii');
      const text = r.readLengthPrefixedString('utf8');
      return { tag: 'textWithLanguage', value: { lang, text } };
    }

    case ValueTag.nameWithLanguage: {
      r.readU16(); // outer value-length
      const lang = r.readLengthPrefixedString('ascii');
      const text = r.readLengthPrefixedString('utf8');
      return { tag: 'nameWithLanguage', value: { lang, text } };
    }

    // ── Character-string family ─────────────────────────────────────────────
    case ValueTag.textWithoutLanguage:
      return { tag: 'textWithoutLanguage', value: r.readLengthPrefixedString('utf8') };

    case ValueTag.nameWithoutLanguage:
      return { tag: 'nameWithoutLanguage', value: r.readLengthPrefixedString('utf8') };

    case ValueTag.keyword:
      return { tag: 'keyword', value: r.readLengthPrefixedString('ascii') };

    case ValueTag.uri:
      return { tag: 'uri', value: r.readLengthPrefixedString('ascii') };

    case ValueTag.uriScheme:
      return { tag: 'uriScheme', value: r.readLengthPrefixedString('ascii') };

    case ValueTag.charset:
      return { tag: 'charset', value: r.readLengthPrefixedString('ascii') };

    case ValueTag.naturalLanguage:
      return { tag: 'naturalLanguage', value: r.readLengthPrefixedString('ascii') };

    case ValueTag.mimeMediaType:
      return { tag: 'mimeMediaType', value: r.readLengthPrefixedString('ascii') };

    // ── Out-of-band values ──────────────────────────────────────────────────
    case ValueTag['no-value']:
      r.readU16(); // value-length = 0
      return { tag: 'no-value' };

    case ValueTag.unsupported:
      r.readU16();
      return { tag: 'unsupported' };

    case ValueTag.unknown:
      r.readU16();
      return { tag: 'unknown' };

    case ValueTag.default:
      r.readU16();
      return { tag: 'default' };

    case ValueTag['not-settable']:
      r.readU16();
      return { tag: 'not-settable' };

    case ValueTag['delete-attribute']:
      r.readU16();
      return { tag: 'delete-attribute' };

    case ValueTag['admin-define']:
      r.readU16();
      return { tag: 'admin-define' };

    // ── Extension / unknown (0x7F = 4-byte extended tag follows) ───────────
    case ValueTag.extension: {
      // RFC 8010 §3.5.2: 0x7F tag is followed by a 4-byte extension tag value
      const extTag = r.readU32();
      const bytes  = r.readLengthPrefixedBytes();
      console.warn(
        `[ipp/codec] Unknown extension tag 0x${extTag.toString(16).padStart(8, '0')} ` +
        `for attribute '${attrName}', treating as octetString`,
      );
      return { tag: 'octetString', value: bytes };
    }

    default: {
      // Unknown tag — skip value bytes and return as octetString
      const bytes = r.readLengthPrefixedBytes();
      console.warn(
        `[ipp/codec] Unknown value tag 0x${tagByte.toString(16).padStart(2, '0')} ` +
        `for attribute '${attrName}', treating as octetString`,
      );
      return { tag: 'octetString', value: bytes };
    }
  }
}

// ─── Collection parsing (RFC 3382) ───────────────────────────────────────────

function parseCollection(r: IppReader): IppCollection {
  const collection: Record<string, IppValue | IppValue[]> = {};

  while (!r.done) {
    const peek = r.peekU8();

    if (peek === ValueTag.endCollection) { // 0x37
      r.readU8();    // endCollection tag
      r.readU16();   // name-length (always 0)
      r.readU16();   // value-length (always 0, but spec says may have content in future)
      break;
    }

    if (peek !== ValueTag.memberAttrName) { // 0x4A
      throw new IppParseError(
        `Expected memberAttrName (0x4A) or endCollection (0x37), got 0x${peek.toString(16)}`,
        r.position,
      );
    }

    // Read the member attribute name
    r.readU8();    // memberAttrName tag (0x4A)
    r.readU16();   // name-length of the memberAttrName tag itself (always 0)
    const memberName = r.readLengthPrefixedString('ascii');

    // Read the member value tag + value
    const valueTag = r.readU8();
    r.readU16(); // name-length (always 0 for member values)
    const firstValue = parseValue(r, valueTag, memberName);

    const values: IppValue[] = [firstValue];
    while (!r.done && isAdditionalValue(r)) {
      const nextTag = r.readU8();
      r.readU16(); // empty name
      values.push(parseValue(r, nextTag, memberName));
    }

    collection[memberName] = values.length === 1 ? values[0]! : values;
  }

  return collection;
}

// ─── DateTime parsing (RFC 1903 / SNMPv2) ────────────────────────────────────

function parseDateTimeBytes(r: IppReader): Date {
  // RFC 8010 uses DateAndTime from RFC 1903 (11 bytes):
  // year(2) month(1) day(1) hour(1) minute(1) second(1) deci-second(1)
  // direction(1) hours-from-utc(1) minutes-from-utc(1)
  const year    = r.readU16();
  const month   = r.readU8();   // 1–12
  const day     = r.readU8();   // 1–31
  const hour    = r.readU8();
  const minute  = r.readU8();
  const second  = r.readU8();
  const deci    = r.readU8();   // deci-seconds (0–9)
  const dir     = String.fromCharCode(r.readU8()); // '+' or '-'
  const tzHours = r.readU8();
  const tzMins  = r.readU8();

  const ms = deci * 100;
  const tzOffsetMin = (dir === '-' ? -1 : 1) * (tzHours * 60 + tzMins);

  // Build ISO 8601 string for reliable parsing
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const tzSign = dir === '-' ? '-' : '+';
  const iso =
    `${pad(year, 4)}-${pad(month)}-${pad(day)}T` +
    `${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(ms, 3)}` +
    `${tzSign}${pad(tzHours)}:${pad(tzMins)}`;

  void tzOffsetMin; // included via ISO string
  return new Date(iso);
}
