create extension if not exists "pgcrypto";

create type public.profile_preference_mode as enum (
  'bonus',
  'penalty',
  'hard_reject',
  'neutral'
);

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.search_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  is_active boolean not null default false,
  is_archived boolean not null default false,
  version integer not null default 1 check (version > 0),
  purchase_price_target numeric(12, 2),
  purchase_price_max numeric(12, 2),
  renovation_budget_target numeric(12, 2),
  renovation_budget_max numeric(12, 2),
  total_project_budget_target numeric(12, 2),
  total_project_budget_max numeric(12, 2),
  commute_anchor_label text,
  commute_anchor_lat numeric(10, 7),
  commute_anchor_lng numeric(10, 7),
  commute_ideal_minutes integer check (commute_ideal_minutes is null or commute_ideal_minutes >= 0),
  commute_preferred_minutes integer check (commute_preferred_minutes is null or commute_preferred_minutes >= 0),
  commute_max_minutes integer check (commute_max_minutes is null or commute_max_minutes >= 0),
  acreage_min numeric(8, 2),
  acreage_is_hard_min boolean not null default false,
  renovation_tolerance text not null default 'moderate_remodel',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index search_profiles_one_active_per_user_idx
  on public.search_profiles(user_id)
  where is_active and not is_archived;

create table public.profile_town_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.search_profiles(id) on delete cascade,
  town text not null,
  state text not null,
  rank integer not null check (rank > 0),
  tier integer not null check (tier > 0),
  weight integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, town, state)
);

create table public.profile_feature_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.search_profiles(id) on delete cascade,
  feature_key text not null,
  feature_label text not null,
  category text not null,
  rank integer,
  weight integer not null default 0,
  mode public.profile_preference_mode not null default 'neutral',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, feature_key)
);

create table public.profile_category_weights (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.search_profiles(id) on delete cascade,
  category_key text not null,
  category_label text not null,
  weight integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, category_key)
);

create table public.profile_score_thresholds (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.search_profiles(id) on delete cascade,
  label text not null,
  minimum_score integer not null check (minimum_score >= 0 and minimum_score <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, label)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_profile_updated_at_and_version()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if (to_jsonb(new) - 'updated_at' - 'version') is distinct from
     (to_jsonb(old) - 'updated_at' - 'version') then
    new.version = old.version + 1;
  end if;

  return new;
end;
$$;

create or replace function public.touch_parent_search_profile()
returns trigger
language plpgsql
as $$
declare
  target_profile_id uuid;
begin
  target_profile_id = coalesce(new.profile_id, old.profile_id);

  update public.search_profiles
  set updated_at = now(),
      version = version + 1
  where id = target_profile_id;

  if TG_OP = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

create trigger search_profiles_updated_at_and_version
  before update on public.search_profiles
  for each row execute function public.set_profile_updated_at_and_version();

create trigger profile_town_preferences_updated_at
  before update on public.profile_town_preferences
  for each row execute function public.set_updated_at();

create trigger profile_feature_preferences_updated_at
  before update on public.profile_feature_preferences
  for each row execute function public.set_updated_at();

create trigger profile_category_weights_updated_at
  before update on public.profile_category_weights
  for each row execute function public.set_updated_at();

create trigger profile_score_thresholds_updated_at
  before update on public.profile_score_thresholds
  for each row execute function public.set_updated_at();

create trigger profile_town_preferences_touch_profile
  after insert or update or delete on public.profile_town_preferences
  for each row execute function public.touch_parent_search_profile();

create trigger profile_feature_preferences_touch_profile
  after insert or update or delete on public.profile_feature_preferences
  for each row execute function public.touch_parent_search_profile();

create trigger profile_category_weights_touch_profile
  after insert or update or delete on public.profile_category_weights
  for each row execute function public.touch_parent_search_profile();

create trigger profile_score_thresholds_touch_profile
  after insert or update or delete on public.profile_score_thresholds
  for each row execute function public.touch_parent_search_profile();

alter table public.user_profiles enable row level security;
alter table public.search_profiles enable row level security;
alter table public.profile_town_preferences enable row level security;
alter table public.profile_feature_preferences enable row level security;
alter table public.profile_category_weights enable row level security;
alter table public.profile_score_thresholds enable row level security;

create policy "Users can manage their own profile"
  on public.user_profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Users can manage their own search profiles"
  on public.search_profiles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can manage town preferences through owned profiles"
  on public.profile_town_preferences
  for all
  using (
    exists (
      select 1
      from public.search_profiles sp
      where sp.id = profile_town_preferences.profile_id
        and sp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.search_profiles sp
      where sp.id = profile_town_preferences.profile_id
        and sp.user_id = auth.uid()
    )
  );

create policy "Users can manage feature preferences through owned profiles"
  on public.profile_feature_preferences
  for all
  using (
    exists (
      select 1
      from public.search_profiles sp
      where sp.id = profile_feature_preferences.profile_id
        and sp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.search_profiles sp
      where sp.id = profile_feature_preferences.profile_id
        and sp.user_id = auth.uid()
    )
  );

create policy "Users can manage category weights through owned profiles"
  on public.profile_category_weights
  for all
  using (
    exists (
      select 1
      from public.search_profiles sp
      where sp.id = profile_category_weights.profile_id
        and sp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.search_profiles sp
      where sp.id = profile_category_weights.profile_id
        and sp.user_id = auth.uid()
    )
  );

create policy "Users can manage score thresholds through owned profiles"
  on public.profile_score_thresholds
  for all
  using (
    exists (
      select 1
      from public.search_profiles sp
      where sp.id = profile_score_thresholds.profile_id
        and sp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.search_profiles sp
      where sp.id = profile_score_thresholds.profile_id
        and sp.user_id = auth.uid()
    )
  );
