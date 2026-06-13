// RFC 3995 — IPP Event Notification subscriptions

import type { IppAttribute, IppAttributeGroup, IppRequestMessage } from '@ipp/protocol';
import { v } from '@ipp/protocol';
import {
  type PrinterDefaults,
  buildOperationGroup,
  generateRequestId,
} from './common.js';

// ─── Notify events ────────────────────────────────────────────────────────────

export type NotifyEvent =
  | 'job-completed'
  | 'job-created'
  | 'job-state-changed'
  | 'job-stopped'
  | 'printer-config-changed'
  | 'printer-finishings-changed'
  | 'printer-media-changed'
  | 'printer-queue-order-changed'
  | 'printer-restarted'
  | 'printer-shutdown'
  | 'printer-state-changed'
  | 'printer-stopped';

// ─── Create-Printer-Subscriptions (RFC 3995 §11.2.1) ────────────────────────

export interface SubscriptionSpec {
  /** IPP Push: where to POST notifications. Omit for pull delivery. */
  recipientUri?: string;
  /** Pull delivery method, e.g. 'ippget'. Ignored when recipientUri is set. */
  pullMethod?: string;
  /** Events to subscribe to. Defaults to ['job-completed']. */
  events?: NotifyEvent[];
  /** How long (seconds) the subscription lives. Default: 3600. */
  leaseDuration?: number;
  /** Polling interval hint (seconds) for pull delivery. */
  timeInterval?: number;
}

export function buildCreatePrinterSubscriptions(
  defaults: PrinterDefaults,
  subscriptions: SubscriptionSpec[],
): IppRequestMessage {
  const groups: IppAttributeGroup[] = [buildOperationGroup(defaults)];

  for (const sub of subscriptions) {
    const attrs: IppAttribute[] = [];

    if (sub.recipientUri) {
      attrs.push({ name: 'notify-recipient-uri', values: [v.uri(sub.recipientUri)] });
    } else {
      const method = sub.pullMethod ?? 'ippget';
      attrs.push({ name: 'notify-pull-method', values: [v.keyword(method)] });
    }

    const events = sub.events ?? ['job-completed'];
    attrs.push({ name: 'notify-events', values: events.map(v.keyword) });

    if (sub.leaseDuration !== undefined) {
      attrs.push({ name: 'notify-lease-duration', values: [v.integer(sub.leaseDuration)] });
    }

    if (sub.timeInterval !== undefined) {
      attrs.push({ name: 'notify-time-interval', values: [v.integer(sub.timeInterval)] });
    }

    groups.push({ tag: 'subscription-attributes-tag', attributes: attrs });
  }

  return {
    version:   defaults.version,
    operation: 'Create-Printer-Subscriptions',
    requestId: generateRequestId(),
    groups,
  };
}

// ─── Create-Job-Subscriptions (RFC 3995 §11.2.2) ─────────────────────────────

export function buildCreateJobSubscriptions(
  defaults: PrinterDefaults,
  jobId: number,
  subscriptions: SubscriptionSpec[],
): IppRequestMessage {
  const extra: IppAttribute[] = [
    { name: 'job-id', values: [v.integer(jobId)] },
  ];
  const groups: IppAttributeGroup[] = [buildOperationGroup(defaults, extra)];

  for (const sub of subscriptions) {
    const attrs: IppAttribute[] = [];
    if (sub.recipientUri) {
      attrs.push({ name: 'notify-recipient-uri', values: [v.uri(sub.recipientUri)] });
    } else {
      attrs.push({ name: 'notify-pull-method', values: [v.keyword(sub.pullMethod ?? 'ippget')] });
    }
    const events = sub.events ?? ['job-completed'];
    attrs.push({ name: 'notify-events', values: events.map(v.keyword) });
    if (sub.leaseDuration !== undefined) {
      attrs.push({ name: 'notify-lease-duration', values: [v.integer(sub.leaseDuration)] });
    }
    groups.push({ tag: 'subscription-attributes-tag', attributes: attrs });
  }

  return {
    version:   defaults.version,
    operation: 'Create-Job-Subscriptions',
    requestId: generateRequestId(),
    groups,
  };
}

// ─── Get-Subscriptions (RFC 3995 §11.2.4) ────────────────────────────────────

export interface GetSubscriptionsOptions {
  jobId?: number;
  mySubscriptions?: boolean;
  limit?: number;
  requestedAttributes?: string[];
}

export function buildGetSubscriptions(
  defaults: PrinterDefaults,
  opts?: GetSubscriptionsOptions,
): IppRequestMessage {
  const extra: IppAttribute[] = [
    ...(opts?.jobId !== undefined ? [{ name: 'job-id', values: [v.integer(opts.jobId)] }] : []),
    ...(opts?.mySubscriptions !== undefined
      ? [{ name: 'my-subscriptions', values: [v.boolean(opts.mySubscriptions)] }]
      : []),
    ...(opts?.limit !== undefined ? [{ name: 'limit', values: [v.integer(opts.limit)] }] : []),
    ...(opts?.requestedAttributes?.length
      ? [{ name: 'requested-attributes', values: opts.requestedAttributes.map(v.keyword) }]
      : []),
  ];
  return {
    version:   defaults.version,
    operation: 'Get-Subscriptions',
    requestId: generateRequestId(),
    groups:    [buildOperationGroup(defaults, extra)],
  };
}

// ─── Renew-Subscription (RFC 3995 §11.2.5) ───────────────────────────────────

export function buildRenewSubscription(
  defaults: PrinterDefaults,
  subscriptionId: number,
  leaseDuration?: number,
): IppRequestMessage {
  const extra: IppAttribute[] = [
    { name: 'notify-subscription-id', values: [v.integer(subscriptionId)] },
    ...(leaseDuration !== undefined
      ? [{ name: 'notify-lease-duration', values: [v.integer(leaseDuration)] }]
      : []),
  ];
  return {
    version:   defaults.version,
    operation: 'Renew-Subscription',
    requestId: generateRequestId(),
    groups:    [buildOperationGroup(defaults, extra)],
  };
}

// ─── Cancel-Subscription (RFC 3995 §11.2.6) ──────────────────────────────────

export function buildCancelSubscription(
  defaults: PrinterDefaults,
  subscriptionId: number,
): IppRequestMessage {
  const extra: IppAttribute[] = [
    { name: 'notify-subscription-id', values: [v.integer(subscriptionId)] },
  ];
  return {
    version:   defaults.version,
    operation: 'Cancel-Subscription',
    requestId: generateRequestId(),
    groups:    [buildOperationGroup(defaults, extra)],
  };
}
