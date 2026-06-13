import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { IppAttribute, IppAttributeGroup, IppValue, IppVersion } from '@ipp/protocol';
import { EnumRegistry } from '@ipp/protocol';
import { parse } from '../parser.js';
import { serialize } from '../serializer.js';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Printable ASCII string, 1–20 chars (printable range 0x20–0x7E) */
const asciiStrNE = fc
  .array(fc.integer({ min: 0x21, max: 0x7E }), { minLength: 1, maxLength: 20 })
  .map((codes) => String.fromCharCode(...codes));

/** UTF-8 safe string (excludes lone surrogates) */
const utf8Str = fc.string({ unit: 'grapheme', minLength: 0, maxLength: 20 });

/** Language tag */
const langTag = fc.constantFrom('en', 'en-us', 'fr', 'zh-cn', 'de', 'ja', 'ko');

/** Known enum value for a given attribute name, or numeric string if no table exists */
function enumValueArb(attrName: string): fc.Arbitrary<IppValue> {
  const known: string[] = [];
  for (let code = 0; code <= 200; code++) {
    const name = EnumRegistry.lookup(attrName, code);
    if (name !== undefined) known.push(name);
  }
  // No table → use numeric string (serializer round-trips via the numeric fallback)
  if (known.length === 0) {
    return fc.integer({ min: 3, max: 999 }).map((n) => ({ tag: 'enum' as const, value: String(n) }));
  }
  return fc.constantFrom(...known).map((name) => ({ tag: 'enum' as const, value: name }));
}

/** All scalar IppValue types */
function scalarIppValueArb(attrName?: string): fc.Arbitrary<IppValue> {
  return fc.oneof(
    fc.integer({ min: -(2 ** 31), max: 2 ** 31 - 1 })
      .map((v) => ({ tag: 'integer' as const, value: v })),
    fc.boolean()
      .map((v) => ({ tag: 'boolean' as const, value: v })),
    asciiStrNE
      .map((v) => ({ tag: 'keyword' as const, value: v })),
    asciiStrNE
      .map((v) => ({ tag: 'uri' as const, value: `ipp://${v}/ipp` })),
    fc.constantFrom('ipp', 'ipps', 'http', 'https')
      .map((v) => ({ tag: 'uriScheme' as const, value: v })),
    fc.constantFrom('utf-8', 'us-ascii', 'iso-8859-1')
      .map((v) => ({ tag: 'charset' as const, value: v })),
    langTag
      .map((v) => ({ tag: 'naturalLanguage' as const, value: v })),
    fc.constantFrom('application/pdf', 'application/octet-stream', 'image/png', 'text/plain')
      .map((v) => ({ tag: 'mimeMediaType' as const, value: v })),
    utf8Str
      .map((v) => ({ tag: 'textWithoutLanguage' as const, value: v })),
    utf8Str
      .map((v) => ({ tag: 'nameWithoutLanguage' as const, value: v })),
    fc.tuple(langTag, utf8Str)
      .map(([lang, text]) => ({ tag: 'textWithLanguage' as const, value: { lang, text } })),
    fc.tuple(langTag, utf8Str)
      .map(([lang, text]) => ({ tag: 'nameWithLanguage' as const, value: { lang, text } })),
    fc.uint8Array({ minLength: 0, maxLength: 16 })
      .map((v) => ({ tag: 'octetString' as const, value: v })),
    fc.tuple(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 500 }))
      .map(([a, b]) => ({ tag: 'rangeOfInteger' as const, value: [Math.min(a, b), Math.max(a, b)] as const })),
    fc.tuple(
      fc.integer({ min: 72, max: 1200 }),
      fc.integer({ min: 72, max: 1200 }),
      fc.constantFrom('dpi' as const, 'dpcm' as const),
    ).map(([x, y, unit]) => ({ tag: 'resolution' as const, value: { x, y, unit } })),
    fc.constantFrom('no-value', 'unsupported', 'unknown', 'not-settable', 'delete-attribute', 'admin-define')
      .map((tag) => ({ tag } as IppValue)),
    // For unknown attr names use numeric string (round-trips via the numeric fallback path)
    attrName
      ? enumValueArb(attrName)
      : fc.integer({ min: 3, max: 999 }).map((n) => ({ tag: 'enum' as const, value: String(n) })),
  );
}

/** IppAttribute with 1–3 homogeneous values */
function attributeArb(name?: string): fc.Arbitrary<IppAttribute> {
  const nameArb = name ? fc.constant(name) : asciiStrNE;
  return nameArb.chain((attrName) =>
    fc.tuple(
      scalarIppValueArb(attrName),
      fc.option(scalarIppValueArb(attrName), { nil: undefined }),
    ).chain(([v1, v2opt]) => {
      const values: IppValue[] = [v1];
      // Additional values must have the same tag as the first
      if (v2opt && v2opt.tag === v1.tag) values.push(v2opt);
      return fc.constant({ name: attrName, values: values as [IppValue, ...IppValue[]] });
    }),
  );
}

/** Minimal operation-attributes-tag group with required charset/language attrs */
const operationGroupArb: fc.Arbitrary<IppAttributeGroup> = fc
  .array(attributeArb(), { minLength: 0, maxLength: 4 })
  .map((extras) => ({
    tag: 'operation-attributes-tag' as const,
    attributes: [
      { name: 'attributes-charset',          values: [{ tag: 'charset' as const, value: 'utf-8' }] },
      { name: 'attributes-natural-language', values: [{ tag: 'naturalLanguage' as const, value: 'en' }] },
      { name: 'printer-uri',                 values: [{ tag: 'uri' as const, value: 'ipp://printer/ipp' }] },
      // Filter out mandatory attrs from extras to avoid duplicates
      ...extras.filter(
        (a) => a.name !== 'attributes-charset' && a.name !== 'attributes-natural-language' && a.name !== 'printer-uri',
      ),
    ],
  }));

/** Optional job-attributes-tag group */
const jobGroupArb: fc.Arbitrary<IppAttributeGroup> = fc
  .array(attributeArb(), { minLength: 1, maxLength: 5 })
  .map((attrs) => ({ tag: 'job-attributes-tag' as const, attributes: attrs }));

const versionArb: fc.Arbitrary<IppVersion> = fc.constantFrom('1.0', '1.1', '2.0', '2.1', '2.2');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function octetsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function valuesMatch(orig: IppValue, parsed: IppValue): boolean {
  if (orig.tag !== parsed.tag) return false;
  if (orig.tag === 'octetString' && parsed.tag === 'octetString') {
    return octetsEqual(orig.value, parsed.value);
  }
  return JSON.stringify(orig) === JSON.stringify(parsed);
}

// ─── Round-trip property ──────────────────────────────────────────────────────

describe('codec round-trip property', () => {
  it('parse(serialize(request)) reconstructs the message (1000 runs)', () => {
    fc.assert(
      fc.property(
        versionArb,
        fc.integer({ min: 1, max: 0x7FFFFFFF }),
        operationGroupArb,
        fc.option(jobGroupArb, { nil: undefined }),
        (version, requestId, opGroup, jobGroup) => {
          const groups: IppAttributeGroup[] = [opGroup];
          if (jobGroup) groups.push(jobGroup);

          const original = {
            version,
            operation: 'Get-Printer-Attributes' as const,
            requestId,
            groups,
          };

          const buf = serialize(original);
          const parsed = parse(buf);

          if (parsed.version !== version) return false;
          if (parsed.requestId !== requestId) return false;
          if (parsed.groups.length !== original.groups.length) return false;

          for (let gi = 0; gi < original.groups.length; gi++) {
            const origGroup = original.groups[gi]!;
            const parsedGroup = parsed.groups[gi]!;
            if (parsedGroup.tag !== origGroup.tag) return false;

            for (let ai = 0; ai < origGroup.attributes.length; ai++) {
              const origAttr = origGroup.attributes[ai]!;
              const parsedAttr = parsedGroup.attributes[ai];
              if (!parsedAttr) return false;
              if (parsedAttr.name !== origAttr.name) return false;
              if (parsedAttr.values.length !== origAttr.values.length) return false;

              for (let vi = 0; vi < origAttr.values.length; vi++) {
                if (!valuesMatch(origAttr.values[vi]!, parsedAttr.values[vi]!)) return false;
              }
            }
          }
          return true;
        },
      ),
      { numRuns: 1000, seed: 42 },
    );
  });

  it('serialized output always ends with 0x03 (end-of-attributes)', () => {
    fc.assert(
      fc.property(versionArb, fc.integer({ min: 1, max: 0x7FFFFFFF }), (version, requestId) => {
        const msg = {
          version,
          operation: 'Print-Job' as const,
          requestId,
          groups: [{
            tag: 'operation-attributes-tag' as const,
            attributes: [
              { name: 'attributes-charset',          values: [{ tag: 'charset' as const, value: 'utf-8' }] },
              { name: 'attributes-natural-language', values: [{ tag: 'naturalLanguage' as const, value: 'en' }] },
            ],
          }],
        };
        const buf = serialize(msg);
        return buf[buf.length - 1] === 0x03 && buf.length > 8;
      }),
      { numRuns: 200 },
    );
  });

  it('requestId round-trips for any 31-bit positive integer', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 0x7FFFFFFF }), (requestId) => {
        const msg = {
          version: '2.0' as const,
          operation: 'Get-Jobs' as const,
          requestId,
          groups: [{
            tag: 'operation-attributes-tag' as const,
            attributes: [
              { name: 'attributes-charset',          values: [{ tag: 'charset' as const, value: 'utf-8' }] },
              { name: 'attributes-natural-language', values: [{ tag: 'naturalLanguage' as const, value: 'en' }] },
            ],
          }],
        };
        return parse(serialize(msg)).requestId === requestId;
      }),
      { numRuns: 500 },
    );
  });

  it('all registered enum values survive a round-trip', () => {
    const attrNames = ['printer-state', 'job-state', 'finishings', 'print-quality', 'orientation-requested'];
    for (const attrName of attrNames) {
      for (let code = 0; code <= 120; code++) {
        const enumName = EnumRegistry.lookup(attrName, code);
        if (enumName === undefined) continue;

        const msg = {
          version: '2.0' as const,
          operation: 'Get-Printer-Attributes' as const,
          requestId: 1,
          groups: [{
            tag: 'operation-attributes-tag' as const,
            attributes: [
              { name: 'attributes-charset',          values: [{ tag: 'charset' as const, value: 'utf-8' }] },
              { name: 'attributes-natural-language', values: [{ tag: 'naturalLanguage' as const, value: 'en' }] },
              { name: attrName,                      values: [{ tag: 'enum' as const, value: enumName }] },
            ],
          }],
        };
        const parsed = parse(serialize(msg));
        const attr = parsed.groups[0]!.attributes.find((a) => a.name === attrName);
        expect(attr).toBeDefined();
        expect(attr!.values[0]).toEqual({ tag: 'enum', value: enumName });
      }
    }
  });
});
