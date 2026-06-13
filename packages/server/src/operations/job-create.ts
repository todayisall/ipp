// Job creation operations:
// Print-Job, Print-URI, Validate-Job, Create-Job, Send-Document, Send-URI, Close-Job

import type { IppRequestMessage, IppResponseMessage } from '@ipp/protocol';
import { v } from '@ipp/protocol';
import {
  attr, en, errResponse, int, kw, nm, okResponse,
  opStr, opBool, jobInt, jobStr, jobStrList,
} from '../helpers.js';
import type { JobRecord } from '../types.js';
import type { MockPrinterState, PrinterConfig } from '../mock-printer.js';

// ─── Validate-Job ─────────────────────────────────────────────────────────────

export function handleValidateJob(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const check = checkJobSubmission(state, cfg, req);
  if (check) return check;
  return okResponse(req);
}

// ─── Print-Job ────────────────────────────────────────────────────────────────

export function handlePrintJob(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
  scheduleProcessing: (jobId: number) => void,
): IppResponseMessage {
  const check = checkJobSubmission(state, cfg, req);
  if (check) return check;

  const job = createJobRecord(state, cfg, req);
  job.closed        = true;        // Print-Job is always single-document
  job.documentCount = 1;
  job.data          = req.data;

  state.jobs.set(job.id, job);
  if (job.state === 'pending') scheduleProcessing(job.id);

  return jobCreatedResponse(req, job);
}

// ─── Print-URI ────────────────────────────────────────────────────────────────

export function handlePrintUri(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
  scheduleProcessing: (jobId: number) => void,
): IppResponseMessage {
  const check = checkJobSubmission(state, cfg, req);
  if (check) return check;

  const documentUri = opStr(req, 'document-uri');
  if (!documentUri) {
    return errResponse(req, 'client-error-bad-request', 'Missing document-uri');
  }

  const job = createJobRecord(state, cfg, req);
  job.closed        = true;
  job.documentCount = 1;

  state.jobs.set(job.id, job);
  if (job.state === 'pending') scheduleProcessing(job.id);

  return jobCreatedResponse(req, job);
}

// ─── Create-Job ───────────────────────────────────────────────────────────────

export function handleCreateJob(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const check = checkJobSubmission(state, cfg, req);
  if (check) return check;

  if (!(cfg.multipleDocumentJobsSupported ?? true)) {
    return errResponse(req, 'server-error-operation-not-supported',
      'Multiple-document jobs not supported');
  }

  const job = createJobRecord(state, cfg, req);
  job.closed        = false;
  job.documentCount = 0;
  // Stays pending until Close-Job or Send-Document with last-document=true

  state.jobs.set(job.id, job);
  return jobCreatedResponse(req, job);
}

// ─── Send-Document ────────────────────────────────────────────────────────────

export function handleSendDocument(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
  scheduleProcessing: (jobId: number) => void,
): IppResponseMessage {
  const jobId = opInt(req, 'job-id');
  if (!jobId) return errResponse(req, 'client-error-bad-request', 'Missing job-id');

  const job = state.jobs.get(jobId);
  if (!job)  return errResponse(req, 'client-error-not-found', `Job ${jobId} not found`);

  if (job.closed) {
    return errResponse(req, 'client-error-not-possible',
      `Job ${jobId} is already closed`);
  }
  if (job.state !== 'pending' && job.state !== 'pending-held') {
    return errResponse(req, 'client-error-not-possible',
      `Job ${jobId} is not in a state that accepts documents`);
  }

  job.documentCount += 1;
  if (req.data) job.data = req.data;

  const lastDocument = opBool(req, 'last-document') ?? false;
  if (lastDocument) {
    job.closed = true;
    if (job.state === 'pending') scheduleProcessing(job.id);
  }

  return okResponse(req,
    { tag: 'job-attributes-tag', attributes: jobAttrs(job) },
  );
}

// ─── Send-URI ─────────────────────────────────────────────────────────────────

export function handleSendUri(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
  scheduleProcessing: (jobId: number) => void,
): IppResponseMessage {
  const jobId = opInt(req, 'job-id');
  if (!jobId) return errResponse(req, 'client-error-bad-request', 'Missing job-id');

  const job = state.jobs.get(jobId);
  if (!job)  return errResponse(req, 'client-error-not-found', `Job ${jobId} not found`);

  if (job.closed) {
    return errResponse(req, 'client-error-not-possible', `Job ${jobId} already closed`);
  }

  const documentUri = opStr(req, 'document-uri');
  if (!documentUri) {
    return errResponse(req, 'client-error-bad-request', 'Missing document-uri');
  }

  job.documentCount += 1;
  const lastDocument = opBool(req, 'last-document') ?? false;
  if (lastDocument) {
    job.closed = true;
    if (job.state === 'pending') scheduleProcessing(job.id);
  }

  return okResponse(req,
    { tag: 'job-attributes-tag', attributes: jobAttrs(job) },
  );
}

// ─── Close-Job ────────────────────────────────────────────────────────────────

export function handleCloseJob(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
  scheduleProcessing: (jobId: number) => void,
): IppResponseMessage {
  const jobId = opInt(req, 'job-id');
  if (!jobId) return errResponse(req, 'client-error-bad-request', 'Missing job-id');

  const job = state.jobs.get(jobId);
  if (!job)  return errResponse(req, 'client-error-not-found', `Job ${jobId} not found`);

  if (job.closed) {
    return errResponse(req, 'client-error-not-possible', `Job ${jobId} already closed`);
  }

  job.closed = true;
  if (job.documentCount === 0) {
    // Close with no documents — abort
    job.state        = 'aborted';
    job.stateReasons = ['unsupported-document-format'];
    job.completedAt  = new Date();
  } else if (job.state === 'pending') {
    scheduleProcessing(job.id);
  }

  return okResponse(req,
    { tag: 'job-attributes-tag', attributes: jobAttrs(job) },
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function opInt(req: IppRequestMessage, name: string): number | undefined {
  const attr = req.groups.find(g => g.tag === 'operation-attributes-tag')
    ?.attributes.find(a => a.name === name);
  const val = attr?.values[0];
  return val?.tag === 'integer' ? val.value : undefined;
}

function checkJobSubmission(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage | null {
  if (!state.isAcceptingJobs) {
    return errResponse(req, 'server-error-not-accepting-jobs',
      'Printer is not accepting jobs');
  }
  const printerUri = opStr(req, 'printer-uri');
  if (printerUri && printerUri !== cfg.printerUri) {
    return errResponse(req, 'client-error-not-found',
      `Printer not found: ${printerUri}`);
  }
  const fmt = opStr(req, 'document-format');
  if (fmt) {
    const supported = cfg.documentFormats ?? DEFAULT_FORMATS;
    if (!supported.includes(fmt) && fmt !== 'application/octet-stream') {
      return errResponse(req, 'client-error-document-format-not-supported',
        `Document format not supported: ${fmt}`);
    }
  }
  return null;
}

function createJobRecord(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): JobRecord {
  const id     = state.nextJobId++;
  const userName = opStr(req, 'requesting-user-name') ?? 'anonymous';
  const name   = jobStr(req, 'job-name') ?? opStr(req, 'job-name') ?? `Job ${id}`;
  const copies = jobInt(req, 'copies') ?? 1;
  const sides  = jobStr(req, 'sides') ?? 'one-sided';
  const media  = jobStr(req, 'media') ?? cfg.mediaDefault ?? DEFAULT_MEDIA[0]!;
  const fmt    = opStr(req, 'document-format') ?? cfg.documentFormatDefault ?? 'application/octet-stream';
  const holdUntil = jobStr(req, 'job-hold-until') ?? 'no-hold';
  const priority  = jobInt(req, 'job-priority') ?? 50;

  const state_ = holdUntil === 'no-hold' ? 'pending' : 'pending-held' as const;
  const stateReasons = holdUntil === 'no-hold' ? ['none'] : ['job-hold-until-specified'];

  return {
    id,
    uri:                 `${cfg.printerUri}/jobs/${id}`,
    state:               state_,
    stateReasons,
    name,
    userName,
    documentFormat:      fmt,
    copies,
    sides,
    media,
    priority,
    holdUntil,
    createdAt:           new Date(),
    documentCount:       0,
    closed:              false,
    impressionsCompleted: 0,
  };
}

export function jobAttrs(job: JobRecord) {
  return [
    int('job-id',                      job.id),
    attr('job-uri',                    v.uri(job.uri)),
    en('job-state',                    job.state),
    kw('job-state-reasons',            job.stateReasons[0] ?? 'none'),
    nm('job-name',                     job.name),
    nm('job-originating-user-name',    job.userName),
    int('number-of-documents',         job.documentCount),
    int('job-impressions-completed',   job.impressionsCompleted),
    int('time-at-creation',            Math.floor(job.createdAt.getTime() / 1000)),
    int('time-at-processing',          job.processingAt
      ? Math.floor(job.processingAt.getTime() / 1000) : 0),
    int('time-at-completed',           job.completedAt
      ? Math.floor(job.completedAt.getTime() / 1000) : 0),
  ];
}

function jobCreatedResponse(
  req: IppRequestMessage,
  job: JobRecord,
): IppResponseMessage {
  return okResponse(req,
    { tag: 'job-attributes-tag', attributes: [
      int('job-id',  job.id),
      attr('job-uri', v.uri(job.uri)),
      en('job-state', job.state),
      kw('job-state-reasons', job.stateReasons[0] ?? 'none'),
    ]},
  );
}

const DEFAULT_FORMATS = ['application/pdf', 'application/octet-stream', 'image/jpeg', 'image/png'];
const DEFAULT_MEDIA   = ['iso_a4_210x297mm', 'na_letter_8.5x11in'];
