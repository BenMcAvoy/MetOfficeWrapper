# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: —

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

<!-- Project-specific conventions discovered during development. -->

[2026-05-20] Trophy race categorization: all trophy events in this club's calendar have the literal word "trophy" in their name. The `getEventCategory` trophy rule should be just `/trophy/i` — do not add `cup|regatta|championship|nationals|teapot|paint` etc; those names belong in other buckets (e.g. cruiser, dinghy default).

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

[2026-05-20] Do NOT add horizontal swipe-between-tabs gestures on the main content area. User found it frustrating — likely conflicts with horizontal scrollers (date strip, forecast strip) and chart pan. Bottom-nav taps are the only intended tab-switch path. Edge-swipe-back inside a drilled-in view (like event detail) is fine.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
