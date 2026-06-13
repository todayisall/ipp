// RFC 3995 subscription operations:
// Create-Printer-Subscriptions, Create-Job-Subscriptions,
// Get-Subscriptions, Renew-Subscription, Cancel-Subscription

import type { IppAttribute, IppAttributeGroup, IppRequestMessage, IppResponseMessage } from '@ipp/protocol';
import { v } from '@ipp/protocol';
import { attr, errResponse, int, kw, kwList, nm, okResponse, opStr, opInt, opStrList } from '../helpers.js';
import type { SubscriptionRecord } from '../types.js';
import type { MockPrinterState, PrinterConfig } from '../mock-printer.js';

// ─── Create-Printer-Subscriptions ────────────────────────────────────────────

export function handleCreatePrinterSubscriptions(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const subs = createSubscriptions(state, cfg, req, undefined);
  if (!Array.isArray(subs)) return subs; // error response
  return okResponse(req, ...subs.map(subAttrsGroup));
}

// ─── Create-Job-Subscriptions ─────────────────────────────────────────────────

export function handleCreateJobSubscriptions(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const jobId = opInt(req, 'job-id');
  if (!jobId) return errResponse(req, 'client-error-bad-request', 'Missing job-id');
  if (!state.jobs.has(jobId)) {
    return errResponse(req, 'client-error-not-found', `Job ${jobId} not found`);
  }

  const subs = createSubscriptions(state, cfg, req, jobId);
  if (!Array.isArray(subs)) return subs;
  return okResponse(req, ...subs.map(subAttrsGroup));
}

// ─── Get-Subscriptions ────────────────────────────────────────────────────────

export function handleGetSubscriptions(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const printerUri = opStr(req, 'printer-uri');
  if (printerUri && printerUri !== cfg.printerUri) {
    return errResponse(req, 'client-error-not-found', `Printer not found: ${printerUri}`);
  }

  const mySubsOnly = opBool(req, 'my-subscriptions') ?? false;
  const requesting = opStr(req, 'requesting-user-name');
  const jobId      = opInt(req, 'job-id');
  const limit      = opInt(req, 'limit') ?? 0;

  let subs = [...state.subscriptions.values()];

  // Remove expired subscriptions before returning
  const now = Date.now();
  subs = subs.filter((s) => s.leaseDuration === 0 || s.leaseExpires.getTime() > now);

  if (mySubsOnly && requesting) {
    subs = subs.filter((s) => s.userName === requesting);
  }
  if (jobId !== undefined) {
    subs = subs.filter((s) => s.jobId === jobId);
  }
  if (limit > 0) subs = subs.slice(0, limit);

  if (subs.length === 0) {
    return errResponse(req, 'client-error-not-found', 'No matching subscriptions');
  }

  return okResponse(req, ...subs.map(subAttrsGroup));
}

// ─── Renew-Subscription ───────────────────────────────────────────────────────

export function handleRenewSubscription(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const subId = opInt(req, 'notify-subscription-id');
  if (!subId) return errResponse(req, 'client-error-bad-request', 'Missing notify-subscription-id');

  const sub = state.subscriptions.get(subId);
  if (!sub) return errResponse(req, 'client-error-not-found', `Subscription ${subId} not found`);

  const newLease = opInt(req, 'notify-lease-duration') ?? sub.leaseDuration;
  sub.leaseDuration = newLease;
  sub.leaseExpires  = newLease === 0
    ? new Date(Date.now() + 86400_000 * 365) // indefinite → 1 year
    : new Date(Date.now() + newLease * 1000);

  return okResponse(req, subAttrsGroup(sub));
}

// ─── Cancel-Subscription ─────────────────────────────────────────────────────

export function handleCancelSubscription(
  state: MockPrinterState,
  _cfg: PrinterConfig,
  req: IppRequestMessage,
): IppResponseMessage {
  const subId = opInt(req, 'notify-subscription-id');
  if (!subId) return errResponse(req, 'client-error-bad-request', 'Missing notify-subscription-id');

  if (!state.subscriptions.has(subId)) {
    return errResponse(req, 'client-error-not-found', `Subscription ${subId} not found`);
  }

  state.subscriptions.delete(subId);
  return okResponse(req);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createSubscriptions(
  state: MockPrinterState,
  cfg: PrinterConfig,
  req: IppRequestMessage,
  jobId: number | undefined,
): SubscriptionRecord[] | IppResponseMessage {
  // Subscription attributes are in subscription-attributes-tag groups
  const subGroups = req.groups.filter((g) => g.tag === 'subscription-attributes-tag');

  if (subGroups.length === 0) {
    return errResponse(req, 'client-error-bad-request',
      'Missing subscription-attributes-tag');
  }

  const created: SubscriptionRecord[] = [];
  const userName = opStr(req, 'requesting-user-name') ?? 'anonymous';

  for (const group of subGroups) {
    const find = (name: string) => group.attributes.find((a) => a.name === name);
    const strVal = (name: string) => {
      const a = find(name);
      const val = a?.values[0];
      if (!val) return undefined;
      if (val.tag === 'keyword' || val.tag === 'uri' || val.tag === 'nameWithoutLanguage') return val.value;
      return undefined;
    };
    const intVal = (name: string) => {
      const a = find(name);
      const val = a?.values[0];
      return val?.tag === 'integer' ? val.value : undefined;
    };
    const strListVal = (name: string) => {
      const a = find(name);
      if (!a) return [];
      return a.values.flatMap((val) =>
        val.tag === 'keyword' ? [val.value] : [],
      );
    };

    const events      = strListVal('notify-events');
    const pullMethod  = strVal('notify-pull-method') ?? 'ippget';
    const recipientUri = strVal('notify-recipient-uri');
    const leaseDuration = intVal('notify-lease-duration') ?? 86400;

    const id         = state.nextSubscriptionId++;
    const leaseExpires = leaseDuration === 0
      ? new Date(Date.now() + 86400_000 * 365)
      : new Date(Date.now() + leaseDuration * 1000);

    const sub: SubscriptionRecord = {
      id,
      printerUri:     cfg.printerUri,
      notifyEvents:   events.length > 0 ? events : ['job-completed'],
      pullMethod,
      recipientUri,
      leaseDuration,
      leaseExpires,
      userName,
      jobId,
      sequenceNumber: 0,
    };

    state.subscriptions.set(id, sub);
    created.push(sub);
  }

  return created;
}

function subAttrsGroup(sub: SubscriptionRecord): IppAttributeGroup {
  const leaseSeconds = Math.max(
    0,
    Math.floor((sub.leaseExpires.getTime() - Date.now()) / 1000),
  );
  const attrs: IppAttribute[] = [
    int('notify-subscription-id',  sub.id),
    attr('notify-printer-uri',     v.uri(sub.printerUri)),
    kwList('notify-events',        sub.notifyEvents),
    kw('notify-pull-method',       sub.pullMethod),
    int('notify-lease-duration',   leaseSeconds),
    nm('notify-subscriber-user-name', sub.userName),
    int('notify-sequence-number',  sub.sequenceNumber),
  ];
  if (sub.jobId !== undefined) attrs.push(int('notify-job-id', sub.jobId));
  if (sub.recipientUri)        attrs.push(attr('notify-recipient-uri', v.uri(sub.recipientUri)));
  return { tag: 'subscription-attributes-tag', attributes: attrs };
}

function opBool(req: IppRequestMessage, name: string): boolean | undefined {
  const a = req.groups.find((g) => g.tag === 'operation-attributes-tag')
    ?.attributes.find((a) => a.name === name);
  const val = a?.values[0];
  return val?.tag === 'boolean' ? val.value : undefined;
}
