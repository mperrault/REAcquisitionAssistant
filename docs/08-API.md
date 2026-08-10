# API / Integration Plan

The MVP can primarily use Next.js server actions or route handlers backed by Supabase. This document defines logical integration boundaries rather than requiring a REST architecture.

## Property operations

- create property
- update property
- list/filter properties
- fetch property detail
- archive/delete property

## Listing-alert ingestion operations

- create/update/list listing-alert sources
- configure provider connection metadata without storing mailbox passwords
- run enabled source ingestion
- persist alert message metadata and raw text
- parse alert messages into listing candidates
- deduplicate listing candidates by URL, MLS ID, and normalized address
- import a listing candidate as an editable property draft
- ignore or archive a listing candidate

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
- email/listing alert ingestion
- browser-assisted user import

The no-MLS MVP should ingest saved-search listing-alert emails from configured user-controlled sources. Parser test input may accept user-provided text, but the product workflow should not require manual copy/paste. If parsing is uncertain, preserve raw alert text, create inspectable candidates, and mark extracted facts as unverified.

For IMAP sources, persist host, port, security mode, username, mailbox folder, and the server-side password secret name. Do not persist the password itself in the browser or database.
