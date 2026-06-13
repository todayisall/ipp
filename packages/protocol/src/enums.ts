// RFC 8011 + PWG extensions — Enumerated attribute values
// EnumRegistry maps attribute-name → { enumName → wireCode }
// Used by codec for serialize (name→code) and parse (code→name).
// Collection member names share the same global namespace (member names are globally unique in IPP).

type EnumMap = Record<string, number>;

const enumData: Record<string, EnumMap> = {
  // ── RFC 8011 §5.4.11 ────────────────────────────────────────────────────────
  'printer-state': {
    idle:       3,
    processing: 4,
    stopped:    5,
  },

  // ── RFC 8011 §5.3.7 ─────────────────────────────────────────────────────────
  'job-state': {
    pending:              3,
    'pending-held':       4,
    processing:           5,
    'processing-stopped': 6,
    canceled:             7,
    aborted:              8,
    completed:            9,
  },

  // ── PWG 5100.5 §9.2 ─────────────────────────────────────────────────────────
  'document-state': {
    pending:    3,
    processing: 5,
    canceled:   7,
    aborted:    8,
    completed:  9,
  },

  // ── RFC 8011 §5.3.3 + PWG 5100.1 finishings ─────────────────────────────────
  finishings: {
    none:                      3,
    staple:                    4,
    punch:                     5,
    cover:                     6,
    bind:                      7,
    'saddle-stitch':            8,
    'edge-stitch':              9,
    fold:                      10,
    trim:                      11,
    bale:                      12,
    'booklet-maker':           13,
    'jog-offset':              14,
    'coat':                    15,
    'laminate':                16,
    'staple-top-left':         20,
    'staple-bottom-left':      21,
    'staple-top-right':        22,
    'staple-bottom-right':     23,
    'edge-stitch-left':        24,
    'edge-stitch-top':         25,
    'edge-stitch-right':       26,
    'edge-stitch-bottom':      27,
    'staple-dual-left':        28,
    'staple-dual-top':         29,
    'staple-dual-right':       30,
    'staple-dual-bottom':      31,
    'staple-triple-left':      32,
    'staple-triple-top':       33,
    'staple-triple-right':     34,
    'staple-triple-bottom':    35,
    'bind-left':               50,
    'bind-top':                51,
    'bind-right':              52,
    'bind-bottom':             53,
    'trim-after-pages':        60,
    'trim-after-documents':    61,
    'trim-after-copies':       62,
    'trim-after-job':          63,
    'punch-top-left':          70,
    'punch-bottom-left':       71,
    'punch-top-right':         72,
    'punch-bottom-right':      73,
    'punch-dual-left':         74,
    'punch-dual-top':          75,
    'punch-dual-right':        76,
    'punch-dual-bottom':       77,
    'punch-triple-left':       78,
    'punch-triple-top':        79,
    'punch-triple-right':      80,
    'punch-triple-bottom':     81,
    'punch-quad-left':         82,
    'punch-quad-top':          83,
    'punch-quad-right':        84,
    'punch-quad-bottom':       85,
    'fold-accordion':          90,
    'fold-double-gate':        91,
    'fold-gate':               92,
    'fold-half':               93,
    'fold-half-z':             94,
    'fold-left-gate':          95,
    'fold-letter':             96,
    'fold-parallel':           97,
    'fold-poster':             98,
    'fold-right-gate':         99,
    'fold-z':                  100,
    'fold-engineering-z':      101,
  },

  // ── RFC 8011 §5.4.14 ────────────────────────────────────────────────────────
  'orientation-requested': {
    portrait:            3,
    landscape:           4,
    'reverse-landscape': 5,
    'reverse-portrait':  6,
    none:                7, // PWG 5100.13
  },

  // ── RFC 8011 §5.3.3 ─────────────────────────────────────────────────────────
  'print-quality': {
    draft:  3,
    normal: 4,
    high:   5,
  },

  // ── RFC 8011 §5.4.15 — operations-supported ─────────────────────────────────
  'operations-supported': {
    'Print-Job':                    0x0002,
    'Print-URI':                    0x0003,
    'Validate-Job':                 0x0004,
    'Create-Job':                   0x0005,
    'Send-Document':                0x0006,
    'Send-URI':                     0x0007,
    'Cancel-Job':                   0x0008,
    'Get-Job-Attributes':           0x0009,
    'Get-Jobs':                     0x000A,
    'Get-Printer-Attributes':       0x000B,
    'Hold-Job':                     0x000C,
    'Release-Job':                  0x000D,
    'Restart-Job':                  0x000E,
    'Pause-Printer':                0x0010,
    'Resume-Printer':               0x0011,
    'Purge-Jobs':                   0x0012,
    'Set-Printer-Attributes':       0x0013,
    'Set-Job-Attributes':           0x0014,
    'Get-Printer-Supported-Values': 0x0015,
    'Create-Printer-Subscriptions': 0x0016,
    'Create-Job-Subscriptions':     0x0017,
    'Get-Subscriptions':            0x0018,
    'Renew-Subscription':           0x0019,
    'Cancel-Subscription':          0x001A,
    'Get-Notifications':            0x001B,
    'Send-Notifications':           0x001C,
    'Get-Resource-Attributes':      0x001D,
    'Get-Resources':                0x0022,  // note: conflict; using actual RFC value
    'Enable-Printer':               0x0022,
    'Disable-Printer':              0x0023,
    'Pause-Printer-After-Current-Job': 0x0024,
    'Hold-New-Jobs':                0x0025,
    'Release-Held-New-Jobs':        0x0026,
    'Deactivate-Printer':           0x0027,
    'Activate-Printer':             0x0028,
    'Restart-Printer':              0x0029,
    'Shutdown-Printer':             0x002A,
    'Startup-Printer':              0x002B,
    'Reprocess-Job':                0x002C,
    'Cancel-Current-Job':           0x002D,
    'Suspend-Current-Job':          0x002E,
    'Resume-Job':                   0x002F,
    'Promote-Job':                  0x0030,
    'Schedule-Job-After':           0x0031,
    'Cancel-Document':              0x0033,
    'Get-Document-Attributes':      0x0034,
    'Get-Documents':                0x0035,
    'Delete-Document':              0x0036,
    'Set-Document-Attributes':      0x0037,
    'Cancel-Jobs':                  0x0038,
    'Cancel-My-Jobs':               0x0039,
    'Resubmit-Job':                 0x003A,
    'Close-Job':                    0x003B,
    'Identify-Printer':             0x003C,
    'Validate-Document':            0x003D,
    'Add-Document-Images':          0x003E,
    'Acknowledge-Document':         0x003F,
    'Acknowledge-Identify-Printer': 0x0040,
    'Acknowledge-Job':              0x0041,
    'Fetch-Document':               0x0042,
    'Fetch-Job':                    0x0043,
    'Get-Output-Device-Attributes': 0x0044,
    'Update-Active-Jobs':           0x0045,
    'Deregister-Output-Device':     0x0046,
    'Update-Document-Status':       0x0047,
    'Update-Job-Status':            0x0048,
    'Update-Output-Device-Attributes': 0x0049,
    'Get-Next-Document-Data':       0x004A,
    'Allocate-Printer-Resources':   0x004B,
    'Deallocate-Printer-Resources': 0x004C,
  },

  // ── RFC 8011 §5.3.4 — multiple-document-handling ────────────────────────────
  'multiple-document-handling': {
    'single-document':                      0,
    'separate-documents-uncollated-copies': 1,
    'separate-documents-collated-copies':   2,
    'single-document-new-sheet':            3,
  },

  // ── RFC 8011 — output-bin ────────────────────────────────────────────────────
  'output-bin': {
    top:              0,
    middle:           1,
    bottom:           2,
    side:             3,
    left:             4,
    right:            5,
    center:           6,
    rear:             7,
    'face-up':        8,
    'face-down':      9,
    'large-capacity': 10,
    stacker:          11,
    mailbox:          12,
    tray:             13,
  },

  // ── PWG 5100.5 — page-delivery ───────────────────────────────────────────────
  'page-delivery': {
    'reverse-order-face-down':  0,
    'reverse-order-face-up':    1,
    'same-order-face-down':     2,
    'same-order-face-up':       3,
    'system-specified':         4,
  },

  // ── PWG 5100.1 — cover-type (for cover-front/cover-back attributes) ──────────
  'cover-type': {
    'no-cover':           0,
    'print-none':         1,
    'print-front':        2,
    'print-back':         3,
    'print-both':         4,
  },

  // ── RFC 8011 — job-collation-type ────────────────────────────────────────────
  'job-collation-type': {
    'uncollated-sheets':        1,
    'collated-documents':       2,
    'uncollated-documents':     3,
  },

  // ── PWG 5100.1 — baling-type ─────────────────────────────────────────────────
  'baling-type': {
    'band':              0,
    'shrink-wrap':       1,
    'wrap':              2,
  },

  // ── PWG 5100.1 — stitching-method ────────────────────────────────────────────
  'stitching-method': {
    'auto':          0,
    'crimp':         1,
    'wire':          2,
  },

  // ── PWG 5100.1 — trimming-type ───────────────────────────────────────────────
  'trimming-type': {
    'draw-line':                0,
    'full':                     1,
    'partial':                  2,
    'perforate':                3,
    'score':                    4,
    'tab':                      5,
  },

  // ── PWG 5100.1 — punch-location ──────────────────────────────────────────────
  'punch-location': {
    'bottom-left':      0,
    'bottom-middle':    1,
    'bottom-right':     2,
    'left-bottom':      3,
    'left-middle':      4,
    'left-top':         5,
    'right-bottom':     6,
    'right-middle':     7,
    'right-top':        8,
    'top-left':         9,
    'top-middle':       10,
    'top-right':        11,
  },

  // ── RFC 3381 — presentation-direction-number-up ─────────────────────────────
  'presentation-direction-number-up': {
    'tobottom-toleft':  0,
    'tobottom-toright': 1,
    'toleft-tobottom':  2,
    'toleft-totop':     3,
    'toright-tobottom': 4,
    'toright-totop':    5,
    'totop-toleft':     6,
    'totop-toright':    7,
  },

  // ── PWG 5100.13 — identify-actions ──────────────────────────────────────────
  // (IPP Everywhere; actual values are keyword but some printers use integer enum)
  'identify-actions': {
    display: 0,
    flash:   1,
    sound:   2,
    speak:   3,
  },

  // ── RFC 8011 — page-order-received (integer enum in some implementations) ────
  'page-order-received': {
    '1-to-n-order':  1,
    'n-to-1-order':  2,
  },

  // ── PWG 5100.13 — printer-kind is keyword; but bitmask attrs use integer ─────
  // 'printer-kind' is keyword — omitted intentionally

  // ── RFC 8011 — feed-orientation ─────────────────────────────────────────────
  'feed-orientation': {
    'long-edge-first':  3,
    'short-edge-first': 4,
  },
};

// ── Aliases: many IPP attributes share enum tables ───────────────────────────
// e.g. 'finishings-supported' uses the same table as 'finishings'
const aliases: Record<string, string> = {
  // finishings
  'finishings-supported':                         'finishings',
  'finishings-default':                           'finishings',
  'finishings-ready':                             'finishings',
  'finishings-col-database':                      'finishings',
  'job-finishings':                               'finishings',
  'job-finishings-supported':                     'finishings',

  // orientation-requested
  'orientation-requested-supported':              'orientation-requested',
  'orientation-requested-default':                'orientation-requested',

  // print-quality
  'print-quality-default':                        'print-quality',
  'print-quality-supported':                      'print-quality',
  'job-print-quality-default':                    'print-quality',

  // job-state
  'job-state-supported':                          'job-state',

  // printer-state
  'printer-state-supported':                      'printer-state',

  // document-state
  'document-state-supported':                     'document-state',

  // output-bin
  'output-bin-default':                           'output-bin',
  'output-bin-supported':                         'output-bin',

  // multiple-document-handling
  'multiple-document-handling-default':           'multiple-document-handling',
  'multiple-document-handling-supported':         'multiple-document-handling',

  // page-delivery
  'page-delivery-default':                        'page-delivery',
  'page-delivery-supported':                      'page-delivery',

  // cover-type (used in cover-front and cover-back collection members)
  'cover-type-supported':                         'cover-type',

  // job-collation-type
  'job-collation-type-supported':                 'job-collation-type',
  'sheet-collation-supported':                    'job-collation-type',

  // baling-type
  'baling-type-supported':                        'baling-type',

  // stitching-method
  'stitching-method-supported':                   'stitching-method',

  // trimming-type
  'trimming-type-supported':                      'trimming-type',

  // punch-location
  'punch-location-supported':                     'punch-location',

  // presentation-direction-number-up
  'presentation-direction-number-up-supported':   'presentation-direction-number-up',

  // feed-orientation
  'feed-orientation-default':                     'feed-orientation',
  'feed-orientation-supported':                   'feed-orientation',

  // page-order-received
  'page-order-received-default':                  'page-order-received',
  'page-order-received-supported':                'page-order-received',
};

function resolveAttrName(attrName: string): string {
  return aliases[attrName] ?? attrName;
}

// Reverse maps: attrName → code → name
const reverseMaps = new Map<string, Map<number, string>>();
for (const [attrName, map] of Object.entries(enumData)) {
  const rev = new Map<number, string>();
  for (const [name, code] of Object.entries(map)) rev.set(code, name);
  reverseMaps.set(attrName, rev);
}

export const EnumRegistry = {
  /**
   * Resolve enum name → wire code for a given attribute.
   * Returns undefined if the attribute has no enum table or the name is unknown.
   */
  resolve(attrName: string, enumName: string): number | undefined {
    return enumData[resolveAttrName(attrName)]?.[enumName];
  },

  /**
   * Reverse-lookup: wire code → enum name for a given attribute.
   * Returns undefined if unknown; callers should fall back to the string representation of the code.
   */
  lookup(attrName: string, code: number): string | undefined {
    return reverseMaps.get(resolveAttrName(attrName))?.get(code);
  },

  /** Returns true if the attribute name has a registered enum table. */
  hasTable(attrName: string): boolean {
    return resolveAttrName(attrName) in enumData;
  },
} as const;
