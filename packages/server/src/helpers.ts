// Request parsing + response building helpers for the mock printer.
// All functions are pure / free of side-effects.

import type {
  IppAttribute,
  IppAttributeGroup,
  IppRequestMessage,
  IppResponseMessage,
  IppValue,
  StatusCodeName,
} from '@ipp/protocol';
import { v } from '@ipp/protocol';

// ─── Response builders ────────────────────────────────────────────────────────

export function okResponse(
  req: IppRequestMessage,
  ...groups: IppAttributeGroup[]
): IppResponseMessage {
  return {
    version:    req.version,
    statusCode: 'successful-ok',
    requestId:  req.requestId,
    groups:     [baseOpGroup(), ...groups],
  };
}

export function errResponse(
  req: IppRequestMessage,
  statusCode: StatusCodeName,
  message?: string,
): IppResponseMessage {
  const opGroup = baseOpGroup();
  if (message) {
    opGroup.attributes.push({ name: 'status-message', values: [v.text(message)] });
  }
  return {
    version:    req.version,
    statusCode,
    requestId:  req.requestId,
    groups:     [opGroup],
  };
}

function baseOpGroup(): IppAttributeGroup {
  return {
    tag: 'operation-attributes-tag',
    attributes: [
      { name: 'attributes-charset',          values: [v.charset('utf-8')]         },
      { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')] },
    ],
  };
}

// ─── Request attribute extraction ────────────────────────────────────────────

function groupAttrs(req: IppRequestMessage, tag: IppAttributeGroup['tag']): IppAttribute[] {
  return req.groups.find((g) => g.tag === tag)?.attributes ?? [];
}

function findAttr(attrs: IppAttribute[], name: string): IppAttribute | undefined {
  return attrs.find((a) => a.name === name);
}

function strVal(attr: IppAttribute | undefined): string | undefined {
  const val = attr?.values[0];
  if (!val) return undefined;
  if (
    val.tag === 'nameWithoutLanguage' || val.tag === 'textWithoutLanguage' ||
    val.tag === 'keyword'  || val.tag === 'uri'          ||
    val.tag === 'charset'  || val.tag === 'naturalLanguage' ||
    val.tag === 'mimeMediaType' || val.tag === 'uriScheme'
  ) return val.value;
  return undefined;
}

function intVal(attr: IppAttribute | undefined): number | undefined {
  const val = attr?.values[0];
  return val?.tag === 'integer' ? val.value : undefined;
}

function boolVal(attr: IppAttribute | undefined): boolean | undefined {
  const val = attr?.values[0];
  return val?.tag === 'boolean' ? val.value : undefined;
}

function strListVal(attr: IppAttribute | undefined): string[] {
  if (!attr) return [];
  return attr.values.flatMap((val) => {
    if (
      val.tag === 'keyword' || val.tag === 'nameWithoutLanguage' ||
      val.tag === 'textWithoutLanguage' || val.tag === 'mimeMediaType'
    ) return [val.value];
    return [];
  });
}

// Operation-attributes helpers
export const opStr  = (req: IppRequestMessage, name: string) =>
  strVal(findAttr(groupAttrs(req, 'operation-attributes-tag'), name));

export const opInt  = (req: IppRequestMessage, name: string) =>
  intVal(findAttr(groupAttrs(req, 'operation-attributes-tag'), name));

export const opBool = (req: IppRequestMessage, name: string) =>
  boolVal(findAttr(groupAttrs(req, 'operation-attributes-tag'), name));

export const opStrList = (req: IppRequestMessage, name: string) =>
  strListVal(findAttr(groupAttrs(req, 'operation-attributes-tag'), name));

// Job-attributes helpers
export const jobStr  = (req: IppRequestMessage, name: string) =>
  strVal(findAttr(groupAttrs(req, 'job-attributes-tag'), name));

export const jobInt  = (req: IppRequestMessage, name: string) =>
  intVal(findAttr(groupAttrs(req, 'job-attributes-tag'), name));

export const jobStrList = (req: IppRequestMessage, name: string) =>
  strListVal(findAttr(groupAttrs(req, 'job-attributes-tag'), name));

// ─── Attribute filtering ──────────────────────────────────────────────────────

/** Filter attributes to only those named in `requested` (empty = return all). */
export function filterAttrs(
  attrs: IppAttribute[],
  requested: string[],
): IppAttribute[] {
  if (requested.length === 0 || requested.includes('all')) return attrs;
  return attrs.filter((a) => requested.includes(a.name));
}

// ─── Attribute builders ───────────────────────────────────────────────────────

export function attr(name: string, ...values: IppValue[]): IppAttribute {
  return { name, values };
}

/** Build a single-keyword attribute */
export const kw   = (name: string, value: string)   => attr(name, v.keyword(value));
/** Build a single-enum attribute */
export const en   = (name: string, value: string)   => attr(name, v.enum(value));
/** Build a single-integer attribute */
export const int  = (name: string, value: number)   => attr(name, v.integer(value));
/** Build a single-boolean attribute */
export const bool = (name: string, value: boolean)  => attr(name, v.boolean(value));
/** Build a single-text attribute */
export const txt  = (name: string, value: string)   => attr(name, v.text(value));
/** Build a single-name attribute */
export const nm   = (name: string, value: string)   => attr(name, v.name(value));
/** Build a single-uri attribute */
export const uri  = (name: string, value: string)   => attr(name, v.uri(value));
/** Build a single-mimeMediaType attribute */
export const mime = (name: string, value: string)   => attr(name, v.mimeMediaType(value));
/** Build a multi-keyword attribute */
export const kwList = (name: string, values: string[]) =>
  attr(name, ...values.map(v.keyword));
/** Build a multi-enum attribute */
export const enList = (name: string, values: string[]) =>
  attr(name, ...values.map(v.enum));
/** Build a multi-uri attribute */
export const uriList = (name: string, values: string[]) =>
  attr(name, ...values.map(v.uri));
/** Build a multi-mime attribute */
export const mimeList = (name: string, values: string[]) =>
  attr(name, ...values.map(v.mimeMediaType));
