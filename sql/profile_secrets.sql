-- Clé API HenrikDev personnelle : sortie de `profiles` vers une table PRIVÉE.
--
-- Pourquoi : la règle « Authenticated users can view all profiles » (using true)
-- laisse tout joueur connecté lire TOUTES les colonnes de TOUS les profils, donc
-- aussi `henrikdev_api_key` des autres (constaté le 2026-10-05). Les classements
-- ont besoin de lire les profils des autres (pseudo, avatar...), pas leur clé.
--
-- Ce que fait ce script, dans l'ordre :
--   1. crée `profile_secrets` : une ligne par joueur, lisible/modifiable par lui seul ;
--   2. y copie toutes les clés déjà présentes dans `profiles` ;
--   3. vide la colonne `profiles.henrikdev_api_key` pour tout le monde ;
--   4. pose un déclencheur sur `profiles` : toute écriture de la clé (y compris par
--      les ANCIENNES versions de l'app, qui écrivent encore dans `profiles`) est
--      rangée dans `profile_secrets`, et la colonne reste vide.
--
-- Les anciennes versions continuent de fonctionner (elles enregistrent toujours
-- leur clé) ; seule différence pour elles : sur un appareil neuf, la clé n'est plus
-- reprise automatiquement depuis le compte, l'app la redemande. Les nouvelles
-- versions (app de bureau, mobile, web) lisent et écrivent dans `profile_secrets`.
--
-- Rejouable sans risque.

create table if not exists public.profile_secrets (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  henrikdev_api_key text,
  updated_at        timestamptz not null default now()
);

alter table public.profile_secrets enable row level security;

drop policy if exists profile_secrets_select_own on public.profile_secrets;
create policy profile_secrets_select_own on public.profile_secrets
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists profile_secrets_insert_own on public.profile_secrets;
create policy profile_secrets_insert_own on public.profile_secrets
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists profile_secrets_update_own on public.profile_secrets;
create policy profile_secrets_update_own on public.profile_secrets
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists profile_secrets_delete_own on public.profile_secrets;
create policy profile_secrets_delete_own on public.profile_secrets
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.profile_secrets from anon, public;
grant select, insert, update, delete on public.profile_secrets to authenticated;

-- 2. Copie des clés existantes.
insert into public.profile_secrets (user_id, henrikdev_api_key)
select p.id, p.henrikdev_api_key
from public.profiles p
where p.henrikdev_api_key is not null and p.henrikdev_api_key <> ''
on conflict (user_id) do update
  set henrikdev_api_key = excluded.henrikdev_api_key, updated_at = now();

-- 3. La colonne ne contient plus aucune clé (copie faite à l'étape 2). Fait AVANT de
-- poser le déclencheur, pour qu'il n'intervienne pas sur cette remise à NULL.
drop trigger if exists profiles_redirect_api_key on public.profiles;
update public.profiles set henrikdev_api_key = null where henrikdev_api_key is not null;

-- 4. Déclencheur : la clé écrite dans `profiles` est rangée dans `profile_secrets`.
-- `security definer` : il doit pouvoir écrire dans la table privée quel que soit le
-- rôle de celui qui met à jour le profil ; `new.id` est toujours le propriétaire.
-- (Effacer sa clé se fait directement dans `profile_secrets`, voir profileSecret.js.)
create or replace function public.profiles_redirect_api_key()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.henrikdev_api_key is not null then
    if new.henrikdev_api_key <> '' then
      insert into public.profile_secrets (user_id, henrikdev_api_key)
      values (new.id, new.henrikdev_api_key)
      on conflict (user_id) do update
        set henrikdev_api_key = excluded.henrikdev_api_key, updated_at = now();
    end if;
    new.henrikdev_api_key := null;
  end if;
  return new;
end;
$$;

create trigger profiles_redirect_api_key
  before insert or update on public.profiles
  for each row execute function public.profiles_redirect_api_key();
