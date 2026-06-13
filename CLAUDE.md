# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TypeScript 6.0 rewrite of an IPP (Internet Printing Protocol) library. Uses a pnpm monorepo with packages designed for cross-platform support including HarmonyOS Next.

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages (required before running workspace-level tests)
pnpm build

# Run all tests (builds first, then runs vitest)
pnpm test

# Per-package tests (no build required — uses source aliases)
pnpm --filter @ipp/protocol test
pnpm --filter @ipp/codec test
pnpm --filter @ipp/client test
pnpm --filter @ipp/transport-fetch test

# Watch mode per package (TDD workflow)
pnpm --filter @ipp/codec test:watch

# Type-check all packages
pnpm typecheck

# Lint + format
pnpm lint
pnpm format
```

## Monorepo Structure

```
packages/
  protocol/       @ipp/protocol  — IPP types, constants, enums, helpers
  codec/          @ipp/codec     — Binary parser + serializer (platform-agnostic)
  client/         @ipp/client    — Printer class, builders, transports
  transport-fetch/ @ipp/transport-fetch — Fetch API transport (Node 18+, browsers)
  transport-harmony/ @ipp/transport-harmony — HarmonyOS @ohos.net.http transport
```

## Binary Protocol Architecture (RFC 8010)

IPP messages are big-endian binary. Structure:
- 2 bytes: version (major.minor)
- 2 bytes: operation code (request) or status code (response)
- 4 bytes: request-id
- N × attribute groups, each starting with a group-tag byte (0x01–0x0A)
- 1 byte: end-of-attributes-tag (0x03)
- Optional: document data

Each attribute: `[value-tag: u8][name-len: u16][name: ascii][value-len: u16][value]`.
Multi-valued attributes repeat with empty name (name-len = 0).

## Key Design Decisions

- **IppValue** uses discriminated union with `tag` field — `{ tag: 'enum', value: 'idle' }` not raw numbers
- **Enum values** are stored as resolved string names (e.g. `'idle'`), never wire integers
- **Unknown enum codes** are returned as their decimal string (`'42'`) per Q1 decision
- **requestId** is generated via `crypto.getRandomValues()` per Q2 decision
- **Collections** (RFC 3382) use `begCollection(0x34)` / `memberAttrName(0x4A)` / `endCollection(0x37)` wire format
- **Ambiguous op/status range** (0x0002–0x0007): parser emits both `operation` and `statusCode` fields
- **EnumRegistry** has alias system: `finishings-supported` → `finishings`, etc.
- **`types` export condition** must be FIRST in package.json exports, before `import`/`require`

## TypeScript 6.0 Notes

- `Uint8Array` without type parameter is `Uint8Array<ArrayBufferLike>`, not assignable to `BodyInit` in fetch API
- Fix: cast to `body as BodyInit` when passing to `fetch()` or `new Response()`
- `baseUrl` is deprecated in TS 6.0 — add `"ignoreDeprecations": "6.0"` to tsconfig when using tsup
- tsup 8.5.1 internally injects `baseUrl: '.'` for DTS builds (hence the need for `ignoreDeprecations`)

## Workspace Tests

`pnpm test` runs `pnpm build && vitest run`. The workspace vitest config does NOT support `resolve.alias` or `resolve.conditions` in project objects (Vitest 4.x limitation — all projects share a single Vite server). Building first ensures `dist/` files exist for cross-package imports.

For TDD: use `pnpm --filter <package> test:watch` which uses per-package `vitest.config.ts` with correct source aliases.

## HarmonyOS Notes

`@ipp/transport-harmony` uses a dynamic import of `@ohos.net.http` with `@ts-expect-error` to avoid compile-time resolution failure. The module only exists in the HarmonyOS SDK runtime. The `ITransport` interface ensures the codec/client packages are 100% platform-agnostic.
