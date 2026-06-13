export { Printer } from './printer.js';
export type { PrinterOptions } from './printer.js';
export { IppError, IppTransportError, IppOperationError } from './errors.js';
export type { ITransport, TransportOptions } from './transport.js';
export type { GetPrinterAttributesOptions } from './builders/get-printer-attributes.js';
export type { PrintJobOptions } from './builders/print-job.js';
export type {
  GetJobAttributesOptions,
  GetJobsOptions,
  IdentifyAction,
  PrintUriOptions,
  ValidateJobOptions,
} from './builders/other.js';
export type {
  GetSubscriptionsOptions,
  NotifyEvent,
  SubscriptionSpec,
} from './builders/subscriptions.js';
// Builder functions (useful for constructing requests without a Printer instance)
export { buildGetPrinterAttributes } from './builders/get-printer-attributes.js';
export { buildPrintJob } from './builders/print-job.js';
export {
  buildCancelJob, buildGetJobAttributes, buildGetJobs, buildPrintUri,
  buildIdentifyPrinter, buildValidateJob, buildCloseJob,
} from './builders/other.js';
export {
  buildCreatePrinterSubscriptions, buildCreateJobSubscriptions,
  buildGetSubscriptions, buildRenewSubscription, buildCancelSubscription,
} from './builders/subscriptions.js';
export { buildOperationGroup, generateRequestId, DEFAULT_PRINTER_OPTIONS } from './builders/common.js';
// Re-export protocol and codec for convenience
export * from '@ipp/protocol';
export { parse, serialize, IppParseError, IppSerializeError } from '@ipp/codec';
