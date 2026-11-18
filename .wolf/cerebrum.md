# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

<!-- Project-specific conventions discovered during development. -->

[2026-05-20] Trophy race categorization: all trophy events in this club's calendar have the literal word "trophy" in their name. The `getEventCategory` trophy rule should be just `/trophy/i` - do not add `cup|regatta|championship|nationals|teapot|paint` etc; those names belong in other buckets (e.g. cruiser, dinghy default).

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

[2026-05-20] Do NOT add horizontal swipe-between-tabs gestures on the main content area. User found it frustrating - likely conflicts with horizontal scrollers (date strip, forecast strip) and chart pan. Bottom-nav taps are the only intended tab-switch path. Edge-swipe-back inside a drilled-in view (like event detail) is fine.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

[2026-05-21] Tide flow data: chose Open-Meteo Marine API (`/api/marine` proxy) for ocean current velocity/direction + sea_level_height_msl because it is free, keyless, returns hourly grids, and complements the existing UKHO Admiralty HW/LW + interpolated heights. `ocean_current_velocity` is in km/h - convert with KMH_TO_KNOTS=0.539957 for display. Open-Meteo currents may return null in sheltered inland water (Poole Harbour); UI degrades to ` - ` and the flow card hides when no marine data is available.
