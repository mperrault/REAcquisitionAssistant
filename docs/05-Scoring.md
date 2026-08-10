# Scoring Specification

## Goal

Provide a transparent 0-100 match score while preserving the distinction between:

- hard deal breakers
- weighted preferences
- neutral facts
- missing information

## Evaluation order

1. Gather property facts.
2. Evaluate hard filters.
3. Calculate category scores.
4. Apply bonuses and penalties.
5. Normalize to 0-100.
6. Generate explanation.
7. Record missing-data warnings.
8. Save score evaluation with profile version.

## Recommended categories

Initial categories:

- Location / commute
- Setting / views
- House character / style
- Renovation fit
- Financial fit
- Resale potential
- Maintenance burden
- Risk / nuisances

All category weights should be configurable.

## Hard rejection behavior

Hard-reject rules do not delete or hide the property.

A rejected property receives:

- `hard_rejected = true`
- one or more rejection reasons
- a score for informational purposes
- a prominent UI warning

The user may manually override a hard rejection.

## Drive-time rule

Initial configuration:

- Ideal: <= 30 minutes
- Preferred: <= 35 minutes
- Absolute maximum: 40 minutes

Suggested initial scoring curve:

- 0-25 min: full location points
- >25-30 min: slight reduction
- >30-35 min: moderate reduction
- >35-40 min: significant reduction
- >40 min: hard reject

Exact values must be configurable.

## Town priority

Town rank should be a preference, not necessarily a hard filter.

Suggested configuration:

- Tier 1: strong bonus
- Tier 2: moderate bonus
- Tier 3: small bonus
- unlisted but within commute max: neutral or mild penalty

## Setting preference order

Initial preference ranking:

1. Country / Mountain View
2. Open Fields / Pastoral
3. Horse Property
4. Small Farm
5. River Frontage
6. Lake View
7. Pond View (not frontage)
8. Lake Frontage
9. Pond Frontage
10. Historic New England Setting
11. Woods / Privacy

These rankings should seed editable weights.

Important product insight:

The first profile values **landscape quality and visual setting more than waterfront status by itself**.

## House style preference order

1. Cape
2. Cottage
3. Farmhouse
4. Ranch
5. Colonial
6. Contemporary
7. Log Home

House style should have less weight than setting.

## Acreage

Initial rule:

- no hard minimum
- acreage is a bonus only when it contributes meaningfully to setting, privacy, utility, resale, or flexibility
- a small lot with an exceptional view may outrank a much larger wooded parcel

## Renovation tolerance

Initial level: Moderate Remodel

Acceptable:

- paint
- flooring
- kitchen
- bathrooms
- lighting
- landscaping
- windows
- siding
- deck / porch
- minor layout changes

Generally outside target:

- foundation repair
- major structural repair
- whole-house gut
- major addition
- extensive electrical/plumbing replacement as the main project

The system should score renovation burden using expected project scope and cost.

## Initial hard deal breakers

Seed as hard-reject rules:

- busy road
- flood zone
- HOA
- steep driveway
- electric baseboard heat
- high-voltage power lines nearby
- visible cell tower
- railroad nearby
- drive time > 40 minutes

## Initially acceptable / neutral facts

Seed as neutral or low-penalty until user changes them:

- shared driveway
- oil heat
- propane
- well
- septic
- no garage
- wetlands

Wetlands should become context-sensitive later.

## Budget scoring

The application should distinguish:

- asking price
- estimated purchase price
- expected renovation
- optional acquisition/closing costs
- projected total investment

Suggested budget behavior:

- within target: full points
- modestly over target: graduated penalty
- above configured maximum: optional hard rejection

All thresholds should be profile settings.

## Resale scoring

Resale should initially be user-assessed with optional structured inputs:

- distinctive setting
- broadly appealing architecture
- normal financing / insurability
- reasonable maintenance
- functional floor plan
- marketable bedroom/bath count
- quality of surrounding properties
- nuisance exposure

Later, resale may incorporate comparable sales.

## Explainability schema

Each rule result should resemble:

```json
{
  "ruleKey": "setting.country_mountain_view",
  "label": "Country / mountain view",
  "category": "setting",
  "result": "bonus",
  "points": 18,
  "detail": "Highest-ranked setting preference"
}
```

## Score labels

Suggested defaults:

- 90-100: Exceptional
- 80-89: Strong Candidate
- 70-79: Worth Reviewing
- 60-69: Marginal
- below 60: Weak Match
- any hard rejection: Rejected by Profile

Thresholds should be configurable.
