-- Bibliothèque de techs communautaires (onglet Lineups, Outils) — TechLibrary.jsx
-- Même mécanique que map_compositions : table publique en lecture, écriture
-- restreinte à son propre auteur, suppression par l'auteur ou un admin.
-- À exécuter une seule fois dans le SQL Editor du projet Supabase.

create table public.agent_techs (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  map text,
  title text not null,
  video_url text not null,
  -- Miniature réelle pour Medal.tv/Streamable (YouTube n'en a pas besoin,
  -- son URL de miniature se déduit de l'id de la vidéo sans appel réseau —
  -- voir clipThumbnailUrl dans clipEmbed.js). Résolue une seule fois à la
  -- publication (voir clips:resolve-clip-metadata dans main.js) et stockée
  -- ici, plutôt que re-scrapée à chaque affichage du fil pour tout le monde.
  thumbnail_url text,
  tags text[] not null default '{}',
  -- Vers profiles(id), pas auth.users(id) : `author:profiles(...)` (le nom
  -- affiché) est chargé par un embed PostgREST dans TechLibrary.jsx, qui a
  -- besoin d'une clé étrangère DIRECTE entre agent_techs et profiles pour
  -- pouvoir faire la jointure — vers auth.users, la requête entière
  -- échouait silencieusement ("could not find a relationship"), laissant le
  -- fil vide même après une publication réussie (même bug que sur clips,
  -- signalé en vrai).
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.agent_techs enable row level security;

create policy "agent_techs_select_all"
  on public.agent_techs for select
  using (true);

create policy "agent_techs_insert_own"
  on public.agent_techs for insert
  with check (auth.uid() = created_by);

create policy "agent_techs_delete_own_or_admin"
  on public.agent_techs for delete
  using (auth.uid() = created_by or is_admin());

-- RLS ne fait que RESTREINDRE : sans ces GRANT, le rôle `authenticated`
-- (tout compte connecté) n'a même pas le droit de base de lire/écrire sur
-- cette table, RLS ou pas — "permission denied" avant même que les policies
-- entrent en jeu. Les tables créées via l'éditeur graphique Supabase les
-- reçoivent automatiquement ; celles créées en SQL brut comme ici, non.
grant select, insert, delete on public.agent_techs to authenticated;
