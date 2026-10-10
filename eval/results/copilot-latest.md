# Copilot golden set — 2026-10-10T14:57:06.537Z

Models: smart `openai/gpt-oss-120b`, fast `qwen/qwen3.8-27b`. **21/22** workflows fully correct, 220/221 checks, p50 12.0 s, p95 22.2 s.

| Case | Result | Time | Steps | Failed checks |
|---|---|---|---|---|
| hackathon-registration | pass | 4.5 s | trigger:Form > ai/classify > ai/draft-email > smtp-email/send-email > google-sheets/append-row > telegram/send-message |  |
| lead-scoring-hot | pass | 3.3 s | trigger:Form > ai/classify > Condition > telegram/send-message |  |
| clinic-booking | pass | 4.4 s | trigger:Form > google-sheets/append-row > ai/draft-email > smtp-email/send-email |  |
| daily-telegram-update | pass | 1.7 s | trigger:Schedule > ai/generate > telegram/send-message |  |
| webhook-order | pass | 33.9 s | trigger:Webhook > google-sheets/append-row > ai/draft-email > smtp-email/send-email |  |
| feedback-negative-alert | pass | 2.3 s | trigger:Form > ai/classify > Condition > telegram/send-message |  |
| job-application | pass | 3.2 s | trigger:Form > ai/generate > google-sheets/append-row > smtp-email/send-email |  |
| personal-reply | pass | 6.7 s | trigger:Form > ai/draft-email > smtp-email/send-email |  |
| rsvp-reminder | pass | 15.4 s | trigger:Form > google-sheets/append-row > smtp-email/send-email > Delay > smtp-email/send-email |  |
| weekly-report | pass | 17.0 s | trigger:Schedule > ai/generate > telegram/send-message |  |
| support-ticket-priority | pass | 15.2 s | trigger:Webhook > ai/classify > google-sheets/append-row > Condition > telegram/send-message |  |
| telugu-welcome | pass | 17.4 s | trigger:Form > ai/draft-email > smtp-email/send-email > google-sheets/append-row |  |
| hindi-alert | pass | 2.3 s | trigger:Form > telegram/send-message > google-sheets/append-row |  |
| manual-hello | pass | 11.6 s | trigger:Manual > telegram/send-message |  |
| extract-enquiry | FAIL | 12.0 s | trigger:Form > ai/extract > google-sheets/append-row | sheet row uses ai/extract |
| webinar-parallel | pass | 3.0 s | trigger:Form > ai/draft-email > smtp-email/send-email > telegram/send-message |  |
| payment-webhook | pass | 16.1 s | trigger:Webhook > google-sheets/append-row > ai/draft-email > smtp-email/send-email |  |
| attendance-reminder | pass | 14.7 s | trigger:Schedule > telegram/send-message |  |
| course-interest-email | pass | 15.0 s | trigger:Form > ai/classify > Condition > ai/draft-email > smtp-email/send-email > Condition > ai/draft-email > smtp-email/send-email > Condition > ai/draft-email > smtp-email/send-email |  |
| crm-http | pass | 19.2 s | trigger:Form > HTTP Request > telegram/send-message |  |
| edit-add-condition | pass | 4.4 s | trigger:Form > ai/classify > ai/draft-email > google-sheets/append-row > smtp-email/send-email > Condition > telegram/send-message |  |
| edit-remove-sheet | pass | 22.2 s | trigger:Form > smtp-email/send-email > Delay > smtp-email/send-email |  |
