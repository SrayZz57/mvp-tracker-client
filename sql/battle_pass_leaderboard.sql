-- Classements de saison et global (phase 6). Une seule fonction, appliquée à
-- une fenêtre de dates différente : la saison en cours, ou toute la vie du
-- compte. Voir docs/battle-pass.md, section « Classements : jour, saison,
-- global » pour le pourquoi du calcul (Aim Rating).
--
-- Aim Rating d'un joueur sur une fenêtre :
--   1. son meilleur score sur chaque mode joué dans la fenêtre (hors 'custom') ;
--   2. divisé par le 90e centile des meilleurs scores de TOUS les joueurs sur
--      ce mode, dans la même fenêtre ;
--   3. plafonné à 1,5 ; moyenne sur les modes joués ; ×100.
--   4. il faut au moins 3 modes joués pour apparaître.
--
-- `aim_trainer_scores` est lisible par tout compte connecté (RLS existante),
-- mais `bp_xp_events` ne l'est que par son propre propriétaire : le niveau
-- affiché à côté du classement (à titre d'information seulement, jamais le
-- critère de tri) nécessite donc une fonction security definer.
--
-- La fonction renvoie le top `p_limit`, plus la ligne de l'appelant si elle
-- n'y est pas déjà (comme un classement de jeu qui montre toujours « toi »).
create or replace function public.bp_leaderboard(p_scope text, p_limit integer default 10)
returns table(rank integer, user_id uuid, rating numeric, modes_played integer, level integer, is_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w_start timestamptz;
  w_end   timestamptz;
  cur     public.bp_seasons;
begin
  if p_scope = 'season' then
    select starts_at, ends_at into w_start, w_end from public.bp_seasons
      where now() >= starts_at and now() < ends_at limit 1;
    if w_start is null then
      return; -- entre deux saisons : pas de classement de saison
    end if;
  elsif p_scope = 'global' then
    w_start := '-infinity'::timestamptz;
    w_end   := 'infinity'::timestamptz;
  else
    raise exception 'bp_leaderboard: scope invalide (%)', p_scope;
  end if;

  select * into cur from public.bp_current_season();

  return query
  with scores as (
    -- Meilleur score de chaque joueur, par mode, dans la fenêtre. 'custom' est
    -- exclu : ses réglages libres ne sont comparables entre personne.
    select s.user_id, s.mode, max(s.score) as best
    from public.aim_trainer_scores s
    where s.mode <> 'custom'
      and s.created_at >= w_start and s.created_at < w_end
    group by s.user_id, s.mode
  ),
  caps as (
    select mode, percentile_cont(0.9) within group (order by best) as p90
    from scores
    group by mode
  ),
  ratios as (
    select sc.user_id, least(sc.best / c.p90, 1.5) as ratio
    from scores sc
    join caps c on c.mode = sc.mode
    where c.p90 > 0
  ),
  ratings as (
    select r.user_id, (avg(r.ratio) * 100)::numeric(6, 2) as rating, count(*)::integer as modes_played
    from ratios r
    group by r.user_id
    having count(*) >= 3
  ),
  levels as (
    select e.user_id, coalesce(sum(e.xp), 0)::integer as total_xp
    from public.bp_xp_events e
    where cur.id is not null and e.season_id = cur.id
    group by e.user_id
  ),
  ranked as (
    select
      rt.user_id,
      rt.rating,
      rt.modes_played,
      case when cur.id is not null then public.bp_level_from_xp(cur.id, coalesce(lv.total_xp, 0)) else null end as level,
      row_number() over (order by rt.rating desc, rt.user_id)::integer as rnk
    from ratings rt
    left join levels lv on lv.user_id = rt.user_id
  )
  select ranked.rnk, ranked.user_id, ranked.rating, ranked.modes_played, ranked.level, (ranked.user_id = auth.uid()) as is_me
  from ranked
  where ranked.rnk <= p_limit or ranked.user_id = auth.uid()
  order by ranked.rnk;
end;
$$;

revoke all on function public.bp_leaderboard(text, integer) from public, anon;
grant execute on function public.bp_leaderboard(text, integer) to authenticated;
