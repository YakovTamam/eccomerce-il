import type { EmailMessage, EmailProvider } from "./provider";

/** Dev/default: no real mail leaves the system. */
export class ConsoleEmailProvider implements EmailProvider {
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    this.sent.push(msg);
    console.info(`[email:console] to=${msg.to} subject=${msg.subject}`);
  }
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private apiKey: string,
    private from: string,
    private f: typeof fetch = fetch,
  ) {}
  async send(msg: EmailMessage) {
    const res = await this.f("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
    });
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
  }
}

export function getEmailProvider(
  env: Record<string, string | undefined> = process.env,
): EmailProvider {
  if (env.RESEND_API_KEY)
    return new ResendEmailProvider(
      env.RESEND_API_KEY,
      env.EMAIL_FROM ?? "onboarding@resend.dev",
    );
  return new ConsoleEmailProvider();
}
