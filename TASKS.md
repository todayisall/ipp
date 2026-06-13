# IPP TypeScript 重构 — 任务列表

> 状态标记：`[ ]` 待开始 · `[~]` 进行中 · `[x]` 完成

---

## M1 — 基础设施（Monorepo）

- [x] T01 初始化 monorepo：根目录 `package.json` / `pnpm-workspace.yaml` / `tsconfig.base.json` / `biome.json` / `vitest.workspace.ts`
- [x] T02 创建 `@ipp/protocol` 包骨架（`package.json` / `tsconfig.json` / `vitest.config.ts` / `src/index.ts`）
- [x] T03 创建 `@ipp/codec` 包骨架
- [x] T04 创建 `@ipp/client` 包骨架
- [x] T05 创建 `@ipp/transport-fetch` 包骨架

---

## M2 — @ipp/protocol

- [x] T06 `values.ts`：`IppValue` discriminated union + 所有子类型接口 + `IppCollection`
- [x] T07 `message.ts`：`IppAttribute` / `IppAttributeGroup` / `IppMessage` / `IppRequestMessage` / `IppResponseMessage` / `IppVersion` / `GroupTagName`
- [x] T08 `constants.ts`：`ValueTag` / `GroupTagByte` / `VersionByte`（`as const satisfies`）
- [x] T09 `operations.ts`：`OperationName` union + `OperationCode` 双向映射（RFC 8011 全量 + PWG 扩展）
- [x] T10 `status-codes.ts`：`StatusCodeName` union + `StatusCodeValue` 双向映射
- [x] T11 `enums.ts`：`EnumRegistry`（基础实现：printer-state / job-state / finishings + aliases）
- [x] T12 `helpers.ts`：`v` 命名空间（所有值构造 helpers）+ 测试
- [x] T13 `query.ts`：`getGroup` / `getAttr` / `getAttrValue<T>` / `getAttrValues<T>` + 测试
- [x] T14 `index.ts`：统一 re-export

---

## M3 — @ipp/codec

- [x] T15 `reader.ts`：`IppReader` + 单元测试
- [x] T16 `writer.ts`：`IppWriter` + 单元测试
- [x] T17 `string-codec.ts`：平台兼容字符串编解码（内联于 reader/writer，无需独立文件）
- [x] T18 `parser.ts`：消息头解析（version / op-or-status / requestId）+ 测试
- [x] T19 `parser.ts`：`parseGroups` / `parseAttributes`（含多值追加逻辑）+ 测试
- [x] T20 `parser.ts`：integer / boolean / enum / rangeOfInteger / resolution / dateTime + 测试
- [x] T21 `parser.ts`：字符串族 + textWithLanguage / nameWithLanguage + 测试
- [x] T22 `parser.ts`：out-of-band 值 + 测试
- [x] T23 `parser.ts`：octetString / collection 递归 + 测试
- [x] T24 `parser.ts`：未知 tag 降级为 octetString + 测试
- [x] T25 `serializer.ts`：消息头 + group 排序 + 测试
- [x] T26 `serializer.ts`：基础 value tag 序列化 + 测试
- [x] T27 `serializer.ts`：字符串族序列化 + 测试
- [x] T28 `serializer.ts`：out-of-band + enum 查表 + 测试
- [x] T29 `serializer.ts`：collection 序列化 + 测试
- [x] T30 `roundtrip.test.ts`：`parse(serialize(msg))` 往返测试（覆盖于 parser/serializer 测试中）
- [x] T31 `codec.property.test.ts`：`fast-check` 属性测试（1000 轮往返无损）
- [x] T32 `fixtures/`：接入真实 `.bin` fixture 文件 + 快照测试

---

## M4 — @ipp/client + transports

- [x] T33 `errors.ts`：`IppError` / `IppTransportError` / `IppOperationError`
- [x] T34 `transport.ts`：`ITransport` 接口 + `TransportOptions`
- [x] T35 `@ipp/transport-fetch`：`FetchTransport` + 测试（mock fetch）
- [x] T36 `@ipp/transport-node`（可选，Node < 18 兼容）：`NodeTransport`
- [x] T37 `builders/common.ts`：`generateRequestId()` / `buildOperationGroup()`
- [x] T38 `builders/get-printer-attributes.ts`：`buildGetPrinterAttributes`
- [x] T39 `builders/print-job.ts`：`buildPrintJob`
- [x] T40 `builders/print-uri.ts`：`buildPrintUri`（在 builders/other.ts）
- [x] T41 `builders/cancel-job.ts` / `get-job-attributes.ts` / `get-jobs.ts`（在 builders/other.ts）
- [x] T42 `printer.ts`：`Printer` 类 + `execute` + 测试
- [x] T43 `printer.ts`：高层方法（getPrinterAttributes / printJob / printUri 等）+ 测试
- [x] T44 `printer.ts`：`identifyPrinter`（PWG 5100.13）+ 测试
- [x] T45 `index.ts`：统一 re-export

---

## M5 — 协议补全

- [x] T46 完整 `enums.ts`：补全 RFC 8011 全量枚举（page-delivery / cover-type / job-collation-type / baling-type / stitching-method / trimming-type / punch-location / presentation-direction-number-up / feed-orientation 等 + 别名扩充）
- [x] T47 RFC 3995 订阅：`builders/subscriptions.ts`（Create/Get/Renew/Cancel Printer & Job subscriptions）
- [x] T48 RFC 3995 订阅：`printer.ts` 增加 `subscribe` / `subscribeToJob` / `getSubscriptions` / `renewSubscription` / `cancelSubscription` 方法
- [x] T49 PWG 5100.13：`buildValidateJob` + `buildCloseJob`（在 builders/other.ts）+ Printer 高层方法
- [x] T50 IPPS TLS：`NodeTransport` 增加 `rejectUnauthorized` / `ca` 选项；`FetchTransport` 文档说明

---

## M6 — 鸿蒙 Next

- [x] T51 创建 `@ipp/transport-harmony` 包骨架（ArkTS 兼容）
- [x] T52 `HarmonyTransport`：基于 `@ohos.net.http` 实现 `ITransport`（动态 import 降级）
- [x] T53 `HarmonyTransport`：connectTimeout / readTimeout / caPath / clientCert TLS 选项

---

## M4.5 — media-col 强类型（推迟，不阻塞主线）

- [ ] T54 `@ipp/protocol` 增加 `MediaCollection` / `MediaSize` 等 collection 子类型
- [ ] T55 `buildPrintJob` 中 `mediaCol` 选项接受强类型 `MediaCollection`

---

*当前进度：49 / 55 tasks*
