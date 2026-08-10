# Codex — Start Here

## Objective

Build the first usable version of RE Acquisition Assistant from the documentation in this repository.

Before writing code, read:

1. `README.md`
2. `docs/01-Vision.md`
3. `docs/02-PRD.md`
4. `docs/03-Architecture.md`
5. `docs/04-Database.md`
6. `docs/05-Scoring.md`
7. `docs/06-UX.md`
8. `docs/07-Roadmap.md`
9. `docs/09-Initial-Search-Profile.md`

## Non-negotiable design constraints

1. User acquisition preferences must not be hardcoded.
2. Property facts must be stored separately from profile preferences.
3. Hard deal breakers must be distinct from weighted scoring rules.
4. Score evaluations must be explainable.
5. Score evaluations should be versionable/historical.
6. The app must work without AI.
7. The initial Quiet Corner profile is seed data, not product logic.
8. Do not implement unauthorized scraping of listing sites.

## Recommended first task

Implement Milestone 0 and Milestone 1 from `docs/07-Roadmap.md`.

Specifically:

- initialize a Next.js TypeScript application
- configure Tailwind and shadcn/ui
- define Supabase schema/migrations for users and search profiles
- implement Search Profiles UI
- seed the initial Quiet Corner profile
- allow every seeded preference to be edited
- add tests for profile configuration persistence

Do not build the scoring engine until the profile model is stable.

## Coding style

- TypeScript strict mode
- small, testable domain functions
- avoid business logic inside React components
- use schema validation at data boundaries
- add migrations rather than editing production schema manually
- keep secrets in environment variables
- document major architectural decisions

## Completion report

After each milestone, report:

- files changed
- migrations added
- tests added/run
- assumptions made
- open questions
- next recommended milestone
