import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PushPayload = { title: string; body: string; url?: string };

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// Web Push payload encryption (RFC 8291) requires ECDH + HKDF + AES-GCM.
// Kept isolated here so delivery failures never affect the order processing path.
export async function enviarPushAoUsuario(userId: string, payload: PushPayload): Promise<void> {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) return;
    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId);
    if (error || !subscriptions?.length) return;

    // Load the Edge/WebCrypto implementation lazily to avoid Node-native dependencies.
    const { sendNotification } = await import("@negrel/webpush");
    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        const response = await sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({ ...payload, icon: "/logo.png", badge: "/favicon.png", data: { url: payload.url || "/plataforma" } }),
          {
            vapid: { subject, publicKey, privateKey },
            fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(3000) }),
          } as never,
        );
        if (response.status === 404 || response.status === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", subscription.id);
        }
      } catch (error) {
        const status = (error as { statusCode?: number; status?: number })?.statusCode ??
          (error as { status?: number })?.status;
        if (status === 404 || status === 410) {
          try { await supabaseAdmin.from("push_subscriptions").delete().eq("id", subscription.id); } catch { /* best effort */ }
        }
      }
    }));
  } catch {
    // Push is best-effort and must never break or delay the caller.
  }
}
