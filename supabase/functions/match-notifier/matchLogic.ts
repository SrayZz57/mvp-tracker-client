// @ts-nocheck
// FICHIER GÉNÉRÉ par build.cjs à partir de l'app mobile (matchNormalizer.ts, valorantStats.ts).
// Ne pas modifier ici : régénérer.
// ../mvp-tracker-mobile/src/lib/matchNormalizer.ts
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

// ../mvp-tracker-mobile/src/lib/valorantStats.ts
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
export {
  excludeDeathmatch,
  findMe,
  hitStats,
  matchScore,
  normalizeV4Match,
  resultLabel
};
