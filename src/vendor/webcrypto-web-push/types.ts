// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/types.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31
//
// Upstream typed `data` as `Jsonifiable` (from `type-fest`) and `options` as
// `RequireAtLeastOne<{...}>`. Both were type-only uses of that dependency;
// dropping it here removes the last external package this vendor code
// needed. `data` is narrowed to what buildPushPayload actually does with it
// (stringify, or pass through if already string/number) and `options` is a
// plain partial, since every field is optional in practice.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  // `undefined` values are allowed here (unlike strict JSON) because
  // JSON.stringify simply omits them - this matches how buildPushPayload
  // in payload.ts actually serializes `data`.
  | { [key: string]: JsonValue | undefined };

export type PushMessage<T extends JsonValue = JsonValue> = {
  data: T;

  options?: {
    // TTL (or time to live) is an integer specifying the number of seconds
    // you want your push message to live on the push service before it's
    // delivered. When the TTL expires, the message will be removed from the
    // push service queue and it won't be delivered.
    ttl?: number;

    // Topics are strings that can be used to replace a pending messages with
    // a new message if they have matching topic names.
    topic?: string;

    // Urgency indicates to the push service how important a message is to the
    // user. This can be used by the push service to help conserve the battery
    // life of a user's device by only waking up for important messages when
    // battery is low.
    urgency?: "low" | "normal" | "high";
  };
};

export type PushSubscription = {
  endpoint: string;

  /** DOMHighResTimeStamp */
  expirationTime: number | null;
  keys: {
    auth: string; // secret
    p256dh: string; // key
  };
};
