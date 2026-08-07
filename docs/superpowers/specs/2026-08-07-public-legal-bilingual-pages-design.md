# Public and legal bilingual pages

## Goal

Provide complete Chinese and English public pages for Social Scheduler so users can browse in either language and external reviewers can open stable English URLs without relying on browser-local language preferences.

## Routes

| Content | Chinese route | English route |
| --- | --- | --- |
| Public home | `/` | `/en` |
| Privacy policy | `/privacy` | `/en/privacy` |
| Terms of service | `/terms` | `/en/terms` |

Existing `/privacy-policy` continues to point to the Chinese privacy policy for backward compatibility.

## Page behavior

- Chinese remains the default public language at the root routes.
- Each public and legal page displays a `中文 / English` language switcher.
- The switcher links to the equivalent route in the other language, rather than only storing a client-side preference.
- Footer legal links remain in the current language: an English page links only to English legal pages, and a Chinese page links only to Chinese legal pages.
- English pages use English metadata and set their document language to English where the existing layout permits.

## Content

- The English home page describes Social Scheduler, its authorized-account connection flow, original-content publishing workflow, and supported platforms.
- The English privacy policy is a complete translation of the current policy, including all supported third-party platforms, authorization data, data retention, deletion rights, no-sale/no-targeted-advertising statement, and contact email.
- The English terms are a complete translation of the current terms, including user content rights, copyright and music responsibility, third-party platform rules, service limitations, account restrictions, deletion, disclaimers, and contact email.
- The English public homepage and legal pages state that TikTok features are intended for users outside Mainland China. This makes the service scope clear to reviewers without changing the Chinese product workflow.

## Implementation shape

- Extract reusable public-site shell, language switcher, and legal-document rendering components so language-specific routes do not duplicate layout behavior.
- Keep the substantive legal copy in language-specific content objects/components. Avoid runtime translation and avoid requiring JavaScript for a reviewer to read an English route.
- Preserve all existing URLs and public page styles.

## Error handling and compatibility

- Old links to `/`, `/privacy`, `/terms`, and `/privacy-policy` remain valid.
- A user can open an English page directly in a fresh browser session and see English immediately.
- Language selection on public pages does not affect the authenticated application language preference.

## Tests

- Add source-level route/content tests that verify each English route exists and includes the required legal/public disclosures.
- Verify public-language links map to the correct counterpart routes.
- Run the relevant web tests, lint, and production build before deployment.

