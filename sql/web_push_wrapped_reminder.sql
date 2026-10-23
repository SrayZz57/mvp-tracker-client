-- Rappel du Wrapped sur la version web : deux colonnes de plus sur les abonnements existants.
-- À exécuter une fois dans l'éditeur SQL de Supabase (la table web_push_subscriptions existe déjà).
--   match_alerts      : l'appareil reçoit les alertes de fin de partie (réglage « Alertes de partie »)
--   wrapped_reminder  : l'appareil reçoit le rappel du lundi (réglage « Wrapped du lundi »)
-- Les deux réglages sont indépendants : ils partagent l'abonnement de l'appareil, qui n'est supprimé
-- que lorsque les deux sont coupés.
alter table public.web_push_subscriptions add column if not exists match_alerts boolean not null default false;
alter table public.web_push_subscriptions add column if not exists wrapped_reminder boolean not null default false;

-- Les abonnements déjà enregistrés l'ont été pour les alertes de partie.
update public.web_push_subscriptions set match_alerts = true where match_alerts = false and wrapped_reminder = false;
