// RFC 8010 §3.5 — Protocol byte constants (used internally by codec)

import type { IppValueTag } from './values.js';
import type { GroupTagName, IppVersion } from './message.js';

/** RFC 8010 §3.5.2 — Value tag byte values */
export const ValueTag = {
  // Out-of-band (0x10–0x17)
  unsupported:         0x10,
  default:             0x11,
  unknown:             0x12,
  'no-value':          0x13,
  'not-settable':      0x15, // RFC 3380
  'delete-attribute':  0x16, // RFC 3380
  'admin-define':      0x17, // RFC 3380

  // Integer family (0x21–0x23)
  integer:             0x21,
  boolean:             0x22,
  enum:                0x23,

  // Octet-string family (0x30–0x37)
  octetString:         0x30,
  dateTime:            0x31,
  resolution:          0x32,
  rangeOfInteger:      0x33,
  begCollection:       0x34, // RFC 3382
  textWithLanguage:    0x35,
  nameWithLanguage:    0x36,
  endCollection:       0x37, // RFC 3382

  // Character-string family (0x41–0x4A)
  textWithoutLanguage: 0x41,
  nameWithoutLanguage: 0x42,
  keyword:             0x44,
  uri:                 0x45,
  uriScheme:           0x46,
  charset:             0x47,
  naturalLanguage:     0x48,
  mimeMediaType:       0x49,
  memberAttrName:      0x4A, // RFC 3382 (collection internal — not a public IppValue tag)

  // Extension
  extension:           0x7F,
} as const satisfies Record<string, number>;

export type ValueTagKey = keyof typeof ValueTag;
export type ValueTagByte = (typeof ValueTag)[ValueTagKey];

/**
 * Maps an IppValueTag string to its wire byte.
 * `begCollection` is used for 'collection'; memberAttrName / endCollection are internal.
 */
export const valueTagToByte: Record<IppValueTag, number> = {
  unsupported:          ValueTag.unsupported,
  unknown:              ValueTag.unknown,
  'no-value':           ValueTag['no-value'],
  default:              ValueTag.default,
  'not-settable':       ValueTag['not-settable'],
  'delete-attribute':   ValueTag['delete-attribute'],
  'admin-define':       ValueTag['admin-define'],
  integer:              ValueTag.integer,
  boolean:              ValueTag.boolean,
  enum:                 ValueTag.enum,
  octetString:          ValueTag.octetString,
  dateTime:             ValueTag.dateTime,
  resolution:           ValueTag.resolution,
  rangeOfInteger:       ValueTag.rangeOfInteger,
  collection:           ValueTag.begCollection,
  textWithLanguage:     ValueTag.textWithLanguage,
  nameWithLanguage:     ValueTag.nameWithLanguage,
  textWithoutLanguage:  ValueTag.textWithoutLanguage,
  nameWithoutLanguage:  ValueTag.nameWithoutLanguage,
  keyword:              ValueTag.keyword,
  uri:                  ValueTag.uri,
  uriScheme:            ValueTag.uriScheme,
  charset:              ValueTag.charset,
  naturalLanguage:      ValueTag.naturalLanguage,
  mimeMediaType:        ValueTag.mimeMediaType,
};

/**
 * Maps a wire byte back to an IppValueTag.
 * Returns undefined for internal-only bytes (memberAttrName, endCollection, extension).
 */
export function byteToValueTag(byte: number): IppValueTag | undefined {
  for (const [key, val] of Object.entries(valueTagToByte)) {
    if (val === byte) return key as IppValueTag;
  }
  return undefined;
}

/** RFC 8010 §3.5.1 — Group tag byte values */
export const GroupTagByte = {
  'operation-attributes-tag':           0x01,
  'job-attributes-tag':                 0x02,
  'end-of-attributes-tag':              0x03,
  'printer-attributes-tag':             0x04,
  'unsupported-attributes-tag':         0x05,
  'subscription-attributes-tag':        0x06,
  'event-notification-attributes-tag':  0x07,
  'resource-attributes-tag':            0x08,
  'document-attributes-tag':            0x09,
  'system-attributes-tag':              0x0A,
} as const satisfies Record<GroupTagName | 'end-of-attributes-tag' | 'resource-attributes-tag', number>;

export function byteToGroupTag(byte: number): GroupTagName | undefined {
  for (const [name, val] of Object.entries(GroupTagByte)) {
    if (val === byte && name !== 'end-of-attributes-tag' && name !== 'resource-attributes-tag') {
      return name as GroupTagName;
    }
  }
  return undefined;
}

/** RFC 8010 §3.3 — Version number encoding: [major, minor] */
export const VersionByte: Record<IppVersion, readonly [number, number]> = {
  '1.0': [1, 0],
  '1.1': [1, 1],
  '2.0': [2, 0],
  '2.1': [2, 1],
  '2.2': [2, 2],
};

export function bytesToVersion(major: number, minor: number): IppVersion | undefined {
  const key = `${major}.${minor}` as IppVersion;
  return key in VersionByte ? key : undefined;
}
