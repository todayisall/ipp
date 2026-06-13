import type { IppRequestMessage } from '@ipp/protocol';
import { v } from '@ipp/protocol';
import {
  type PrinterDefaults,
  buildOperationGroup,
  generateRequestId,
} from './common.js';

export interface GetPrinterAttributesOptions {
  requestedAttributes?: string[];
}

export function buildGetPrinterAttributes(
  defaults: PrinterDefaults,
  opts?: GetPrinterAttributesOptions,
): IppRequestMessage {
  const extra = opts?.requestedAttributes?.length
    ? [{ name: 'requested-attributes', values: opts.requestedAttributes.map(v.keyword) }]
    : [];

  return {
    version:   defaults.version,
    operation: 'Get-Printer-Attributes',
    requestId: generateRequestId(),
    groups:    [buildOperationGroup(defaults, extra)],
  };
}
