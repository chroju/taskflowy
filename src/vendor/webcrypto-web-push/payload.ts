// Vendored from @block65/webcrypto-web-push v1.0.2
// Source: https://github.com/block65/webcrypto-web-push (packages/web-push/lib/payload.ts)
// License: MIT (see ./LICENSE.md)
// Vendored on: 2026-07-31

import { encodeBase64Url } from "./base64";
import { encryptNotification } from "./encrypt";
import type { PushMessage, PushSubscription } from "./types";
import { vapidHeaders, type VapidKeys } from "./vapid";

export async function buildPushPayload(
  message: PushMessage,
  subscription: PushSubscription,
  vapid: VapidKeys
) {
  const { headers } = await vapidHeaders(subscription, vapid);

  const encrypted = await encryptNotification(
    subscription,
    new TextEncoder().encode(
      // if its a primitive, convert to string, otherwise stringify
      typeof message.data === "string" || typeof message.data === "number"
        ? message.data.toString()
        : JSON.stringify(message.data)
    )
  );

  return {
    headers: {
      ...headers,

      "crypto-key": `dh=${encodeBase64Url(
        encrypted.localPublicKeyBytes
      )};${headers["crypto-key"]}`,

      encryption: `salt=${encodeBase64Url(encrypted.salt)}`,

      ttl: (message.options?.ttl || 60).toString(),
      ...(message.options?.urgency && {
        urgency: message.options.urgency,
      }),
      ...(message.options?.topic && {
        topic: message.options.topic,
      }),

      "content-encoding": "aesgcm",
      "content-length": encrypted.ciphertext.byteLength.toString(),
      "content-type": "application/octet-stream",
    },
    method: "post",
    body: encrypted.ciphertext,
  };
}
