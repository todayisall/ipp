// RFC 8011 §5.4.15 + PWG extensions — IPP Operation names and codes

/** All known IPP operation names (string literal union). */
export type KnownOperationName =
  // RFC 8011 Core
  | 'Print-Job'                        // 0x0002
  | 'Print-URI'                        // 0x0003
  | 'Validate-Job'                     // 0x0004
  | 'Create-Job'                       // 0x0005
  | 'Send-Document'                    // 0x0006
  | 'Send-URI'                         // 0x0007
  | 'Cancel-Job'                       // 0x0008
  | 'Get-Job-Attributes'               // 0x0009
  | 'Get-Jobs'                         // 0x000A
  | 'Get-Printer-Attributes'           // 0x000B
  | 'Hold-Job'                         // 0x000C
  | 'Release-Job'                      // 0x000D
  | 'Restart-Job'                      // 0x000E
  | 'Pause-Printer'                    // 0x0010
  | 'Resume-Printer'                   // 0x0011
  | 'Purge-Jobs'                       // 0x0012
  // RFC 3380 — Set Operations
  | 'Set-Printer-Attributes'           // 0x0013
  | 'Set-Job-Attributes'               // 0x0014
  | 'Get-Printer-Supported-Values'     // 0x0015
  // RFC 3995/3996 — Event Notifications
  | 'Create-Printer-Subscriptions'     // 0x0016
  | 'Create-Job-Subscriptions'         // 0x0017
  | 'Get-Subscriptions'                // 0x0018
  | 'Renew-Subscription'               // 0x0019
  | 'Cancel-Subscription'              // 0x001A
  | 'Get-Notifications'                // 0x001B
  // RFC 3998 — Printer Administration
  | 'Enable-Printer'                   // 0x0022
  | 'Disable-Printer'                  // 0x0023
  | 'Pause-Printer-After-Current-Job'  // 0x0024
  | 'Hold-New-Jobs'                    // 0x0025
  | 'Release-Held-New-Jobs'            // 0x0026
  | 'Deactivate-Printer'               // 0x0027
  | 'Activate-Printer'                 // 0x0028
  | 'Restart-Printer'                  // 0x0029
  | 'Shutdown-Printer'                 // 0x002A
  | 'Startup-Printer'                  // 0x002B
  | 'Cancel-Current-Job'               // 0x002C
  | 'Suspend-Current-Job'              // 0x002D
  | 'Resume-Job'                       // 0x002E
  | 'Promote-Job'                      // 0x002F
  | 'Schedule-Job-After'               // 0x0030
  // PWG 5100.5 — Document Object
  | 'Cancel-Document'                  // 0x0033
  | 'Get-Document-Attributes'          // 0x0034
  | 'Get-Documents'                    // 0x0035
  | 'Close-Job'                        // 0x003B
  // PWG 5100.11 — Cancel Operations
  | 'Cancel-Jobs'                      // 0x0038
  | 'Cancel-My-Jobs'                   // 0x0039
  // PWG 5100.13 — Driver-Less Printing (IPP Everywhere)
  | 'Validate-Document'                // 0x003D
  | 'Identify-Printer'                 // 0x003C
  // PWG 5100.22 — System Service
  | 'Get-Resource-Attributes'          // 0x003E (also used in 5100.22)
  | 'Get-Resources'                    // 0x003F
  | 'Get-System-Attributes'            // 0x0042
  | 'Get-All-Printer-Attributes'       // 0x0044
  | 'Create-System-Subscriptions';     // 0x0041

/** Vendor-extension operations are also valid (arbitrary numeric codes) */
export type OperationName = KnownOperationName | (string & {});

/** Bidirectional mapping: operation name ↔ operation code */
const operationEntries: [KnownOperationName, number][] = [
  ['Print-Job',                       0x0002],
  ['Print-URI',                       0x0003],
  ['Validate-Job',                    0x0004],
  ['Create-Job',                      0x0005],
  ['Send-Document',                   0x0006],
  ['Send-URI',                        0x0007],
  ['Cancel-Job',                      0x0008],
  ['Get-Job-Attributes',              0x0009],
  ['Get-Jobs',                        0x000A],
  ['Get-Printer-Attributes',          0x000B],
  ['Hold-Job',                        0x000C],
  ['Release-Job',                     0x000D],
  ['Restart-Job',                     0x000E],
  ['Pause-Printer',                   0x0010],
  ['Resume-Printer',                  0x0011],
  ['Purge-Jobs',                      0x0012],
  ['Set-Printer-Attributes',          0x0013],
  ['Set-Job-Attributes',              0x0014],
  ['Get-Printer-Supported-Values',    0x0015],
  ['Create-Printer-Subscriptions',    0x0016],
  ['Create-Job-Subscriptions',        0x0017],
  ['Get-Subscriptions',               0x0018],
  ['Renew-Subscription',              0x0019],
  ['Cancel-Subscription',             0x001A],
  ['Get-Notifications',               0x001B],
  ['Enable-Printer',                  0x0022],
  ['Disable-Printer',                 0x0023],
  ['Pause-Printer-After-Current-Job', 0x0024],
  ['Hold-New-Jobs',                   0x0025],
  ['Release-Held-New-Jobs',           0x0026],
  ['Deactivate-Printer',              0x0027],
  ['Activate-Printer',                0x0028],
  ['Restart-Printer',                 0x0029],
  ['Shutdown-Printer',                0x002A],
  ['Startup-Printer',                 0x002B],
  ['Cancel-Current-Job',              0x002C],
  ['Suspend-Current-Job',             0x002D],
  ['Resume-Job',                      0x002E],
  ['Promote-Job',                     0x002F],
  ['Schedule-Job-After',              0x0030],
  ['Cancel-Document',                 0x0033],
  ['Get-Document-Attributes',         0x0034],
  ['Get-Documents',                   0x0035],
  ['Cancel-Jobs',                     0x0038],
  ['Cancel-My-Jobs',                  0x0039],
  ['Close-Job',                       0x003B],
  ['Identify-Printer',                0x003C],
  ['Validate-Document',               0x003D],
  ['Get-Resource-Attributes',         0x003E],
  ['Get-Resources',                   0x003F],
  ['Create-System-Subscriptions',     0x0041],
  ['Get-System-Attributes',           0x0042],
  ['Get-All-Printer-Attributes',      0x0044],
];

export const operationNameToCode = new Map<string, number>(operationEntries);
export const operationCodeToName = new Map<number, OperationName>(
  operationEntries.map(([name, code]) => [code, name]),
);

export function resolveOperationCode(name: OperationName): number {
  const code = operationNameToCode.get(name);
  if (code !== undefined) return code;
  // Allow hex strings like '0x0040' for vendor-extension operations
  const n = Number(name);
  if (!Number.isNaN(n)) return n;
  throw new Error(`Unknown IPP operation: ${name}`);
}

export function resolveOperationName(code: number): OperationName {
  return operationCodeToName.get(code) ?? `0x${code.toString(16).padStart(4, '0')}`;
}
