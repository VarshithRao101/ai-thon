/** Temporary test sign-in is on until Google OAuth is configured (D-050). */
export function demoLoginEnabled(): boolean {
  return (
    !process.env.GOOGLE_CLIENT_ID && process.env.DEMO_LOGIN_ENABLED !== "false"
  );
}
