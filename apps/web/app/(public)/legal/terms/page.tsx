import type { Metadata } from "next";
import { contactLine, LAST_UPDATED } from "@/lib/legal/contact";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of use</h1>
      <p>Last updated {LAST_UPDATED}.</p>

      <h2>Using ZETA</h2>
      <ul>
        <li>
          By creating an account or a guest session you accept these terms.
        </li>
        <li>
          Workspace owners control who can access their workspace and what its
          workflows do.
        </li>
        <li>
          Do not use ZETA for spam, unlawful data collection, harassment, or to
          abuse connected services or their limits.
        </li>
      </ul>

      <h2>Your data</h2>
      <p>
        Workspace owners own their workflows and the data they process. For form
        submissions and other personal data, the workspace owner is the data
        fiduciary and ZETA is the processor.
      </p>

      <h2>Connected services and AI</h2>
      <ul>
        <li>
          Google, Telegram and AI providers have their own terms and limits.
          ZETA is not responsible for their availability.
        </li>
        <li>
          AI steps can be wrong. Review AI drafts before relying on them for
          important decisions.
        </li>
      </ul>

      <h2>Plans, availability and liability</h2>
      <ul>
        <li>
          Plan limits and fair use apply. The Free plan has no uptime
          commitment.
        </li>
        <li>
          To the extent the law allows, our liability is limited to the fees
          paid in the previous three months.
        </li>
        <li>
          You can export your workflows and leave at any time; we delete
          workspace data after termination.
        </li>
      </ul>

      <h2>Law and contact</h2>
      <p>
        These terms are governed by the laws of India. Contact: {contactLine()}.
      </p>
    </>
  );
}
