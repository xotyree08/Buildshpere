/** The verification message, one place so signup and resend never drift. */

import type { EmailMessage } from "./email";

export function verificationEmail(to: string, token: string): EmailMessage {
  const link = `https://onbuildsphere.com/api/v1/auth/verify?token=${token}`;
  return {
    to,
    subject: "Verify your BuildSphere email",
    text:
      `Welcome to BuildSphere.\n\n` +
      `Confirm this email address by opening the link below (valid for 48 hours):\n\n${link}\n\n` +
      `If you didn't create a BuildSphere account, ignore this message — nothing else happens.`,
  };
}
