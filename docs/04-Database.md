# Database Model

This is a logical model. Exact SQL may evolve during implementation.

## users

Supabase Auth owns identity. Application profile may include:

- id
- display_name
- created_at
- updated_at

## search_profiles

- id
- user_id
- name
- description
- is_active
- is_archived
- version
- purchase_price_target
- purchase_price_max
- renovation_budget_target
- renovation_budget_max
- total_project_budget_target
- total_project_budget_max
- commute_anchor_label
- commute_anchor_lat
- commute_anchor_lng
- commute_ideal_minutes
- commute_preferred_minutes
- commute_max_minutes
- acreage_min
- acreage_is_hard_min
- renovation_tolerance
- created_at
- updated_at

## profile_town_preferences

- id
- profile_id
- town
- state
- rank
- tier
- weight
- enabled

## profile_feature_preferences

Generic feature preference configuration.

- id
- profile_id
- feature_key
- feature_label
- category
- rank
- weight
- mode (`bonus`, `penalty`, `hard_reject`, `neutral`)
- enabled

Examples:

- `setting.country_mountain_view`
- `setting.open_fields_pastoral`
- `style.cape`
- `risk.busy_road`
- `risk.flood_zone`

## properties

- id
- user_id
- address_line1
- city
- state
- postal_code
- latitude
- longitude
- listing_url
- mls_id
- asking_price
- estimated_purchase_price
- listing_status
- lifecycle_status
- bedrooms
- bathrooms
- living_sqft
- lot_acres
- year_built
- annual_property_tax
- hoa_present
- hoa_fee
- house_style
- garage_spaces
- heating_type
- water_source
- sewer_type
- listing_remarks
- created_at
- updated_at

## property_facts

Flexible facts not suitable for core columns.

- id
- property_id
- fact_key
- value_json
- source_type
- source_reference
- confidence
- verified
- observed_at

Examples:

- `setting.country_mountain_view = true`
- `road.busy = true`
- `driveway.steep = false`
- `utility.high_voltage_lines_visible = false`

## renovation_estimates

- id
- property_id
- estimate_name
- contingency_percent
- notes
- created_at
- updated_at

## renovation_line_items

- id
- renovation_estimate_id
- category
- description
- low_estimate
- expected_estimate
- high_estimate

## visits

- id
- property_id
- visited_at
- overall_impression
- user_rating
- setting_rating
- condition_rating
- resale_rating
- notes

## property_decisions

- id
- property_id
- decision_type
- decision_at
- notes

Examples:
- watch
- visit
- reject
- offer
- purchase

## rejection_reasons

- id
- property_id
- reason_key
- reason_label
- notes
- created_at

## score_evaluations

- id
- property_id
- profile_id
- profile_version
- scoring_engine_version
- raw_score
- normalized_score
- hard_rejected
- explanation_json
- created_at

## attachments

- id
- property_id
- storage_path
- attachment_type
- filename
- description
- source_url
- created_at

## comparison_sets

- id
- user_id
- name
- created_at

## comparison_set_properties

- comparison_set_id
- property_id
- sort_order

## Future tables

- external_data_snapshots
- offers
- inspections
- due_diligence_items
- financing_scenarios
- comparable_sales
- ai_analyses
- map_layers
- profile_learning_events

## Key design choice

Property facts and scoring preferences must remain separate.

A property can be objectively recorded as:

`house_style = Cape`

Profile A might assign +10.
Profile B might assign 0.
Profile C might penalize it.

That separation is fundamental.
