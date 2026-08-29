/** Brevo transactional email — Phase F's provider (TERMINAL_SPEC.md §6),
 *  chosen over Resend specifically because Brevo's single-sender
 *  verification is an email-ownership click-through, not full domain DNS
 *  records, so it works without ZOQO owning a verified sending domain yet
 *  (see PHASE_C_HANDOFF.md's Phase F note on this same tradeoff for
 *  Resend). Requires BREVO_API_KEY + BREVO_SENDER_EMAIL (a single sender
 *  verified in the Brevo dashboard) — absent either, `sendEmail` no-ops and
 *  logs instead of throwing, same "runs fine without the key, just not for
 *  real" pattern as src/lib/serverPriceFeed.ts's TwelveData fallback.
 *
 *  API verified against Brevo's current transactional email docs before
 *  writing this (POST /v3/smtp/email, `api-key` header, sender/to/subject/
 *  htmlContent body) — no SDK installed, plain fetch is enough for one
 *  endpoint. */

export interface SendEmailInput {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; reason?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
    console.log(`[brevo] BREVO_API_KEY/BREVO_SENDER_EMAIL not set — skipping send to ${input.to.email}: "${input.subject}"`);
    return { ok: false, reason: "not configured" };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      sender: { name: "ZOQO", email: senderEmail },
      to: [input.to],
      subject: input.subject,
      htmlContent: input.htmlContent,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, reason: `brevo ${res.status}: ${body}` };
  }
  return { ok: true };
}
