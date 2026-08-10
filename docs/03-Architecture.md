# Architecture

## Recommended stack

### Frontend

- Next.js with App Router
- TypeScript
- React Server Components where appropriate
- Tailwind CSS
- shadcn/ui

### Backend / data

- Supabase
  - PostgreSQL
  - Authentication
  - Storage
  - Row-Level Security
  - optional Edge Functions

### Mapping

MVP:
- Leaflet + OpenStreetMap, or Mapbox if richer map UX is desired

Later:
- routing / drive-time API
- elevation and GIS layers
- parcel and wetlands data sources

### Deployment

- Vercel for the web app
- Supabase Cloud for database/auth/storage

## Architectural principles

### 1. Configuration-driven scoring

The scoring engine must not contain user-specific constants.

Bad:

```ts
if (property.houseStyle === "Cape") score += 10;
```

Good:

```ts
const preference = profile.houseStylePreferences.find(
  (p) => p.value === property.houseStyle
);
score += preference?.weight ?? 0;
```

### 2. Versioned score evaluations

Scores should be stored as evaluations, not as a single mutable `score` field on the property.

Each score evaluation should identify:

- property
- profile
- profile version
- scoring engine version
- score
- hard-filter result
- explanation payload
- evaluated_at

This allows historical comparisons when preferences change.

### 3. Property fact provenance

Important facts should support provenance:

- user-entered
- listing
- GIS
- API
- AI-inferred
- verified

This becomes increasingly valuable as external data sources are added.

### 4. Service boundaries

Suggested application services:

- `profile-service`
- `property-service`
- `listing-alert-ingestion-service`
- `scoring-service`
- `renovation-service`
- `comparison-service`
- `mapping-service`
- `reporting-service`
- `ai-analysis-service` (later)

### 5. No scraping dependency

Listing URLs may be stored. The app should not require unauthorized scraping to function.

Property intake should be designed as a permitted-ingestion pipeline with listing-alert email ingestion as the no-MLS MVP path:

- configured Gmail label/query or IMAP mailbox
- ingestion runs that fetch only new alert messages
- raw message preservation for audit/debugging
- listing-candidate extraction and deduplication
- candidate-to-property draft creation
- manual parser test input for development and fallback only
- licensed feed or provider API later

Every imported fact should preserve source/provenance and verification state.

## Suggested project structure

```text
app/
  (auth)/
  dashboard/
  properties/
  compare/
  profiles/
  settings/
  api/

components/
  dashboard/
  properties/
  profiles/
  scoring/
  finance/
  map/
  ui/

lib/
  db/
  scoring/
  validation/
  finance/
  mapping/
  ai/

types/

supabase/
  migrations/
  seed.sql

docs/
```

## Scoring engine design

The scoring engine should be a pure function where practical:

```ts
evaluateProperty(propertyFacts, profileConfig) => ScoreEvaluation
```

Suggested result:

```ts
type ScoreEvaluation = {
  rawScore: number;
  normalizedScore: number;
  hardRejected: boolean;
  hardRejectReasons: RuleResult[];
  positiveFactors: RuleResult[];
  penalties: RuleResult[];
  missingData: string[];
  categoryScores: Record<string, number>;
};
```

This makes scoring easy to test.

## Security

For initial single-user deployment:

- Supabase Auth
- all user-owned rows contain `user_id`
- Row-Level Security ensures users see only their own records
- secrets never exposed in client-side code

## Testing

Minimum tests:

- scoring unit tests
- hard-filter tests
- normalization tests
- profile duplication tests
- renovation-total calculations
- property comparison calculations

Later:
- Playwright end-to-end tests
- API integration tests

## Data import/export

MVP should support CSV export of property records and profile settings.

Later:
- CSV import
- listing-alert email ingestion connectors
- user-assisted listing text import as fallback
- JSON backup/restore
- document attachments
