import "server-only";

import nodemailer from "nodemailer";
import type { SmtpEmailCredentials } from "./credentials";

/**
 * SMTP over implicit TLS (port 465). Defaults to Gmail; a Gmail account needs
 * 2-Step Verification and an app password (D-010).
 */
export function createTransport(credentials: SmtpEmailCredentials) {
  return nodemailer.createTransport({
    host: credentials.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: credentials.SMTP_USER?.trim(),
      // Google shows app passwords in groups of four; spaces are not part of it.
      pass: credentials.SMTP_PASSWORD?.replace(/\s+/g, ""),
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}
