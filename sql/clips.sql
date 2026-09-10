-- Module Clips (mini réseau social de highlights) — ClipsFeed.jsx
-- Même mécanique que agent_techs.sql : tables publiques en lecture, écriture
-- restreinte à son propre auteur, suppression par l'auteur ou un admin.
-- Aucune vidéo stockée ici — juste le lien externe et ses métadonnées.
-- À exécuter une seule fois dans le SQL Editor du projet Supabase.

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  platform text not null check (platform in ('youtube', 'medal', 'streamable')),
  title text not null,
  description text,
  agent text,
  map text,
  -- Miniature réelle pour Medal.tv/Streamable (YouTube n'en a pas besoin :
  -- son URL de miniature se déduit de l'id de la vidéo, sans appel réseau —
  -- voir clipThumbnailUrl dans clipEmbed.js). Résolue une seule fois à la
  -- publication (voir clips:resolve-metadata dans main.js) et stockée ici,
  -- plutôt que re-scrapée à chaque affichage du fil pour tout le monde.
  thumbnail_url text,
  -- Vers profiles(id), pas auth.users(id) : `author:profiles(...)` (le nom
  -- affiché) est chargé par un embed PostgREST dans ClipsFeed.jsx, qui a
  -- besoin d'une clé étrangère DIRECTE entre clips et profiles pour pouvoir
  -- faire la jointure — vers auth.users, la requête entière échouait
  -- silencieusement ("could not find a relationship"), laissant le fil vide
  -- même après une publication réussie (signalé en vrai).
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.clips enable row level security;

create policy "clips_select_all"
  on public.clips for select
  using (true);

create policy "clips_insert_own"
  on public.clips for insert
  with check (auth.uid() = created_by);

create policy "clips_delete_own_or_admin"
  on public.clips for delete
  using (auth.uid() = created_by or is_admin());

-- Likes : une ligne = un like d'un utilisateur sur un clip. Clé primaire
-- composite (clip_id, user_id) : un like par utilisateur et par clip, pas
-- besoin de contrainte UNIQUE séparée.
create table public.clip_likes (
  clip_id uuid not null references public.clips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, user_id)
);

alter table public.clip_likes enable row level security;

create policy "clip_likes_select_all"
  on public.clip_likes for select
  using (true);

create policy "clip_likes_insert_own"
  on public.clip_likes for insert
  with check (auth.uid() = user_id);

create policy "clip_likes_delete_own"
  on public.clip_likes for delete
  using (auth.uid() = user_id);

create table public.clip_comments (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  -- Vers profiles(id) pour la même raison que clips.created_by ci-dessus :
  -- ClipsFeed.jsx charge aussi l'auteur du commentaire via un embed.
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.clip_comments enable row level security;

create policy "clip_comments_select_all"
  on public.clip_comments for select
  using (true);

create policy "clip_comments_insert_own"
  on public.clip_comments for insert
  with check (auth.uid() = user_id);

create policy "clip_comments_delete_own_or_admin"
  on public.clip_comments for delete
  using (auth.uid() = user_id or is_admin());

-- Signalements : un signalement par utilisateur et par clip (contrainte
-- UNIQUE, pas de clé composite car `id` reste utile pour le futur — ex.
-- lister/traiter un signalement précis). Lecture restreinte : chacun ne voit
-- que ses propres signalements (pour savoir s'il a déjà signalé un clip),
-- un admin les voit tous (file de modération).
create table public.clip_reports (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (clip_id, user_id)
);

alter table public.clip_reports enable row level security;

create policy "clip_reports_select_own_or_admin"
  on public.clip_reports for select
  using (auth.uid() = user_id or is_admin());

create policy "clip_reports_insert_own"
  on public.clip_reports for insert
  with check (auth.uid() = user_id);

-- RLS ne fait que RESTREINDRE : sans ces GRANT, le rôle `authenticated`
-- (tout compte connecté) n'a même pas le droit de base de lire/écrire sur
-- ces tables, RLS ou pas — "permission denied" avant même que les policies
-- entrent en jeu. Les tables créées via l'éditeur graphique Supabase les
-- reçoivent automatiquement ; celles créées en SQL brut comme ici, non.
grant select, insert, delete on public.clips to authenticated;
grant select, insert, delete on public.clip_likes to authenticated;
grant select, insert, delete on public.clip_comments to authenticated;
grant select, insert on public.clip_reports to authenticated;
