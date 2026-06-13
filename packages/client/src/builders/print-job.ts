import type { IppAttribute, IppAttributeGroup, IppRequestMessage } from '@ipp/protocol';
import { v } from '@ipp/protocol';
import {
  type PrinterDefaults,
  buildOperationGroup,
  generateRequestId,
} from './common.js';

export interface PrintJobOptions {
  jobName?: string;
  documentFormat?: string;
  copies?: number;
  sides?: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge';
  colorMode?: string;
  /** IPP media size name e.g. 'iso_a4_210x297mm' */
  media?: string;
  priority?: number;
  /** Username sent as requesting-user-name */
  userName?: string;
  /** Raw extra job-attributes-tag attributes */
  extraJobAttrs?: IppAttribute[];
}

export function buildPrintJob(
  defaults: PrinterDefaults,
  data: Uint8Array,
  opts?: PrintJobOptions,
): IppRequestMessage {
  const opExtra: IppAttribute[] = [
    { name: 'requesting-user-name', values: [v.name(opts?.userName ?? 'ipp-client')] },
    ...(opts?.jobName ? [{ name: 'job-name', values: [v.name(opts.jobName)] }] : []),
    ...(opts?.documentFormat
      ? [{ name: 'document-format', values: [v.mimeMediaType(opts.documentFormat)] }]
      : []),
  ];

  const jobAttrs: IppAttribute[] = [
    ...(opts?.copies !== undefined ? [{ name: 'copies',   values: [v.integer(opts.copies)] }] : []),
    ...(opts?.sides               ? [{ name: 'sides',    values: [v.keyword(opts.sides)] }] : []),
    ...(opts?.colorMode           ? [{ name: 'print-color-mode', values: [v.keyword(opts.colorMode)] }] : []),
    ...(opts?.media               ? [{ name: 'media',   values: [v.keyword(opts.media)] }] : []),
    ...(opts?.priority !== undefined
      ? [{ name: 'job-priority', values: [v.integer(opts.priority)] }]
      : []),
    ...(opts?.extraJobAttrs ?? []),
  ];

  const groups: IppAttributeGroup[] = [buildOperationGroup(defaults, opExtra)];
  if (jobAttrs.length > 0) {
    groups.push({ tag: 'job-attributes-tag', attributes: jobAttrs });
  }

  return {
    version:   defaults.version,
    operation: 'Print-Job',
    requestId: generateRequestId(),
    groups,
    data,
  };
}
