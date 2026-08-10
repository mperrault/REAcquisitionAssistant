create table public.score_evaluations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  profile_id uuid not null references public.search_profiles(id) on delete cascade,
  profile_version integer not null check (profile_version > 0),
  scoring_engine_version text not null,
  raw_score numeric(8, 2) not null,
  normalized_score integer not null check (normalized_score >= 0 and normalized_score <= 100),
  score_label text not null,
  hard_rejected boolean not null default false,
  explanation_json jsonb not null,
  hard_reject_reasons jsonb not null default '[]'::jsonb,
  positive_factors jsonb not null default '[]'::jsonb,
  penalties jsonb not null default '[]'::jsonb,
  missing_data jsonb not null default '[]'::jsonb,
  category_scores jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index score_evaluations_property_profile_created_idx
  on public.score_evaluations(property_id, profile_id, created_at desc);

create index score_evaluations_profile_version_idx
  on public.score_evaluations(profile_id, profile_version);

alter table public.score_evaluations enable row level security;

create policy "Users can read score evaluations through owned properties and profiles"
  on public.score_evaluations
  for select
  using (
    exists (
      select 1
      from public.properties p
      where p.id = score_evaluations.property_id
        and p.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.search_profiles sp
      where sp.id = score_evaluations.profile_id
        and sp.user_id = auth.uid()
    )
  );

create policy "Users can create score evaluations through owned properties and profiles"
  on public.score_evaluations
  for insert
  with check (
    exists (
      select 1
      from public.properties p
      where p.id = score_evaluations.property_id
        and p.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.search_profiles sp
      where sp.id = score_evaluations.profile_id
        and sp.user_id = auth.uid()
    )
  );
