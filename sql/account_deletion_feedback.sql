-- Retours recueillis juste avant la suppression d'un compte (voir
-- DeleteAccountModal.jsx + SettingsPage.jsx) — consultable directement dans
-- le Table Editor Supabase, pas d'onglet Admin dédié pour l'instant.
-- À exécuter une seule fois dans le SQL Editor du projet Supabase.

create table public.account_deletion_feedback (
  id uuid primary key default gen_random_uuid(),
  -- Pas de référence vers auth.users/profiles : cette ligne doit survivre à
  -- la suppression du compte (via l'Edge Function delete-account, juste
  -- après) — c'est tout l'intérêt de la conserver. `email` reste le seul
  -- moyen d'identifier le compte une fois qu'il n'existe plus.
  user_id uuid,
  email text,
  reasons text[] not null default '{}',
  other_text text,
  created_at timestamptz not null default now()
);

alter table public.account_deletion_feedback enable row level security;

-- Un compte encore actif enregistre SON propre retour juste avant de se
-- supprimer. Pas de select/update/delete pour les comptes normaux : ces
-- retours ne sont consultés que par toi, directement dans Supabase.
create policy "account_deletion_feedback_insert_own"
  on public.account_deletion_feedback for insert
  with check (auth.uid() = user_id);

grant insert on public.account_deletion_feedback to authenticated;
