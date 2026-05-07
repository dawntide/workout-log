type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  devLink?: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";

export function getRequestOrigin(req: Request): string {
  const configured = process.env.WORKOUT_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");

  const host = req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

export async function sendEmail(input: EmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      console.error("Email not sent: RESEND_API_KEY or RESEND_FROM is missing");
      return false;
    }
    console.info("Email not sent in dev; configure RESEND_API_KEY and RESEND_FROM.");
    if (input.devLink) console.info(`Auth link for ${input.to}: ${input.devLink}`);
    return false;
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`Email not sent: Resend returned ${res.status}`, detail);
    return false;
  }
  return true;
}
