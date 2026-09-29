import { attackerTeamByRound } from './valorantStats.js';

// Timeline d'un match, round par round, du point de vue du joueur suivi : issue,
// score cumulé, camp, économie des deux équipes, chronologie des kills, pose et
// désamorçage du spike, puis les « moments clés » (clutchs, multi-kills, séries,
// rounds éco gagnés). Logique pure, testée dans roundTimeline.test.mjs.

export const STREAK_MIN = 3;
const HALF_MODES = ['competitive', 'unrated'];
const HALF_SIZE = 12;

// Type d'achat d'une équipe d'après la valeur moyenne de l'équipement par
// joueur. Seuils approximatifs (Riot ne publie pas de catégorie d'achat) : c'est
// une lecture indicative, pas une donnée officielle.
export function classifyBuy(avgLoadout, roundIndex, halfMode) {
  if (roundIndex === 0 || (halfMode && roundIndex === HALF_SIZE)) return 'pistol';
  if (avgLoadout === null) return null;
  if (avgLoadout < 1600) return 'eco';
  if (avgLoadout < 3600) return 'semi';
  return 'full';
}

function teamLoadout(playerStats, team) {
  const values = playerStats
    .filter((ps) => ps.player_team === team && typeof ps.economy?.loadout_value === 'number')
    .map((ps) => ps.economy.loadout_value);
  if (values.length === 0) return { total: null, avg: null };
  const total = values.reduce((sum, v) => sum + v, 0);
  return { total, avg: total / values.length };
}

// Rejoue les kills du round dans l'ordre : le joueur a-t-il été le dernier
// vivant de son équipe face à au moins un adversaire ? Renvoie le nombre
// d'adversaires encore en vie à ce moment-là (0 = pas de clutch).
function clutchOpponents(playerStats, sortedKills, me) {
  const mates = new Set(playerStats.filter((ps) => ps.player_team === me.team).map((ps) => ps.player_puuid));
  if (!mates.has(me.puuid)) return 0;
  const enemies = new Set(playerStats.filter((ps) => ps.player_team !== me.team).map((ps) => ps.player_puuid));
  let versus = 0;
  sortedKills.forEach((k) => {
    mates.delete(k.victim_puuid);
    enemies.delete(k.victim_puuid);
    if (!versus && mates.size === 1 && mates.has(me.puuid) && enemies.size >= 1) versus = enemies.size;
  });
  return versus;
}

const shortName = (displayName) => (displayName ?? '').split('#')[0];

export function buildTimeline(match, me) {
  const rounds = match?.rounds ?? [];
  if (!me?.puuid || !me?.team || rounds.length === 0) return null;

  const halfMode = HALF_MODES.includes(match.metadata?.mode_id);
  const attackers = attackerTeamByRound(match);
  const agentOf = new Map((match.players?.all_players ?? []).map((p) => [p.puuid, p.character ?? null]));

  let myScore = 0;
  let enemyScore = 0;
  const out = rounds.map((round, index) => {
    const playerStats = round.player_stats ?? [];
    const kills = playerStats.flatMap((ps) => ps.kill_events ?? []).sort((a, b) => (a.kill_time_in_round ?? 0) - (b.kill_time_in_round ?? 0));
    const won = round.winning_team === me.team;
    if (won) myScore += 1;
    else enemyScore += 1;

    const myKills = kills.filter((k) => k.killer_puuid === me.puuid && k.victim_puuid !== me.puuid && k.victim_team !== me.team);
    const died = kills.some((k) => k.victim_puuid === me.puuid);
    const mine = playerStats.find((ps) => ps.player_puuid === me.puuid);
    const attacker = attackers[index];
    const side = attacker == null ? null : attacker === me.team ? 'attack' : 'defense';

    const myEco = teamLoadout(playerStats, me.team);
    const enemyTeam = me.team === 'Red' ? 'Blue' : 'Red';
    const enemyEco = teamLoadout(playerStats, enemyTeam);
    const myBuy = classifyBuy(myEco.avg, index, halfMode);
    const enemyBuy = classifyBuy(enemyEco.avg, index, halfMode);

    const events = kills.map((k) => ({
      type: 'kill',
      time: k.kill_time_in_round ?? 0,
      killerName: shortName(k.killer_display_name),
      killerAgent: agentOf.get(k.killer_puuid) ?? null,
      victimName: shortName(k.victim_display_name),
      victimAgent: agentOf.get(k.victim_puuid) ?? null,
      weapon: k.damage_weapon_name ?? null,
      self: k.killer_puuid === k.victim_puuid,
      allyKill: k.killer_team === me.team,
      byMe: k.killer_puuid === me.puuid,
      onMe: k.victim_puuid === me.puuid,
    }));
    if (round.plant_events) {
      events.push({
        type: 'plant',
        time: round.plant_events.plant_time_in_round ?? 0,
        by: shortName(round.plant_events.planted_by?.display_name),
        site: round.plant_events.plant_site ?? null,
        allyAction: round.plant_events.planted_by?.team === me.team,
      });
    }
    if (round.defuse_events) {
      events.push({
        type: 'defuse',
        time: round.defuse_events.defuse_time_in_round ?? 0,
        by: shortName(round.defuse_events.defused_by?.display_name),
        allyAction: round.defuse_events.defused_by?.team === me.team,
      });
    }
    events.sort((a, b) => a.time - b.time);

    const first = kills[0];
    const clutchVs = clutchOpponents(playerStats, kills, me);

    return {
      index,
      won,
      endType: round.end_type ?? null,
      side,
      score: { me: myScore, enemy: enemyScore },
      diff: myScore - enemyScore,
      halfAfter: halfMode && index === HALF_SIZE - 1 && rounds.length > HALF_SIZE,
      economy: { me: myEco.total, enemy: enemyEco.total, myBuy, enemyBuy },
      kills: myKills.length,
      damage: mine?.damage ?? null,
      score_points: mine?.score ?? null,
      died,
      firstBlood: first ? { byMe: first.killer_puuid === me.puuid, onMe: first.victim_puuid === me.puuid, allyKill: first.killer_team === me.team } : null,
      clutch: clutchVs > 0 ? { versus: clutchVs, won } : null,
      ace: myKills.length >= 5,
      multiKill: myKills.length >= 3 && myKills.length < 5 ? myKills.length : 0,
      ecoWin: won && (myBuy === 'eco' || myBuy === 'semi') && enemyBuy === 'full',
      events,
    };
  });

  // Séries d'issues identiques (rounds gagnés ou perdus d'affilée).
  let runStart = 0;
  for (let i = 1; i <= out.length; i += 1) {
    if (i === out.length || out[i].won !== out[runStart].won) {
      const length = i - runStart;
      for (let j = runStart; j < i; j += 1) out[j].run = { length, position: j - runStart + 1, won: out[runStart].won };
      runStart = i;
    }
  }

  return { rounds: out, moments: buildMoments(out), momentum: [0, ...out.map((r) => r.diff)] };
}

// Moments marquants, dans l'ordre des rounds.
function buildMoments(rounds) {
  const moments = [];
  rounds.forEach((r) => {
    if (r.run.position === 1 && r.run.length >= STREAK_MIN) {
      moments.push({ kind: 'streak', round: r.index, length: r.run.length, won: r.run.won });
    }
    if (r.ace) moments.push({ kind: 'ace', round: r.index });
    else if (r.multiKill) moments.push({ kind: 'multi', round: r.index, count: r.multiKill });
    if (r.clutch) moments.push({ kind: 'clutch', round: r.index, versus: r.clutch.versus, won: r.clutch.won });
    if (r.ecoWin) moments.push({ kind: 'ecoWin', round: r.index });
  });
  return moments;
}
