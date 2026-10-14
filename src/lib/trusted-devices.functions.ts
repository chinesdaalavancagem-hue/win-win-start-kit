import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEVICE_COOKIE_NAME = "wow_trusted_device";
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function readDeviceCookie(cookieHeader: string): string | null {
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEVICE_COOKIE_NAME}=`));
  const value = entry?.slice(DEVICE_COOKIE_NAME.length + 1);
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

function createDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const registrarDispositivoConfiavel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    console.info("[TRUSTED_DEVICE] entry");
    try {
      const request = getRequest();
      const existingId = readDeviceCookie(request.headers.get("cookie") ?? "");
      const deviceId = existingId ?? createDeviceId();

      if (!existingId) {
        setResponseHeader(
          "Set-Cookie",
          `${DEVICE_COOKIE_NAME}=${deviceId}; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
        );
      }

      const deviceTokenHash = await sha256Hex(deviceId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error, status } = await supabaseAdmin.rpc("register_trusted_device", {
        p_user_id: context.userId,
        p_device_token_hash: deviceTokenHash,
      });

      if (error) {
        console.error("[TRUSTED_DEVICE] error", {
          status,
          message: error.message.replace(
            /(wow_trusted_device|device_token_hash|service_role|password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
            "$1=[REDACTED]",
          ),
        });
        return { registered: false };
      }

      console.info("[TRUSTED_DEVICE] success", { event_action: data?.[0]?.event_action });
      return { registered: true };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown registration error";
      console.error("[TRUSTED_DEVICE] error", {
        status: typeof (cause as { status?: unknown })?.status === "number"
          ? (cause as { status: number }).status
          : null,
        message: message.replace(
          /(wow_trusted_device|device_token_hash|service_role|password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
          "[REDACTED]",
        ),
      });
      return { registered: false };
    }
  });
