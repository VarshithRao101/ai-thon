/** Guest (anonymous plugin) users can't use the app: they must sign in first. */
export function isGuest(
  user:
    | {
        name?: string | null;
        email?: string | null;
        isAnonymous?: boolean | null;
      }
    | null
    | undefined
): boolean {
  return (
    !user ||
    user.isAnonymous === true ||
    user.name === "Anonymous" ||
    Boolean(user.email?.startsWith("temp-"))
  );
}

/** Only same-site paths are allowed as post-login destinations. */
export function safeNext(
  value: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return fallback;
  }
  return value;
}
