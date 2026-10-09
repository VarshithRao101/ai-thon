import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// Same precedence as Next.js: .env.local overrides .env
config({ path: [".env.local", ".env"], quiet: true });

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations run as the table owner; the app connects as a least-privilege role.
    url:
      process.env.DATABASE_ADMIN_URL ||
      process.env.DATABASE_URL ||
      "postgres://localhost:5432/workflow",
  },
} satisfies Config;
