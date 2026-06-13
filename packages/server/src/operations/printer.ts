// Printer-level operations:
// Get-Printer-Attributes, Get-Printer-Supported-Values, Set-Printer-Attributes,
// Pause-Printer, Resume-Printer, Purge-Jobs, Identify-Printer

import type {
  IppAttribute,
  IppAttributeGroup,
  IppRequestMessage,
  IppResponseMessage,
} from '@ipp/protocol';
import { v } from '@ipp/protocol';
import {
  attr, bool, en, enList, errResponse, filterAttrs, int, kw, kwList,
  mime, mimeList, nm, okResponse, opStr, opStrList, txt, uri, uriList,
} from '../helpers.js';
import type { MockPrinterState, PrinterConfig } from '../mock-printer.js';

// ─── Printer attribute sets ───────────────────────────────────────────────────

// Attributes returned in the 'printer-description' group
function printerDescriptionAttrs(
  state: MockPrinterState,
  cfg: PrinterConfig,
  uptime: number,
): IppAttribute[] {
  const queuedCount = [...state.jobs.values()].filter(
    (j) => j.state === 'pending' || j.state === 'processing',
  ).length;

  return [
    uri('printer-uri-supported',         cfg.printerUri),
    kw('uri-security-supported',          'none'),
    kw('uri-authentication-supported',    'none'),
    nm('printer-name',                    cfg.printerName ?? 'Mock Printer'),
    txt('printer-info',                   cfg.info ?? 'IPP mock printer'),
    txt('printer-location',               cfg.location ?? ''),
    txt('printer-make-and-model',         cfg.makeAndModel ?? '@ipp/server Mock Printer'),
    bool('printer-is-accepting-jobs',     state.isAcceptingJobs),
    en('printer-state',                   state.printerState),
    kwList('printer-state-reasons',       state.printerStateReasons),
    enList('operations-supported',        state.supportedOperations),
    kw('charset-configured',              'utf-8'),
    kwList('charset-supported',           ['utf-8', 'us-ascii']),
    kw('natural-language-configured',     'en-us'),
    kwList('generated-natural-language-supported', ['en-us']),
    mimeList('document-format-supported', cfg.documentFormats ?? DEFAULT_FORMATS),
    mime('document-format-default',       cfg.documentFormatDefault ?? 'application/octet-stream'),
    bool('color-supported',               cfg.colorSupported ?? false),
    int('pages-per-minute',               cfg.pagesPerMinute ?? 20),
    kwList('ipp-versions-supported',      ['1.0', '1.1', '2.0']),
    kwList('compression-supported',       ['none']),
    kw('pdl-override-supported',          'not-attempted'),
    int('printer-up-time',                uptime),
    attr('printer-current-time',          v.dateTime(new Date())),
    int('queued-job-count',               queuedCount),
    bool('multiple-document-jobs-supported', cfg.multipleDocumentJobsSupported ?? true),
    int('multiple-operation-time-out',    120),
    ...(cfg.moreInfo ? [uri('printer-more-info', cfg.moreInfo)] : []),
    ...(cfg.uuid    ? [uri('printer-uuid', `urn:uuid:${cfg.uuid}`)] : []),
  ];
}

// Attributes returned in the 'job-template' group
function jobTemplateAttrs(cfg: PrinterConfig): IppAttribute[] {
  const sides   = cfg.sidesSupported   ?? DEFAULT_SIDES;
  const quality = cfg.printQualitySupported ?? DEFAULT_QUALITY;
  const finishings = cfg.finishingsSupported ?? ['none'];
  const orientations = cfg.orientationsSupported ?? DEFAULT_ORIENTATIONS;
  const copies  = cfg.copiesSupported  ?? [1, 99];
  const media   = cfg.mediaSupported   ?? DEFAULT_MEDIA;
  const resolutions = cfg.resolutionsSupported ?? [{ x: 600, y: 600, unit: 'dpi' as const }];
  const resDef  = cfg.resolutionDefault ?? resolutions[0] ?? { x: 600, y: 600, unit: 'dpi' as const };

  return [
    int('copies-default',                  1),
    attr('copies-supported',               v.range(copies[0], copies[1])),
    enList('finishings-default',           ['none']),
    enList('finishings-supported',         finishings),
    kw('job-hold-until-default',           'no-hold'),
    kwList('job-hold-until-supported',     ['no-hold', 'indefinite', 'day-time', 'evening', 'night', 'weekend']),
    int('job-priority-default',            50),
    attr('job-priority-supported',         v.integer(100)),
    kw('media-default',                    cfg.mediaDefault ?? DEFAULT_MEDIA[0]!),
    kwList('media-ready',                  cfg.mediaReady ?? [cfg.mediaDefault ?? DEFAULT_MEDIA[0]!]),
    kwList('media-supported',              media),
    en('orientation-requested-default',    'portrait'),
    enList('orientation-requested-supported', orientations),
    bool('page-ranges-supported',          true),
    en('print-quality-default',            'normal'),
    enList('print-quality-supported',      quality),
    attr('printer-resolution-default',     v.resolution(resDef.x, resDef.y, resDef.unit)),
    attr('printer-resolution-supported',   ...resolutions.map((r) => v.resolution(r.x, r.y, r.unit))),
    kw('sides-default',                    'one-sided'),
    kwList('sides-supported',              sides),
    attr('job-impressions-supported',      v.range(0, 65535)),
    attr('job-k-octets-supported',         v.range(0, 1048576)),
    attr('job-media-sheets-supported',     v.range(0, 65535)),
  ];
}

// Attributes returned in the 'subscription-description' group
function subscriptionDescAttrs(): IppAttribute[] {
  return [
    kwList('notify-pull-method-supported',   ['ippget']),
    kwList('notify-events-default',          ['job-completed']),
    kwList('notify-events-supported',        NOTIFY_EVENTS),
    int('notify-max-events-supported',       20),
    int('notify-lease-duration-default',     86400),
    attr('notify-lease-duration-supported',  v.range(0, 67108863)),
    int('notify-max-subscription-lookup',    5),
  ];
}

// ─── Group selector ───────────────────────────────────────────────────────────

const PRINTER_DESC_NAMES = new Set([
  'charset-configured', 'charset-supported', 'color-supported',
  'compression-supported', 'document-format-default', 'document-format-supported',
  'generated-natural-language-supported', 'ipp-versions-supported',
  'multiple-document-jobs-supported', 'multiple-operation-time-out',
  'natural-language-configured', 'operations-supported', 'pages-per-minute',
  'pdl-override-supported', 'printer-current-time', 'printer-info',
  'printer-is-accepting-jobs', 'printer-location', 'printer-make-and-model',
  'printer-more-info', 'printer-name', 'printer-state', 'printer-state-message',
  'printer-state-reasons', 'printer-up-time', 'printer-uri-supported',
  'printer-uuid', 'queued-job-count', 'uri-authentication-supported',
  'uri-security-supported',
]);

const JOB_TEMPLATE_NAMES = new Set([
  'copies-default', 'copies-supported', 'finishings-default', 'finishings-supported',
  'job-hold-until-default', 'job-hold-until-supported', 'job-priority-default',
  'job-priority-supported', 'job-impressions-supported', 'job-k-octets-supported',
  'job-media-sheets-supported', 'media-default', 'media-ready', 'media-supported',
  'orientation-requested-default', 'orientation-requested-supported',
  'page-ranges-supported', 'print-quality-default', 'print-quality-supported',
  'printer-resolution-default', 'printer-resolution-supported',
  'sides-default', 'sides-supported',
]);

const SUBSCRIPTION_NAMES = new Set([
  'notify-pull-method-supported', 'notify-events-default', 'notify-events-supported',
  'notify-max-events-supported', 'notify-lease-duration-default',
  'notify-lease-duration-supported', 'notify-max-subscription-lookup',
]);

// ─── Get-Printer-Attributes ───────────────────────────────────────────────────

export function handleGetPrinterAttributes(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const printerUri = opStr(req, 'printer-uri');
  if (printerUri && printerUri !== cfg.printerUri) {
    return errResponse(req, 'client-error-not-found', `Printer not found: ${printerUri}`);
  }

  const requested = opStrList(req, 'requested-attributes');
  const uptime    = Math.floor((Date.now() - state.startTime) / 1000);

  const GROUP_KEYWORDS = ['all', 'printer-description', 'job-template', 'subscription-template', 'subscription-description'];
  const wantAll  = requested.length === 0 || requested.includes('all');
  const wantDesc = wantAll || requested.includes('printer-description');
  const wantTmpl = wantAll || requested.includes('job-template');
  const wantSubs = wantAll || requested.includes('subscription-template') ||
                   requested.includes('subscription-description');
  const wantGroups = wantDesc || wantTmpl || wantSubs;

  // Always build the full pool; then select from it
  const allPossible: IppAttribute[] = [
    ...printerDescriptionAttrs(state, cfg, uptime),
    ...jobTemplateAttrs(cfg),
    ...subscriptionDescAttrs(),
  ];

  let finalAttrs: IppAttribute[];
  if (wantAll) {
    finalAttrs = allPossible;
  } else if (wantGroups) {
    // Include attrs belonging to requested group(s)
    const groupAttrs: IppAttribute[] = [];
    if (wantDesc) groupAttrs.push(...printerDescriptionAttrs(state, cfg, uptime));
    if (wantTmpl) groupAttrs.push(...jobTemplateAttrs(cfg));
    if (wantSubs) groupAttrs.push(...subscriptionDescAttrs());
    // Also include individually named attrs not already in the groups
    const coveredNames = new Set(groupAttrs.map((a) => a.name));
    const extraNames = requested.filter((r) => !GROUP_KEYWORDS.includes(r));
    for (const name of extraNames) {
      if (!coveredNames.has(name)) {
        const found = allPossible.find((a) => a.name === name);
        if (found) groupAttrs.push(found);
      }
    }
    finalAttrs = groupAttrs;
  } else {
    // Only specific named attrs
    finalAttrs = allPossible.filter((a) => requested.includes(a.name));
  }

  return okResponse(req, { tag: 'printer-attributes-tag', attributes: finalAttrs });
}

// ─── Get-Printer-Supported-Values ────────────────────────────────────────────

export function handleGetPrinterSupportedValues(
  _state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  // Returns the same as printer-description for supported-values
  const uptime = 0;
  const attrs  = jobTemplateAttrs(cfg);
  return okResponse(req, { tag: 'printer-attributes-tag', attributes: attrs });
}

// ─── Set-Printer-Attributes ───────────────────────────────────────────────────

export function handleSetPrinterAttributes(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  // Minimal: only printer-state-message is settable
  const printerGroup = req.groups.find((g) => g.tag === 'printer-attributes-tag');
  if (printerGroup) {
    const msgAttr = printerGroup.attributes.find((a) => a.name === 'printer-state-message');
    if (msgAttr) {
      const val = msgAttr.values[0];
      state.printerStateMessage =
        val?.tag === 'textWithoutLanguage' ? val.value : '';
    }
  }
  return okResponse(req);
}

// ─── Pause-Printer / Resume-Printer / Purge-Jobs ─────────────────────────────

export function handlePausePrinter(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  state.printerState        = 'stopped';
  state.printerStateReasons = ['paused'];
  state.isAcceptingJobs     = false;
  return okResponse(req);
}

export function handleResumePrinter(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const hasActiveJobs = [...state.jobs.values()].some(
    (j) => j.state === 'pending' || j.state === 'processing',
  );
  state.printerState        = hasActiveJobs ? 'processing' : 'idle';
  state.printerStateReasons = ['none'];
  state.isAcceptingJobs     = true;
  return okResponse(req);
}

export function handlePurgeJobs(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  // Cancel all non-terminal jobs
  for (const job of state.jobs.values()) {
    if (job.state === 'pending' || job.state === 'pending-held' || job.state === 'processing') {
      job.state         = 'canceled';
      job.stateReasons  = ['job-canceled-by-operator'];
      job.completedAt   = new Date();
    }
  }
  return okResponse(req);
}

// ─── Identify-Printer ────────────────────────────────────────────────────────

export function handleIdentifyPrinter(
  _state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  // RFC 8011 §4.3.11 — no output attributes; just verify the printer URI
  const printerUri = opStr(req, 'printer-uri');
  if (printerUri && printerUri !== cfg.printerUri) {
    return errResponse(req, 'client-error-not-found', `Printer not found: ${printerUri}`);
  }
  return okResponse(req);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_FORMATS    = ['application/pdf', 'application/octet-stream', 'image/jpeg', 'image/png'];
const DEFAULT_MEDIA      = ['iso_a4_210x297mm', 'na_letter_8.5x11in', 'na_legal_8.5x14in'];
const DEFAULT_SIDES      = ['one-sided', 'two-sided-long-edge', 'two-sided-short-edge'];
const DEFAULT_QUALITY    = ['draft', 'normal', 'high'];
const DEFAULT_ORIENTATIONS = ['portrait', 'landscape', 'reverse-landscape', 'reverse-portrait'];
const NOTIFY_EVENTS      = [
  'printer-state-changed', 'printer-stopped', 'printer-restarted', 'printer-shutdown',
  'printer-config-changed', 'printer-queue-order-changed',
  'job-created', 'job-completed', 'job-stopped', 'job-config-changed',
  'job-progress', 'job-state-changed',
];
