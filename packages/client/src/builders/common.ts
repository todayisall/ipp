import type { IppAttribute, IppAttributeGroup, IppVersion } from '@ipp/protocol';
import { v } from '@ipp/protocol';

export interface PrinterDefaults {
  version: IppVersion;
  charset: string;
  language: string;
  printerUri: string;
}

export const DEFAULT_PRINTER_OPTIONS: PrinterDefaults = {
  version:    '2.0',
  charset:    'utf-8',
  language:   'en-us',
  printerUri: '',
};

/** Generate a random request ID using crypto (Q2 decision: crypto.getRandomValues) */
export function generateRequestId(): number {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  // Ensure positive 32-bit int (IPP request-id is unsigned, but Java printers sometimes reject 0)
  return ((buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!) >>> 0 || 1;
}

/** Build the mandatory operation-attributes group header */
export function buildOperationGroup(
  defaults: PrinterDefaults,
  extra: IppAttribute[] = [],
): IppAttributeGroup {
  return {
    tag: 'operation-attributes-tag',
    attributes: [
      { name: 'attributes-charset',          values: [v.charset(defaults.charset)] },
      { name: 'attributes-natural-language', values: [v.naturalLanguage(defaults.language)] },
      { name: 'printer-uri',                 values: [v.uri(defaults.printerUri)] },
      ...extra,
    ],
  };
}
