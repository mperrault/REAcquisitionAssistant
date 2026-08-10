# Roadmap

## Milestone 0 — Foundation

Goal: establish repo and development conventions.

- Next.js + TypeScript
- Tailwind
- shadcn/ui
- Supabase project
- environment configuration
- linting/formatting
- initial database migrations
- basic CI
- README and docs

## Milestone 1 — Search Profiles

Goal: make user preferences configurable.

Deliver:

- create/edit/archive profile
- town ranking/tiering
- commute thresholds
- budget settings
- setting preference ranking
- style preference ranking
- renovation tolerance
- hard deal breakers
- category weights
- set active profile

Acceptance:

No initial user preference is hardcoded in scoring code.

## Milestone 2 — Property Management

Deliver:

- property list
- create/edit property
- incomplete records allowed
- lifecycle status
- listing URL
- core facts
- property facts/features
- notes

## Milestone 3 — Scoring Engine

Deliver:

- profile-driven scoring
- hard-reject evaluation
- normalized 0-100 score
- category scores
- explainability
- missing-data warnings
- stored score evaluations
- scoring unit tests

## Milestone 4 — Dashboard + Compare

Deliver:

- top candidates
- recent properties
- watch list
- worth visiting
- rejected-by-profile
- sortable/filterable property list
- 2-4 property comparison

## Milestone 5 — Renovation + Total Investment

Deliver:

- renovation estimates
- line items
- low/expected/high
- contingency
- projected total investment
- financial-fit scoring

## Milestone 6 — Visit Workflow

Deliver:

- showing notes
- ratings
- rejection reasons
- decision history
- mobile-friendly visit screen

## Milestone 7 — Map

Deliver:

- property pins
- status/score filters
- property preview from map

Later:
- drive-time isochrone
- GIS overlays
- elevation
- water
- wetlands
- conservation

## Milestone 8 — AI Assistance

Deliver selectively:

- listing summary
- score narrative
- note summarization
- preference pattern detection

Requirements:

- AI facts marked as inferred
- user can verify/reject suggestions
- core app functions without AI

## Milestone 9 — Analytics / Reporting

Potential:

- rejection-pattern analytics
- preference drift
- top setting types
- visited vs rejected
- renovation budget accuracy
- PDF/printable candidate report
- acquisition history

## Milestone 10 — External Data

Only after core workflow proves useful.

Potential:
- geocoding
- drive-time API
- parcel GIS
- flood
- wetlands
- tax data
- legitimate real-estate data API
