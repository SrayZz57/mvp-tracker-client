-- Rappel du Wrapped le lundi matin (version web) : appelle la fonction `match-notifier` en mode
-- « wrapped », qui notifie les appareils ayant activé « Wrapped du lundi ». Chaque lundi à 07:00 UTC
-- (08:00 ou 09:00 à Paris selon l'heure d'été). À exécuter une fois, après sql/match_notifier_cron.sql :
-- le mot de passe est lu dans le même coffre (Vault), il n'est écrit nulle part ici.

select cron.unschedule('wrapped-reminder')
where exists (select 1 from cron.job where jobname = 'wrapped-reminder');

select cron.schedule(
  'wrapped-reminder',
  '0 7 * * 1',
  $$
  select net.http_post(
    url := 'https://hbfqtrqztyrnsqrrvmep.supabase.co/functions/v1/match-notifier',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZnF0cnF6dHlybnNxcnJ2bWVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNzk4OTcsImV4cCI6MjEwMjY1NTg5N30.OtQG46T7kwSC6s3l8CNE0Jq7RTAL34tn4HVQl_4Fu_k',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'match_notifier_cron_secret')
    ),
    body := '{"wrapped": true}'::jsonb
  );
  $$
);

-- Pour l'arrêter : select cron.unschedule('wrapped-reminder');
