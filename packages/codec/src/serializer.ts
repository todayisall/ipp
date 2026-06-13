// RFC 8010 §3 — IPP binary message serializer
// Input: IppRequestMessage | IppResponseMessage
// Output: Uint8Array (platform-agnostic)

import {
  type GroupTagName,
  type IppAttribute,
  type IppAttributeGroup,
  type IppCollection,
  type IppMessage,
  type IppValue,
  EnumRegistry,
  GroupTagByte,
  ValueTag,
  VersionByte,
  resolveOperationCode,
  resolveStatusCode,
  valueTagToByte,
} from '@ipp/protocol';
import { IppWriter, encodeString } from './writer.js';

export class IppSerializeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IppSerializeError';
  }
}

/** Serialize an IPP request or response message to binary. */
export function serialize(msg: IppMessage): Uint8Array {
  const w = new IppWriter();
  serializeMessage(w, msg);
  return w.toUint8Array();
}

// ─── Message ──────────────────────────────────────────────────────────────────

function serializeMessage(w: IppWriter, msg: IppMessage): void {
  // Version
  const ver = VersionByte[msg.version ?? '2.0'];
  w.writeU8(ver[0]).writeU8(ver[1]);

  // Operation code or status code
  if ('operation' in msg && msg.operation !== undefined) {
    w.writeU16(resolveOperationCode(msg.operation));
  } else if ('statusCode' in msg && msg.statusCode !== undefined) {
    w.writeU16(resolveStatusCode(msg.statusCode));
  } else {
    throw new IppSerializeError('Message must have either operation or statusCode');
  }

  // Request ID
  w.writeU32(msg.requestId);

  // Attribute groups in canonical order
  const ORDER: GroupTagName[] = [
    'operation-attributes-tag',
    'job-attributes-tag',
    'printer-attributes-tag',
    'subscription-attributes-tag',
    'event-notification-attributes-tag',
    'document-attributes-tag',
    'system-attributes-tag',
    'unsupported-attributes-tag',
  ];

  for (const tagName of ORDER) {
    const group = msg.groups.find((g) => g.tag === tagName);
    if (group) serializeGroup(w, group);
  }

  // Any groups not in the canonical order list (e.g. vendor extensions)
  for (const group of msg.groups) {
    if (!ORDER.includes(group.tag)) serializeGroup(w, group);
  }

  w.writeU8(GroupTagByte['end-of-attributes-tag']); // 0x03

  if (msg.data) w.writeBytes(msg.data);
}

// ─── Group ────────────────────────────────────────────────────────────────────

function serializeGroup(w: IppWriter, group: IppAttributeGroup): void {
  w.writeU8(GroupTagByte[group.tag]);

  // RFC 8010 §3.7: 'attributes-charset' and 'attributes-natural-language'
  // MUST be the first two attributes in the operation-attributes group.
  let attrs = group.attributes as IppAttribute[];
  if (group.tag === 'operation-attributes-tag') {
    attrs = [
      ...attrs.filter((a) => a.name === 'attributes-charset'),
      ...attrs.filter((a) => a.name === 'attributes-natural-language'),
      ...attrs.filter(
        (a) => a.name !== 'attributes-charset' && a.name !== 'attributes-natural-language',
      ),
    ];
  }

  for (const attr of attrs) serializeAttribute(w, attr);
}

// ─── Attribute ────────────────────────────────────────────────────────────────

function serializeAttribute(w: IppWriter, attr: IppAttribute): void {
  if (attr.values.length === 0) {
    throw new IppSerializeError(`Attribute '${attr.name}' has no values`);
  }

  for (let i = 0; i < attr.values.length; i++) {
    const val = attr.values[i] as IppValue;
    w.writeU8(resolveValueTagByte(val));

    if (i === 0) {
      w.writeLengthPrefixedString(attr.name, 'ascii');
    } else {
      w.writeU16(0x0000); // empty name for additional values
    }

    serializeValue(w, val, attr.name);
  }
}

function resolveValueTagByte(val: IppValue): number {
  const byte = valueTagToByte[val.tag];
  if (byte === undefined) {
    throw new IppSerializeError(`No tag byte mapping for value tag '${val.tag}'`);
  }
  return byte;
}

// ─── Value ────────────────────────────────────────────────────────────────────

function serializeValue(w: IppWriter, val: IppValue, attrName: string): void {
  switch (val.tag) {
    case 'integer':
      w.writeU16(4).writeI32(val.value);
      return;

    case 'boolean':
      w.writeU16(1).writeU8(val.value ? 1 : 0);
      return;

    case 'enum': {
      const code = EnumRegistry.resolve(attrName, val.value);
      if (code === undefined) {
        // Try parsing the value as a numeric string (handles unknown enum round-trips)
        const numeric = Number(val.value);
        if (!Number.isNaN(numeric)) {
          w.writeU16(4).writeI32(numeric);
          return;
        }
        throw new IppSerializeError(
          `Unknown enum value '${val.value}' for attribute '${attrName}'`,
        );
      }
      w.writeU16(4).writeI32(code);
      return;
    }

    case 'rangeOfInteger':
      w.writeU16(8).writeI32(val.value[0]).writeI32(val.value[1]);
      return;

    case 'resolution':
      w.writeU16(9)
        .writeI32(val.value.x)
        .writeI32(val.value.y)
        .writeU8(val.value.unit === 'dpi' ? 0x03 : 0x04);
      return;

    case 'dateTime':
      w.writeU16(11);
      serializeDateTimeBytes(w, val.value);
      return;

    case 'textWithLanguage':
    case 'nameWithLanguage': {
      const langBytes = encodeString(val.value.lang, 'ascii');
      const textBytes = encodeString(val.value.text, 'utf8');
      // outer value-length = 2 (lang-len field) + lang + 2 (text-len field) + text
      w.writeU16(2 + langBytes.length + 2 + textBytes.length);
      w.writeU16(langBytes.length).writeBytes(langBytes);
      w.writeU16(textBytes.length).writeBytes(textBytes);
      return;
    }

    case 'textWithoutLanguage':
    case 'nameWithoutLanguage':
      w.writeLengthPrefixedString(val.value, 'utf8');
      return;

    case 'keyword':
    case 'uri':
    case 'uriScheme':
    case 'charset':
    case 'naturalLanguage':
    case 'mimeMediaType':
      w.writeLengthPrefixedString(val.value, 'ascii');
      return;

    case 'octetString':
      w.writeLengthPrefixedBytes(val.value);
      return;

    case 'collection':
      w.writeU16(0); // begCollection value-length is always 0
      serializeCollection(w, val.value, attrName);
      return;

    // Out-of-band — empty value
    case 'no-value':
    case 'unsupported':
    case 'unknown':
    case 'default':
    case 'not-settable':
    case 'delete-attribute':
    case 'admin-define':
      w.writeU16(0);
      return;
  }
}

// ─── Collection (RFC 3382) ────────────────────────────────────────────────────

function serializeCollection(w: IppWriter, col: IppCollection, _parentAttrName: string): void {
  for (const [memberName, memberVal] of Object.entries(col)) {
    const valArray = Array.isArray(memberVal) ? memberVal : [memberVal];

    for (let i = 0; i < valArray.length; i++) {
      const val = valArray[i] as IppValue;

      if (i === 0) {
        // memberAttrName entry: tag=0x4A, name-len=0, value=[memberName]
        w.writeU8(ValueTag.memberAttrName);
        w.writeU16(0); // name-length = 0
        w.writeLengthPrefixedString(memberName, 'ascii');
      }

      // Member value entry: tag, name-len=0, value
      w.writeU8(resolveValueTagByte(val));
      w.writeU16(0); // name-length = 0 for member values
      serializeValue(w, val, memberName);
    }
  }

  // endCollection
  w.writeU8(ValueTag.endCollection);
  w.writeU16(0); // name-length = 0
  w.writeU16(0); // value-length = 0
}

// ─── DateTime serialization ───────────────────────────────────────────────────

function serializeDateTimeBytes(w: IppWriter, date: Date): void {
  // RFC 1903 DateAndTime: 11 bytes
  const tzOffset = -date.getTimezoneOffset(); // in minutes
  const tzSign   = tzOffset >= 0 ? '+' : '-';
  const absTz    = Math.abs(tzOffset);
  const tzHours  = Math.floor(absTz / 60);
  const tzMins   = absTz % 60;

  w.writeU16(date.getFullYear());
  w.writeU8(date.getMonth() + 1);
  w.writeU8(date.getDate());
  w.writeU8(date.getHours());
  w.writeU8(date.getMinutes());
  w.writeU8(date.getSeconds());
  w.writeU8(Math.floor(date.getMilliseconds() / 100)); // deci-seconds
  w.writeU8(tzSign.charCodeAt(0));
  w.writeU8(tzHours);
  w.writeU8(tzMins);
}
