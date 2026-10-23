-- Planification du notifier de fin de partie : appelle la fonction `match-notifier` toutes
-- les 2 minutes. À exécuter UNE FOIS dans l'éditeur SQL de Supabase, après avoir :
--   1. activé les extensions pg_cron et pg_net (Database > Extensions) ;
--   2. déployé la fonction match-notifier et défini ses secrets (voir son index.ts),
--      dont CRON_SECRET (un mot de passe long, généré avec
--      `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) ;
--   3. rangé ce MÊME mot de passe dans le coffre de Supabase (Vault), en lançant à part,
--      sans enregistrer ce fichier avec la vraie valeur :
--         select vault.create_secret('LE_MOT_DE_PASSE', 'match_notifier_cron_secret');
--      Pour le changer plus tard :
--         select vault.update_secret(
--           (select id from vault.secrets where name = 'match_notifier_cron_secret'),
--           'LE_NOUVEAU_MOT_DE_PASSE');
--
-- Le mot de passe n'est donc JAMAIS écrit dans ce fichier ni dans la tâche planifiée : la
-- tâche le lit dans le coffre à chaque appel.

select cron.unschedule('match-notifier')
where exists (select 1 from cron.job where jobname = 'match-notifier');

select cron.schedule(
  'match-notifier',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://hbfqtrqztyrnsqrrvmep.supabase.co/functions/v1/match-notifier',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Clé « anon » publique (déjà dans l'app) : la passerelle Supabase exige un JWT ;
      -- la vraie protection est le x-cron-secret ci-dessous.
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZnF0cnF6dHlybnNxcnJ2bWVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNzk4OTcsImV4cCI6MjEwMjY1NTg5N30.OtQG46T7kwSC6s3l8CNE0Jq7RTAL34tn4HVQl_4Fu_k',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'match_notifier_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Pour l'arrêter : select cron.unschedule('match-notifier');
