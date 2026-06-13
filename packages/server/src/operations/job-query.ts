// Job query operations: Get-Job-Attributes, Get-Jobs

import type { IppAttribute, IppAttributeGroup, IppRequestMessage, IppResponseMessage } from '@ipp/protocol';
import { v } from '@ipp/protocol';
import { attr, en, errResponse, filterAttrs, int, kw, mime, nm, okResponse, opStr, opStrList } from '../helpers.js';
import type { JobRecord } from '../types.js';
import type { MockPrinterState, PrinterConfig } from '../mock-printer.js';

// ─── Get-Job-Attributes ───────────────────────────────────────────────────────

export function handleGetJobAttributes(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const job = resolveJob(state, req);
  if ('statusCode' in job) return job;

  const requested = opStrList(req, 'requested-attributes');
  const allAttrs  = fullJobAttrs(job, cfg);

  return okResponse(req, {
    tag:        'job-attributes-tag',
    attributes: filterAttrs(allAttrs, requested),
  });
}

// ─── Get-Jobs ─────────────────────────────────────────────────────────────────

export function handleGetJobs(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const printerUri = opStr(req, 'printer-uri');
  if (printerUri && printerUri !== cfg.printerUri) {
    return errResponse(req, 'client-error-not-found', `Printer not found: ${printerUri}`);
  }

  const requested  = opStrList(req, 'requested-attributes');
  const myJobs     = opBool(req, 'my-jobs') ?? false;
  const requesting = opStr(req, 'requesting-user-name');
  const limitAttr  = opInt(req, 'limit');
  const limit      = limitAttr ?? 0; // 0 = no limit
  const whichJobsAttr = opStr(req, 'which-jobs') ?? 'not-completed';

  let jobs = [...state.jobs.values()];

  // Filter by which-jobs
  jobs = jobs.filter((j) => {
    switch (whichJobsAttr) {
      case 'completed':      return TERMINAL.includes(j.state);
      case 'not-completed':  return !TERMINAL.includes(j.state);
      case 'aborted':        return j.state === 'aborted';
      case 'canceled':       return j.state === 'canceled';
      case 'pending':        return j.state === 'pending' || j.state === 'pending-held';
      case 'processing':     return j.state === 'processing';
      case 'all':            return true;
      default:               return !TERMINAL.includes(j.state);
    }
  });

  // Filter by my-jobs
  if (myJobs && requesting) {
    jobs = jobs.filter((j) => j.userName === requesting);
  }

  // Sort newest first (per RFC 8011 §4.3.4)
  jobs.sort((a, b) => b.id - a.id);

  // Apply limit
  if (limit > 0) jobs = jobs.slice(0, limit);

  const jobGroups: IppAttributeGroup[] = jobs.map((job) => ({
    tag:        'job-attributes-tag',
    attributes: filterAttrs(fullJobAttrs(job, cfg), requested),
  }));

  const resp = okResponse(req, ...jobGroups);
  return resp;
}

// ─── Full job attribute set ───────────────────────────────────────────────────

export function fullJobAttrs(job: JobRecord, cfg: PrinterConfig): IppAttribute[] {
  return [
    int('job-id',                       job.id),
    attr('job-uri',                     v.uri(job.uri)),
    attr('job-printer-uri',             v.uri(cfg.printerUri)),
    en('job-state',                     job.state),
    { name: 'job-state-reasons', values: job.stateReasons.map(kw_val) },
    nm('job-name',                      job.name),
    nm('job-originating-user-name',     job.userName),
    mime('document-format',             job.documentFormat),
    int('copies',                       job.copies),
    kw('sides',                         job.sides),
    kw('media',                         job.media),
    int('job-priority',                 job.priority),
    kw('job-hold-until',                job.holdUntil),
    int('number-of-documents',          job.documentCount),
    int('job-impressions-completed',    job.impressionsCompleted),
    int('time-at-creation',             Math.floor(job.createdAt.getTime() / 1000)),
    int('time-at-processing',           job.processingAt
      ? Math.floor(job.processingAt.getTime() / 1000) : 0),
    int('time-at-completed',            job.completedAt
      ? Math.floor(job.completedAt.getTime() / 1000) : 0),
  ];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function kw_val(value: string) {
  return { tag: 'keyword' as const, value };
}

function opInt(req: IppRequestMessage, name: string): number | undefined {
  const a = req.groups.find((g) => g.tag === 'operation-attributes-tag')
    ?.attributes.find((a) => a.name === name);
  const val = a?.values[0];
  return val?.tag === 'integer' ? val.value : undefined;
}

function opBool(req: IppRequestMessage, name: string): boolean | undefined {
  const a = req.groups.find((g) => g.tag === 'operation-attributes-tag')
    ?.attributes.find((a) => a.name === name);
  const val = a?.values[0];
  return val?.tag === 'boolean' ? val.value : undefined;
}

function resolveJob(
  state: MockPrinterState,
  req: IppRequestMessage,
): JobRecord | IppResponseMessage {
  const jobId  = opInt(req, 'job-id');
  const jobUri = opStr(req, 'job-uri');

  if (!jobId && !jobUri) {
    return errResponse(req, 'client-error-bad-request', 'Missing job-id or job-uri');
  }
  const job = jobId
    ? state.jobs.get(jobId)
    : [...state.jobs.values()].find((j) => j.uri === jobUri);

  if (!job) {
    return errResponse(req, 'client-error-not-found',
      `Job ${jobId ?? jobUri} not found`);
  }
  return job;
}

const TERMINAL: string[] = ['canceled', 'aborted', 'completed'];
