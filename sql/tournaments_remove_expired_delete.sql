-- Retire le droit, pour n'importe quel compte, de supprimer un tournoi dont la
-- date limite d'inscription est passée (policy "tournaments_delete_own_or_admin_or_expired").
-- À exécuter UNE fois dans le SQL Editor du projet Supabase si tu avais déjà
-- lancé une ancienne version de tournaments_community.sql. Sans danger si ce
-- n'est pas le cas.
--
-- Après ça, seuls le créateur du tournoi et les admins peuvent le supprimer.

drop policy if exists "tournaments_delete_own_or_admin_or_expired" on public.tournaments;
drop policy if exists "tournaments_delete_own_or_admin" on public.tournaments;

create policy "tournaments_delete_own_or_admin"
  on public.tournaments for delete
  using (auth.uid() = created_by or is_admin());
