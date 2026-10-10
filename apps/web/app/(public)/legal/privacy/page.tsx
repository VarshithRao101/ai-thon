import type { Metadata } from "next";
import { contactLine, LAST_UPDATED } from "@/lib/legal/contact";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy notice</h1>
      <p>Last updated {LAST_UPDATED}.</p>

      <h2>Who we are</h2>
      <p>
        N-Flow is a no-code automation product built by TRNT BEE (Team Hydra).
        Contact: {contactLine()}.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          Account data: name, email address and a hashed password, or a guest
          session.
        </li>
        <li>
          Workspace data: workflows, connection settings (encrypted), run logs
          and audit events.
        </li>
        <li>
          Form submissions: answers to forms that our customers publish. We
          process these on behalf of the form owner, who decides what is
          collected and why.
        </li>
        <li>
          Technical data: server logs and a keyed hash of your IP address for
          rate limiting. We do not keep raw IPs.
        </li>
      </ul>

      <h2>Why, and on what basis</h2>
      <p>
        To run the automations you or a form owner set up, to keep the service
        secure, and to provide support. Under India's Digital Personal Data
        Protection Act, 2023 we rely on consent (for example the consent
        checkbox on every hosted form) and on legitimate uses permitted by the
        Act.
      </p>

      <h2>Who processes data for us</h2>
      <ul>
        <li>Hosting and database providers that run N-Flow.</li>
        <li>
          Services you connect: Google (Sheets, Gmail), Telegram, and AI
          providers (Google Gemini, with Groq as a backup). Data reaches them
          only when a workflow step sends it.
        </li>
        <li>
          AI providers' free tiers may use inputs to improve their models. Do
          not send sensitive data through AI steps on a free tier.
        </li>
      </ul>

      <h2>What goes on the blockchain</h2>
      <p>
        Only 32-byte Merkle roots, computed from receipts that contain salted
        hashes and ids. No names, emails or answers are ever written on-chain.
        Deleting the salt for a run makes its hashes permanently unlinkable to
        the person.
      </p>

      <h2>Retention and security</h2>
      <ul>
        <li>
          Run data is kept according to the workspace's plan and then deleted.
        </li>
        <li>
          Connection secrets and step outputs are encrypted with a per-workspace
          key. Workspaces are isolated in the database by row-level security.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask for access, correction or erasure of your personal data,
        withdraw consent, nominate someone to act for you, and raise a
        grievance. For data in a form, contact the form owner first; we will
        help them respond. A grievance officer will be named before commercial
        launch. Contact: {contactLine()}.
      </p>

      <h2>Children</h2>
      <p>N-Flow is not directed at people under 18.</p>

      <h2>Changes</h2>
      <p>We will update this page and its date when practices change.</p>
    </>
  );
}
