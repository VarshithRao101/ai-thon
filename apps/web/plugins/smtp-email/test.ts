import { createTransport } from "./transport";

/** Logs in to the SMTP server without sending anything. */
export async function testSmtpEmail(credentials: Record<string, string>) {
  if (!(credentials.SMTP_USER && credentials.SMTP_PASSWORD)) {
    return { success: false, error: "Enter the sender address and its app password" };
  }
  try {
    await createTransport(credentials).verify();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: /535|Invalid login|Username and Password/i.test(message)
        ? "Login refused. For Gmail, use a 16-character app password (2-Step Verification must be on)."
        : `Could not connect: ${message}`,
    };
  }
}
