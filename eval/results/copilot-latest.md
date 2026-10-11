# Copilot golden set — 2026-10-11T01:32:41.091Z

Models: smart `openai/gpt-oss-120b`, fast `openai/gpt-oss-20b`. **30/40** workflows fully correct, 502/531 checks, p50 11.8 s, p95 25.4 s.

| Case | Result | Time | Steps | Failed checks |
|---|---|---|---|---|
| hackathon-registration | pass | 3.7 s | trigger:Form > ai/classify > smtp-email/send-email > google-sheets/append-row > telegram/send-message |  |
| lead-scoring-hot | pass | 3.4 s | trigger:Form > ai/classify > Condition > telegram/send-message |  |
| clinic-booking | pass | 2.1 s | trigger:Form > google-sheets/append-row > smtp-email/send-email |  |
| daily-telegram-update | pass | 1.8 s | trigger:Schedule > ai/generate > telegram/send-message |  |
| webhook-order | pass | 2.8 s | trigger:Webhook > google-sheets/append-row > smtp-email/send-email |  |
| feedback-negative-alert | pass | 2.9 s | trigger:Form > ai/classify > Condition > telegram/send-message |  |
| job-application | pass | 8.1 s | trigger:Form > ai/generate > google-sheets/append-row > smtp-email/send-email |  |
| personal-reply | pass | 8.3 s | trigger:Form > ai/draft-email > smtp-email/send-email |  |
| rsvp-reminder | pass | 4.7 s | trigger:Form > google-sheets/append-row > ai/draft-email > smtp-email/send-email > Delay > ai/draft-email > smtp-email/send-email |  |
| weekly-report | pass | 3.5 s | trigger:Schedule > ai/generate > telegram/send-message |  |
| support-ticket-priority | FAIL | 8.0 s | trigger:Webhook > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (Failed after 2 attempts. Last error: You exceeded your current quota, please che); has ai/classify (missing); has Condition (missing); ai/classify before Condition (not upstream); Condition before telegram/send-message (not upstream); condition tests one of the classifier's labels |
| telugu-welcome | pass | 10.3 s | trigger:Form > ai/draft-email > smtp-email/send-email > google-sheets/append-row |  |
| hindi-alert | pass | 16.9 s | trigger:Form > telegram/send-message > google-sheets/append-row |  |
| manual-hello | pass | 16.6 s | trigger:Manual > telegram/send-message |  |
| extract-enquiry | pass | 14.0 s | trigger:Form > ai/extract > google-sheets/append-row |  |
| webinar-parallel | pass | 18.6 s | trigger:Form > ai/draft-email > smtp-email/send-email > telegram/send-message |  |
| payment-webhook | pass | 20.7 s | trigger:Webhook > google-sheets/append-row > ai/draft-email > smtp-email/send-email |  |
| attendance-reminder | pass | 21.6 s | trigger:Schedule > telegram/send-message |  |
| course-interest-email | FAIL | 19.6 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (Failed after 2 attempts. Last error: You exceeded your current quota, please che) |
| crm-http | FAIL | 24.9 s | trigger:Form > ai/classify > google-sheets/append-row > Condition > telegram/send-message | real AI (not a template fallback) (Failed after 2 attempts. Last error: You exceeded your current quota, please che); has HTTP Request (missing); HTTP endpoint as asked |
| edit-add-condition | FAIL | 25.4 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (Failed after 2 attempts. Last error: You exceeded your current quota, please che); has Condition (missing); Condition before telegram/send-message (not upstream); condition tests one of the classifier's labels |
| edit-remove-sheet | FAIL | 25.3 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (Failed after 2 attempts. Last error: You exceeded your current quota, please che); no google-sheets/append-row (present) |
| first-5-thanks | pass | 21.9 s | trigger:Form > Condition > smtp-email/send-email |  |
| first-3-discount | pass | 15.5 s | trigger:Form > google-sheets/append-row > Condition > ai/draft-email > smtp-email/send-email |  |
| waitlist-after-50 | pass | 21.1 s | trigger:Form > Condition > smtp-email/send-email > Condition > smtp-email/send-email |  |
| budget-over-50k | pass | 2.2 s | trigger:Form > google-sheets/append-row > Condition > telegram/send-message |  |
| age-18-plus | pass | 6.7 s | trigger:Form > Condition > google-sheets/append-row > smtp-email/send-email |  |
| urgent-or-normal | pass | 10.5 s | trigger:Form > ai/classify > Condition > telegram/send-message |  |
| followup-30-min | pass | 10.5 s | trigger:Form > Delay > ai/draft-email > smtp-email/send-email |  |
| reminder-2-days | pass | 21.3 s | trigger:Form > ai/draft-email > smtp-email/send-email > Delay > ai/draft-email > smtp-email/send-email |  |
| all-three-parallel | pass | 14.0 s | trigger:Form > google-sheets/append-row > smtp-email/send-email > telegram/send-message |  |
| friday-timesheet | FAIL | 25.4 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (Failed after 2 attempts. Last error: You exceeded your current quota, please che); trigger (got Form); cron 0 17 * * 5 (got "") |
| payment-over-1000 | FAIL | 11.8 s | trigger:Webhook > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (Failed after 2 attempts. Last error: You exceeded your current quota, please che); has Condition (missing); Condition before smtp-email/send-email (not upstream); condition uses amount (no condition) |
| hindi-first-10 | pass | 4.9 s | trigger:Form > Condition > smtp-email/send-email > google-sheets/append-row |  |
| extract-city-route | pass | 21.6 s | trigger:Form > ai/extract > google-sheets/append-row > Condition > telegram/send-message |  |
| edit-add-delay | FAIL | 18.7 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > telegram/send-message | real AI (not a template fallback) (Failed after 2 attempts. Last error: You exceeded your current quota, please che); has Delay (missing); Delay before smtp-email/send-email (not upstream); waits 10 min (got ) |
| edit-hot-and-warm | FAIL | 20.6 s | trigger:Form > ai/classify > google-sheets/append-row > Condition > telegram/send-message | real AI (not a template fallback) (Failed after 2 attempts. Last error: You exceeded your current quota, please che) |
| manual-test-row | pass | 3.4 s | trigger:Manual > google-sheets/append-row |  |
| crm-no-url | pass | 7.3 s | trigger:Form > ai/draft-email > google-sheets/append-row > smtp-email/send-email |  |
| lpu-email-domain | FAIL | 4.7 s | trigger:Form > google-sheets/append-row > ai/classify > Condition > telegram/send-message | condition uses lpu.in ({{@classify_email_b4f1:Classify Email.label}} === 'LPU student') |
