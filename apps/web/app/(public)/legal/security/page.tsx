import type { Metadata } from "next";
import { contactLine } from "@/lib/legal/contact";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <>
      <h1>Security</h1>
      <ul>
        <li>
          <strong>Tenant isolation:</strong> Postgres row-level security
          confines every query to one workspace, on top of checks in the
          application.
        </li>
        <li>
          <strong>Encryption:</strong> connection secrets and full step outputs
          are sealed with AES-256-GCM under a per-workspace key, wrapped by
          rotatable master keys.
        </li>
        <li>
          <strong>Access control:</strong> owner, admin, editor and viewer
          roles; scoped, revocable API keys stored as hashes; an audit log of
          sensitive actions.
        </li>
        <li>
          <strong>Outbound requests:</strong> the HTTP step only reaches public
          addresses, and every redirect is checked again.
        </li>
        <li>
          <strong>Public forms:</strong> rate limits, a bot trap, consent
          capture, and duplicate-submit protection.
        </li>
      </ul>
      <h2>Reporting a vulnerability</h2>
      <p>
        Please report security issues privately to {contactLine()}. Do not test
        against other people's workspaces or data.
      </p>
    </>
  );
}
