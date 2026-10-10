import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { demoLoginEnabled } from "@/lib/auth/demo-login";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY test sign-in while Google OAuth isn't configured (D-050).
 * "Continue with Google" calls this instead: each browser gets its own demo
 * account (random email + password kept in an httpOnly cookie), so its
 * workflows and history survive reloads and are never shared. Turns itself
 * off once GOOGLE_CLIENT_ID is set, or with DEMO_LOGIN_ENABLED=false.
 */
const COOKIE = "nf_demo_account";
const YEAR = 60 * 60 * 24 * 365;

function forward(from: Response, to: NextResponse) {
  for (const cookie of from.headers.getSetCookie()) {
    to.headers.append("set-cookie", cookie);
  }
}

export async function GET() {
  return NextResponse.json({ enabled: demoLoginEnabled() });
}

export async function POST(request: Request) {
  if (!demoLoginEnabled()) {
    return NextResponse.json(
      { error: "Demo sign-in is off: use Google" },
      { status: 404 }
    );
  }
  const jar = await cookies();
  const saved = jar.get(COOKIE)?.value;
  const [savedId, savedPassword] = saved?.split(".") ?? [];

  // Returning browser: sign back into its own demo account.
  if (savedId && savedPassword) {
    const signIn = await auth.api.signInEmail({
      body: {
        email: `demo-${savedId}@demo.n-flow.test`,
        password: savedPassword,
      },
      headers: request.headers,
      asResponse: true,
    });
    if (signIn.ok) {
      const res = NextResponse.json({ ok: true, returning: true });
      forward(signIn, res);
      return res;
    }
  }

  const id = randomBytes(6).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const signUp = await auth.api.signUpEmail({
    body: {
      email: `demo-${id}@demo.n-flow.test`,
      password,
      name: `Demo user ${id.slice(0, 4).toUpperCase()}`,
    },
    headers: request.headers,
    asResponse: true,
  });
  if (!signUp.ok) {
    return NextResponse.json(
      { error: "Could not create a demo account" },
      { status: 500 }
    );
  }
  const res = NextResponse.json({ ok: true, returning: false });
  // Set our cookie first: NextResponse.cookies rewrites the set-cookie header,
  // so Better Auth's session cookies are appended after it.
  res.cookies.set(COOKIE, `${id}.${password}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/demo-login",
    maxAge: YEAR,
  });
  forward(signUp, res);
  return res;
}
