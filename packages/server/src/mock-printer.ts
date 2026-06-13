import type { IppRequestMessage, IppResponseMessage } from '@ipp/protocol';
import { errResponse } from './helpers.js';
import type { JobRecord, PrinterState, SubscriptionRecord } from './types.js';
import type { PrinterConfig } from './types.js';
export type { PrinterConfig };

import {
  handleGetPrinterAttributes,
  handleGetPrinterSupportedValues,
  handleIdentifyPrinter,
  handlePausePrinter,
  handlePurgeJobs,
  handleResumePrinter,
  handleSetPrinterAttributes,
} from './operations/printer.js';
import {
  handleCloseJob,
  handleCreateJob,
  handlePrintJob,
  handlePrintUri,
  handleSendDocument,
  handleSendUri,
  handleValidateJob,
} from './operations/job-create.js';
import {
  handleCancelJob,
  handleCancelJobs,
  handleCancelMyJobs,
  handleHoldJob,
  handleReleaseJob,
  handleRestartJob,
  handleSetJobAttributes,
} from './operations/job-control.js';
import { handleGetJobAttributes, handleGetJobs } from './operations/job-query.js';
import {
  handleCancelSubscription,
  handleCreateJobSubscriptions,
  handleCreatePrinterSubscriptions,
  handleGetSubscriptions,
  handleRenewSubscription,
} from './operations/subscriptions.js';

// ─── Shared state shape ───────────────────────────────────────────────────────
// Exported so operation files can type their `state` parameter.

export interface MockPrinterState {
  printerState:        PrinterState;
  printerStateReasons: string[];
  printerStateMessage: string;
  isAcceptingJobs:     boolean;
  jobs:                Map<number, JobRecord>;
  subscriptions:       Map<number, SubscriptionRecord>;
  nextJobId:           number;
  nextSubscriptionId:  number;
  startTime:           number;
  supportedOperations: string[];
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_FORMATS: string[]   = ['application/pdf', 'application/octet-stream', 'image/jpeg', 'image/png'];
const DEFAULT_MEDIA: string[]     = ['iso_a4_210x297mm', 'na_letter_8.5x11in', 'na_legal_8.5x14in'];
const DEFAULT_SIDES: string[]     = ['one-sided', 'two-sided-long-edge', 'two-sided-short-edge'];

const SUPPORTED_OPERATIONS: string[] = [
  'Print-Job', 'Print-URI', 'Validate-Job', 'Create-Job',
  'Send-Document', 'Send-URI', 'Close-Job',
  'Cancel-Job', 'Cancel-Jobs', 'Cancel-My-Jobs',
  'Hold-Job', 'Release-Job', 'Restart-Job',
  'Get-Job-Attributes', 'Get-Jobs',
  'Set-Job-Attributes',
  'Get-Printer-Attributes', 'Get-Printer-Supported-Values', 'Set-Printer-Attributes',
  'Pause-Printer', 'Resume-Printer', 'Purge-Jobs', 'Identify-Printer',
  'Create-Printer-Subscriptions', 'Create-Job-Subscriptions',
  'Get-Subscriptions', 'Renew-Subscription', 'Cancel-Subscription',
];

// ─── MockPrinter ──────────────────────────────────────────────────────────────

/**
 * A stateful IPP mock printer.
 *
 * `handle(req)` dispatches a parsed IppRequestMessage to the appropriate
 * operation handler and returns an IppResponseMessage.  No HTTP is involved —
 * you can call `handle()` directly in unit tests, or wrap it with `IppServer`
 * for integration/end-to-end testing.
 */
export class MockPrinter {
  private readonly state: MockPrinterState;
  private readonly cfg:   Required<PrinterConfig>;
  private autoProcessTimers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(config: PrinterConfig) {
    this.cfg = applyDefaults(config);
    this.state = {
      printerState:        'idle',
      printerStateReasons: ['none'],
      printerStateMessage: '',
      isAcceptingJobs:     true,
      jobs:                new Map(),
      subscriptions:       new Map(),
      nextJobId:           1,
      nextSubscriptionId:  1,
      startTime:           Date.now(),
      supportedOperations: SUPPORTED_OPERATIONS,
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Dispatch a parsed IPP request and return the response. */
  handle(req: IppRequestMessage): IppResponseMessage {
    const op = req.operation;

    if (!op) return errResponse(req, 'client-error-bad-request', 'Missing operation');

    const sched = (id: number) => this.scheduleProcessing(id);

    switch (op) {
      // ── Printer queries ─────────────────────────────────────────────────────
      case 'Get-Printer-Attributes':
        return handleGetPrinterAttributes(this.state, this.cfg, req);
      case 'Get-Printer-Supported-Values':
        return handleGetPrinterSupportedValues(this.state, this.cfg, req);

      // ── Printer control ─────────────────────────────────────────────────────
      case 'Set-Printer-Attributes':
        return handleSetPrinterAttributes(this.state, this.cfg, req);
      case 'Pause-Printer':
        return handlePausePrinter(this.state, this.cfg, req);
      case 'Resume-Printer':
        return handleResumePrinter(this.state, this.cfg, req);
      case 'Purge-Jobs':
        return handlePurgeJobs(this.state, this.cfg, req);
      case 'Identify-Printer':
        return handleIdentifyPrinter(this.state, this.cfg, req);

      // ── Job creation ────────────────────────────────────────────────────────
      case 'Validate-Job':
        return handleValidateJob(this.state, this.cfg, req);
      case 'Print-Job':
        return handlePrintJob(this.state, this.cfg, req, sched);
      case 'Print-URI':
        return handlePrintUri(this.state, this.cfg, req, sched);
      case 'Create-Job':
        return handleCreateJob(this.state, this.cfg, req);
      case 'Send-Document':
        return handleSendDocument(this.state, this.cfg, req, sched);
      case 'Send-URI':
        return handleSendUri(this.state, this.cfg, req, sched);
      case 'Close-Job':
        return handleCloseJob(this.state, this.cfg, req, sched);

      // ── Job control ─────────────────────────────────────────────────────────
      case 'Cancel-Job':
        return handleCancelJob(this.state, this.cfg, req);
      case 'Cancel-Jobs':
        return handleCancelJobs(this.state, this.cfg, req);
      case 'Cancel-My-Jobs':
        return handleCancelMyJobs(this.state, this.cfg, req);
      case 'Hold-Job':
        return handleHoldJob(this.state, this.cfg, req);
      case 'Release-Job':
        return handleReleaseJob(this.state, this.cfg, req, sched);
      case 'Restart-Job':
        return handleRestartJob(this.state, this.cfg, req, sched);
      case 'Set-Job-Attributes':
        return handleSetJobAttributes(this.state, this.cfg, req);

      // ── Job queries ─────────────────────────────────────────────────────────
      case 'Get-Job-Attributes':
        return handleGetJobAttributes(this.state, this.cfg, req);
      case 'Get-Jobs':
        return handleGetJobs(this.state, this.cfg, req);

      // ── Subscriptions ───────────────────────────────────────────────────────
      case 'Create-Printer-Subscriptions':
        return handleCreatePrinterSubscriptions(this.state, this.cfg, req);
      case 'Create-Job-Subscriptions':
        return handleCreateJobSubscriptions(this.state, this.cfg, req);
      case 'Get-Subscriptions':
        return handleGetSubscriptions(this.state, this.cfg, req);
      case 'Renew-Subscription':
        return handleRenewSubscription(this.state, this.cfg, req);
      case 'Cancel-Subscription':
        return handleCancelSubscription(this.state, this.cfg, req);

      default:
        return errResponse(req, 'server-error-operation-not-supported',
          `Operation not supported: ${op}`);
    }
  }

  // ─── State inspection (for tests) ───────────────────────────────────────────

  /** All jobs, keyed by job-id. */
  get jobs(): ReadonlyMap<number, Readonly<JobRecord>> { return this.state.jobs; }

  /** All subscriptions, keyed by subscription-id. */
  get subscriptions(): ReadonlyMap<number, Readonly<SubscriptionRecord>> {
    return this.state.subscriptions;
  }

  /** Current printer state. */
  get printerState(): PrinterState { return this.state.printerState; }

  /** Whether the printer is currently accepting new jobs. */
  get isAcceptingJobs(): boolean { return this.state.isAcceptingJobs; }

  /** Cancel all pending timers (call in afterEach to avoid leaking timers in tests). */
  destroy(): void {
    for (const timer of this.autoProcessTimers.values()) clearTimeout(timer);
    this.autoProcessTimers.clear();
  }

  // ─── Job state machine ────────────────────────────────────────────────────

  private scheduleProcessing(jobId: number): void {
    if (!this.cfg.autoProcessJobs) return;

    const timer = setTimeout(() => {
      this.autoProcessTimers.delete(jobId);
      this.processJob(jobId);
    }, this.cfg.processingDelay);

    this.autoProcessTimers.set(jobId, timer);
  }

  private processJob(jobId: number): void {
    const job = this.state.jobs.get(jobId);
    if (!job || job.state !== 'pending') return;

    job.state        = 'processing';
    job.stateReasons = ['job-printing'];
    job.processingAt = new Date();

    this.state.printerState        = 'processing';
    this.state.printerStateReasons = ['none'];

    setTimeout(() => {
      const j = this.state.jobs.get(jobId);
      if (!j || j.state !== 'processing') return;

      j.state                = 'completed';
      j.stateReasons         = ['job-completed-successfully'];
      j.completedAt          = new Date();
      j.impressionsCompleted = j.copies;

      const stillProcessing = [...this.state.jobs.values()].some(
        (x) => x.state === 'processing',
      );
      if (!stillProcessing) {
        const hasPending = [...this.state.jobs.values()].some(
          (x) => x.state === 'pending',
        );
        this.state.printerState        = hasPending ? 'processing' : 'idle';
        this.state.printerStateReasons = ['none'];
      }
    }, this.cfg.completionDelay);
  }
}

// ─── Config defaults ──────────────────────────────────────────────────────────

function applyDefaults(cfg: PrinterConfig): Required<PrinterConfig> {
  return {
    printerUri:                    cfg.printerUri,
    printerName:                   cfg.printerName                   ?? 'Mock Printer',
    makeAndModel:                  cfg.makeAndModel                  ?? '@ipp/server Mock Printer',
    info:                          cfg.info                          ?? 'IPP mock printer for testing',
    location:                      cfg.location                      ?? 'Virtual',
    moreInfo:                      cfg.moreInfo                      ?? '',
    uuid:                          cfg.uuid                          ?? '',
    colorSupported:                cfg.colorSupported                ?? false,
    pagesPerMinute:                cfg.pagesPerMinute                ?? 20,
    pagesPerMinuteColor:           cfg.pagesPerMinuteColor           ?? 0,
    documentFormats:               cfg.documentFormats               ?? DEFAULT_FORMATS,
    documentFormatDefault:         cfg.documentFormatDefault         ?? 'application/octet-stream',
    mediaSupported:                cfg.mediaSupported                ?? DEFAULT_MEDIA,
    mediaDefault:                  cfg.mediaDefault                  ?? DEFAULT_MEDIA[0]!,
    mediaReady:                    cfg.mediaReady                    ?? [DEFAULT_MEDIA[0]!],
    copiesSupported:               cfg.copiesSupported               ?? [1, 99],
    sidesSupported:                cfg.sidesSupported                ?? DEFAULT_SIDES,
    finishingsSupported:           cfg.finishingsSupported           ?? ['none'],
    printQualitySupported:         cfg.printQualitySupported         ?? ['draft', 'normal', 'high'],
    resolutionsSupported:          cfg.resolutionsSupported          ?? [{ x: 600, y: 600, unit: 'dpi' }],
    resolutionDefault:             cfg.resolutionDefault             ?? { x: 600, y: 600, unit: 'dpi' },
    orientationsSupported:         cfg.orientationsSupported         ?? ['portrait', 'landscape', 'reverse-landscape', 'reverse-portrait'],
    multipleDocumentJobsSupported: cfg.multipleDocumentJobsSupported ?? true,
    autoProcessJobs:               cfg.autoProcessJobs               ?? true,
    processingDelay:               cfg.processingDelay               ?? 0,
    completionDelay:               cfg.completionDelay               ?? 10,
  };
}
