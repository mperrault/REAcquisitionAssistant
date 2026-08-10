create type public.listing_alert_source_provider as enum (
  'gmail_label',
  'gmail_query',
  'imap_mailbox',
  'manual_test'
);

create type public.listing_candidate_status as enum (
  'new',
  'imported',
  'ignored'
);

create type public.listing_alert_run_status as enum (
  'completed',
  'failed'
);

create table public.listing_alert_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.listing_alert_source_provider not null default 'gmail_label',
  name text not null,
  enabled boolean not null default true,
  mailbox_label text not null default '',
  search_query text not null default '',
  polling_minutes integer not null default 30 check (polling_minutes > 0),
  provider_config jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listing_alert_sources_user_enabled_idx
  on public.listing_alert_sources(user_id, enabled);

create table public.listing_alert_messages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.listing_alert_sources(id) on delete cascade,
  external_message_id text not null,
  subject text not null default '',
  from_address text not null default '',
  received_at timestamptz not null,
  body_text text not null default '',
  body_html text not null default '',
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, external_message_id)
);

create index listing_alert_messages_source_received_idx
  on public.listing_alert_messages(source_id, received_at desc);

create table public.listing_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.listing_alert_sources(id) on delete cascade,
  message_id uuid not null references public.listing_alert_messages(id) on delete cascade,
  external_message_id text not null default '',
  status public.listing_candidate_status not null default 'new',
  imported_property_id uuid references public.properties(id) on delete set null,
  dedupe_key text not null,
  listing_url text not null default '',
  mls_id text not null default '',
  address_line1 text not null default '',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  asking_price numeric(12, 2),
  bedrooms numeric(4, 1),
  bathrooms numeric(4, 1),
  living_sqft integer,
  lot_acres numeric(10, 3),
  year_built integer,
  listing_remarks text not null default '',
  raw_text text not null default '',
  extracted_facts_json jsonb not null default '[]'::jsonb,
  confidence numeric(3, 2) not null default 0 check (confidence >= 0 and confidence <= 1),
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, dedupe_key)
);

create index listing_candidates_source_status_updated_idx
  on public.listing_candidates(source_id, status, updated_at desc);

create index listing_candidates_imported_property_idx
  on public.listing_candidates(imported_property_id);

create table public.listing_alert_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.listing_alert_sources(id) on delete cascade,
  status public.listing_alert_run_status not null default 'completed',
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  messages_seen integer not null default 0 check (messages_seen >= 0),
  candidates_created integer not null default 0 check (candidates_created >= 0),
  candidates_updated integer not null default 0 check (candidates_updated >= 0),
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index listing_alert_runs_source_started_idx
  on public.listing_alert_runs(source_id, started_at desc);

create trigger listing_alert_sources_updated_at
  before update on public.listing_alert_sources
  for each row execute function public.set_updated_at();

create trigger listing_candidates_updated_at
  before update on public.listing_candidates
  for each row execute function public.set_updated_at();

alter table public.listing_alert_sources enable row level security;
alter table public.listing_alert_messages enable row level security;
alter table public.listing_candidates enable row level security;
alter table public.listing_alert_runs enable row level security;

create policy "Users can manage their own listing alert sources"
  on public.listing_alert_sources
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage messages through owned listing alert sources"
  on public.listing_alert_messages
  for all
  using (
    exists (
      select 1
      from public.listing_alert_sources s
      where s.id = listing_alert_messages.source_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.listing_alert_sources s
      where s.id = listing_alert_messages.source_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can manage candidates through owned listing alert sources"
  on public.listing_candidates
  for all
  using (
    exists (
      select 1
      from public.listing_alert_sources s
      where s.id = listing_candidates.source_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.listing_alert_sources s
      where s.id = listing_candidates.source_id
        and s.user_id = auth.uid()
    )
    and (
      imported_property_id is null
      or exists (
        select 1
        from public.properties p
        where p.id = listing_candidates.imported_property_id
          and p.user_id = auth.uid()
      )
    )
  );

create policy "Users can read runs through owned listing alert sources"
  on public.listing_alert_runs
  for select
  using (
    exists (
      select 1
      from public.listing_alert_sources s
      where s.id = listing_alert_runs.source_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can create runs through owned listing alert sources"
  on public.listing_alert_runs
  for insert
  with check (
    exists (
      select 1
      from public.listing_alert_sources s
      where s.id = listing_alert_runs.source_id
        and s.user_id = auth.uid()
    )
  );

