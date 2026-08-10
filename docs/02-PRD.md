# Product Requirements Document

## 1. Product overview

RE Acquisition Assistant is a web application for evaluating residential real-estate acquisition opportunities using configurable search profiles, property facts, scoring rules, renovation estimates, due-diligence data, and user decisions.

The MVP is designed for one user but should not block future multi-user support.

## 2. Core entities

The system must support:

- users
- acquisition/search profiles
- geographic preferences
- scoring categories and weights
- hard deal breakers
- properties
- listing-alert ingestion sources
- listing-alert ingestion runs
- listing-alert candidate records
- property facts/features
- financial assumptions
- renovation estimates
- visit notes
- rejection reasons
- property statuses
- score results
- score explanations
- attachments/photos
- comparison sets

## 3. Primary workflows

### 3.1 Create/edit a search profile

The user can create a profile and configure:

- profile name
- description
- active/inactive state
- target geography
- town rankings
- commute anchor
- drive-time thresholds
- purchase-price target and maximum
- renovation budget
- total-project budget
- minimum or preferred acreage
- preferred settings
- preferred house styles
- renovation tolerance
- deal breakers
- weighted penalties
- category weights
- score thresholds

All settings must be editable without code changes.

### 3.2 Add or ingest properties

The MVP must support manual property creation, but the primary time-saving workflow is automated listing-alert ingestion. The user should not need to retype listings found through saved searches.

The user can manually create a property record with:

- address
- listing URL
- asking price
- property status
- town/state
- latitude/longitude
- bedrooms/bathrooms
- living area
- lot size
- year built
- taxes
- HOA data
- garage
- heating type
- septic/well/public utilities
- flood-zone indicator
- road classification / perceived road busyness
- driveway characteristics
- property-setting features
- house style
- renovation condition
- notes
- listing remarks
- photos or attachments

The system must allow incomplete records.

The user must be able to configure one or more permitted listing-alert sources. Because the MVP does not assume MLS/IDX credentials, the first automated source is saved-search email alerts sent to a mailbox or label controlled by the user.

Supported MVP ingestion source types:

- Gmail label or query containing listing-alert emails
- IMAP mailbox containing listing-alert emails
- manual parser test input for development and fallback only

An ingestion run should:

- fetch new alert messages from enabled sources
- preserve message subject, sender, received timestamp, and raw body text
- extract one or more listing candidates from each message
- deduplicate candidates by listing URL, MLS ID when available, and normalized address
- create editable property drafts from candidates on import
- mark extracted facts as sourced from `listing` and unverified

The parser should extract likely fields when present:

- address or location
- listing URL
- asking price
- town/state
- bedrooms/bathrooms
- living area
- lot size
- year built
- taxes/HOA if present
- house style if present
- listing remarks
- setting/risk feature hints

Ingested records must remain editable before and after saving. Any extracted or inferred facts must be marked with source/provenance and should not be treated as verified unless the user verifies them.

Ingestion failure should not block the queue. The app should preserve the raw alert text, show warnings, and allow the user to inspect or ignore the candidate.

The app must not perform unauthorized scraping of listing sites. Automatic ingestion must use email alerts supplied by the user, licensed feeds, authorized APIs, or other permitted data sources.

### 3.3 Score a property

The system calculates a score using the selected search profile.

The score must include:

- raw score
- normalized score (0-100)
- hard-filter result
- positive contributors
- penalties
- missing-data warnings
- score timestamp
- profile/version used

A property failing a hard deal breaker should not disappear. It should be visibly marked as `Rejected by profile` so the user can inspect and override it.

### 3.4 Explain a score

The detail page must show a human-readable explanation such as:

- +18 Country/mountain view
- +12 Cape-style preference
- +8 22-minute commute
- -5 No garage
- -7 Estimated renovation cost above target
- REJECT: Flood zone

### 3.5 Compare properties

The user can select 2-4 properties and compare:

- overall score
- setting score
- commute
- asking price
- estimated purchase price
- renovation estimate
- projected total investment
- estimated resale / post-renovation value
- taxes
- acreage
- style
- maintenance risk
- deal-breaker status
- visit notes
- user rating

### 3.6 Track property lifecycle

Supported default statuses:

- New
- Reviewing
- Watch List
- Worth Visiting
- Visit Scheduled
- Visited
- Interested
- Offer Candidate
- Offer Submitted
- Under Contract
- Purchased
- Rejected
- Sold / Unavailable

Statuses should be configurable later.

### 3.7 Record rejection reasons

When rejecting a property, the user can select one or more reasons and add free-text notes.

Default reason examples:

- busy road
- poor setting
- flood zone
- HOA
- steep driveway
- electric baseboard heat
- power lines
- visible cell tower
- railroad
- excessive renovation
- poor resale
- too far away
- too expensive
- maintenance burden
- other

### 3.8 Renovation analysis

The MVP should allow a renovation estimate with line items:

- kitchen
- bathroom
- flooring
- paint
- lighting
- windows
- siding
- deck/porch
- landscaping
- minor layout
- contingency
- other

The system should calculate:

`projected_total_investment = estimated_purchase_price + renovation_estimate + optional_acquisition_costs`

### 3.9 Dashboard

The dashboard should surface:

- top-ranked active properties
- recently added
- worth visiting
- watch list
- properties rejected by hard filter
- best setting
- best value
- lowest projected total investment
- highest estimated resale margin
- recent decisions

Primary dashboard question:

> If the user has one free Saturday, which properties should be visited?

## 4. Configurable scoring requirements

The application must distinguish:

### Hard filters

Binary rules that can reject a property.

Examples from initial profile:

- busy road
- flood zone
- HOA
- steep driveway
- electric baseboard heat
- high-voltage power lines nearby
- visible cell tower
- railroad nearby
- maximum drive time

### Weighted preferences

Rules that add or subtract points.

Examples:

- setting type
- house style
- town priority
- commute time
- renovation burden
- resale potential
- acreage
- maintenance burden
- water features

### Neutral facts

Facts that may be stored without affecting the score until configured.

Examples:

- well
- septic
- oil heat
- propane
- no garage
- shared driveway
- wetlands

## 5. Profile management

The application must eventually support multiple saved profiles.

For MVP:

- create profile
- edit profile
- duplicate profile
- set active profile
- archive profile

Changing the active profile should immediately allow properties to be rescored.

## 6. Mapping

MVP map:

- property pins
- filtering by status / score
- clicking a pin opens property summary

Later mapping features:

- drive-time isochrones
- elevation
- wetlands
- conservation land
- water bodies
- flood zones
- trails
- parcel boundaries
- viewshed analysis

## 7. AI-assisted features

AI features are optional and must not be required for core scoring.

Potential uses:

- summarize listing remarks
- identify likely view/setting language
- classify house condition from notes/photos
- produce score explanations
- summarize visit notes
- suggest renovation priorities
- detect preference patterns
- generate property reports

AI-generated facts should be distinguishable from verified facts.

## 8. Non-functional requirements

- Responsive for desktop, tablet, and phone
- Fast enough for a few thousand properties
- Accessible UI
- Secure authentication
- Database migrations committed to source control
- Sensitive configuration stored in environment variables
- Exportable user data
- No critical dependence on Zillow scraping
- External data ingestion should use legitimate APIs or user-entered data

## 9. Out of scope for MVP

- Automated scraping of Zillow/Realtor.com
- Automated offer submission
- Mortgage underwriting
- Full appraisal engine
- MLS licensing/integration
- Automated title search
- Commercial property analysis
- Multi-tenant billing

## 10. MVP acceptance criteria

MVP is complete when the user can:

1. Create and edit a profile.
2. Configure rankings, weights, thresholds, and hard deal breakers.
3. Add an incomplete or complete property.
4. Score the property.
5. See exactly why it received that score.
6. Compare multiple properties.
7. Estimate renovation and total project cost.
8. Record visit notes and rejection reasons.
9. Filter and sort properties from a dashboard.
10. Change the profile and re-score existing properties.
