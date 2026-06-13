// Cancel-Job, Get-Job-Attributes, Get-Jobs, Print-URI, Identify-Printer, Validate-Job, Close-Job

import type { IppAttribute, IppAttributeGroup, IppRequestMessage } from '@ipp/protocol';
import { v } from '@ipp/protocol';
import {
  type PrinterDefaults,
  buildOperationGroup,
  generateRequestId,
} from './common.js';

// ─── Cancel-Job ───────────────────────────────────────────────────────────────

export function buildCancelJob(defaults: PrinterDefaults, jobId: number): IppRequestMessage {
  return {
    version:   defaults.version,
    operation: 'Cancel-Job',
    requestId: generateRequestId(),
    groups: [buildOperationGroup(defaults, [
      { name: 'job-id', values: [v.integer(jobId)] },
    ])],
  };
}

// ─── Get-Job-Attributes ───────────────────────────────────────────────────────

export interface GetJobAttributesOptions {
  requestedAttributes?: string[];
}

export function buildGetJobAttributes(
  defaults: PrinterDefaults,
  jobId: number,
  opts?: GetJobAttributesOptions,
): IppRequestMessage {
  const extra: IppAttribute[] = [
    { name: 'job-id', values: [v.integer(jobId)] },
    ...(opts?.requestedAttributes?.length
      ? [{ name: 'requested-attributes', values: opts.requestedAttributes.map(v.keyword) }]
      : []),
  ];
  return {
    version:   defaults.version,
    operation: 'Get-Job-Attributes',
    requestId: generateRequestId(),
    groups:    [buildOperationGroup(defaults, extra)],
  };
}

// ─── Get-Jobs ─────────────────────────────────────────────────────────────────

export interface GetJobsOptions {
  limit?: number;
  whichJobs?: 'completed' | 'not-completed' | 'all';
  myJobs?: boolean;
  requestedAttributes?: string[];
}

export function buildGetJobs(defaults: PrinterDefaults, opts?: GetJobsOptions): IppRequestMessage {
  const extra: IppAttribute[] = [
    ...(opts?.limit !== undefined
      ? [{ name: 'limit', values: [v.integer(opts.limit)] }]
      : []),
    ...(opts?.whichJobs
      ? [{ name: 'which-jobs', values: [v.keyword(opts.whichJobs)] }]
      : []),
    ...(opts?.myJobs !== undefined
      ? [{ name: 'my-jobs', values: [v.boolean(opts.myJobs)] }]
      : []),
    ...(opts?.requestedAttributes?.length
      ? [{ name: 'requested-attributes', values: opts.requestedAttributes.map(v.keyword) }]
      : []),
  ];
  return {
    version:   defaults.version,
    operation: 'Get-Jobs',
    requestId: generateRequestId(),
    groups:    [buildOperationGroup(defaults, extra)],
  };
}

// ─── Print-URI ────────────────────────────────────────────────────────────────

export interface PrintUriOptions {
  jobName?: string;
  documentFormat?: string;
  copies?: number;
  sides?: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge';
}

export function buildPrintUri(
  defaults: PrinterDefaults,
  documentUri: string,
  opts?: PrintUriOptions,
): IppRequestMessage {
  const extra: IppAttribute[] = [
    { name: 'document-uri',  values: [v.uri(documentUri)] },
    ...(opts?.jobName ? [{ name: 'job-name', values: [v.name(opts.jobName)] }] : []),
    ...(opts?.documentFormat
      ? [{ name: 'document-format', values: [v.mimeMediaType(opts.documentFormat)] }]
      : []),
  ];
  const jobAttrs: IppAttribute[] = [
    ...(opts?.copies !== undefined ? [{ name: 'copies', values: [v.integer(opts.copies)] }] : []),
    ...(opts?.sides ? [{ name: 'sides', values: [v.keyword(opts.sides)] }] : []),
  ];
  return {
    version:   defaults.version,
    operation: 'Print-URI',
    requestId: generateRequestId(),
    groups: [
      buildOperationGroup(defaults, extra),
      ...(jobAttrs.length > 0 ? [{ tag: 'job-attributes-tag' as const, attributes: jobAttrs }] : []),
    ],
  };
}

// ─── Identify-Printer (PWG 5100.13) ──────────────────────────────────────────

export type IdentifyAction = 'display' | 'flash' | 'sound' | 'speak';

export function buildIdentifyPrinter(
  defaults: PrinterDefaults,
  actions?: IdentifyAction[],
): IppRequestMessage {
  const extra: IppAttribute[] = actions?.length
    ? [{ name: 'identify-actions', values: actions.map(v.keyword) }]
    : [];
  return {
    version:   defaults.version,
    operation: 'Identify-Printer',
    requestId: generateRequestId(),
    groups:    [buildOperationGroup(defaults, extra)],
  };
}

// ─── Validate-Job (PWG 5100.13 §7.2) ─────────────────────────────────────────

export interface ValidateJobOptions {
  jobName?: string;
  documentFormat?: string;
  copies?: number;
  sides?: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge';
  media?: string;
  userName?: string;
}

export function buildValidateJob(
  defaults: PrinterDefaults,
  opts?: ValidateJobOptions,
): IppRequestMessage {
  const opExtra: IppAttribute[] = [
    { name: 'requesting-user-name', values: [v.name(opts?.userName ?? 'ipp-client')] },
    ...(opts?.jobName ? [{ name: 'job-name', values: [v.name(opts.jobName)] }] : []),
    ...(opts?.documentFormat
      ? [{ name: 'document-format', values: [v.mimeMediaType(opts.documentFormat)] }]
      : []),
  ];
  const jobAttrs: IppAttribute[] = [
    ...(opts?.copies !== undefined ? [{ name: 'copies', values: [v.integer(opts.copies)] }] : []),
    ...(opts?.sides ? [{ name: 'sides', values: [v.keyword(opts.sides)] }] : []),
    ...(opts?.media ? [{ name: 'media', values: [v.keyword(opts.media)] }] : []),
  ];
  const groups: IppAttributeGroup[] = [buildOperationGroup(defaults, opExtra)];
  if (jobAttrs.length > 0) {
    groups.push({ tag: 'job-attributes-tag', attributes: jobAttrs });
  }
  return {
    version:   defaults.version,
    operation: 'Validate-Job',
    requestId: generateRequestId(),
    groups,
  };
}

// ─── Close-Job (PWG 5100.5 §7.3) ─────────────────────────────────────────────

export function buildCloseJob(defaults: PrinterDefaults, jobId: number): IppRequestMessage {
  return {
    version:   defaults.version,
    operation: 'Close-Job',
    requestId: generateRequestId(),
    groups: [buildOperationGroup(defaults, [
      { name: 'job-id', values: [v.integer(jobId)] },
    ])],
  };
}
