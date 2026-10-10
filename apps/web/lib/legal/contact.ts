/** Public contact for legal pages. Set CONTACT_EMAIL before launch. */
export function contactLine(): string {
  const email = process.env.CONTACT_EMAIL?.trim();
  return email
    ? email
    : "the ZETA team (Team Hydra, TRNT BEE); a contact address will be published before launch";
}

export const LAST_UPDATED = "10 October 2026";
