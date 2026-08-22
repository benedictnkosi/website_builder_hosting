import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  handleWhatsAppVerification,
  handleWhatsAppWebhook,
} from "../lib/whatsapp-webhook.ts";

const env = {
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "a-long-random-verification-token",
  META_APP_SECRET: "test-app-secret",
  WHATSAPP_ACCESS_TOKEN: "test-access-token",
  WHATSAPP_PHONE_NUMBER_ID: "1314737525052159",
  WHATSAPP_BUSINESS_ACCOUNT_ID: "4059294674203789",
};

function signature(body: string): string {
  return `sha256=${createHmac("sha256", env.META_APP_SECRET).update(body).digest("hex")}`;
}

function postRequest(body: string, suppliedSignature: string | null = signature(body)): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (suppliedSignature) headers.set("x-hub-signature-256", suppliedSignature);
  return new Request("https://example.com/api/webhooks/whatsapp", {
    method: "POST",
    headers,
    body,
  });
}

test("GET verifies a matching token and returns the challenge", async () => {
  const url = new URL("https://example.com/api/webhooks/whatsapp");
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  url.searchParams.set("hub.challenge", "123456789");
  const response = handleWhatsAppVerification(new Request(url), env);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/plain/);
  assert.equal(await response.text(), "123456789");
});

test("GET rejects an incorrect verification token", () => {
  const response = handleWhatsAppVerification(
    new Request(
      "https://example.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1",
    ),
    env,
  );
  assert.equal(response.status, 403);
});

test("POST accepts a valid signature", async () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const response = await handleWhatsAppWebhook(postRequest(body), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "EVENT_RECEIVED");
});

test("POST rejects an invalid or missing signature", async (t) => {
  const body = JSON.stringify({ entry: [] });
  await t.test("invalid", async () => {
    const response = await handleWhatsAppWebhook(postRequest(body, `sha256=${"0".repeat(64)}`), env);
    assert.equal(response.status, 401);
  });
  await t.test("missing", async () => {
    const response = await handleWhatsAppWebhook(postRequest(body, null), env);
    assert.equal(response.status, 401);
  });
});

test("POST processes incoming messages", async () => {
  const body = JSON.stringify({
    entry: [{ id: "account", changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "phone-id" },
      messages: [{ id: "message-id", from: "27821234567", type: "text", text: { body: "secret" } }],
    } }] }],
  });
  const received: unknown[] = [];
  const response = await handleWhatsAppWebhook(postRequest(body), env, {
    onMessage(message) { received.push(message); },
  });
  assert.equal(response.status, 200);
  assert.equal(received.length, 1);
});

test("POST processes message statuses", async () => {
  const body = JSON.stringify({
    entry: [{ changes: [{ field: "messages", value: {
      statuses: [{ id: "message-id", recipient_id: "27821234567", status: "delivered" }],
    } }] }],
  });
  const received: unknown[] = [];
  const response = await handleWhatsAppWebhook(postRequest(body), env, {
    onStatus(status) { received.push(status); },
  });
  assert.equal(response.status, 200);
  assert.equal(received.length, 1);
});

test("POST rejects malformed JSON after signature verification", async () => {
  const response = await handleWhatsAppWebhook(postRequest("{"), env);
  assert.equal(response.status, 400);
});

test("POST acknowledges unsupported events", async () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "unknown", value: {} }] }] });
  const response = await handleWhatsAppWebhook(postRequest(body), env);
  assert.equal(response.status, 200);
});
