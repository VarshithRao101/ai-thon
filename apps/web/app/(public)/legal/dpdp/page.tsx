import type { Metadata } from "next";
import { contactLine, LAST_UPDATED } from "@/lib/legal/contact";

export const metadata: Metadata = { title: "DPDP notice for form submitters" };

export default function DpdpPage() {
  return (
    <>
      <h1>Notice for people filling in a N-Flow form</h1>
      <p>Last updated {LAST_UPDATED}.</p>
      <ul>
        <li>
          The organisation that published the form (the form owner) decides what
          it asks and why. It is the data fiduciary under India's DPDP Act,
          2023. N-Flow processes your answers for them.
        </li>
        <li>
          Your answers are used only for the purpose the form describes, for
          example confirming a registration, adding it to the owner's
          spreadsheet, emailing you and alerting their team.
        </li>
        <li>
          You give consent by ticking the box on the form. You can withdraw it
          at any time by contacting the form owner.
        </li>
        <li>
          Each submission gets a tamper-proof receipt. Only salted hashes go
          into it, and only a Merkle root of many receipts goes on a public
          blockchain. Your answers are never on-chain.
        </li>
        <li>
          To access, correct or erase your answers, contact the form owner. If
          you cannot reach them, contact {contactLine()}.
        </li>
      </ul>
    </>
  );
}
