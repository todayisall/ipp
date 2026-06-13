// RFC 8011 §5.4.16 — IPP Status Codes

const statusEntries = [
  // Successful (0x0000–0x00FF)
  ['successful-ok',                                      0x0000],
  ['successful-ok-ignored-or-substituted-attributes',    0x0001],
  ['successful-ok-conflicting-attributes',               0x0002],
  ['successful-ok-ignored-subscriptions',                0x0003], // RFC 3995
  ['successful-ok-too-many-events',                      0x0005], // RFC 3995
  ['successful-ok-events-complete',                      0x0007], // RFC 3995

  // Informational (0x0100–0x01FF) — none defined yet

  // Redirection (0x0300–0x03FF) — none defined yet

  // Client Error (0x0400–0x04FF)
  ['client-error-bad-request',                           0x0400],
  ['client-error-forbidden',                             0x0401],
  ['client-error-not-authenticated',                     0x0402],
  ['client-error-not-authorized',                        0x0403],
  ['client-error-not-possible',                          0x0404],
  ['client-error-timeout',                               0x0405],
  ['client-error-not-found',                             0x0406],
  ['client-error-gone',                                  0x0407],
  ['client-error-request-entity-too-large',              0x0408],
  ['client-error-request-value-too-long',                0x0409],
  ['client-error-document-format-not-supported',         0x040A],
  ['client-error-attributes-or-values-not-supported',    0x040B],
  ['client-error-uri-scheme-not-supported',              0x040C],
  ['client-error-charset-not-supported',                 0x040D],
  ['client-error-conflicting-attributes',                0x040E],
  ['client-error-compression-not-supported',             0x040F],
  ['client-error-compression-error',                     0x0410],
  ['client-error-document-format-error',                 0x0411],
  ['client-error-document-access-error',                 0x0412],
  ['client-error-attributes-not-settable',               0x0413], // RFC 3380
  ['client-error-ignored-all-subscriptions',             0x0414], // RFC 3995
  ['client-error-too-many-subscriptions',                0x0415], // RFC 3995
  ['client-error-document-password-error',               0x0418], // PWG 5100.13
  ['client-error-document-permission-error',             0x0419], // PWG 5100.13
  ['client-error-document-security-error',               0x041A], // PWG 5100.13
  ['client-error-document-unprintable-error',            0x041B], // PWG 5100.13
  ['client-error-account-info-needed',                   0x041C], // PWG 5100.13
  ['client-error-account-closed',                        0x041D], // PWG 5100.13
  ['client-error-account-limit-reached',                 0x041E], // PWG 5100.13
  ['client-error-account-authorization-failed',          0x041F], // PWG 5100.13
  ['client-error-not-fetchable',                         0x0420], // PWG 5100.18

  // Server Error (0x0500–0x05FF)
  ['server-error-internal-error',                        0x0500],
  ['server-error-operation-not-supported',               0x0501],
  ['server-error-service-unavailable',                   0x0502],
  ['server-error-version-not-supported',                 0x0503],
  ['server-error-device-error',                          0x0504],
  ['server-error-temporary-error',                       0x0505],
  ['server-error-not-accepting-jobs',                    0x0506],
  ['server-error-busy',                                  0x0507],
  ['server-error-job-canceled',                          0x0508],
  ['server-error-multiple-document-jobs-not-supported',  0x0509],
  ['server-error-printer-is-deactivated',                0x050A], // RFC 3998
  ['server-error-too-many-jobs',                         0x050B], // PWG 5100.11
  ['server-error-too-many-documents',                    0x050C], // PWG 5100.11
] as const satisfies [string, number][];

export type StatusCodeName = (typeof statusEntries)[number][0];

export const statusNameToCode = new Map<string, number>(
  statusEntries.map(([name, code]) => [name, code]),
);
export const statusCodeToName = new Map<number, StatusCodeName>(
  statusEntries.map(([name, code]) => [code, name]),
);

export function resolveStatusCode(name: StatusCodeName | string): number {
  const code = statusNameToCode.get(name);
  if (code !== undefined) return code;
  const n = Number(name);
  if (!Number.isNaN(n)) return n;
  throw new Error(`Unknown IPP status code: ${name}`);
}

export function resolveStatusName(code: number): StatusCodeName | string {
  return statusCodeToName.get(code) ?? `0x${code.toString(16).padStart(4, '0')}`;
}

export function isSuccessStatus(name: StatusCodeName | string): boolean {
  const code = statusNameToCode.get(name) ?? Number(name);
  return code >= 0x0000 && code <= 0x00FF;
}

export function isErrorStatus(name: StatusCodeName | string): boolean {
  return !isSuccessStatus(name);
}
