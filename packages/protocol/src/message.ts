// RFC 8010 §3 — IPP Message Structure

import type { IppValue } from './values.js';
import type { OperationName } from './operations.js';
import type { StatusCodeName } from './status-codes.js';

/** RFC 8010 §3.5.1 — Attribute group delimiter tag names */
export type GroupTagName =
  | 'operation-attributes-tag'           // 0x01
  | 'job-attributes-tag'                 // 0x02
  | 'printer-attributes-tag'             // 0x04
  | 'unsupported-attributes-tag'         // 0x05
  | 'subscription-attributes-tag'        // 0x06 RFC 3995
  | 'event-notification-attributes-tag'  // 0x07 RFC 3995
  | 'document-attributes-tag'            // 0x09 PWG 5100.5
  | 'system-attributes-tag';             // 0x0A RFC 8011

/** Supported IPP versions (RFC 8010 §3.3) */
export type IppVersion = '1.0' | '1.1' | '2.0' | '2.1' | '2.2';

/** A single named attribute with one or more typed values */
export interface IppAttribute {
  readonly name: string;
  /** Always an array; single-valued attributes have length 1 */
  readonly values: readonly IppValue[];
}

/** A group of attributes sharing a group delimiter tag */
export interface IppAttributeGroup {
  readonly tag: GroupTagName;
  readonly attributes: readonly IppAttribute[];
}

interface IppMessageBase {
  readonly version: IppVersion;
  /** RFC 8010 §3.3 — request-id field */
  readonly requestId: number;
  readonly groups: readonly IppAttributeGroup[];
  /** Document data appended after the attribute groups (e.g. Print-Job payload) */
  readonly data?: Uint8Array | undefined;
}

/** An IPP request message */
export interface IppRequestMessage extends IppMessageBase {
  readonly operation: OperationName;
  readonly statusCode?: never;
}

/** An IPP response message */
export interface IppResponseMessage extends IppMessageBase {
  readonly statusCode: StatusCodeName;
  readonly operation?: never;
}

export type IppMessage = IppRequestMessage | IppResponseMessage;
