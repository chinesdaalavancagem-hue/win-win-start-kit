import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PushPayload = { title: string; body: string; url?: string };

const encoder = new TextEncoder();
const VAPID_EXPIRY_SECONDS = 12 * 60 * 60;

// Produz um ArrayBuffer independente, compatível com os tipos BufferSource
// esperados pela Web Crypto API em runtimes como Cloudflare Workers.
function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function uint32be(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

async function createVapidAuthorization(endpoint: string, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const rawPublicKey = decodeBase64Url(publicKey);
  if (rawPublicKey.length !== 65 || rawPublicKey[0] !== 4) throw new Error("Invalid VAPID public key");
  const x = encodeBase64Url(rawPublicKey.slice(1, 33));
  const y = encodeBase64Url(rawPublicKey.slice(33, 65));
  const d = encodeBase64Url(decodeBase64Url(privateKey));
  if (decodeBase64Url(d).length !== 32) throw new Error("Invalid VAPID private key");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, ext: true, key_ops: ["sign"] },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const origin = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = encodeBase64Url(encoder.encode(JSON.stringify({ aud: origin, exp: now + VAPID_EXPIRY_SECONDS, sub: subject })));
  const unsigned = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    asArrayBuffer(encoder.encode(unsigned)),
  ));
  if (signature.length !== 64) throw new Error("Unexpected ES256 signature format");
  return `vapid t=${unsigned}.${encodeBase64Url(signature)}, k=${publicKey}`;
}

async function encryptPayload(subscription: { p256dh: string; auth: string }, payload: string): Promise<Uint8Array> {
  const uaPublicBytes = decodeBase64Url(subscription.p256dh);
  const authSecret = decodeBase64Url(subscription.auth);
  if (uaPublicBytes.length !== 65 || uaPublicBytes[0] !== 4 || authSecret.length < 16) {
    throw new Error("Invalid push subscription keys");
  }

  const uaPublicKey = await crypto.subtle.importKey(
    "raw", asArrayBuffer(uaPublicBytes), { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  ) as CryptoKeyPair;
  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaPublicKey }, ephemeral.privateKey, 256,
  ));

  const keyInfo = concatBytes(encoder.encode("WebPush: info\0"), uaPublicBytes, asPublicBytes);
  const sharedKey = await crypto.subtle.importKey("raw", asArrayBuffer(sharedSecret), "HKDF", false, ["deriveBits"]);
  const ikm = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: asArrayBuffer(authSecret), info: asArrayBuffer(keyInfo) }, sharedKey, 256,
  ));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const inputKey = await crypto.subtle.importKey("raw", asArrayBuffer(ikm), "HKDF", false, ["deriveBits"]);
  const contentKeyBytes = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: asArrayBuffer(salt), info: asArrayBuffer(encoder.encode("Content-Encoding: aes128gcm\0")) }, inputKey, 128,
  ));
  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: asArrayBuffer(salt), info: asArrayBuffer(encoder.encode("Content-Encoding: nonce\0")) }, inputKey, 96,
  ));
  const contentKey = await crypto.subtle.importKey("raw", asArrayBuffer(contentKeyBytes), { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = concatBytes(encoder.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(nonce), tagLength: 128 }, contentKey, asArrayBuffer(plaintext),
  ));

  // RFC 8291 aes128gcm record: salt || rs || idlen || ephemeral public key || ciphertext.
  return concatBytes(salt, uint32be(4096), new Uint8Array([asPublicBytes.length]), asPublicBytes, ciphertext);
}

async function enviarParaInscricao(
  subscription: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
  publicKey: string,
  privateKey: string,
  subject: string,
): Promise<void> {
  try {
    const endpoint = new URL(subscription.endpoint);
    if (endpoint.protocol !== "https:") return;
    const authorization = await createVapidAuthorization(subscription.endpoint, publicKey, privateKey, subject);
    const body = await encryptPayload(subscription, JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: "/logo.png",
      badge: "/favicon.png",
      data: { url: payload.url || "/plataforma" },
    }));
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "60",
        Urgency: "high",
      },
      body: body as BodyInit,
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 404 || response.status === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("id", subscription.id);
    }
  } catch {
    // A falha em um dispositivo não afeta a ordem nem as demais inscrições.
  }
}

// Envio best-effort: todos os erros são absorvidos para nunca quebrar o processamento da ordem.
export async function enviarPushAoUsuario(userId: string, payload: PushPayload): Promise<void> {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) return;

    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", userId);
    if (error || !subscriptions?.length) return;

    await Promise.all(subscriptions.map((subscription) =>
      enviarParaInscricao(subscription, payload, publicKey, privateKey, subject),
    ));
  } catch {
    // Push é opcional e não pode interromper a rota chamadora.
  }
}
