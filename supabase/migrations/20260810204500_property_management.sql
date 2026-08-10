create type public.lifecycle_status as enum (
  'new',
  'reviewing',
  'watch_list',
  'worth_visiting',
  'visit_scheduled',
  'visited',
  'interested',
  'offer_candidate',
  'offer_submitted',
  'under_contract',
  'purchased',
  'rejected',
  'sold_unavailable'
);

create type public.listing_status as enum (
  'unknown',
  'active',
  'pending',
  'under_contract',
  'sold',
  'off_market'
);

create type public.property_fact_source_type as enum (
  'user_entered',
  'listing',
  'gis',
  'api',
  'ai_inferred',
  'verified'
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address_line1 text not null default '',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  listing_url text not null default '',
  mls_id text not null default '',
  asking_price numeric(12, 2),
  estimated_purchase_price numeric(12, 2),
  listing_status public.listing_status not null default 'unknown',
  lifecycle_status public.lifecycle_status not null default 'new',
  bedrooms numeric(4, 1),
  bathrooms numeric(4, 1),
  living_sqft integer,
  lot_acres numeric(10, 3),
  year_built integer,
  annual_property_tax numeric(12, 2),
  hoa_present boolean,
  hoa_fee numeric(12, 2),
  house_style text not null default '',
  garage_spaces integer,
  heating_type text not null default '',
  water_source text not null default '',
  sewer_type text not null default '',
  listing_remarks text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_user_lifecycle_status_idx
  on public.properties(user_id, lifecycle_status);

create index properties_user_created_at_idx
  on public.properties(user_id, created_at desc);

create table public.property_facts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  fact_key text not null,
  label text not null default '',
  value_json jsonb,
  source_type public.property_fact_source_type not null default 'user_entered',
  source_reference text not null default '',
  confidence numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  verified boolean not null default false,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index property_facts_property_id_idx
  on public.property_facts(property_id);

create index property_facts_fact_key_idx
  on public.property_facts(fact_key);

create trigger properties_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

create trigger property_facts_updated_at
  before update on public.property_facts
  for each row execute function public.set_updated_at();

alter table public.properties enable row level security;
alter table public.property_facts enable row level security;

create policy "Users can manage their own properties"
  on public.properties
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage facts through owned properties"
  on public.property_facts
  for all
  using (
    exists (
      select 1
      from public.properties p
      where p.id = property_facts.property_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.properties p
      where p.id = property_facts.property_id
        and p.user_id = auth.uid()
    )
  );
