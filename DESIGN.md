# IPP TypeScript 重构 — 详细设计文档

> 基于方案 B：每个 IPP 值显式携带 `tag`，类型安全优先。
> 版本：v0.1（设计评审稿，开工前确认）

---

## 目录

1. [设计原则](#1-设计原则)
2. [包结构与依赖关系](#2-包结构与依赖关系)
3. [@ipp/protocol — 类型系统与协议常量](#3-ippprotocol--类型系统与协议常量)
4. [@ipp/codec — 二进制编解码](#4-ippcodec--二进制编解码)
5. [@ipp/client — 高层 API](#5-ippclient--高层-api)
6. [Transport 层 — 平台适配](#6-transport-层--平台适配)
7. [错误处理体系](#7-错误处理体系)
8. [API 使用示例（端到端）](#8-api-使用示例端到端)
9. [TDD 测试策略](#9-tdd-测试策略)
10. [构建与发布](#10-构建与发布)
11. [鸿蒙 Next 适配详解](#11-鸿蒙-next-适配详解)
12. [与旧版 API 的差异对照](#12-与旧版-api-的差异对照)
13. [待确认的开放问题](#13-待确认的开放问题)

---

## 1. 设计原则

| 编号 | 原则 | 具体含义 |
|---|---|---|
| P1 | **平台无关核心** | `@ipp/protocol` 和 `@ipp/codec` 只使用 `Uint8Array` / `DataView`，零 Node.js 依赖 |
| P2 | **显式优于隐式** | 每个 IPP 值必须携带 `tag`；没有"猜测 tag"的逻辑 |
| P3 | **零运行时依赖** | 整个 core（protocol + codec）的 `dependencies` 为空 |
| P4 | **面向 RFC 建模** | 类型名、字段名与 RFC 8010/8011 保持一致，注释链接到原文 |
| P5 | **不破坏可用性** | 高层 API（`Printer` 类）提供便捷 helpers，让日常用法简洁 |
| P6 | **TDD 驱动实现** | 每个模块先写测试 fixture，再写实现 |

---

## 2. 包结构与依赖关系

```
ipp/                              ← git 根目录
├── packages/
│   ├── protocol/                 ← 类型 + 协议常量（无依赖）
│   ├── codec/                    ← 编解码（只依赖 protocol）
│   ├── client/                   ← 高层 API（依赖 codec + protocol）
│   ├── transport-fetch/          ← Fetch API 适配（Node 18+/Deno/Browser）
│   ├── transport-node/           ← Node.js http 模块适配（兼容 < Node 18）
│   └── transport-harmony/        ← 鸿蒙 Next @ohos.net.http 适配
├── pnpm-workspace.yaml
├── vitest.workspace.ts
├── biome.json
└── tsconfig.base.json
```

### 依赖关系图

```
transport-fetch ──┐
transport-node  ──┼──► client ──► codec ──► protocol
transport-harmony─┘
```

规则：**下层包不能依赖上层包**。`protocol` 对任何人都不感知。

### 各包 npm 名称与定位

| 包 | npm 名称 | 描述 |
|---|---|---|
| protocol | `@ipp/protocol` | 纯类型 + 常量，可单独用于类型检查 |
| codec | `@ipp/codec` | 编解码，可在任何 JS 环境独立使用 |
| client | `@ipp/client` | 完整客户端，需配合 transport |
| transport-fetch | `@ipp/transport-fetch` | 推荐默认 transport |
| transport-node | `@ipp/transport-node` | 兼容旧 Node.js |
| transport-harmony | `@ipp/transport-harmony` | 鸿蒙专用 |

> **用户安装**：大多数人只需 `npm i @ipp/client @ipp/transport-fetch`

---

## 3. @ipp/protocol — 类型系统与协议常量

### 3.1 值类型（IppValue）

每个 IPP 值是一个 discriminated union，`tag` 字段是判别符：

```typescript
// packages/protocol/src/values.ts

/** RFC 8010 §3.5.2 — Out-of-band 值（无实际 value 字段） */
export interface OutOfBandValue<T extends string> { tag: T }

export type UnsupportedValue  = OutOfBandValue<'unsupported'>;
export type UnknownValue      = OutOfBandValue<'unknown'>;
export type NoValueValue      = OutOfBandValue<'no-value'>;
export type DefaultValue      = OutOfBandValue<'default'>;
export type NotSettableValue  = OutOfBandValue<'not-settable'>;    // RFC 3380
export type DeleteAttrValue   = OutOfBandValue<'delete-attribute'>; // RFC 3380
export type AdminDefineValue  = OutOfBandValue<'admin-define'>;    // RFC 3380

/** RFC 8010 §3.5.2 — 整数族 */
export interface IntegerValue       { tag: 'integer';   value: number }
export interface BooleanValue       { tag: 'boolean';   value: boolean }
export interface EnumValue          { tag: 'enum';      value: string }  // 存字符串，如 'idle'

/** RFC 8010 §3.5.2 — 二进制族 */
export interface OctetStringValue   { tag: 'octetString'; value: Uint8Array }
export interface DateTimeValue      { tag: 'dateTime';    value: Date }
export interface ResolutionValue    {
  tag: 'resolution';
  value: { x: number; y: number; unit: 'dpi' | 'dpcm' }
}
export interface RangeOfIntegerValue { tag: 'rangeOfInteger'; value: [number, number] }
export interface CollectionValue    { tag: 'collection'; value: IppCollection } // RFC 3382

/** RFC 8010 §3.5.2 — 带语言标签的文本 */
export interface TextWithLanguageValue {
  tag: 'textWithLanguage';
  value: { lang: string; text: string }
}
export interface NameWithLanguageValue {
  tag: 'nameWithLanguage';
  value: { lang: string; text: string }
}

/** RFC 8010 §3.5.2 — 字符串族 */
export interface TextWithoutLanguageValue { tag: 'textWithoutLanguage'; value: string }
export interface NameWithoutLanguageValue { tag: 'nameWithoutLanguage'; value: string }
export interface KeywordValue             { tag: 'keyword';             value: string }
export interface UriValue                 { tag: 'uri';                 value: string }
export interface UriSchemeValue           { tag: 'uriScheme';           value: string }
export interface CharsetValue             { tag: 'charset';             value: string }
export interface NaturalLanguageValue     { tag: 'naturalLanguage';     value: string }
export interface MimeMediaTypeValue       { tag: 'mimeMediaType';       value: string }

/** 所有值的联合类型 */
export type IppValue =
  | UnsupportedValue | UnknownValue | NoValueValue | DefaultValue
  | NotSettableValue | DeleteAttrValue | AdminDefineValue
  | IntegerValue | BooleanValue | EnumValue
  | OctetStringValue | DateTimeValue | ResolutionValue
  | RangeOfIntegerValue | CollectionValue
  | TextWithLanguageValue | NameWithLanguageValue
  | TextWithoutLanguageValue | NameWithoutLanguageValue
  | KeywordValue | UriValue | UriSchemeValue
  | CharsetValue | NaturalLanguageValue | MimeMediaTypeValue;

/** RFC 3382 — Collection 内部 */
export type IppCollection = {
  [attributeName: string]: IppValue | IppValue[]
};
```

**设计要点**：
- `enum` 类型存 **字符串**（如 `'idle'`），不存数字。数字 ↔ 字符串转换在 codec 内部完成，消费者永远看不到裸数字枚举值。
- 旧代码用 ``（RS 字符）分隔语言和文本；新版用结构体 `{ lang, text }`，不再需要魔法字符。
- Out-of-band 值无 `value` 字段，TypeScript 类型检查会阻止错误访问。

---

### 3.2 属性与消息结构

```typescript
// packages/protocol/src/message.ts

/** RFC 8010 §3.5.1 — 属性组 tag 名称 */
export type GroupTagName =
  | 'operation-attributes-tag'          // 0x01
  | 'job-attributes-tag'                // 0x02
  | 'end-of-attributes-tag'             // 0x03 (codec 内部，消费者不感知)
  | 'printer-attributes-tag'            // 0x04
  | 'unsupported-attributes-tag'        // 0x05
  | 'subscription-attributes-tag'       // 0x06  RFC 3995
  | 'event-notification-attributes-tag' // 0x07  RFC 3995
  | 'document-attributes-tag'           // 0x09  PWG 5100.5
  | 'system-attributes-tag';            // 0x0A  RFC 8011 (NEW)

/** 单个属性 */
export interface IppAttribute {
  name: string;
  values: IppValue[];   // 始终为数组；单值属性长度为 1
}

/** 属性组 */
export interface IppAttributeGroup {
  tag: GroupTagName;
  attributes: IppAttribute[];
}

/** IPP 版本 */
export type IppVersion = '1.0' | '1.1' | '2.0' | '2.1' | '2.2';

/** 基础消息（request 和 response 共享） */
interface IppMessageBase {
  version: IppVersion;
  requestId: number;     // 注：旧代码叫 id，此处改名与 RFC 术语对齐
  groups: IppAttributeGroup[];
  data?: Uint8Array;     // 文档体（Print-Job 等）
}

/** 请求消息 */
export interface IppRequestMessage extends IppMessageBase {
  operation: OperationName;    // 字符串，如 'Print-Job'
  statusCode?: never;
}

/** 响应消息 */
export interface IppResponseMessage extends IppMessageBase {
  statusCode: StatusCodeName;  // 字符串，如 'successful-ok'
  operation?: never;
}

export type IppMessage = IppRequestMessage | IppResponseMessage;
```

---

### 3.3 协议常量

```typescript
// packages/protocol/src/constants.ts

/** RFC 8010 §3.5.2 — Value Tag 字节值（codec 内部使用） */
export const ValueTag = {
  // Out-of-band (0x10-0x1F)
  unsupported:      0x10,
  default:          0x11,
  unknown:          0x12,
  'no-value':       0x13,
  'not-settable':   0x15,
  'delete-attribute': 0x16,
  'admin-define':   0x17,
  // Integer (0x21-0x23)
  integer:          0x21,
  boolean:          0x22,
  enum:             0x23,
  // Octet-string (0x30-0x37)
  octetString:      0x30,
  dateTime:         0x31,
  resolution:       0x32,
  rangeOfInteger:   0x33,
  begCollection:    0x34,
  textWithLanguage: 0x35,
  nameWithLanguage: 0x36,
  endCollection:    0x37,
  // Character-string (0x41-0x4A)
  textWithoutLanguage: 0x41,
  nameWithoutLanguage: 0x42,
  keyword:          0x44,
  uri:              0x45,
  uriScheme:        0x46,
  charset:          0x47,
  naturalLanguage:  0x48,
  mimeMediaType:    0x49,
  memberAttrName:   0x4A,  // 仅 collection 内部
  // Extension
  extension:        0x7F,
} as const satisfies Record<string, number>;

export type ValueTagName = keyof typeof ValueTag;
export type ValueTagByte = (typeof ValueTag)[ValueTagName];

/** RFC 8010 §3.5.1 — Group Tag 字节值 */
export const GroupTagByte = {
  'operation-attributes-tag':           0x01,
  'job-attributes-tag':                 0x02,
  'end-of-attributes-tag':              0x03,
  'printer-attributes-tag':             0x04,
  'unsupported-attributes-tag':         0x05,
  'subscription-attributes-tag':        0x06,
  'event-notification-attributes-tag':  0x07,
  'resource-attributes-tag':            0x08,
  'document-attributes-tag':            0x09,
  'system-attributes-tag':              0x0A,
} as const satisfies Record<GroupTagName | 'resource-attributes-tag', number>;

/** IPP 版本字节值 */
export const VersionByte: Record<IppVersion, [number, number]> = {
  '1.0': [1, 0],
  '1.1': [1, 1],
  '2.0': [2, 0],
  '2.1': [2, 1],
  '2.2': [2, 2],
};
```

---

### 3.4 操作名（OperationName）

```typescript
// packages/protocol/src/operations.ts
// 来源：RFC 8011 §5.4.15 + 各扩展 RFC

export type OperationName =
  // RFC 8011 Core Operations
  | 'Print-Job'              // 0x0002
  | 'Print-URI'              // 0x0003
  | 'Validate-Job'           // 0x0004
  | 'Create-Job'             // 0x0005
  | 'Send-Document'          // 0x0006
  | 'Send-URI'               // 0x0007
  | 'Cancel-Job'             // 0x0008
  | 'Get-Job-Attributes'     // 0x0009
  | 'Get-Jobs'               // 0x000A
  | 'Get-Printer-Attributes' // 0x000B
  | 'Hold-Job'               // 0x000C
  | 'Release-Job'            // 0x000D
  | 'Restart-Job'            // 0x000E
  | 'Pause-Printer'          // 0x0010
  | 'Resume-Printer'         // 0x0011
  | 'Purge-Jobs'             // 0x0012
  | 'Set-Printer-Attributes' // 0x0013  RFC 3380
  | 'Set-Job-Attributes'     // 0x0014  RFC 3380
  | 'Get-Printer-Supported-Values' // 0x0015  RFC 3380
  | 'Create-Printer-Subscriptions' // 0x0016  RFC 3995
  | 'Create-Job-Subscriptions'     // 0x0017  RFC 3995
  | 'Get-Subscriptions'            // 0x0018  RFC 3995
  | 'Renew-Subscription'           // 0x0019  RFC 3995
  | 'Cancel-Subscription'          // 0x001A  RFC 3995
  | 'Get-Notifications'            // 0x001B  RFC 3996
  | 'Get-Resource-Attributes'      // 0x0022  PWG 5100.22 System
  | 'Get-Resources'                // 0x0023  PWG 5100.22
  | 'Enable-Printer'               // 0x0022  RFC 3998
  | 'Disable-Printer'              // 0x0023  RFC 3998
  | 'Pause-Printer-After-Current-Job' // 0x0024  RFC 3998
  | 'Hold-New-Jobs'                // 0x0025  RFC 3998
  | 'Release-Held-New-Jobs'        // 0x0026  RFC 3998
  | 'Deactivate-Printer'           // 0x0027  RFC 3998
  | 'Activate-Printer'             // 0x0028  RFC 3998
  | 'Restart-Printer'              // 0x0029  RFC 3998
  | 'Shutdown-Printer'             // 0x002A  RFC 3998
  | 'Startup-Printer'              // 0x002B  RFC 3998
  | 'Cancel-Current-Job'           // 0x002C  RFC 3998
  | 'Suspend-Current-Job'          // 0x002D  RFC 3998
  | 'Resume-Job'                   // 0x002E  RFC 3998
  | 'Promote-Job'                  // 0x002F  RFC 3998
  | 'Schedule-Job-After'           // 0x0030  RFC 3998
  | 'Cancel-Document'              // 0x0033  PWG 5100.5
  | 'Get-Document-Attributes'      // 0x0034  PWG 5100.5
  | 'Get-Documents'                // 0x0035  PWG 5100.5
  | 'Identify-Printer'             // 0x003C  PWG 5100.13
  | 'Validate-Document'            // 0x003D  PWG 5100.13
  | 'Send-Resource'                // 0x003E  PWG 5100.22
  | 'Create-System-Subscriptions'  // 0x0041  PWG 5100.22
  | 'Cancel-Jobs'                  // 0x0038  PWG 5100.11
  | 'Cancel-My-Jobs'               // 0x0039  PWG 5100.11
  | 'Close-Job'                    // 0x003B  PWG 5100.5
  | (string & {});                 // 允许厂商扩展操作，但保留已知名称的智能提示

// 操作码双向映射
export const OperationCode: Record<OperationName & string, number> = { /* ... */ };
export const OperationName: Record<number, OperationName> = { /* 反向查表 */ };
```

---

### 3.5 值构造 Helpers（v 命名空间）

让日常使用不必每次手写 `{ tag: '...', value: '...' }`：

```typescript
// packages/protocol/src/helpers.ts

export const v = {
  integer:             (value: number):                      IntegerValue => ({ tag: 'integer', value }),
  boolean:             (value: boolean):                     BooleanValue => ({ tag: 'boolean', value }),
  enum:                (value: string):                      EnumValue    => ({ tag: 'enum', value }),
  keyword:             (value: string):                      KeywordValue => ({ tag: 'keyword', value }),
  uri:                 (value: string):                      UriValue     => ({ tag: 'uri', value }),
  uriScheme:           (value: string):                      UriSchemeValue => ({ tag: 'uriScheme', value }),
  charset:             (value: string):                      CharsetValue => ({ tag: 'charset', value }),
  naturalLanguage:     (value: string):                      NaturalLanguageValue => ({ tag: 'naturalLanguage', value }),
  mimeMediaType:       (value: string):                      MimeMediaTypeValue => ({ tag: 'mimeMediaType', value }),
  text:                (value: string):                      TextWithoutLanguageValue => ({ tag: 'textWithoutLanguage', value }),
  textLang:            (lang: string, text: string):         TextWithLanguageValue => ({ tag: 'textWithLanguage', value: { lang, text } }),
  name:                (value: string):                      NameWithoutLanguageValue => ({ tag: 'nameWithoutLanguage', value }),
  nameLang:            (lang: string, text: string):         NameWithLanguageValue => ({ tag: 'nameWithLanguage', value: { lang, text } }),
  dateTime:            (value: Date):                        DateTimeValue => ({ tag: 'dateTime', value }),
  resolution:          (x: number, y: number, unit: 'dpi' | 'dpcm'): ResolutionValue => ({ tag: 'resolution', value: { x, y, unit } }),
  range:               (lower: number, upper: number):       RangeOfIntegerValue => ({ tag: 'rangeOfInteger', value: [lower, upper] }),
  collection:          (value: IppCollection):               CollectionValue => ({ tag: 'collection', value }),
  octetString:         (value: Uint8Array):                  OctetStringValue => ({ tag: 'octetString', value }),
  noValue:             ():                                   NoValueValue => ({ tag: 'no-value' }),
  unknown:             ():                                   UnknownValue => ({ tag: 'unknown' }),
  unsupported:         ():                                   UnsupportedValue => ({ tag: 'unsupported' }),
  deleteAttribute:     ():                                   DeleteAttrValue => ({ tag: 'delete-attribute' }),
} as const;
```

---

### 3.6 属性查询 Helpers

```typescript
// packages/protocol/src/query.ts

/** 从消息中找到指定 tag 的属性组 */
export function getGroup(
  msg: IppMessage,
  tag: GroupTagName
): IppAttributeGroup | undefined {
  return msg.groups.find(g => g.tag === tag);
}

/** 从属性组中找到指定名称的属性 */
export function getAttr(
  group: IppAttributeGroup,
  name: string
): IppAttribute | undefined {
  return group.attributes.find(a => a.name === name);
}

/**
 * 类型安全地读取属性的第一个值
 * 如果 tag 不匹配，返回 undefined
 *
 * @example
 * const state = getAttrValue(printerGroup, 'printer-state', 'enum');
 * // state: EnumValue | undefined
 */
export function getAttrValue<T extends IppValue['tag']>(
  group: IppAttributeGroup,
  name: string,
  tag: T
): Extract<IppValue, { tag: T }> | undefined {
  const attr = getAttr(group, name);
  if (!attr || attr.values.length === 0) return undefined;
  const val = attr.values[0];
  return val.tag === tag ? val as Extract<IppValue, { tag: T }> : undefined;
}

/** 读取属性的所有值（多值属性） */
export function getAttrValues<T extends IppValue['tag']>(
  group: IppAttributeGroup,
  name: string,
  tag: T
): Extract<IppValue, { tag: T }>[] {
  const attr = getAttr(group, name);
  if (!attr) return [];
  return attr.values.filter(v => v.tag === tag) as Extract<IppValue, { tag: T }>[];
}
```

---

## 4. @ipp/codec — 二进制编解码

### 4.1 IppReader（替代裸游标）

```typescript
// packages/codec/src/reader.ts

export class IppReader {
  private pos = 0;
  private view: DataView;

  constructor(private buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  get position() { return this.pos; }
  get remaining() { return this.buf.length - this.pos; }
  get done() { return this.pos >= this.buf.length; }

  peekU8(): number { return this.view.getUint8(this.pos); }
  readU8():  number { return this.view.getUint8(this.pos++); }
  readI16(): number { const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
  readU16(): number { const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  readI32(): number { const v = this.view.getInt32(this.pos); this.pos += 4; return v; }
  readU32(): number { const v = this.view.getUint32(this.pos); this.pos += 4; return v; }

  readBytes(length: number): Uint8Array {
    const slice = this.buf.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  readString(length: number, encoding: 'utf8' | 'ascii' = 'utf8'): string {
    const bytes = this.readBytes(length);
    return new TextDecoder(encoding).decode(bytes);
  }

  /** 读取 [length: u16][string] 格式 */
  readLengthPrefixedString(encoding: 'utf8' | 'ascii' = 'utf8'): string {
    const length = this.readU16();
    return length === 0 ? '' : this.readString(length, encoding);
  }

  /** 读取 [length: u16][bytes] 格式，返回原始字节 */
  readLengthPrefixedBytes(): Uint8Array {
    const length = this.readU16();
    return this.readBytes(length);
  }

  slice(from: number): Uint8Array {
    return this.buf.subarray(from);
  }
}
```

### 4.2 IppWriter（替代 Buffer + 扩容）

```typescript
// packages/codec/src/writer.ts

export class IppWriter {
  private buf: Uint8Array;
  private view: DataView;
  private pos = 0;

  constructor(initialSize = 4096) {
    this.buf = new Uint8Array(initialSize);
    this.view = new DataView(this.buf.buffer);
  }

  get position() { return this.pos; }

  private ensure(needed: number): void {
    if (this.pos + needed <= this.buf.length) return;
    // 至少翻倍，确保 needed 能放下
    const nextSize = Math.max(this.buf.length * 2, this.pos + needed);
    const next = new Uint8Array(nextSize);
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }

  writeU8(v: number):  this { this.ensure(1); this.view.setUint8(this.pos++, v); return this; }
  writeU16(v: number): this { this.ensure(2); this.view.setUint16(this.pos, v); this.pos += 2; return this; }
  writeI32(v: number): this { this.ensure(4); this.view.setInt32(this.pos, v); this.pos += 4; return this; }
  writeU32(v: number): this { this.ensure(4); this.view.setUint32(this.pos, v); this.pos += 4; return this; }

  writeBytes(bytes: Uint8Array): this {
    this.ensure(bytes.length);
    this.buf.set(bytes, this.pos);
    this.pos += bytes.length;
    return this;
  }

  writeString(s: string, encoding: 'utf8' | 'ascii' = 'utf8'): this {
    const bytes = new TextEncoder().encode(s); // TextEncoder 始终 utf8；ascii 用 Latin1 回退
    return this.writeBytes(bytes);
  }

  /** 写 [length: u16][string] */
  writeLengthPrefixedString(s: string, encoding: 'utf8' | 'ascii' = 'utf8'): this {
    const bytes = encodeString(s, encoding);
    this.writeU16(bytes.length);
    return this.writeBytes(bytes);
  }

  /** 写 [length: u16][bytes] */
  writeLengthPrefixedBytes(bytes: Uint8Array): this {
    this.writeU16(bytes.length);
    return this.writeBytes(bytes);
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

// 平台兼容的 ASCII 编码（TextEncoder 不支持 ASCII 模式）
function encodeString(s: string, encoding: 'utf8' | 'ascii'): Uint8Array {
  if (encoding === 'utf8') return new TextEncoder().encode(s);
  // ASCII：逐字节截断
  const buf = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i) & 0xFF;
  return buf;
}
```

---

### 4.3 Parser 设计

Parser 是一个**纯函数**：`Uint8Array → IppMessage`，内部用 `IppReader` 维护状态。

```typescript
// packages/codec/src/parser.ts

export function parse(buf: Uint8Array): IppMessage {
  const r = new IppReader(buf);
  return parseMessage(r);
}

function parseMessage(r: IppReader): IppMessage {
  // Header: version(2) + operation/status(2) + request-id(4)
  const versionMajor = r.readU8();
  const versionMinor = r.readU8();
  const version = `${versionMajor}.${versionMinor}` as IppVersion;

  const opOrStatus = r.readU16();
  const requestId  = r.readU32();

  const groups = parseGroups(r);

  // 剩余字节为文档数据
  const data = r.remaining > 0 ? r.slice(r.position) : undefined;

  // 判断是 request 还是 response
  // RFC 8010 §3.4: operations 0x0002–0x8FFF; status 0x0000–0x0FFF
  // 注意：0x0002–0x0007 存在歧义区间（两个域都可能）
  const isStatus = opOrStatus <= 0x00FF || opOrStatus >= 0x0400;
  const isOp     = opOrStatus >= 0x0002 && opOrStatus <= 0x8FFF;

  const base = { version, requestId, groups, data };

  if (isOp && !isStatus) {
    return { ...base, operation: resolveOperation(opOrStatus) };
  }
  if (isStatus && !isOp) {
    return { ...base, statusCode: resolveStatusCode(opOrStatus) };
  }
  // 歧义区间：同时输出两个字段，调用方按需取用
  // （与旧版行为一致）
  return {
    ...base,
    operation: resolveOperation(opOrStatus),
    statusCode: resolveStatusCode(opOrStatus),
  } as IppMessage;
}

function parseGroups(r: IppReader): IppAttributeGroup[] {
  const groups: IppAttributeGroup[] = [];
  while (!r.done) {
    const groupByte = r.peekU8();
    if (groupByte === GroupTagByte['end-of-attributes-tag']) {
      r.readU8(); // 消耗 0x03
      break;
    }
    if (groupByte < 0x01 || groupByte > 0x0F) break; // 不是 group tag，停止
    r.readU8();
    const tag = resolveGroupTag(groupByte);
    groups.push({ tag, attributes: parseAttributes(r) });
  }
  return groups;
}

function parseAttributes(r: IppReader): IppAttribute[] {
  const attrs: IppAttribute[] = [];
  while (!r.done) {
    const peek = r.peekU8();
    if (peek < 0x0F) break; // 下一个 group tag 或 end
    if (peek === 0x4A) break; // memberAttrName（collection 内部处理）
    attrs.push(parseAttribute(r));
  }
  return attrs;
}

function parseAttribute(r: IppReader): IppAttribute {
  const tagByte = r.readU8();
  const name    = r.readLengthPrefixedString('ascii');
  const firstValue = parseValue(r, tagByte, name);

  const values: IppValue[] = [firstValue];

  // 检查是否有追加值（同名 attribute 多值编码：name 长度为 0）
  while (!r.done && isAdditionalValue(r)) {
    const nextTag = r.readU8();
    r.readU16(); // empty name length
    values.push(parseValue(r, nextTag, name));
  }

  return { name, values };
}

/** 判断下一个字节是否是追加值（不是 group delimiter 且 name length == 0） */
function isAdditionalValue(r: IppReader): boolean {
  const peek = r.peekU8();
  // group delimiters: 0x01-0x0F; memberAttrName: 0x4A; endCollection: 0x37
  if (peek <= 0x0F || peek === 0x37 || peek === 0x4A) return false;
  // 窥视 name length（offset +1 和 +2）
  // 追加值的 name length 字段必须为 0x0000
  // 注意：这里需要 DataView 偏移读取，IppReader 需暴露 peekU16At
  return r.peekU16At(r.position + 1) === 0;
}
```

**每个 tag 的解析**（核心 `parseValue` 函数，按 tag 分派）：

```typescript
function parseValue(r: IppReader, tagByte: number, attrName: string): IppValue {
  switch (tagByte) {
    case ValueTag.integer:
      r.readU16(); // value length (always 4)
      return { tag: 'integer', value: r.readI32() };

    case ValueTag.boolean:
      r.readU16(); // value length (always 1)
      return { tag: 'boolean', value: r.readU8() !== 0 };

    case ValueTag.enum: {
      r.readU16(); // value length (always 4)
      const code = r.readU32();
      // 尝试将数字 enum 解析为字符串名称
      const name = resolveEnum(attrName, code);
      return { tag: 'enum', value: name ?? String(code) };
    }

    case ValueTag.rangeOfInteger: {
      r.readU16(); // value length (always 8)
      const lower = r.readI32();
      const upper = r.readI32();
      return { tag: 'rangeOfInteger', value: [lower, upper] };
    }

    case ValueTag.resolution: {
      r.readU16(); // value length (always 9)
      const x    = r.readI32();
      const y    = r.readI32();
      const unit = r.readU8() === 0x03 ? 'dpi' : 'dpcm';
      return { tag: 'resolution', value: { x, y, unit } };
    }

    case ValueTag.dateTime: {
      r.readU16(); // value length (always 11)
      return { tag: 'dateTime', value: parseDateTimeValue(r) };
    }

    case ValueTag.textWithLanguage: {
      r.readU16(); // outer length
      const lang = r.readLengthPrefixedString('ascii');
      const text = r.readLengthPrefixedString('utf8');
      return { tag: 'textWithLanguage', value: { lang, text } };
    }

    case ValueTag.nameWithLanguage: {
      r.readU16(); // outer length
      const lang = r.readLengthPrefixedString('ascii');
      const text = r.readLengthPrefixedString('utf8');
      return { tag: 'nameWithLanguage', value: { lang, text } };
    }

    case ValueTag.textWithoutLanguage:
      return { tag: 'textWithoutLanguage', value: r.readLengthPrefixedString('utf8') };

    case ValueTag.nameWithoutLanguage:
      return { tag: 'nameWithoutLanguage', value: r.readLengthPrefixedString('utf8') };

    case ValueTag.keyword:
    case ValueTag.uri:
    case ValueTag.uriScheme:
    case ValueTag.charset:
    case ValueTag.naturalLanguage:
    case ValueTag.mimeMediaType: {
      const str = r.readLengthPrefixedString('ascii');
      return { tag: resolveValueTagName(tagByte), value: str } as IppValue;
    }

    case ValueTag.octetString:
      return { tag: 'octetString', value: r.readLengthPrefixedBytes() };

    case ValueTag.begCollection: {
      r.readU16(); // value length (spec says can be ignored)
      r.readBytes(r.readU16() > 0 ? r.readU16() : 0); // 忽略任何值
      // 注：此处实际上 begCollection 后 value length 为 0
      return { tag: 'collection', value: parseCollection(r) };
    }

    // Out-of-band values
    case ValueTag['no-value']:
      r.readU16(); // length (0)
      return { tag: 'no-value' };
    case ValueTag.unsupported:
      r.readU16();
      return { tag: 'unsupported' };
    case ValueTag.unknown:
      r.readU16();
      return { tag: 'unknown' };
    case ValueTag['not-settable']:
      r.readU16();
      return { tag: 'not-settable' };
    case ValueTag['delete-attribute']:
      r.readU16();
      return { tag: 'delete-attribute' };
    case ValueTag['admin-define']:
      r.readU16();
      return { tag: 'admin-define' };

    default: {
      // 扩展 tag（0x7F 表示 32-bit 扩展 tag）
      const bytes = r.readLengthPrefixedBytes();
      // 上报但不崩溃，返回 octetString
      console.warn(`[ipp/codec] Unknown value tag 0x${tagByte.toString(16)}, treating as octetString`);
      return { tag: 'octetString', value: bytes };
    }
  }
}
```

**Collection 解析**（RFC 3382）：

```typescript
function parseCollection(r: IppReader): IppCollection {
  const collection: IppCollection = {};

  while (!r.done) {
    const peek = r.peekU8();
    if (peek === ValueTag.endCollection) {
      r.readU8(); // endCollection tag
      r.readU16(); // empty name length
      r.readU16(); // empty value length
      break;
    }
    if (peek !== ValueTag.memberAttrName) {
      throw new IppParseError(`Expected memberAttrName (0x4A), got 0x${peek.toString(16)}`);
    }
    r.readU8(); // memberAttrName tag
    r.readU16(); // name length (always 0 for memberAttrName tag itself)
    const memberName = r.readLengthPrefixedString('ascii'); // the actual member name

    // 读 member 的值 tag 和 value
    const valueTag = r.readU8();
    r.readU16(); // name length (0)
    const value = parseValue(r, valueTag, memberName);

    // collection 内部的多值（同样用空名追加）
    const values: IppValue[] = [value];
    while (!r.done && isAdditionalValue(r)) {
      const nextTag = r.readU8();
      r.readU16();
      values.push(parseValue(r, nextTag, memberName));
    }

    collection[memberName] = values.length === 1 ? values[0] : values;
  }

  return collection;
}
```

---

### 4.4 Serializer 设计

Serializer 是**纯函数**：`IppRequestMessage → Uint8Array`

```typescript
// packages/codec/src/serializer.ts

export function serialize(msg: IppRequestMessage | IppResponseMessage): Uint8Array {
  const w = new IppWriter();
  serializeMessage(w, msg);
  return w.toUint8Array();
}

function serializeMessage(w: IppWriter, msg: IppMessage): void {
  // Header
  const [major, minor] = VersionByte[msg.version ?? '2.0'];
  w.writeU8(major).writeU8(minor);

  if ('operation' in msg && msg.operation) {
    w.writeU16(resolveOperationCode(msg.operation));
  } else if ('statusCode' in msg && msg.statusCode) {
    w.writeU16(resolveStatusCode(msg.statusCode));
  } else {
    throw new IppSerializeError('Message must have either operation or statusCode');
  }

  w.writeU32(msg.requestId ?? generateRequestId());

  // Attribute groups（必须按规定顺序）
  const ORDER: GroupTagName[] = [
    'operation-attributes-tag',
    'job-attributes-tag',
    'printer-attributes-tag',
    'subscription-attributes-tag',
    'event-notification-attributes-tag',
    'document-attributes-tag',
    'system-attributes-tag',
    'unsupported-attributes-tag',
  ];

  for (const tagName of ORDER) {
    const group = msg.groups.find(g => g.tag === tagName);
    if (group) serializeGroup(w, group);
  }

  // 处理 ORDER 以外的自定义 group
  for (const group of msg.groups) {
    if (!ORDER.includes(group.tag)) serializeGroup(w, group);
  }

  w.writeU8(GroupTagByte['end-of-attributes-tag']); // 0x03

  // 文档数据
  if (msg.data) w.writeBytes(msg.data);
}

function serializeGroup(w: IppWriter, group: IppAttributeGroup): void {
  w.writeU8(GroupTagByte[group.tag]);

  // operation-attributes-tag 内 charset 和 naturalLanguage 必须排在最前
  let attrs = group.attributes;
  if (group.tag === 'operation-attributes-tag') {
    attrs = [
      ...attrs.filter(a => a.name === 'attributes-charset'),
      ...attrs.filter(a => a.name === 'attributes-natural-language'),
      ...attrs.filter(a => a.name !== 'attributes-charset' && a.name !== 'attributes-natural-language'),
    ];
  }

  for (const attr of attrs) serializeAttribute(w, attr);
}

function serializeAttribute(w: IppWriter, attr: IppAttribute): void {
  if (attr.values.length === 0) {
    throw new IppSerializeError(`Attribute '${attr.name}' has no values`);
  }

  for (let i = 0; i < attr.values.length; i++) {
    const val = attr.values[i];
    w.writeU8(resolveValueTagByte(val));

    // 第一个值写名称；追加值写空名称
    if (i === 0) {
      w.writeLengthPrefixedString(attr.name, 'ascii');
    } else {
      w.writeU16(0); // empty name
    }

    serializeValue(w, val);
  }
}

function serializeValue(w: IppWriter, val: IppValue): void {
  switch (val.tag) {
    case 'integer':
      w.writeU16(4).writeI32(val.value);
      break;

    case 'boolean':
      w.writeU16(1).writeU8(val.value ? 1 : 0);
      break;

    case 'enum': {
      const code = resolveEnumCode(/* attrName */'', val.value);
      w.writeU16(4).writeI32(code);
      break;
    }

    case 'rangeOfInteger':
      w.writeU16(8).writeI32(val.value[0]).writeI32(val.value[1]);
      break;

    case 'resolution':
      w.writeU16(9)
        .writeI32(val.value.x)
        .writeI32(val.value.y)
        .writeU8(val.value.unit === 'dpi' ? 0x03 : 0x04);
      break;

    case 'dateTime':
      w.writeU16(11);
      serializeDateTimeValue(w, val.value);
      break;

    case 'textWithLanguage':
    case 'nameWithLanguage': {
      const langBytes = encodeString(val.value.lang, 'ascii');
      const textBytes = encodeString(val.value.text, 'utf8');
      w.writeU16(2 + langBytes.length + 2 + textBytes.length);
      w.writeU16(langBytes.length).writeBytes(langBytes);
      w.writeU16(textBytes.length).writeBytes(textBytes);
      break;
    }

    case 'textWithoutLanguage':
    case 'nameWithoutLanguage':
      w.writeLengthPrefixedString(val.value, 'utf8');
      break;

    case 'keyword':
    case 'uri':
    case 'uriScheme':
    case 'charset':
    case 'naturalLanguage':
    case 'mimeMediaType':
      w.writeLengthPrefixedString(val.value, 'ascii');
      break;

    case 'octetString':
      w.writeLengthPrefixedBytes(val.value);
      break;

    case 'collection':
      w.writeU16(0); // empty value for begCollection
      serializeCollection(w, val.value);
      break;

    // Out-of-band: empty value
    case 'no-value':
    case 'unsupported':
    case 'unknown':
    case 'not-settable':
    case 'delete-attribute':
    case 'admin-define':
    case 'default':
      w.writeU16(0);
      break;
  }
}
```

---

### 4.5 Enum 解析的特殊处理

`enum` 值需要在序列化时知道属性名（不同属性的枚举码表不同）。这是方案B的一个挑战：

**解决方案**：`enum` tag 在序列化时携带的是字符串名（如 `'idle'`），codec 需要通过属性名查表。为此，`serializeAttribute` 把属性名传给 `serializeValue`：

```typescript
// serializeValue 签名增加 attrName 参数
function serializeValue(w: IppWriter, val: IppValue, attrName: string): void {
  if (val.tag === 'enum') {
    const code = EnumRegistry.resolve(attrName, val.value);
    if (code === undefined) {
      throw new IppSerializeError(`Unknown enum value '${val.value}' for attribute '${attrName}'`);
    }
    w.writeU16(4).writeI32(code);
    return;
  }
  // ... 其余分支不需要 attrName
}
```

`EnumRegistry` 是一个从 `@ipp/protocol/enums` 生成的双向查表：

```typescript
// packages/protocol/src/enums.ts（节选）

export const EnumRegistry = {
  // attrName → { enumName → code }
  'printer-state': {
    'idle':       3,
    'processing': 4,
    'stopped':    5,
  },
  'job-state': {
    'pending':            3,
    'pending-held':       4,
    'processing':         5,
    'processing-stopped': 6,
    'canceled':           7,
    'aborted':            8,
    'completed':          9,
  },
  // ... 完整枚举表（对应 RFC 8011 §5.4 + 扩展）

  resolve(attrName: string, name: string): number | undefined {
    return this[attrName as keyof typeof this]?.[name as never];
  },

  lookup(attrName: string, code: number): string | undefined {
    const map = this[attrName as keyof typeof this] as Record<string, number> | undefined;
    if (!map) return undefined;
    return Object.entries(map).find(([, v]) => v === code)?.[0];
  },
} as const;
```

---

## 5. @ipp/client — 高层 API

### 5.1 Printer 类完整设计

```typescript
// packages/client/src/printer.ts

export interface PrinterOptions {
  version?: IppVersion;           // 默认 '2.0'
  charset?: string;               // 默认 'utf-8'
  language?: string;              // 默认 'en-us'
  printerUri?: string;            // 默认由 url 推导
  timeout?: number;               // ms，默认 30000
  retries?: number;               // 失败重试次数，默认 0
}

export class Printer {
  private readonly url: string;
  private readonly opts: Required<PrinterOptions>;
  private readonly transport: ITransport;

  constructor(url: string, opts?: PrinterOptions, transport?: ITransport) {
    this.url = normalizeUrl(url);
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    // 如果未传 transport，自动按环境选择
    this.transport = transport ?? detectDefaultTransport();
  }

  // ─── 低层通用接口 ───────────────────────────────────────────────

  /** 发送任意 IPP 请求，返回完整解析后的 IppResponseMessage */
  async execute(msg: IppRequestMessage): Promise<IppResponseMessage> {
    const buf = serialize(msg);
    const respBuf = await this.transport.send(this.url, buf, {
      timeout: this.opts.timeout,
    });
    const resp = parse(respBuf) as IppResponseMessage;
    if (isErrorStatus(resp.statusCode)) {
      throw new IppOperationError(resp);
    }
    return resp;
  }

  // ─── 高层便捷方法 ─────────────────────────────────────────────

  /** RFC 8011 §4.4 — 获取打印机属性 */
  async getPrinterAttributes(
    options?: GetPrinterAttributesOptions
  ): Promise<IppResponseMessage> {
    return this.execute(
      buildGetPrinterAttributes(this.opts, options)
    );
  }

  /** RFC 8011 §3.2.1 — 打印文档 */
  async printJob(
    data: Uint8Array,
    options?: PrintJobOptions
  ): Promise<IppResponseMessage> {
    return this.execute(
      buildPrintJob(this.opts, data, options)
    );
  }

  /** RFC 8011 §3.2.2 — 打印 URI */
  async printUri(
    documentUri: string,
    options?: PrintJobOptions
  ): Promise<IppResponseMessage> {
    return this.execute(
      buildPrintUri(this.opts, documentUri, options)
    );
  }

  /** RFC 8011 §3.3.3 — 取消任务 */
  async cancelJob(jobId: number): Promise<IppResponseMessage> {
    return this.execute(
      buildCancelJob(this.opts, jobId)
    );
  }

  /** RFC 8011 §3.3.4 — 获取任务属性 */
  async getJobAttributes(
    jobId: number,
    options?: GetJobAttributesOptions
  ): Promise<IppResponseMessage> {
    return this.execute(
      buildGetJobAttributes(this.opts, jobId, options)
    );
  }

  /** RFC 8011 §3.2.6 — 获取任务列表 */
  async getJobs(options?: GetJobsOptions): Promise<IppResponseMessage> {
    return this.execute(buildGetJobs(this.opts, options));
  }

  /** PWG 5100.13 — 识别打印机（闪灯/蜂鸣） */
  async identifyPrinter(
    actions?: ('display' | 'flash' | 'sound' | 'speak')[]
  ): Promise<IppResponseMessage> {
    return this.execute(buildIdentifyPrinter(this.opts, actions));
  }
}
```

### 5.2 消息构建器（Builder Functions）

每个操作对应一个纯函数 builder，方便测试（无需 Printer 实例）：

```typescript
// packages/client/src/builders/print-job.ts

export interface PrintJobOptions {
  jobName?: string;
  documentFormat?: string;   // MIME type, 如 'application/pdf'
  copies?: number;
  sides?: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge';
  colorMode?: string;
  mediaSize?: string;        // 如 'iso_a4_210x297mm'
  priority?: number;         // 1-100
  extraAttrs?: IppAttribute[]; // 自定义额外属性
}

export function buildPrintJob(
  printerOpts: Required<PrinterOptions>,
  data: Uint8Array,
  opts?: PrintJobOptions
): IppRequestMessage {
  const opAttrs: IppAttribute[] = [
    { name: 'attributes-charset',          values: [v.charset(printerOpts.charset)] },
    { name: 'attributes-natural-language', values: [v.naturalLanguage(printerOpts.language)] },
    { name: 'printer-uri',                 values: [v.uri(printerOpts.printerUri)] },
    { name: 'requesting-user-name',        values: [v.name('ipp-client')] },
    ...(opts?.jobName ? [
      { name: 'job-name', values: [v.name(opts.jobName)] }
    ] : []),
    ...(opts?.documentFormat ? [
      { name: 'document-format', values: [v.mimeMediaType(opts.documentFormat)] }
    ] : []),
  ];

  const jobAttrs: IppAttribute[] = [
    ...(opts?.copies !== undefined ? [
      { name: 'copies', values: [v.integer(opts.copies)] }
    ] : []),
    ...(opts?.sides ? [
      { name: 'sides', values: [v.keyword(opts.sides)] }
    ] : []),
    ...(opts?.extraAttrs ?? []),
  ];

  return {
    version:   printerOpts.version,
    operation: 'Print-Job',
    requestId: generateRequestId(),
    groups: [
      { tag: 'operation-attributes-tag', attributes: opAttrs },
      ...(jobAttrs.length > 0 ? [
        { tag: 'job-attributes-tag', attributes: jobAttrs } as IppAttributeGroup
      ] : []),
    ],
    data,
  };
}
```

---

## 6. Transport 层 — 平台适配

### 6.1 接口定义

```typescript
// packages/client/src/transport.ts

export interface TransportOptions {
  timeout?: number;
  signal?: AbortSignal;
  auth?: { username: string; password: string };
  tls?: {
    rejectUnauthorized?: boolean; // 默认 true
    ca?: Uint8Array;              // 自定义 CA 证书
  };
}

export interface ITransport {
  send(url: string, body: Uint8Array, opts?: TransportOptions): Promise<Uint8Array>;
}
```

### 6.2 FetchTransport（推荐默认）

```typescript
// packages/transport-fetch/src/index.ts
// 适用：Node.js 18+, Deno, Bun, 鸿蒙（如平台有标准 fetch）

export class FetchTransport implements ITransport {
  async send(url: string, body: Uint8Array, opts?: TransportOptions): Promise<Uint8Array> {
    const httpUrl = url.replace(/^ipps?:\/\//, (m) =>
      m.startsWith('ipps:') ? 'https://' : 'http://'
    );

    const controller = new AbortController();
    const signal = opts?.signal ?? controller.signal;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (opts?.timeout) {
      timeoutId = setTimeout(() => controller.abort(), opts.timeout);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/ipp',
      'Content-Length': String(body.length),
    };
    if (opts?.auth) {
      const creds = btoa(`${opts.auth.username}:${opts.auth.password}`);
      headers['Authorization'] = `Basic ${creds}`;
    }

    try {
      const res = await fetch(httpUrl, {
        method: 'POST',
        headers,
        body,
        signal,
      });

      if (!res.ok) {
        throw new IppTransportError(
          `HTTP ${res.status} ${res.statusText}`,
          res.status
        );
      }

      return new Uint8Array(await res.arrayBuffer());
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}
```

### 6.3 HarmonyTransport（鸿蒙 Next）

```typescript
// packages/transport-harmony/src/index.ts
// 依赖：@ohos.net.http（DevEco Studio 环境）

import http from '@ohos.net.http';
import buffer from '@ohos.buffer';

export class HarmonyTransport implements ITransport {
  async send(url: string, body: Uint8Array, opts?: TransportOptions): Promise<Uint8Array> {
    // 鸿蒙 URL 格式只接受 http/https
    const httpUrl = url.replace(/^ipps?:\/\//, (m) =>
      m.startsWith('ipps:') ? 'https://' : 'http://'
    );

    const request = http.createHttp();

    try {
      const response = await request.request(httpUrl, {
        method: http.RequestMethod.POST,
        header: {
          'Content-Type': 'application/ipp',
          'Content-Length': String(body.length),
        },
        // @ohos.net.http 接受 ArrayBuffer 作为 body
        extraData: body.buffer as ArrayBuffer,
        connectTimeout: opts?.timeout ?? 30000,
        readTimeout:    opts?.timeout ?? 30000,
        // TLS 设置
        ...(opts?.tls?.rejectUnauthorized === false ? {
          usingProtocol: http.HttpProtocol.HTTP1_1,
        } : {}),
      });

      if (response.responseCode !== 200) {
        throw new IppTransportError(
          `HTTP ${response.responseCode}`,
          response.responseCode
        );
      }

      // result 可能是 string 或 ArrayBuffer，需要处理
      if (typeof response.result === 'string') {
        return new TextEncoder().encode(response.result);
      }
      return new Uint8Array(response.result as ArrayBuffer);
    } finally {
      request.destroy();
    }
  }
}
```

### 6.4 NodeTransport（兼容 Node.js < 18）

```typescript
// packages/transport-node/src/index.ts
// 使用 Node.js 内置 http/https，兼容不支持 fetch 的旧版本

import http from 'node:http';
import https from 'node:https';

export class NodeTransport implements ITransport {
  async send(url: string, body: Uint8Array, opts?: TransportOptions): Promise<Uint8Array> {
    const parsed = new URL(url.replace(/^ipps?:/, m => m === 'ipps:' ? 'https:' : 'http:'));
    if (!parsed.port) parsed.port = '631';

    return new Promise((resolve, reject) => {
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request({
        hostname: parsed.hostname,
        port:     Number(parsed.port),
        path:     parsed.pathname + parsed.search,
        method:   'POST',
        headers: {
          'Content-Type':   'application/ipp',
          'Content-Length': body.length,
        },
        timeout: opts?.timeout ?? 30000,
        // TLS
        rejectUnauthorized: opts?.tls?.rejectUnauthorized ?? true,
        ca: opts?.tls?.ca,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const combined = Buffer.concat(chunks);
          resolve(new Uint8Array(combined.buffer, combined.byteOffset, combined.byteLength));
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new IppTransportError('Request timeout', 0)); });
      req.write(body);
      req.end();
    });
  }
}
```

---

## 7. 错误处理体系

```typescript
// packages/client/src/errors.ts

/** 基类 */
export class IppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** 二进制解析错误 */
export class IppParseError extends IppError {
  constructor(message: string, public readonly offset?: number) {
    super(offset !== undefined ? `${message} (at offset 0x${offset.toString(16)})` : message);
  }
}

/** 序列化错误 */
export class IppSerializeError extends IppError {}

/** HTTP 传输层错误（非 IPP 层） */
export class IppTransportError extends IppError {
  constructor(message: string, public readonly httpStatusCode: number) {
    super(message);
  }
}

/** IPP 协议层操作失败（statusCode 为错误值） */
export class IppOperationError extends IppError {
  public readonly statusCode: StatusCodeName;
  public readonly response: IppResponseMessage;

  constructor(response: IppResponseMessage) {
    const msg = getStatusMessage(response);
    super(`IPP operation failed: ${response.statusCode}${msg ? ` — ${msg}` : ''}`);
    this.statusCode = response.statusCode;
    this.response   = response;
  }
}

/** 读取 status-message 属性（如果有） */
function getStatusMessage(resp: IppResponseMessage): string | undefined {
  const opGroup = resp.groups.find(g => g.tag === 'operation-attributes-tag');
  if (!opGroup) return undefined;
  const attr = opGroup.attributes.find(a => a.name === 'status-message');
  return attr?.values[0]?.tag === 'textWithoutLanguage'
    ? attr.values[0].value
    : undefined;
}
```

---

## 8. API 使用示例（端到端）

### 8.1 低层 API — 完全手动控制

```typescript
import { serialize, parse } from '@ipp/codec';
import { v } from '@ipp/protocol';
import { FetchTransport } from '@ipp/transport-fetch';

const transport = new FetchTransport();

// 手动构建 Get-Printer-Attributes 请求
const request = {
  version:   '2.0' as const,
  operation: 'Get-Printer-Attributes' as const,
  requestId: 1,
  groups: [{
    tag: 'operation-attributes-tag' as const,
    attributes: [
      { name: 'attributes-charset',          values: [v.charset('utf-8')] },
      { name: 'attributes-natural-language', values: [v.naturalLanguage('en-us')] },
      { name: 'printer-uri',                 values: [v.uri('ipp://printer.local:631/ipp')] },
      // 指定想要的属性（可选）
      { name: 'requested-attributes', values: [
        v.keyword('printer-state'),
        v.keyword('printer-state-reasons'),
        v.keyword('printer-make-and-model'),
      ]},
    ],
  }],
};

const reqBuf  = serialize(request);
const resBuf  = await transport.send('ipp://printer.local:631/ipp', reqBuf);
const response = parse(resBuf);

// 类型安全地读取属性
import { getGroup, getAttrValue } from '@ipp/protocol';

const printerGroup = getGroup(response, 'printer-attributes-tag');
if (printerGroup) {
  const state = getAttrValue(printerGroup, 'printer-state', 'enum');
  //    ^ EnumValue | undefined
  console.log(state?.value);  // 'idle' | 'processing' | 'stopped'

  const model = getAttrValue(printerGroup, 'printer-make-and-model', 'textWithoutLanguage');
  console.log(model?.value);  // 'HP LaserJet 400 M401dn'
}
```

### 8.2 高层 API — 日常用法

```typescript
import { Printer } from '@ipp/client';
import { FetchTransport } from '@ipp/transport-fetch';
import { getGroup, getAttrValue } from '@ipp/protocol';

const printer = new Printer(
  'ipp://printer.local:631/ipp/printer',
  { version: '2.0', language: 'zh-cn' },
  new FetchTransport()
);

// 获取打印机状态
const resp = await printer.getPrinterAttributes({
  requestedAttributes: ['printer-state', 'printer-state-reasons', 'media-ready'],
});
const group = getGroup(resp, 'printer-attributes-tag')!;
const state = getAttrValue(group, 'printer-state', 'enum');
console.log(state?.value); // 'idle'

// 打印 PDF
import { readFile } from 'node:fs/promises';
const pdf = await readFile('document.pdf');

const printResp = await printer.printJob(
  new Uint8Array(pdf.buffer),
  {
    jobName:        'My Document',
    documentFormat: 'application/pdf',
    copies:         2,
    sides:          'two-sided-long-edge',
  }
);
const jobGroup = getGroup(printResp, 'job-attributes-tag')!;
const jobId = getAttrValue(jobGroup, 'job-id', 'integer');
console.log('Job ID:', jobId?.value);
```

### 8.3 鸿蒙 Next 用法

```typescript
// ArkTS 代码（DevEco Studio）
import { Printer } from '@ipp/client';
import { HarmonyTransport } from '@ipp/transport-harmony';

const transport = new HarmonyTransport();
const printer = new Printer('ipp://192.168.1.100:631/ipp', {}, transport);

const pdf = getResourceBytes($r('rawfile.document.pdf')); // 鸿蒙资源读取
await printer.printJob(new Uint8Array(pdf), {
  jobName: '测试文件',
  documentFormat: 'application/pdf',
});
```

---

## 9. TDD 测试策略

### 9.1 测试分层

```
packages/codec/src/__tests__/
├── fixtures/
│   ├── get-printer-attrs-req.bin     ← Wireshark 抓包的真实数据
│   ├── get-printer-attrs-res.bin
│   ├── print-job-req.bin
│   ├── print-job-res.bin
│   └── collection-media-col.bin      ← 包含 collection 的复杂报文
├── reader.test.ts                    ← IppReader 单元测试
├── writer.test.ts                    ← IppWriter 单元测试
├── parser.test.ts                    ← 每个 tag 类型 + fixture 快照
├── serializer.test.ts                ← 每个 tag 类型
├── roundtrip.test.ts                 ← parse → serialize → parse 一致性
└── codec.property.test.ts            ← fast-check 属性测试
```

### 9.2 TDD 开发顺序（严格遵守）

```
每个功能单元的节奏：

  1. 写 fixture（如果有真实数据）或手工构造最小 binary
  2. 写 failing test（RED）
  3. 写最小实现让 test 通过（GREEN）
  4. Refactor（保持 GREEN）
```

**示例：为 `rangeOfInteger` tag 写测试**

```typescript
// codec/src/__tests__/parser.test.ts

import { describe, it, expect } from 'vitest';
import { parse } from '../parser';
import { buildMinimalMessage } from './helpers';

describe('parser — rangeOfInteger', () => {
  it('parses a rangeOfInteger value correctly', () => {
    // 构建只含一个 rangeOfInteger 属性的最小 IPP 消息
    // RFC 8010: tag(1) + name-len(2) + name + value-len(2) + lower(4) + upper(4)
    const buf = buildMinimalMessage([{
      tag: 0x33,               // rangeOfInteger
      name: 'copies-supported',
      valueBytes: [
        0x00, 0x08,            // value-length = 8
        0x00, 0x00, 0x00, 0x01, // lower = 1
        0x00, 0x00, 0x00, 0x63, // upper = 99
      ],
    }]);

    const msg = parse(buf);
    const group = msg.groups[0];
    const attr  = group.attributes[0];

    expect(attr.name).toBe('copies-supported');
    expect(attr.values).toHaveLength(1);
    expect(attr.values[0]).toEqual({ tag: 'rangeOfInteger', value: [1, 99] });
  });
});
```

### 9.3 往返属性测试（fast-check）

```typescript
// codec/src/__tests__/codec.property.test.ts

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { parse }     from '../parser';
import { serialize } from '../serializer';
import { arbIppMessage } from './arbitraries';  // 自定义 Arbitrary

describe('codec roundtrip', () => {
  it('parse(serialize(msg)) deep equals original message', () => {
    fc.assert(fc.property(
      arbIppMessage(),
      (msg) => {
        const buf      = serialize(msg);
        const decoded  = parse(buf);
        // 忽略 data 字段的比较（Buffer 比较需要特殊处理）
        const { data: _, ...msgNoData } = msg;
        const { data: __, ...decNoData } = decoded;
        expect(decNoData).toStrictEqual(msgNoData);
      }
    ), { numRuns: 1000 });
  });
});
```

### 9.4 Fixture 获取方法

```bash
# 方法 1：使用 ipptool（推荐，最权威）
# macOS 自带，Linux 装 cups-client
ipptool -v ipp://YOUR_PRINTER:631/ipp/printer get-printer-attributes.test

# 方法 2：Wireshark 抓包
# Filter: tcp.port == 631
# 右键 Follow TCP Stream → Save as Raw
# 用 Wireshark 的 IPP dissector 验证解析正确性

# 方法 3：CUPS debug 日志
cupsctl --debug-logging
# 日志在 /var/log/cups/error_log，含 hex dump
```

---

## 10. 构建与发布

### 10.1 目录配置文件

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM"]    // DOM 提供 fetch/TextEncoder/DataView
  }
}
```

```typescript
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
]);
```

### 10.2 每个包的 package.json 结构

```json
// packages/codec/package.json
{
  "name": "@ipp/codec",
  "version": "3.0.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "test":  "vitest run",
    "dev":   "vitest"
  },
  "dependencies": {
    "@ipp/protocol": "workspace:*"
  },
  "devDependencies": {
    "fast-check": "^3.x",
    "vitest": "^2.x",
    "tsup": "^8.x"
  }
}
```

---

## 11. 鸿蒙 Next 适配详解

### 11.1 ArkTS 限制与应对

| ArkTS 限制 | 影响 | 应对方案 |
|---|---|---|
| 不支持 `eval` / `Function` | 无影响（我们不用） | — |
| 不支持 `Buffer` | codec 全部使用 `Uint8Array` | 已在设计中解决 |
| `TextDecoder`/`TextEncoder` 可用 | 字符串编解码正常 | — |
| `DataView` 可用 | reader/writer 正常 | — |
| 不支持 Node.js 内置模块 | transport 需用 `@ohos.net.http` | HarmonyTransport |
| `fetch` API 支持情况待确认 | 可能需要 HarmonyTransport | 用 HarmonyTransport |
| `AbortController` 支持待确认 | timeout 机制 | 用 `connectTimeout` 参数代替 |

### 11.2 鸿蒙打包方案

`@ipp/protocol` 和 `@ipp/codec` 可以直接打包进 HAP，因为它们是纯 TypeScript，没有 Node.js 依赖。

推荐方式：通过 DevEco Studio 的 ohpm 包管理（类似 npm）引用。

```
# 鸿蒙 oh-package.json5
{
  "dependencies": {
    "@ipp/client":             "^3.0.0",
    "@ipp/transport-harmony":  "^3.0.0"
  }
}
```

### 11.3 IPPS（加密）在鸿蒙的处理

鸿蒙 `@ohos.net.http` 对 HTTPS 有系统证书验证。若打印机使用自签证书：

```typescript
// 鸿蒙允许通过证书 pinning 信任特定证书
const transport = new HarmonyTransport({
  ssl: {
    certPath: 'printer-ca.pem', // rawfile 中的自定义 CA
  }
});
```

---

## 12. 与旧版 API 的差异对照

| 旧版（JS） | 新版（TS 方案B） | 迁移说明 |
|---|---|---|
| `ipp.parse(buf)` | `parse(buf)` from `@ipp/codec` | 函数签名一致，返回类型更精确 |
| `ipp.serialize(msg)` | `serialize(msg)` from `@ipp/codec` | msg 结构不同（见下） |
| `ipp.request(url, data, cb)` | `transport.send(url, data)` | Promise 化，无回调 |
| `new ipp.Printer(url)` | `new Printer(url, opts, transport)` | 需显式传 transport |
| `printer.execute(op, msg, cb)` | `printer.execute(requestMsg)` | Promise 化，msg 结构不同 |
| `res.operation` | `res.statusCode` | response 不再有 `operation` 字段 |
| `res["printer-attributes-tag"]` | `getGroup(res, 'printer-attributes-tag')` | 结构化访问 |
| `res["printer-attributes-tag"]["printer-state"]` | `getAttrValue(group, 'printer-state', 'enum')?.value` | 类型安全 |
| `msg.id` | `msg.requestId` | 与 RFC 术语对齐 |

**旧 message 格式** vs **新 message 格式**：

```javascript
// 旧版
{
  "version": "2.0",
  "operation": "Print-Job",
  "id": 1,
  "operation-attributes-tag": {
    "attributes-charset": "utf-8",
    "printer-uri": "ipp://..."
  },
  data: <Buffer>
}

// 新版（方案B）
{
  version: '2.0',
  operation: 'Print-Job',
  requestId: 1,
  groups: [{
    tag: 'operation-attributes-tag',
    attributes: [
      { name: 'attributes-charset', values: [{ tag: 'charset', value: 'utf-8' }] },
      { name: 'printer-uri',        values: [{ tag: 'uri',     value: 'ipp://...' }] },
    ]
  }],
  data: new Uint8Array(...)
}
```

---

## 13. 待确认的开放问题

在开工前需要你决策的问题：

### Q1：`enum` 值的未知情况如何处理？

当 codec 遇到一个 enum 数字但没有在 EnumRegistry 找到对应名称时：

- **选项 A**：返回数字的字符串形式 `{ tag: 'enum', value: '42' }` — 不丢数据，但消费者拿到字符

---

### Q2：`requestId` 的自动生成策略？
- **选项 C**：`crypto.getRandomValues()`（最安全，所有目标平台都支持）

---

### Q3：Collection 序列化时 `enum` 子属性如何查表？

Collection 内部的属性名（如 `media-col` 内的 `media-type`）在 `attrName` 语境下是局部名。EnumRegistry 是按顶层属性名索引的。

其他专业库是怎样实现的, 可以参考其他语言的实现; 如果负责, 可以先简单实现. 简单实现会有功能问题么. 如果没有就简单实现.

---

### Q4：是否需要兼容旧版 flat object 格式的适配层？

是否提供一个 `@ipp/compat` 包，将新版 `IppMessage` 转换为旧版平铺格式，方便现有用户迁移？

不需要.

---

### Q5：`media-col` 等复杂 Collection 属性是否需要强类型？

`media-col` 是 IPP Everywhere 的核心属性，内部有固定的成员结构（PWG 5100.13）。可以为它提供专用类型：

```typescript
export interface MediaCollection {
  'media-size'?: {
    'x-dimension': IntegerValue;
    'y-dimension': IntegerValue;
  };
  'media-type'?: KeywordValue | NameWithoutLanguageValue;
  'media-source'?: KeywordValue;
  // ...
}
```

这样在构建 `job-attributes-tag` 中的 `media-col` 时可以得到类型提示。

**建议**：在 M3 之后单独的 M4.5 里做，不阻塞主线开发。

---

*文档版本：v0.1 | 最后更新：2026-06-12*
