// Edge Function « match-notifier » — VERSION EN UN SEUL FICHIER, à coller dans l'éditeur
// de fonctions du dashboard Supabase. Générée à partir de index.ts + matchLogic.ts
// (supabase/functions/match-notifier/) : en cas de modification, régénérer plutôt que
// d'éditer ici. Prérequis : secrets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// et CRON_SECRET, tables web_push_subscriptions et match_push_state (dossier sql/),
// planification (sql/match_notifier_cron.sql).
// supabase/functions/match-notifier/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// supabase/functions/match-notifier/matchLogic.ts
function playerName(p) {
  return p ? `${p.name}#${p.tag}` : null;
}
var ABILITY_WEAPON_NAMES = {
  "856d9a7e-4b06-dc37-15dc-9d809c37cb90": "Headhunter",
  "39099fb5-4293-def4-1e09-2e9080ce7456": "Tour De Force"
};
function normalizeKillEvent(k) {
  return {
    kill_time_in_round: k.time_in_round_in_ms,
    kill_time_in_match: k.time_in_match_in_ms,
    killer_puuid: k.killer?.puuid ?? null,
    killer_display_name: playerName(k.killer),
    killer_team: k.killer?.team ?? null,
    victim_puuid: k.victim?.puuid ?? null,
    victim_display_name: playerName(k.victim),
    victim_team: k.victim?.team ?? null,
    victim_death_location: k.location ?? null,
    damage_weapon_id: k.weapon?.id ?? null,
    damage_weapon_name: k.weapon?.name ?? ABILITY_WEAPON_NAMES[k.weapon?.id] ?? null,
    secondary_fire_mode: k.secondary_fire_mode ?? false,
    player_locations_on_kill: (k.player_locations ?? []).map((pl) => ({
      player_puuid: pl.player?.puuid ?? null,
      player_display_name: playerName(pl.player),
      player_team: pl.player?.team ?? null,
      location: pl.location,
      view_radians: pl.view_radians
    })),
    assistants: k.assistants ?? []
  };
}
function normalizePlayer(p) {
  return {
    puuid: p.puuid,
    name: p.name,
    tag: p.tag,
    team: p.team_id,
    level: p.account_level,
    character: p.agent?.name ?? null,
    currenttier: p.tier?.id ?? null,
    currenttier_patched: p.tier?.name ?? null,
    party_id: p.party_id,
    stats: p.stats,
    ability_casts: p.ability_casts,
    behavior: p.behavior,
    economy: p.economy
  };
}
function normalizeRoundStat(s, killsThisRound) {
  return {
    ability_casts: s.ability_casts,
    player_puuid: s.player?.puuid ?? null,
    player_display_name: playerName(s.player),
    player_team: s.player?.team ?? null,
    damage_events: s.damage_events,
    damage: (s.damage_events ?? []).reduce((sum, d) => sum + (d.damage ?? 0), 0),
    headshots: s.stats?.headshots ?? 0,
    bodyshots: s.stats?.bodyshots ?? 0,
    legshots: s.stats?.legshots ?? 0,
    kill_events: killsThisRound.filter((k) => k.killer?.puuid === s.player?.puuid).map(normalizeKillEvent),
    kills: s.stats?.kills ?? 0,
    score: s.stats?.score ?? 0,
    economy: s.economy ? {
      loadout_value: s.economy.loadout_value,
      remaining: s.economy.remaining,
      spent: s.economy.loadout_value,
      weapon: s.economy.weapon,
      armor: s.economy.armor
    } : null,
    was_afk: s.was_afk,
    was_penalized: s.received_penalty,
    stayed_in_spawn: s.stayed_in_spawn
  };
}
function normalizeRound(round, allKills) {
  const killsThisRound = allKills.filter((k) => k.round === round.id);
  return {
    winning_team: round.winning_team,
    end_type: round.result === "" ? "Round timer expired" : round.result,
    bomb_planted: !!round.plant,
    bomb_defused: !!round.defuse,
    plant_events: round.plant ? {
      plant_location: round.plant.location,
      planted_by: {
        puuid: round.plant.player?.puuid ?? null,
        display_name: playerName(round.plant.player),
        team: round.plant.player?.team ?? null
      },
      plant_site: round.plant.site,
      plant_time_in_round: round.plant.round_time_in_ms,
      player_locations_on_plant: (round.plant.player_locations ?? []).map((pl) => ({
        player_puuid: pl.player?.puuid ?? null,
        player_display_name: playerName(pl.player),
        player_team: pl.player?.team ?? null,
        location: pl.location,
        view_radians: pl.view_radians
      }))
    } : null,
    defuse_events: round.defuse ? {
      defuse_location: round.defuse.location,
      defused_by: {
        puuid: round.defuse.player?.puuid ?? null,
        display_name: playerName(round.defuse.player),
        team: round.defuse.player?.team ?? null
      },
      defuse_time_in_round: round.defuse.round_time_in_ms
    } : null,
    player_stats: (round.stats ?? []).map((s) => normalizeRoundStat(s, killsThisRound))
  };
}
function normalizeTeams(teams) {
  const out = {};
  (teams ?? []).forEach((t) => {
    const key = String(t.team_id ?? "").toLowerCase();
    if (!key) return;
    out[key] = { has_won: t.won, rounds_won: t.rounds?.won ?? 0, rounds_lost: t.rounds?.lost ?? 0, roster: null };
  });
  return out;
}
function normalizeV4Match(m) {
  const allPlayers = (m.players ?? []).map(normalizePlayer);
  const allKills = m.kills ?? [];
  return {
    metadata: {
      map: m.metadata.map?.name ?? null,
      game_version: m.metadata.game_version,
      game_length: Math.round((m.metadata.game_length_in_ms ?? 0) / 1e3),
      game_start: Math.round(new Date(m.metadata.started_at).getTime() / 1e3),
      game_start_patched: m.metadata.started_at,
      rounds_played: (m.rounds ?? []).length,
      mode: m.metadata.queue?.name ?? null,
      mode_id: (m.metadata.queue?.id ?? "").replace(/^console_/, ""),
      queue: m.metadata.queue?.mode_type ?? null,
      season_id: m.metadata.season?.id ?? null,
      platform: m.metadata.platform,
      matchid: m.metadata.match_id,
      region: m.metadata.region,
      cluster: m.metadata.cluster
    },
    players: {
      all_players: allPlayers,
      red: allPlayers.filter((p) => p.team === "Red"),
      blue: allPlayers.filter((p) => p.team === "Blue")
    },
    teams: normalizeTeams(m.teams),
    rounds: (m.rounds ?? []).map((r) => normalizeRound(r, allKills)),
    kills: allKills.map(normalizeKillEvent)
  };
}
var NON_STANDARD_MODE_IDS = /* @__PURE__ */ new Set(["deathmatch", "custom", "", "ggteam", "hurm"]);
function excludeDeathmatch(matches) {
  return matches.filter((m) => !NON_STANDARD_MODE_IDS.has(m.metadata?.mode_id));
}
var DIACRITICS_RE = new RegExp("[" + String.fromCharCode(768) + "-" + String.fromCharCode(879) + "]", "g");
function normalizeRiotIdPart(value) {
  return (value ?? "").normalize("NFD").replace(DIACRITICS_RE, "").trim().toLowerCase();
}
function findMe(match, name, tag) {
  const players = match?.players?.all_players ?? [];
  const targetName = normalizeRiotIdPart(name);
  const targetTag = normalizeRiotIdPart(tag);
  return players.find(
    (p) => normalizeRiotIdPart(p.name) === targetName && normalizeRiotIdPart(p.tag) === targetTag
  );
}
function resultLabel(match, me) {
  if (match?.metadata?.mode_id === "deathmatch") return "Sans \xE9quipe";
  if (!me?.team) return "?";
  const teamKey = me.team.toLowerCase();
  const otherKey = teamKey === "red" ? "blue" : "red";
  const myRounds = match?.teams?.[teamKey]?.rounds_won;
  const otherRounds = match?.teams?.[otherKey]?.rounds_won;
  if (myRounds !== void 0 && otherRounds !== void 0 && myRounds === otherRounds) return "Match nul";
  const won = match?.teams?.[teamKey]?.has_won;
  if (won === void 0) return "?";
  return won ? "Victoire" : "D\xE9faite";
}
function matchScore(match, me) {
  if (!me?.team) return null;
  const myKey = me.team.toLowerCase();
  const otherKey = myKey === "red" ? "blue" : "red";
  const myRounds = match?.teams?.[myKey]?.rounds_won;
  const otherRounds = match?.teams?.[otherKey]?.rounds_won;
  if (myRounds === void 0 || otherRounds === void 0) return null;
  return `${myRounds}-${otherRounds}`;
}
function hitStats(me) {
  const headshots = me?.stats?.headshots ?? 0;
  const bodyshots = me?.stats?.bodyshots ?? 0;
  const legshots = me?.stats?.legshots ?? 0;
  const total = headshots + bodyshots + legshots;
  return {
    headshots,
    bodyshots,
    legshots,
    hsPercent: total > 0 ? headshots / total * 100 : null,
    bsPercent: total > 0 ? bodyshots / total * 100 : null,
    lsPercent: total > 0 ? legshots / total * 100 : null
  };
}
var SLOT_HOURS = 3;
var TIME_SLOT_ORDER = Array.from({ length: 24 / SLOT_HOURS }, (_, i) => `${i * SLOT_HOURS}h-${(i + 1) * SLOT_HOURS}h`);

// supabase/functions/match-notifier/index.ts
var BASE_URL = "https://api.henrikdev.xyz";
var ACTIVE_WINDOW_MS = 3 * 60 * 60 * 1e3;
var ACTIVE_INTERVAL_MS = 90 * 1e3;
var IDLE_INTERVAL_MS = 8 * 60 * 1e3;
var CONCURRENCY = 5;
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
async function henrik(path, apiKey) {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: apiKey } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.errors?.[0]?.message ?? `HenrikDev ${response.status}`), { status: response.status });
  return body.data;
}
function platformCandidates(platforms) {
  const list = (platforms ?? []).map((p) => p.toLowerCase());
  if (list.includes("pc") && list.includes("console")) return ["pc", "console"];
  if (list.includes("console")) return ["console"];
  return ["pc"];
}
async function latestMatch(person, state, apiKey) {
  const name = encodeURIComponent(person.riot_name ?? "");
  const tag = encodeURIComponent(person.riot_tag ?? "");
  const attempt = async (region, platform) => {
    const data = await henrik(`/valorant/v4/matches/${region}/${platform}/${name}/${tag}?size=1`, apiKey);
    return { raw: Array.isArray(data) ? data[0] : null, region, platform };
  };
  if (state?.region && state?.platform) {
    try {
      return await attempt(state.region, state.platform);
    } catch (err) {
      if (err.status === 429) throw err;
    }
  }
  const account = await henrik(`/valorant/v2/account/${name}/${tag}`, apiKey);
  let lastError;
  for (const platform of platformCandidates(account.platforms)) {
    try {
      return await attempt(account.region, platform);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
function buildMessage(match, name, tag) {
  if (excludeDeathmatch([match]).length === 0) return null;
  const me = findMe(match, name, tag);
  if (!me) return null;
  const label = resultLabel(match, me);
  if (label !== "Victoire" && label !== "D\xE9faite" && label !== "Match nul") return null;
  const kills = me.stats?.kills ?? 0;
  const deaths = me.stats?.deaths ?? 0;
  const assists = me.stats?.assists ?? 0;
  const kd = deaths > 0 ? kills / deaths : kills;
  const { hsPercent } = hitStats(me);
  const score = matchScore(match, me);
  const hero = me.character ?? "Agent inconnu";
  const title = `${label}${score ? ` ${score.replace("-", "\u2013")}` : ""} \xB7 ${hero}`;
  const body = [`K/D ${kd.toFixed(2)} (${kills}/${deaths}/${assists})`, hsPercent === null ? null : `HS ${hsPercent.toFixed(0)}%`, match.metadata?.map ?? null].filter(Boolean).join(" \xB7 ");
  return { title, body };
}
function isDue(state, now) {
  if (!state?.last_checked_at) return true;
  const sinceCheck = now - Date.parse(state.last_checked_at);
  const lastMatch = state.last_match_at ? Date.parse(state.last_match_at) : 0;
  return sinceCheck >= (now - lastMatch < ACTIVE_WINDOW_MS ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
}
async function inBatches(items, size, work) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(work));
}
Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return json({ error: "not-configured" });
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "https://mvptracker.fr", publicKey, privateKey);
  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: subscriptions, error: subsError } = await admin.from("web_push_subscriptions").select("endpoint, p256dh, auth, user_id, match_alerts, wrapped_reminder");
  if (subsError) {
    console.error("[match-notifier] lecture des abonnements", subsError.message);
    return json({ error: "read-subscriptions", detail: subsError.message, hint: "Droit manquant ? Voir sql/web_push_subscriptions.sql (grant ... to service_role)." });
  }
  const subsByUser = /* @__PURE__ */ new Map();
  for (const sub of (subscriptions ?? []).filter((s) => s.match_alerts === true)) subsByUser.set(sub.user_id, [...subsByUser.get(sub.user_id) ?? [], sub]);
  const userIds = [...subsByUser.keys()];
  const body = await req.json().catch(() => ({}));
  if (userIds.length === 0 && body?.wrapped !== true && body?.test !== true) return json({ checked: 0, notified: 0, subscribers: 0 });
  if (body?.wrapped === true) {
    const payload = JSON.stringify({ title: "Ton Wrapped de la semaine est dispo", body: "Parties, winrate, K/D, pr\xE9cision t\xEAte : d\xE9couvre ta semaine Valorant.", url: "/account/wrapped" });
    const targets = subscriptions.filter((sub) => sub.wrapped_reminder === true);
    const gone = [];
    let sentCount = 0;
    await Promise.all(
      targets.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 6 * 3600 });
          sentCount += 1;
        } catch (err) {
          const status = err.statusCode;
          if (status === 404 || status === 410) gone.push(sub.endpoint);
          else console.error("[match-notifier] wrapped", status, err?.message);
        }
      })
    );
    if (gone.length > 0) await admin.from("web_push_subscriptions").delete().in("endpoint", gone);
    return json({ wrapped: true, devices: targets.length, sent: sentCount, removed: gone.length });
  }
  if (body?.test === true) {
    const payload = JSON.stringify({ title: "Test MVP Tracker", body: "Si tu vois \xE7a, les notifications fonctionnent." });
    const results = [];
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 300, urgency: "high" });
          results.push({ ok: true });
        } catch (err) {
          results.push({ ok: false, status: err.statusCode, error: String(err?.message ?? err).slice(0, 160) });
        }
      })
    );
    return json({ test: true, subscribers: userIds.length, devices: results.length, results });
  }
  const [{ data: states, error: statesError }, { data: people, error: peopleError }, secretsResult] = await Promise.all([
    admin.from("match_push_state").select("*").in("user_id", userIds),
    admin.from("profiles").select("id, riot_name, riot_tag").in("id", userIds),
    admin.from("profile_secrets").select("user_id, henrikdev_api_key").in("user_id", userIds)
  ]);
  if (statesError || peopleError) {
    const detail = (statesError ?? peopleError).message;
    console.error("[match-notifier] lecture", detail);
    return json({ error: "read-tables", detail, hint: "Droit manquant ? Voir sql/match_push_state.sql (grant ... to service_role)." });
  }
  const stateById = new Map((states ?? []).map((s) => [s.user_id, s]));
  const keyById = /* @__PURE__ */ new Map();
  for (const row of secretsResult.data ?? []) if (row.henrikdev_api_key) keyById.set(row.user_id, row.henrikdev_api_key);
  if (secretsResult.error) {
    const legacy = await admin.from("profiles").select("id, henrikdev_api_key").in("id", userIds);
    for (const row of legacy.data ?? []) if (row.henrikdev_api_key) keyById.set(row.id, row.henrikdev_api_key);
  }
  const now = Date.now();
  let checked = 0;
  let notified = 0;
  let failed = 0;
  let reachedHenrik = 0;
  let newMatches = 0;
  const problems = [];
  await inBatches(people ?? [], CONCURRENCY, async (person) => {
    const state = stateById.get(person.id);
    const apiKey = keyById.get(person.id);
    if (!apiKey || !person.riot_name || !person.riot_tag || !isDue(state, now)) return;
    checked += 1;
    const next = { user_id: person.id, last_checked_at: new Date(now).toISOString() };
    try {
      const { raw, region, platform } = await latestMatch(person, state, apiKey);
      next.region = region;
      next.platform = platform;
      reachedHenrik += 1;
      if (raw) {
        const match = normalizeV4Match(raw);
        const matchId = match.metadata?.matchid;
        if (matchId && matchId !== state?.last_match_id) {
          next.last_match_id = matchId;
          newMatches += 1;
          next.last_match_at = new Date((match.metadata?.game_start ?? 0) * 1e3).toISOString();
          const message = state?.last_match_id ? buildMessage(match, person.riot_name, person.riot_tag) : null;
          if (message) {
            const payload = JSON.stringify(message);
            const gone = [];
            await Promise.all(
              (subsByUser.get(person.id) ?? []).map(async (sub) => {
                try {
                  await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, urgency: "high" });
                  notified += 1;
                } catch (err) {
                  const status = err.statusCode;
                  if (status === 404 || status === 410) gone.push(sub.endpoint);
                  else {
                    failed += 1;
                    problems.push(`envoi ` + (status ?? "?") + ` ` + String(err?.message ?? err).slice(0, 120));
                    console.error("[match-notifier] \xE9chec d'envoi", status, err?.message);
                  }
                }
              })
            );
            if (gone.length > 0) await admin.from("web_push_subscriptions").delete().in("endpoint", gone);
          }
        }
      }
    } catch (err) {
      problems.push("henrik " + (err.status ?? "?") + " " + String(err?.message ?? err).slice(0, 100));
      console.error("[match-notifier] HenrikDev", err?.message);
    }
    await admin.from("match_push_state").upsert({ ...next, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
  });
  const skippedNoKey = (people ?? []).filter((person) => !keyById.get(person.id) || !person.riot_name || !person.riot_tag).length;
  return json({ subscribers: userIds.length, checked, reachedHenrik, newMatches, notified, failed, skippedNoKey, problems: problems.slice(0, 5) });
});
