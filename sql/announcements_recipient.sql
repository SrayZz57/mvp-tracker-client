-- Messages ciblés dans la cloche d'annonces — AdminNotificationComposer.jsx
-- `recipient_id` NULL = annonce pour tout le monde (comportement actuel) ;
-- renseigné = message visible UNIQUEMENT par ce joueur (et les admins).
-- À exécuter une seule fois dans le SQL Editor du projet Supabase, AVANT de
-- publier la version de l'appli qui envoie des messages ciblés.

alter table public.announcements
  add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;

create index if not exists announcements_recipient_idx on public.announcements (recipient_id);

-- Les anciennes policies SELECT laissaient tout le monde lire toutes les
-- annonces actives : sans les retirer, un message ciblé resterait lisible par
-- n'importe quel compte (les policies permissives s'additionnent). On supprime
-- donc toutes les policies SELECT existantes, quel que soit leur nom, avant de
-- poser la nouvelle règle ci-dessous.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'announcements'
      and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.announcements', pol.policyname);
  end loop;
end $$;

-- Un joueur voit les annonces actives pour tous + les messages qui lui sont
-- adressés ; un admin voit tout (y compris les annonces désactivées).
create policy "announcements_select_broadcast_or_own"
  on public.announcements for select
  using (
    is_admin()
    or (is_active = true and (recipient_id is null or recipient_id = auth.uid()))
  );
