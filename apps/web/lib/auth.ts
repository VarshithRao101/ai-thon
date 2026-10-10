import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous, genericOAuth, organization } from "better-auth/plugins";
import { isAiGatewayManagedKeysEnabled } from "./ai-gateway/config";
import { ac, roles } from "./auth/permissions";
import { firstWorkspaceId, linkAnonymousWorkspaces } from "./auth/workspaces";
import { db } from "./db";
import {
  accounts,
  invitations,
  members,
  sessions,
  users,
  verifications,
  workspaces,
} from "./db/schema";

// Better Auth models -> ZETA tables (organization = workspace)
const schema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  organization: workspaces,
  member: members,
  invitation: invitations,
};

// Determine the base URL for authentication
// This supports Vercel Preview deployments with dynamic URLs
function getBaseURL() {
  // Priority 1: Explicit BETTER_AUTH_URL (set manually for production/dev)
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }

  // Priority 2: NEXT_PUBLIC_APP_URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Priority 3: Check if we're on Vercel (for preview deployments)
  if (process.env.VERCEL_URL) {
    // VERCEL_URL doesn't include protocol, so add it
    // Use https for Vercel deployments (both production and preview)
    return `https://${process.env.VERCEL_URL}`;
  }

  // Fallback: Local development
  return "http://localhost:3000";
}

// Build plugins array conditionally
const plugins = [
  anonymous({
    // A guest who signs up or signs in keeps everything they built.
    async onLinkAccount({ anonymousUser, newUser }) {
      await linkAnonymousWorkspaces(anonymousUser.user.id, newUser.user.id);
    },
  }),
  organization({
    ac,
    roles,
    creatorRole: "owner",
    // Guests work in their personal workspace only.
    allowUserToCreateOrganization: (user) =>
      !(user as { isAnonymous?: boolean | null }).isAnonymous,
    invitationExpiresIn: 7 * 24 * 60 * 60,
    sendInvitationEmail: ({ id, organization: workspace }) => {
      // P1E wires SMTP. Never log the invitee's email address.
      console.info(`[invite] created ${id} for workspace ${workspace.id}`);
      return Promise.resolve();
    },
  }),
  ...(process.env.VERCEL_CLIENT_ID
    ? [
        genericOAuth({
          config: [
            {
              providerId: "vercel",
              clientId: process.env.VERCEL_CLIENT_ID,
              clientSecret: process.env.VERCEL_CLIENT_SECRET || "",
              authorizationUrl: "https://vercel.com/oauth/authorize",
              tokenUrl: "https://api.vercel.com/login/oauth/token",
              userInfoUrl: "https://api.vercel.com/login/oauth/userinfo",
              // Include read-write:team scope when AI Gateway User Keys is enabled
              // This grants APIKey and APIKeyAiGateway permissions for creating user keys
              scopes: isAiGatewayManagedKeysEnabled()
                ? ["openid", "email", "profile", "read-write:team"]
                : ["openid", "email", "profile"],
              discoveryUrl: undefined,
              pkce: true,
              getUserInfo: async (tokens) => {
                const response = await fetch(
                  "https://api.vercel.com/login/oauth/userinfo",
                  {
                    headers: {
                      Authorization: `Bearer ${tokens.accessToken}`,
                    },
                  }
                );
                const profile = await response.json();
                console.log("[Vercel OAuth] userinfo response:", profile);
                return {
                  id: profile.sub,
                  email: profile.email,
                  name: profile.name ?? profile.preferred_username,
                  emailVerified: profile.email_verified ?? true,
                  image: profile.picture,
                };
              },
            },
          ],
        }),
      ]
    : []),
];

export const auth = betterAuth({
  baseURL: getBaseURL(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  // Signing in with Google using an address that already has an ZETA
  // account links to it (Google verifies the address), so history is kept.
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  // Brute-force protection on sign-in and sign-up (D-056); per instance.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 10 },
      "/sign-in/social": { window: 60, max: 20 },
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      enabled: !!process.env.GITHUB_CLIENT_ID,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      enabled: !!process.env.GOOGLE_CLIENT_ID,
    },
  },
  plugins,
  databaseHooks: {
    // Personal workspaces are created lazily (lib/auth/workspaces.ts) to avoid
    // racing guest-account linking; new sessions start in the oldest workspace.
    session: {
      create: {
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await firstWorkspaceId(session.userId),
          },
        }),
      },
    },
  },
});
