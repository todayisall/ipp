// Job control operations:
// Cancel-Job, Cancel-Jobs, Cancel-My-Jobs, Hold-Job, Release-Job,
// Restart-Job, Set-Job-Attributes

import type { IppRequestMessage, IppResponseMessage } from '@ipp/protocol';
import { en, errResponse, int, kw, okResponse, opStr, jobStr } from '../helpers.js';
import type { JobRecord, JobState } from '../types.js';
import type { MockPrinterState, PrinterConfig } from '../mock-printer.js';

// ─── Cancel-Job ───────────────────────────────────────────────────────────────

export function handleCancelJob(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const job = resolveJob(state, req);
  if ('statusCode' in job) return job;

  if (!isCancelable(job.state)) {
    return errResponse(req, 'client-error-not-possible',
      `Job ${job.id} cannot be canceled in state '${job.state}'`);
  }

  job.state        = 'canceled';
  job.stateReasons = ['job-canceled-by-user'];
  job.completedAt  = new Date();
  return okResponse(req);
}

// ─── Cancel-Jobs ─────────────────────────────────────────────────────────────

export function handleCancelJobs(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  // Cancel all non-terminal jobs (optionally filtered by my-jobs)
  const myJobs     = opStr(req, 'my-jobs') === 'true';
  const requesting = opStr(req, 'requesting-user-name');

  for (const job of state.jobs.values()) {
    if (!isCancelable(job.state)) continue;
    if (myJobs && requesting && job.userName !== requesting) continue;
    job.state        = 'canceled';
    job.stateReasons = ['job-canceled-by-operator'];
    job.completedAt  = new Date();
  }
  return okResponse(req);
}

// ─── Cancel-My-Jobs ───────────────────────────────────────────────────────────

export function handleCancelMyJobs(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const requesting = opStr(req, 'requesting-user-name');
  for (const job of state.jobs.values()) {
    if (!isCancelable(job.state)) continue;
    if (requesting && job.userName !== requesting) continue;
    job.state        = 'canceled';
    job.stateReasons = ['job-canceled-by-user'];
    job.completedAt  = new Date();
  }
  return okResponse(req);
}

// ─── Hold-Job ─────────────────────────────────────────────────────────────────

export function handleHoldJob(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const job = resolveJob(state, req);
  if ('statusCode' in job) return job;

  if (job.state !== 'pending') {
    return errResponse(req, 'client-error-not-possible',
      `Job ${job.id} cannot be held in state '${job.state}'`);
  }

  const holdUntil = jobStr(req, 'job-hold-until') ?? 'indefinite';
  job.state        = 'pending-held';
  job.holdUntil    = holdUntil;
  job.stateReasons = ['job-hold-until-specified'];
  return okResponse(req);
}

// ─── Release-Job ─────────────────────────────────────────────────────────────

export function handleReleaseJob(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
  scheduleProcessing: (jobId: number) => void,
): IppResponseMessage {
  const job = resolveJob(state, req);
  if ('statusCode' in job) return job;

  if (job.state !== 'pending-held') {
    return errResponse(req, 'client-error-not-possible',
      `Job ${job.id} is not held`);
  }

  job.state        = 'pending';
  job.holdUntil    = 'no-hold';
  job.stateReasons = ['none'];
  if (job.closed) scheduleProcessing(job.id);
  return okResponse(req);
}

// ─── Restart-Job ─────────────────────────────────────────────────────────────

export function handleRestartJob(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
  scheduleProcessing: (jobId: number) => void,
): IppResponseMessage {
  const job = resolveJob(state, req);
  if ('statusCode' in job) return job;

  const restartable: JobState[] = ['canceled', 'aborted', 'completed'];
  if (!restartable.includes(job.state)) {
    return errResponse(req, 'client-error-not-possible',
      `Job ${job.id} cannot be restarted in state '${job.state}'`);
  }

  job.state               = 'pending';
  job.stateReasons        = ['none'];
  job.processingAt        = undefined;
  job.completedAt         = undefined;
  job.impressionsCompleted = 0;
  scheduleProcessing(job.id);
  return okResponse(req);
}

// ─── Set-Job-Attributes ───────────────────────────────────────────────────────

export function handleSetJobAttributes(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const job = resolveJob(state, req);
  if ('statusCode' in job) return job;

  if (job.state !== 'pending' && job.state !== 'pending-held') {
    return errResponse(req, 'client-error-not-possible',
      `Job ${job.id} cannot be modified in state '${job.state}'`);
  }

  const jobGroup = req.groups.find((g) => g.tag === 'job-attributes-tag');
  if (jobGroup) {
    for (const a of jobGroup.attributes) {
      switch (a.name) {
        case 'job-name': {
          const val = a.values[0];
          if (val?.tag === 'nameWithoutLanguage') job.name = val.value;
          break;
        }
        case 'copies': {
          const val = a.values[0];
          if (val?.tag === 'integer') job.copies = val.value;
          break;
        }
        case 'sides': {
          const val = a.values[0];
          if (val?.tag === 'keyword') job.sides = val.value;
          break;
        }
        case 'media': {
          const val = a.values[0];
          if (val?.tag === 'keyword' || val?.tag === 'nameWithoutLanguage')
            job.media = val.value;
          break;
        }
        case 'job-hold-until': {
          const val = a.values[0];
          if (val?.tag === 'keyword') {
            job.holdUntil = val.value;
            if (val.value !== 'no-hold') {
              job.state        = 'pending-held';
              job.stateReasons = ['job-hold-until-specified'];
            }
          }
          break;
        }
        case 'job-priority': {
          const val = a.values[0];
          if (val?.tag === 'integer') job.priority = val.value;
          break;
        }
      }
    }
  }
  return okResponse(req);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function opInt(req: IppRequestMessage, name: string): number | undefined {
  const attr = req.groups.find((g) => g.tag === 'operation-attributes-tag')
    ?.attributes.find((a) => a.name === name);
  const val = attr?.values[0];
  return val?.tag === 'integer' ? val.value : undefined;
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

  let job: JobRecord | undefined;
  if (jobId) {
    job = state.jobs.get(jobId);
  } else {
    job = [...state.jobs.values()].find((j) => j.uri === jobUri);
  }

  if (!job) {
    return errResponse(req, 'client-error-not-found',
      `Job ${jobId ?? jobUri} not found`);
  }
  return job;
}

function isCancelable(s: JobState): boolean {
  return s === 'pending' || s === 'pending-held' || s === 'processing';
}
