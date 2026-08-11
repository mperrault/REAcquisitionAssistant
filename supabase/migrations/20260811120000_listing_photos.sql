alter table public.properties
  add column primary_photo_url text not null default '',
  add column photo_urls jsonb not null default '[]'::jsonb;

alter table public.listing_candidates
  add column primary_photo_url text not null default '',
  add column photo_urls jsonb not null default '[]'::jsonb;
