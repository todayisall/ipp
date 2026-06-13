# @ipp — Internet Printing Protocol for TypeScript

A full TypeScript 6.0 implementation of IPP/2.0 (RFC 8010 / RFC 8011) with cross-platform support.  
Works in **Node.js**, **browsers**, **Deno**, **Bun**, and **HarmonyOS Next**.

```
pnpm add @ipp/client
```

---

## Packages

| Package | Description |
|---------|-------------|
| [`@ipp/protocol`](#ippprotocol) | IPP types, constants, enums, value helpers |
| [`@ipp/codec`](#ippcodec) | RFC 8010 binary parser + serializer |
| [`@ipp/client`](#ippclient) | `Printer` class + all operation builders |
| [`@ipp/transport-fetch`](#ipptransport-fetch) | Fetch API transport (Node 18+, browsers, Deno, Bun) |
| [`@ipp/transport-node`](#ipptransport-node) | Node.js `http`/`https` transport (TLS control, Node < 18) |
| [`@ipp/transport-harmony`](#ipptransport-harmony) | HarmonyOS Next `@ohos.net.http` transport |
| [`@ipp/server`](#ippserver) | Mock IPP printer server for testing |

---

## Quick Start

### Print a document

```typescript
import { Printer } from '@ipp/client';

// Node.js 18+ / browsers / Deno / Bun — Fetch is used automatically
const printer = new Printer('ipp://192.168.1.100:631/ipp/printer');

const resp = await printer.printJob(pdfBytes, {
  jobName:        'My Document',
  documentFormat: 'application/pdf',
  copies:         1,
  sides:          'two-sided-long-edge',
});

const jobGroup = resp.groups.find(g => g.tag === 'job-attributes-tag')!;
const jobId    = jobGroup.attributes.find(a => a.name === 'job-id')!.values[0];
console.log('Job ID:', (jobId as { value: number }).value);
```

### Use a specific transport

```typescript
import { Printer } from '@ipp/client';
import { NodeTransport } from '@ipp/transport-node';

// Node.js http/https — use for TLS control or Node < 18
const printer = new Printer(
  'ipps://printer.corp:443/ipp/print',
  { version: '2.0' },
  new NodeTransport({ rejectUnauthorized: false }),  // allow self-signed cert
);
```

### Spin up a mock printer for tests

```typescript
import { MockPrinter, IppServer } from '@ipp/server';

const mock   = new MockPrinter({ printerUri: 'ipp://localhost:3631/ipp/printer' });
const server = new IppServer(mock);
const { port } = await server.listen(3631);
// → real IPP server at ipp://localhost:3631/ipp/printer
```

---

## `@ipp/protocol`

Low-level IPP primitives shared by every other package.

### Value helpers (`v`)

```typescript
import { v } from '@ipp/protocol';

v.integer(42)                      // { tag: 'integer',             value: 42 }
v.boolean(true)                    // { tag: 'boolean',             value: true }
v.keyword('one-sided')             // { tag: 'keyword',             value: 'one-sided' }
v.enum('idle')                     // { tag: 'enum',                value: 'idle' }
v.uri('ipp://host/ipp')            // { tag: 'uri',                 value: 'ipp://host/ipp' }
v.name('My Printer')               // { tag: 'nameWithoutLanguage', value: 'My Printer' }
v.text('Ready')                    // { tag: 'textWithoutLanguage', value: 'Ready' }
v.charset('utf-8')                 // { tag: 'charset',             value: 'utf-8' }
v.naturalLanguage('en-us')         // { tag: 'naturalLanguage',     value: 'en-us' }
v.mimeMediaType('application/pdf') // { tag: 'mimeMediaType',       value: 'application/pdf' }
```

### Query helpers

```typescript
import { getGroup, getAttr, getFirstValue } from '@ipp/protocol';

const group = getGroup(resp, 'printer-attributes-tag');
const attr  = getAttr(group, 'printer-state');
const val   = getFirstValue(attr);  // { tag: 'enum', value: 'idle' }
```

### Status code check

```typescript
import { isErrorStatus } from '@ipp/protocol';

if (isErrorStatus(resp.statusCode)) { /* handle error */ }
```

---

## `@ipp/codec`

Platform-agnostic binary parser and serializer. No DOM or Node.js APIs required.

```typescript
import { parse, serialize } from '@ipp/codec';

// Serialize a request message → Uint8Array
const bytes = serialize({
  version:   '2.0',
  operation: 'Get-Printer-Attributes',
  requestId: 1,
  groups: [{
    tag: 'operation-attributes-tag',
    attributes: [
      { name: 'attributes-charset',          values: [v.charset('utf-8')]          },
      { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')]  },
      { name: 'printer-uri',                 values: [v.uri('ipp://host/ipp')]      },
    ],
  }],
});

// Parse a response binary → IppMessage
const msg = parse(bytes);
// msg.version      → '2.0'
// msg.statusCode   → 'successful-ok'
// msg.requestId    → 1
// msg.groups       → IppAttributeGroup[]
```

**Key design:** `IppValue` uses a **discriminated union** on `tag`, not raw integers:

```typescript
// Correct — values carry their semantic type
{ tag: 'enum',    value: 'idle' }
{ tag: 'integer', value: 42 }
{ tag: 'keyword', value: 'one-sided' }

// Unknown enum codes come back as their decimal string
{ tag: 'enum', value: '42' }
```

---

## `@ipp/client`

High-level `Printer` class plus low-level builder functions.

### `Printer` class

```typescript
import { Printer } from '@ipp/client';

const printer = new Printer(
  'ipp://192.168.1.5:631/ipp/printer',  // URL (ipp:// or ipps://)
  {
    version:    '2.0',    // default: '2.0'
    charset:    'utf-8',  // default: 'utf-8'
    language:   'en-us',  // default: 'en-us'
    timeout:    30_000,   // ms, default: 30000
  },
  transport,              // optional; auto-detected if omitted
);
```

### Printer operations

```typescript
// Query printer
await printer.getPrinterAttributes();
await printer.getPrinterAttributes({ requestedAttributes: ['printer-state', 'printer-name'] });

// Submit jobs
await printer.printJob(pdfBytes, { jobName: 'Report', copies: 2 });
await printer.printUri('https://example.com/doc.pdf', { documentFormat: 'application/pdf' });
await printer.validateJob({ documentFormat: 'application/pdf' });

// Job control
await printer.cancelJob(jobId);
await printer.getJobAttributes(jobId);
await printer.getJobAttributes(jobId, { requestedAttributes: ['job-state', 'job-state-reasons'] });
await printer.getJobs({ whichJobs: 'completed', limit: 20 });
await printer.closeJob(jobId);

// Printer notifications (RFC 3995)
await printer.subscribe([{ notifyEvents: ['job-completed'], notifyPullMethod: 'ippget' }]);
await printer.subscribeToJob(jobId, [{ notifyEvents: ['job-state-changed'] }]);
await printer.getSubscriptions();
await printer.renewSubscription(subId, 3600);
await printer.cancelSubscription(subId);

// Other
await printer.identifyPrinter(['sound', 'flash']);
```

### Multi-document jobs (Create-Job + Send-Document)

```typescript
import { v, generateRequestId } from '@ipp/client';

// 1. Create an empty job
const createResp = await printer.execute({
  version: '2.0', operation: 'Create-Job', requestId: generateRequestId(),
  groups: [{
    tag: 'operation-attributes-tag',
    attributes: [
      { name: 'attributes-charset',          values: [v.charset('utf-8')]         },
      { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')] },
      { name: 'printer-uri',                 values: [v.uri(printerUri)]           },
      { name: 'job-name',                    values: [v.name('Multi-Doc')]         },
    ],
  }],
});
const jobId = /* read from createResp */;

// 2. Send each document (last-document = false until the last one)
for (let i = 0; i < docs.length; i++) {
  await printer.execute({
    version: '2.0', operation: 'Send-Document', requestId: generateRequestId(),
    groups: [{
      tag: 'operation-attributes-tag',
      attributes: [
        { name: 'attributes-charset',          values: [v.charset('utf-8')]            },
        { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')]    },
        { name: 'printer-uri',                 values: [v.uri(printerUri)]              },
        { name: 'job-id',                      values: [v.integer(jobId)]               },
        { name: 'last-document',               values: [v.boolean(i === docs.length - 1)] },
      ],
    }],
    data: docs[i],
  });
}
```

### Builder functions (without `Printer`)

All builders are exported directly from `@ipp/client`:

```typescript
import {
  buildGetPrinterAttributes, buildPrintJob,
  buildCancelJob, buildGetJobAttributes, buildGetJobs,
  buildCreatePrinterSubscriptions,
  generateRequestId, DEFAULT_PRINTER_OPTIONS,
} from '@ipp/client';

const req = buildPrintJob(
  { printerUri, version: '2.0', charset: 'utf-8', language: 'en-us' },
  pdfBytes,
  { jobName: 'Report', copies: 2 },
);
```

---

## `@ipp/transport-fetch`

Uses the standard **Fetch API**. Works anywhere `fetch` is available.

```typescript
import { FetchTransport } from '@ipp/transport-fetch';

const printer = new Printer(url, opts, new FetchTransport());
```

Automatically converts `ipp://` → `http://` and `ipps://` → `https://`.

> **TLS note:** The Fetch API does not expose `rejectUnauthorized` or custom CA options.
> For self-signed certificates use `@ipp/transport-node` instead.

---

## `@ipp/transport-node`

Uses Node.js built-in `http`/`https` modules. Prefer this when you need TLS control or are on Node.js < 18.

```typescript
import { NodeTransport } from '@ipp/transport-node';

// Default (TLS verification enabled)
new NodeTransport()

// Accept self-signed certificate
new NodeTransport({ rejectUnauthorized: false })

// Custom CA bundle (IPPS / mutual TLS)
new NodeTransport({ ca: fs.readFileSync('./ca.crt') })
```

Automatically converts `ipp://` → `http://` and `ipps://` → `https://`, and defaults to port **631** when no port is specified.

---

## `@ipp/transport-harmony`

Transport for **HarmonyOS Next** applications using `@ohos.net.http`.

```typescript
import { HarmonyTransport } from '@ipp/transport-harmony';
import { Printer } from '@ipp/client';

const printer = new Printer('ipp://192.168.1.5:631/ipp', {}, new HarmonyTransport());
```

The `@ohos.net.http` module is loaded via dynamic import at runtime — the package compiles without the HarmonyOS SDK present.

---

## `@ipp/server`

A stateful mock IPP printer for integration and end-to-end testing.

### Architecture

```
MockPrinter            — pure request handler, no HTTP, unit-testable
IppServer              — thin Node.js HTTP wrapper around MockPrinter
```

### Start a server

```typescript
import { MockPrinter, IppServer } from '@ipp/server';

const mock = new MockPrinter({
  printerUri:      'ipp://localhost:3631/ipp/printer',
  printerName:     'Test Laser',
  autoProcessJobs: true,    // auto-advance job state machine
  processingDelay: 0,       // ms: pending → processing
  completionDelay: 100,     // ms: processing → completed
});

const server = new IppServer(mock);
const { port } = await server.listen(3631);

// Cleanup
await server.close();
mock.destroy();             // cancels internal timers
```

### Use MockPrinter directly (no HTTP)

```typescript
import { MockPrinter } from '@ipp/server';
import { buildPrintJob } from '@ipp/client';

const printer = new MockPrinter({
  printerUri:      'ipp://test.local/ipp',
  autoProcessJobs: false,   // stay in 'pending' for deterministic tests
});

const resp = printer.handle(
  buildPrintJob(
    { printerUri: 'ipp://test.local/ipp', version: '2.0', charset: 'utf-8', language: 'en-us' },
    pdfBytes,
    { jobName: 'Test', copies: 2 },
  ),
);

const jobId = /* read from resp */;
console.log(printer.jobs.get(jobId)!.state);  // 'pending'

printer.destroy();
```

### Supported operations (27)

| Category | Operations |
|----------|-----------|
| Job creation | Print-Job, Print-URI, Validate-Job, Create-Job, Send-Document, Send-URI, Close-Job |
| Job control | Cancel-Job, Cancel-Jobs, Cancel-My-Jobs, Hold-Job, Release-Job, Restart-Job, Set-Job-Attributes |
| Job query | Get-Job-Attributes, Get-Jobs |
| Printer query | Get-Printer-Attributes, Get-Printer-Supported-Values |
| Printer control | Set-Printer-Attributes, Pause-Printer, Resume-Printer, Purge-Jobs, Identify-Printer |
| Subscriptions | Create-Printer-Subscriptions, Create-Job-Subscriptions, Get-Subscriptions, Renew-Subscription, Cancel-Subscription |

### Job state machine

```
Print-Job / Send-Document(last) ──▶ pending
                                       │
                    Hold-Job ◀─────────┤──────▶ pending-held
                                       │             │
                               scheduleProcessing    │ Release-Job
                                       │             │
                                       ▼             ▼
                                  processing ◀───────┘
                                       │
                                  (completionDelay)
                                       │
                              ┌────────┴────────┐
                              ▼                 ▼
                          completed          canceled / aborted
```

### `PrinterConfig` options

```typescript
new MockPrinter({
  // Required
  printerUri: 'ipp://localhost:631/ipp/printer',

  // Printer identity
  printerName:     'My Printer',      // default: 'Mock Printer'
  makeAndModel:    'ACME LJ 3000',
  info:            'Lobby printer',
  location:        '1F West',
  colorSupported:  true,              // default: false
  pagesPerMinute:  40,                // default: 20

  // Supported capabilities
  documentFormats:      ['application/pdf', 'image/jpeg'],
  mediaSupported:       ['iso_a4_210x297mm', 'na_letter_8.5x11in'],
  copiesSupported:      [1, 99],      // [min, max]
  sidesSupported:       ['one-sided', 'two-sided-long-edge'],
  resolutionsSupported: [{ x: 600, y: 600, unit: 'dpi' }],

  // Job state machine
  autoProcessJobs:  true,   // default: true
  processingDelay:  0,      // ms, default: 0
  completionDelay:  10,     // ms, default: 10
});
```

---

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests (builds first)
pnpm test

# Per-package tests (no build required — uses source aliases)
pnpm --filter @ipp/protocol   test
pnpm --filter @ipp/codec      test
pnpm --filter @ipp/client     test
pnpm --filter @ipp/server     test
pnpm --filter @ipp/transport-fetch test
pnpm --filter @ipp/transport-node  test

# TDD watch mode
pnpm --filter @ipp/codec test:watch

# Type-check all packages
pnpm typecheck

# Lint / format
pnpm lint
pnpm format
```

### Monorepo structure

```
packages/
  protocol/          @ipp/protocol        — IPP types, constants, enums
  codec/             @ipp/codec           — RFC 8010 binary codec
  client/            @ipp/client          — Printer class + builders
  transport-fetch/   @ipp/transport-fetch — Fetch API transport
  transport-node/    @ipp/transport-node  — Node.js http/https transport
  transport-harmony/ @ipp/transport-harmony — HarmonyOS @ohos.net.http transport
  server/            @ipp/server          — Mock printer server
```

---

## Further Reading

- [Client ↔ Server interaction guide](docs/client-server-guide.md) — protocol internals, job state machine, polling patterns, testing recipes
- [RFC 8010](https://datatracker.ietf.org/doc/html/rfc8010) — IPP/1.1 encoding
- [RFC 8011](https://datatracker.ietf.org/doc/html/rfc8011) — IPP/1.1 model and semantics
- [RFC 3995](https://datatracker.ietf.org/doc/html/rfc3995) — IPP event notifications

---

## License

MIT
