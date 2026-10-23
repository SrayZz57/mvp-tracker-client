// Notifications de fin de partie sur le téléphone, SANS l'app PC : appelée toutes les
// 2 minutes par pg_cron (sql/match_notifier_cron.sql), elle regarde, pour chaque joueur
// qui a activé les notifications web, si une NOUVELLE partie est apparue chez HenrikDev
// (avec la clé API du joueur, table profile_secrets), puis envoie la notification
// (résultat, score, agent, K/D, % de tirs à la tête, map) à ses appareils abonnés
// (table web_push_subscriptions).
//
// Secrets à définir dans Supabase (Edge Functions > Secrets) — JAMAIS dans le dépôt :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  (paire `npx web-push generate-vapid-keys`)
//   VAPID_SUBJECT                        (ex. https://mvptracker.fr)
//   CRON_SECRET                          (mot de passe inventé, aussi mis dans le cron)
//
// Économie de requêtes HenrikDev (la clé du joueur a un quota) : une seule requête par
// vérification ; un joueur qui a joué dans les 3 dernières heures est vérifié à chaque
// passage, les autres toutes les 8 minutes seulement. Premier passage d'un joueur :
// on mémorise sa dernière partie sans notifier (pas d'alerte pour une vieille partie).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { excludeDeathmatch, findMe, hitStats, matchScore, normalizeV4Match, resultLabel } from './matchLogic.ts';

const BASE_URL = 'https://api.henrikdev.xyz';
const ACTIVE_WINDOW_MS = 3 * 60 * 60 * 1000;
const ACTIVE_INTERVAL_MS = 90 * 1000;
const IDLE_INTERVAL_MS = 8 * 60 * 1000;
const CONCURRENCY = 5;

type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string; match_alerts?: boolean; wrapped_reminder?: boolean };
type State = {
  user_id: string;
  last_match_id: string | null;
  last_match_at: string | null;
  last_checked_at: string | null;
  region: string | null;
  platform: string | null;
};
type Person = { id: string; riot_name: string | null; riot_tag: string | null };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function henrik(path: string, apiKey: string) {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: apiKey } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.errors?.[0]?.message ?? `HenrikDev ${response.status}`), { status: response.status });
  return body.data;
}

// Un compte crossplay peut lister « pc » et « console » : on essaie chaque plateforme.
function platformCandidates(platforms: string[] | undefined): string[] {
  const list = (platforms ?? []).map((p) => p.toLowerCase());
  if (list.includes('pc') && list.includes('console')) return ['pc', 'console'];
  if (list.includes('console')) return ['console'];
  return ['pc'];
}

// Dernière partie du joueur (et région/plateforme qui ont marché, mémorisées ensuite).
async function latestMatch(person: Person, state: State | undefined, apiKey: string) {
  const name = encodeURIComponent(person.riot_name ?? '');
  const tag = encodeURIComponent(person.riot_tag ?? '');
  const attempt = async (region: string, platform: string) => {
    const data = await henrik(`/valorant/v4/matches/${region}/${platform}/${name}/${tag}?size=1`, apiKey);
    return { raw: Array.isArray(data) ? data[0] : null, region, platform };
  };
  if (state?.region && state?.platform) {
    try {
      return await attempt(state.region, state.platform);
    } catch (err) {
      if ((err as { status?: number }).status === 429) throw err;
      // Région ou plateforme périmée : on la redécouvre ci-dessous.
    }
  }
  const account = await henrik(`/valorant/v2/account/${name}/${tag}`, apiKey);
  let lastError: unknown;
  for (const platform of platformCandidates(account.platforms)) {
    try {
      return await attempt(account.region, platform);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// Même message que l'app PC (requestMobileMatchPush) : résultat, score, agent, K/D, tête, map.
function buildMessage(match: any, name: string, tag: string): { title: string; body: string } | null {
  if (excludeDeathmatch([match]).length === 0) return null;
  const me = findMe(match, name, tag);
  if (!me) return null;
  const label = resultLabel(match, me);
  if (label !== 'Victoire' && label !== 'Défaite' && label !== 'Match nul') return null;

  const kills = me.stats?.kills ?? 0;
  const deaths = me.stats?.deaths ?? 0;
  const assists = me.stats?.assists ?? 0;
  const kd = deaths > 0 ? kills / deaths : kills;
  const { hsPercent } = hitStats(me);
  const score = matchScore(match, me);
  const hero = me.character ?? 'Agent inconnu';
  const title = `${label}${score ? ` ${score.replace('-', '–')}` : ''} · ${hero}`;
  const body = [`K/D ${kd.toFixed(2)} (${kills}/${deaths}/${assists})`, hsPercent === null ? null : `HS ${hsPercent.toFixed(0)}%`, match.metadata?.map ?? null].filter(Boolean).join(' · ');
  return { title, body };
}

function isDue(state: State | undefined, now: number): boolean {
  if (!state?.last_checked_at) return true;
  const sinceCheck = now - Date.parse(state.last_checked_at);
  const lastMatch = state.last_match_at ? Date.parse(state.last_match_at) : 0;
  return sinceCheck >= (now - lastMatch < ACTIVE_WINDOW_MS ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
}

async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(work));
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return json({ error: 'not-configured' });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'https://mvptracker.fr', publicKey, privateKey);

  // Service role : cette fonction lit les clés API de plusieurs joueurs. Elle n'est appelable
  // qu'avec le CRON_SECRET et ne renvoie jamais de donnée personnelle.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: subscriptions, error: subsError } = await admin.from('web_push_subscriptions').select('endpoint, p256dh, auth, user_id, match_alerts, wrapped_reminder');
  // Une lecture refusée (droit manquant, table absente) ne doit pas ressembler à « aucun abonné ».
  if (subsError) {
    console.error('[match-notifier] lecture des abonnements', subsError.message);
    return json({ error: 'read-subscriptions', detail: subsError.message, hint: 'Droit manquant ? Voir sql/web_push_subscriptions.sql (grant ... to service_role).' });
  }
  const subsByUser = new Map<string, Sub[]>();
  // Alertes de partie : seulement les appareils qui les ont activées (le rappel du Wrapped est un autre réglage).
  for (const sub of ((subscriptions ?? []) as Sub[]).filter((s) => s.match_alerts === true)) subsByUser.set(sub.user_id, [...(subsByUser.get(sub.user_id) ?? []), sub]);
  const userIds = [...subsByUser.keys()];
  const body = await req.json().catch(() => ({}));
  // Les modes « wrapped » et « test » n'ont pas besoin d'abonnés aux alertes de partie.
  if (userIds.length === 0 && body?.wrapped !== true && body?.test !== true) return json({ checked: 0, notified: 0, subscribers: 0 });

  // Mode Wrapped (corps {"wrapped": true}, chaque lundi matin) : le récap de la semaine est prêt,
  // pour les appareils qui ont activé « Wrapped du lundi ». Pas de lecture de parties.
  if (body?.wrapped === true) {
    const payload = JSON.stringify({ title: 'Ton Wrapped de la semaine est dispo', body: 'Parties, winrate, K/D, précision tête : découvre ta semaine Valorant.', url: '/account/wrapped' });
    const targets = (subscriptions as Sub[]).filter((sub) => sub.wrapped_reminder === true);
    const gone: string[] = [];
    let sentCount = 0;
    await Promise.all(
      targets.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 6 * 3600 });
          sentCount += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(sub.endpoint);
          else console.error('[match-notifier] wrapped', status, (err as Error)?.message);
        }
      }),
    );
    if (gone.length > 0) await admin.from('web_push_subscriptions').delete().in('endpoint', gone);
    return json({ wrapped: true, devices: targets.length, sent: sentCount, removed: gone.length });
  }

  // Mode test (corps {"test": true}) : envoie une notification de test à tous les abonnés, sans
  // regarder les parties. Sert à vérifier que le canal d'envoi marche, sans avoir à jouer.
  if (body?.test === true) {
    const payload = JSON.stringify({ title: 'Test MVP Tracker', body: 'Si tu vois ça, les notifications fonctionnent.' });
    const results: Array<{ ok: boolean; status?: number; error?: string }> = [];
    await Promise.all(
      (subscriptions as Sub[]).map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 300, urgency: 'high' });
          results.push({ ok: true });
        } catch (err) {
          results.push({ ok: false, status: (err as { statusCode?: number }).statusCode, error: String((err as Error)?.message ?? err).slice(0, 160) });
        }
      }),
    );
    return json({ test: true, subscribers: userIds.length, devices: results.length, results });
  }

  const [{ data: states, error: statesError }, { data: people, error: peopleError }, secretsResult] = await Promise.all([
    admin.from('match_push_state').select('*').in('user_id', userIds),
    admin.from('profiles').select('id, riot_name, riot_tag').in('id', userIds),
    admin.from('profile_secrets').select('user_id, henrikdev_api_key').in('user_id', userIds),
  ]);
  if (statesError || peopleError) {
    const detail = (statesError ?? peopleError)!.message;
    console.error('[match-notifier] lecture', detail);
    return json({ error: 'read-tables', detail, hint: 'Droit manquant ? Voir sql/match_push_state.sql (grant ... to service_role).' });
  }
  const stateById = new Map<string, State>((states ?? []).map((s: State) => [s.user_id, s]));
  const keyById = new Map<string, string>();
  for (const row of secretsResult.data ?? []) if (row.henrikdev_api_key) keyById.set(row.user_id, row.henrikdev_api_key);
  if (secretsResult.error) {
    // Base pas encore migrée vers profile_secrets : ancienne colonne de profiles.
    const legacy = await admin.from('profiles').select('id, henrikdev_api_key').in('id', userIds);
    for (const row of legacy.data ?? []) if (row.henrikdev_api_key) keyById.set(row.id, row.henrikdev_api_key);
  }

  const now = Date.now();
  let checked = 0;
  let notified = 0;
  let failed = 0;
  let reachedHenrik = 0;
  let newMatches = 0;
  const problems: string[] = [];

  await inBatches((people ?? []) as Person[], CONCURRENCY, async (person) => {
    const state = stateById.get(person.id);
    const apiKey = keyById.get(person.id);
    if (!apiKey || !person.riot_name || !person.riot_tag || !isDue(state, now)) return;
    checked += 1;

    const next: Partial<State> & { user_id: string } = { user_id: person.id, last_checked_at: new Date(now).toISOString() };
    try {
      const { raw, region, platform } = await latestMatch(person, state, apiKey);
      next.region = region;
      next.platform = platform;
      reachedHenrik += 1;
      if (raw) {
        const match = normalizeV4Match(raw);
        const matchId: string | undefined = match.metadata?.matchid;
        if (matchId && matchId !== state?.last_match_id) {
          next.last_match_id = matchId;
          newMatches += 1;
          next.last_match_at = new Date((match.metadata?.game_start ?? 0) * 1000).toISOString();
          // Pas de notification au tout premier passage : c'est juste le point de départ.
          const message = state?.last_match_id ? buildMessage(match, person.riot_name, person.riot_tag) : null;
          if (message) {
            const payload = JSON.stringify(message);
            const gone: string[] = [];
            await Promise.all(
              (subsByUser.get(person.id) ?? []).map(async (sub) => {
                try {
                  await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, urgency: 'high' });
                  notified += 1;
                } catch (err) {
                  const status = (err as { statusCode?: number }).statusCode;
                  if (status === 404 || status === 410) gone.push(sub.endpoint); // abonnement disparu
                  else {
                    failed += 1;
                    problems.push(`envoi `+ (status ?? '?') + ` ` + String((err as Error)?.message ?? err).slice(0, 120));
                    console.error('[match-notifier] échec d\'envoi', status, (err as Error)?.message);
                  }
                }
              }),
            );
            if (gone.length > 0) await admin.from('web_push_subscriptions').delete().in('endpoint', gone);
          }
        }
      }
    } catch (err) {
      // Limite de requêtes (429), panne HenrikDev, compte introuvable : on réessaiera au prochain
      // passage (last_checked_at est quand même mis à jour pour ne pas insister).
      problems.push('henrik ' + ((err as { status?: number }).status ?? '?') + ' ' + String((err as Error)?.message ?? err).slice(0, 100));
      console.error('[match-notifier] HenrikDev', (err as Error)?.message);
    }
    await admin.from('match_push_state').upsert({ ...next, updated_at: new Date().toISOString() });
  });

  const skippedNoKey = ((people ?? []) as Person[]).filter((person) => !keyById.get(person.id) || !person.riot_name || !person.riot_tag).length;
  return json({ subscribers: userIds.length, checked, reachedHenrik, newMatches, notified, failed, skippedNoKey, problems: problems.slice(0, 5) });
});
