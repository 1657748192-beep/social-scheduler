# Global Status Label Localization Design

## Goal

When a user chooses English in Social Scheduler, every user-visible application status label must be English. Chinese remains the default for Chinese mode.

## Scope

This change covers shared frontend status labels used by the calendar, publishing detail panel, post manager, channel/account connection views, workspace members, invitations, and administrator views. Examples include connected, disconnected, scheduled, publishing, published, succeeded, retrying, failed, canceled, and terminated.

Third-party API error messages and user-authored content are out of scope. They must remain unchanged so that diagnostics remain accurate.

## Design

`apps/web/lib/labels.ts` will expose locale-aware label helpers. Each helper will accept an optional locale (`zh-CN` or `en`) and use Chinese as the default for existing callers.

Components that already use `LanguageProvider` will pass its active locale into these shared helpers. This keeps all semantic status translations in one mapping rather than duplicating status checks across pages.

Unknown status values will continue to fall back to the original raw value, preserving visibility for new backend values that do not yet have a translation.

## Validation

Automated tests will assert Chinese and English mappings for every shared status group, including schedule and publish-job statuses that currently leak Chinese into the English calendar panel. Type checking and the production build will run after implementation.
