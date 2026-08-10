# API / Integration Plan

The MVP can primarily use Next.js server actions or route handlers backed by Supabase. This document defines logical integration boundaries rather than requiring a REST architecture.

## Property operations

- create property
- update property
- list/filter properties
- fetch property detail
- archive/delete property

## Profile operations

- create profile
- update profile
- duplicate profile
- archive profile
- set active profile
- fetch profile configuration

## Scoring operations

- evaluate one property against one profile
- re-score all properties for a profile
- fetch score explanation
- fetch score history

## Renovation operations

- create estimate
- add/edit/remove line item
- calculate low/expected/high totals

## Comparison operations

- create comparison set
- add/remove properties
- fetch comparison data

## Mapping integrations

MVP:
- geocode address if coordinates not provided
- show pins

Later:
- route time
- drive-time polygons
- GIS overlays

## AI integration

Use server-side OpenAI calls only.

Candidate tasks:

- summarize listing remarks
- classify likely setting features from text
- summarize visit notes
- generate concise score explanation
- identify contradictions or missing due-diligence facts

Do not automatically promote AI inference into verified property facts.

## External listing links

Store listing URLs as references.

Do not build the product around unauthorized scraping.

Future options may include:

- MLS feed if licensed
- real-estate data provider APIs
- browser-assisted user import
- email/listing alert ingestion
