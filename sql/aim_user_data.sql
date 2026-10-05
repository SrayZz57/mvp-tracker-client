-- Données personnalisées de l'Aim Trainer synchronisées entre appareils :
-- arènes (éditeur), presets du mode Personnalisé et playlists. Une ligne par
-- élément, le contenu en JSON. Voir src/renderer/aimSync.js (côté app/web) et
-- aimSyncPlan.js (règles de fusion, testées).
--
-- Poids attendu : ~20 Ko par joueur, 45 Ko au maximum par arène (300 blocs).
-- Les plafonds ci-dessous empêchent qu'un compte sature la base.
--
-- Rejouable sans risque (`if not exists`, `create or replace`).

create table if not exists public.aim_user_data (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('arena', 'preset', 'playlist')),
  item_id    text        not null check (char_length(item_id) between 1 and 80),
  data       jsonb       not null default '{}'::jsonb,
  -- Empreinte du contenu, calculée côté client : permet de savoir si un élément
  -- a changé sans télécharger son contenu.
  hash       text        not null default '',
  -- Suppression « douce » : une ligne supprimée reste pour que les autres
  -- appareils sachent qu'ils doivent aussi la supprimer.
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item_id),
  check (octet_length(data::text) <= 102400)
);

alter table public.aim_user_data enable row level security;

drop policy if exists aim_user_data_select_own on public.aim_user_data;
create policy aim_user_data_select_own on public.aim_user_data
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists aim_user_data_insert_own on public.aim_user_data;
create policy aim_user_data_insert_own on public.aim_user_data
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists aim_user_data_update_own on public.aim_user_data;
create policy aim_user_data_update_own on public.aim_user_data
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists aim_user_data_delete_own on public.aim_user_data;
create policy aim_user_data_delete_own on public.aim_user_data
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.aim_user_data from anon;
grant select, insert, update, delete on public.aim_user_data to authenticated;

-- Date de modification donnée par le serveur (pas par l'horloge du client) et
-- plafonds par joueur : 40 arènes, 100 presets, 30 playlists (éléments non
-- supprimés), 400 lignes au total, tombstones compris.
create or replace function public.aim_user_data_guard()
returns trigger
language plpgsql
as $$
declare
  cap     integer;
  current integer;
begin
  new.updated_at := now();

  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.deleted and not new.deleted) then
    if tg_op = 'INSERT' then
      select count(*) into current from public.aim_user_data where user_id = new.user_id;
      if current >= 400 then
        raise exception 'aim_user_data : trop de lignes pour ce compte' using errcode = 'P0001';
      end if;
    end if;

    if not new.deleted then
      cap := case new.kind when 'arena' then 40 when 'preset' then 100 else 30 end;
      select count(*) into current from public.aim_user_data
        where user_id = new.user_id and kind = new.kind and not deleted
          and item_id <> new.item_id;
      if current >= cap then
        raise exception 'aim_user_data : limite de % atteinte pour %', cap, new.kind using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists aim_user_data_guard on public.aim_user_data;
create trigger aim_user_data_guard
  before insert or update on public.aim_user_data
  for each row execute function public.aim_user_data_guard();
