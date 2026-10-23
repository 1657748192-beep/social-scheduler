# Instagram message send feedback — local verification

Scope: frontend feedback only. No deployment, service restart, Meta request, send, attempt reset, permission, credential, schedule or Webhook change.

- Reply composer immediately shows a sending state and prevents repeated clicks.
- A fresh successful Instagram message receipt with a valid provider ID immediately adds the submitted reply as an outgoing chat bubble, marks the detail replied, and follows that bubble once.
- Refresh failures are reported separately from a confirmed send; they cannot change it into an unknown send.
- Missing/malformed receipts remain unknown. Replayed, failed and unknown responses cannot invent a fresh outgoing bubble.
- Account/session/workspace/case changes, access denial and rate limits fence late responses. Authoritative deletion and empty refresh results retain precedence. Existing one-attempt and duplicate-send protections remain unchanged.

Local verification:

- New send-feedback regression tests: 16/16 passed.
- Send-feedback, detail, message timeline and Instagram recording tests: 42/42 passed.
- Complete Web test suite: 384/384 passed.
- Web production build: passed (existing multiple-lockfile workspace-root warning).
- Read-only code review: no important findings.

Evidence: `output/ig-message-feedback-extra-green-20261023.log`, `output/ig-message-feedback-focused-complete-20261023.log`, `output/ig-message-feedback-web-all-20261023.log`, `output/ig-message-feedback-web-build-final-20261023.log`.

Production remains unchanged. No real delivery validation was performed in this local-only round.
