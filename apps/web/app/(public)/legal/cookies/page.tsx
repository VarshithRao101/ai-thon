import type { Metadata } from "next";
import { LAST_UPDATED } from "@/lib/legal/contact";

export const metadata: Metadata = { title: "Cookies" };

export default function CookiesPage() {
  return (
    <>
      <h1>Cookies</h1>
      <p>Last updated {LAST_UPDATED}.</p>
      <p>
        ZETA uses only strictly necessary cookies. There are no analytics or
        advertising cookies, so there is no cookie banner. Hosted forms set no
        cookies at all.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Cookie</th>
            <th>Purpose</th>
            <th>Lifetime</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Session cookie (Better Auth)</td>
            <td>Keeps you signed in. httpOnly, not readable by scripts.</td>
            <td>Until sign-out or expiry</td>
          </tr>
          <tr>
            <td>Theme preference (local storage, not a cookie)</td>
            <td>Remembers light or dark mode on this device.</td>
            <td>Until cleared</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
