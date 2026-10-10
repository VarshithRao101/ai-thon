# Copilot golden set — 2026-10-10T12:20:11.526Z

Models: smart `gemini-3.5-flash`, fast `gemini-3.5-flash-lite`. **9/22** workflows fully correct, 197/221 checks, p50 27.1 s, p95 27.6 s.

| Case | Result | Time | Steps | Failed checks |
|---|---|---|---|---|
| hackathon-registration | FAIL | 15.2 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (No object generated: response did not match schema.) |
| lead-scoring-hot | FAIL | 27.2 s | trigger:Form > ai/classify > google-sheets/append-row > Condition > telegram/send-message | real AI (not a template fallback) (The operation was aborted due to timeout) |
| clinic-booking | FAIL | 27.4 s | trigger:Form > google-sheets/append-row > smtp-email/send-email > Delay > smtp-email/send-email | real AI (not a template fallback) (The operation was aborted due to timeout) |
| daily-telegram-update | pass | 13.6 s | trigger:Schedule > ai/generate > telegram/send-message |  |
| webhook-order | pass | 13.1 s | trigger:Webhook > google-sheets/append-row > smtp-email/send-email |  |
| feedback-negative-alert | FAIL | 27.4 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (The operation was aborted due to timeout); has Condition (missing); ai/classify before Condition (not upstream); Condition before telegram/send-message (not upstream); condition tests one of the classifier's labels |
| job-application | FAIL | 27.6 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (The operation was aborted due to timeout) |
| personal-reply | FAIL | 27.5 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (The operation was aborted due to timeout) |
| rsvp-reminder | FAIL | 29.9 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (The operation was aborted due to timeout); has Delay (missing); 2+ smtp-email/send-email (got 1); Delay before smtp-email/send-email (not upstream) |
| weekly-report | pass | 9.4 s | trigger:Schedule > ai/generate > telegram/send-message |  |
| support-ticket-priority | pass | 10.8 s | trigger:Webhook > ai/classify > google-sheets/append-row > Condition > telegram/send-message |  |
| telugu-welcome | FAIL | 27.3 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (The operation was aborted due to timeout) |
| hindi-alert | FAIL | 9.2 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (No object generated: response did not match schema.) |
| manual-hello | pass | 9.0 s | trigger:Manual > telegram/send-message |  |
| extract-enquiry | FAIL | 27.1 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (The operation was aborted due to timeout); has ai/extract (missing); ai/extract before google-sheets/append-row (not upstream); sheet row uses ai/extract |
| webinar-parallel | FAIL | 27.5 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (The operation was aborted due to timeout) |
| payment-webhook | pass | 9.1 s | trigger:Webhook > google-sheets/append-row > smtp-email/send-email |  |
| attendance-reminder | pass | 8.9 s | trigger:Schedule > telegram/send-message |  |
| course-interest-email | FAIL | 27.3 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (The operation was aborted due to timeout) |
| crm-http | pass | 9.6 s | trigger:Form > HTTP Request > telegram/send-message |  |
| edit-add-condition | pass | 10.4 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > Condition > telegram/send-message |  |
| edit-remove-sheet | FAIL | 27.4 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (The operation was aborted due to timeout); no google-sheets/append-row (present) |
