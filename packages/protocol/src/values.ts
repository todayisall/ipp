// RFC 8010 §3.5.2 — IPP Value Types

/** Out-of-band values — no payload */
export interface UnsupportedValue   { readonly tag: 'unsupported' }
export interface UnknownValue       { readonly tag: 'unknown' }
export interface NoValueValue       { readonly tag: 'no-value' }
export interface DefaultValue       { readonly tag: 'default' }
export interface NotSettableValue   { readonly tag: 'not-settable' }    // RFC 3380
export interface DeleteAttrValue    { readonly tag: 'delete-attribute' } // RFC 3380
export interface AdminDefineValue   { readonly tag: 'admin-define' }    // RFC 3380

/** Integer family (0x21–0x23) */
export interface IntegerValue        { readonly tag: 'integer';          readonly value: number }
export interface BooleanValue        { readonly tag: 'boolean';          readonly value: boolean }
/** Enum is stored as a resolved string name (e.g. 'idle'), never as a raw number. */
export interface EnumValue           { readonly tag: 'enum';             readonly value: string }

/** Octet-string family (0x30–0x37) */
export interface OctetStringValue    { readonly tag: 'octetString';      readonly value: Uint8Array }
export interface DateTimeValue       { readonly tag: 'dateTime';         readonly value: Date }
export interface ResolutionValue     {
  readonly tag: 'resolution';
  readonly value: { readonly x: number; readonly y: number; readonly unit: 'dpi' | 'dpcm' };
}
export interface RangeOfIntegerValue { readonly tag: 'rangeOfInteger';   readonly value: readonly [number, number] }
/** RFC 3382 — nested collection */
export interface CollectionValue     { readonly tag: 'collection';       readonly value: IppCollection }

/** Text with language tag (0x35/0x36) */
export interface TextWithLanguageValue {
  readonly tag: 'textWithLanguage';
  readonly value: { readonly lang: string; readonly text: string };
}
export interface NameWithLanguageValue {
  readonly tag: 'nameWithLanguage';
  readonly value: { readonly lang: string; readonly text: string };
}

/** Character-string family (0x41–0x49) */
export interface TextWithoutLanguageValue { readonly tag: 'textWithoutLanguage'; readonly value: string }
export interface NameWithoutLanguageValue { readonly tag: 'nameWithoutLanguage'; readonly value: string }
export interface KeywordValue             { readonly tag: 'keyword';             readonly value: string }
export interface UriValue                 { readonly tag: 'uri';                 readonly value: string }
export interface UriSchemeValue           { readonly tag: 'uriScheme';           readonly value: string }
export interface CharsetValue             { readonly tag: 'charset';             readonly value: string }
export interface NaturalLanguageValue     { readonly tag: 'naturalLanguage';     readonly value: string }
export interface MimeMediaTypeValue       { readonly tag: 'mimeMediaType';       readonly value: string }

/** Discriminated union of every possible IPP attribute value */
export type IppValue =
  | UnsupportedValue
  | UnknownValue
  | NoValueValue
  | DefaultValue
  | NotSettableValue
  | DeleteAttrValue
  | AdminDefineValue
  | IntegerValue
  | BooleanValue
  | EnumValue
  | OctetStringValue
  | DateTimeValue
  | ResolutionValue
  | RangeOfIntegerValue
  | CollectionValue
  | TextWithLanguageValue
  | NameWithLanguageValue
  | TextWithoutLanguageValue
  | NameWithoutLanguageValue
  | KeywordValue
  | UriValue
  | UriSchemeValue
  | CharsetValue
  | NaturalLanguageValue
  | MimeMediaTypeValue;

/** Tag names of IppValue (the discriminant). */
export type IppValueTag = IppValue['tag'];

/** RFC 3382 — Collection attribute value (map of member name → value or multi-value array) */
export type IppCollection = {
  readonly [memberName: string]: IppValue | readonly IppValue[];
};

/** Extracts the IppValue subtype for a given tag */
export type IppValueOfTag<T extends IppValueTag> = Extract<IppValue, { tag: T }>;
