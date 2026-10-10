# 18 — Legal Pages

All pages are **templates for a hackathon product and not legal advice**. Each page footer says so. Before any real commercial launch, a lawyer must review them.

## Pages (P1H)
| Route | Content outline |
|---|---|
| `/legal/privacy` | Who we are (TRNT BEE / ZETA, contact email); what we collect (account data, workspace data, form submissions processed on behalf of workspace owners, technical logs); purposes; lawful basis under the DPDP Act 2023 (consent, legitimate uses); processors (hosting, DB, email, AI providers, including the free-tier training caveat); data on blockchain (only salted hashes / Merkle roots, no personal data); retention by plan; security measures; data principal rights (access, correction, erasure, grievance redressal, nomination); grievance officer contact; children's data (not directed at under-18s); changes; date |
| `/legal/terms` | Acceptance; accounts and workspaces; acceptable use (no spam, no unlawful data, no abuse of integrations); customer data ownership (the workspace owner is the data fiduciary, ZETA is the processor); plan limits and fair use; third-party integrations disclaimer; AI output disclaimer (review AI drafts); availability (no SLA on Free); liability cap; termination and data export; governing law (India; city to be decided); contact |
| `/legal/cookies` | Cookie table from [10](10_SECURITY_PRIVACY.md); categories; how to change choices (footer link "Cookie settings" reopens the banner) |
| `/legal/dpdp` | Short DPDP notice for form submitters: what the form owner collects, why, how to withdraw consent, who to contact. Linked from every hosted form under the consent checkbox |
| `/legal/dpa` | Data Processing Addendum summary for business customers (processor obligations, sub-processor list, breach notification, deletion on termination) |
| `/legal/open-source` | Attribution for the base template (Apache-2.0) + auto-generated dependency license list |
| `/legal/security` | Short security overview + responsible-disclosure email |

## Cookie consent banner behavior
- Shown on the first visit to the marketing site and the app. Equal-weight buttons: **Accept all**, **Reject non-essential**, **Customize**.
- Defaults: only strictly necessary cookies. Analytics (if added) is off until accepted.
- The choice is stored in the `fl_consent` cookie (180 days) and logged server-side for signed-in users (`audit_events: consent.update`).
- **Hosted forms** show no cookie banner because they set no non-essential cookies. They show the DPDP consent checkbox instead.

## Hosted-form consent text (default; editable by the workspace)
> "I agree that {Workspace name} may use the information in this form to {purpose}. I can withdraw consent anytime by contacting {contact email}. See the [privacy notice](/legal/dpdp)."

The submit button is disabled until the box is checked. The consent timestamp is stored with the submission.
