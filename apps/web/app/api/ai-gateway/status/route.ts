/**
 * GET /api/ai-gateway/status
 *
 * Vercel AI Gateway "managed keys" required Vercel OAuth, which N-Flow does
 * not use (D-027). The feature reports itself disabled so the UI never offers
 * it; N-Flow's own AI provider layer (Gemini/Groq) lands in P1G.
 */
export function GET() {
  return Response.json({
    enabled: false,
    signedIn: false,
    isVercelUser: false,
    hasManagedKey: false,
  });
}
