/**
 * Email provider seam (Resend). Same discipline as payments: an
 * unconfigured deployment refuses loudly with the exact fix (L4), a
 * provider failure surfaces the real reason (L2), and fetch is
 * injectable so the whole path is tested without a network.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface EmailEnv {
  RESEND_API_KEY?: string;
  /** Verified sender; falls back to Resend's onboarding sender for tests. */
  EMAIL_FROM?: string;
}

export const EMAIL_UNCONFIGURED =
  "Email is not configured on this deployment — set RESEND_API_KEY (resend.com → API Keys) and EMAIL_FROM (a verified sender) and redeploy. No message was sent.";

export const DEFAULT_FROM = "BuildSphere <onboarding@resend.dev>";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type SendResult = { ok: true } | { ok: false; error: string };

export function emailConfigured(env: EmailEnv): boolean {
  return Boolean(env.RESEND_API_KEY);
}

export async function sendEmail(env: EmailEnv, msg: EmailMessage, fetchFn: FetchLike): Promise<SendResult> {
  if (!env.RESEND_API_KEY) return { ok: false, error: EMAIL_UNCONFIGURED };
  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || DEFAULT_FROM,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Email provider refused the message (HTTP ${res.status}): ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Could not reach the email provider (${String(e)}).` };
  }
}
