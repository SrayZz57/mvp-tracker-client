import { supabase } from './supabaseClient.js';
import { PROFILE_FIELDS } from './friendsShared.jsx';

// Scores de l'Aim Trainer, par mode. Trois usages :
//  - le record PERSONNEL (meilleur score de l'utilisateur sur ce mode)
//  - le record GÉNÉRAL de l'app (meilleur score tous utilisateurs confondus)
//  - les classements (défi du jour, amis) et l'historique de progression
// Les lignes sont lisibles par tout le monde, mais chacun ne peut écrire que
// les siennes (voir les règles RLS de la table).

export function todayKey() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export async function saveScore(
  userId,
  { mode, score, accuracy, hits, misses, duration, avgReaction, challengeDate = null, dpi = null, sens = null },
) {
  if (!userId) {
    console.error('[aim_trainer_scores] aucun utilisateur : score non enregistré');
    return { ok: false, reason: 'no-user' };
  }
  const { error } = await supabase.from('aim_trainer_scores').insert({
    user_id: userId,
    mode,
    score,
    accuracy,
    hits,
    misses,
    duration,
    avg_reaction: avgReaction,
    challenge_date: challengeDate,
    dpi,
    sens,
  });
  if (error) {
    console.error("[aim_trainer_scores] échec de l'enregistrement :", error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

// Meilleur score de l'utilisateur pour chaque mode, en une seule requête.
export async function loadPersonalBests(userId) {
  if (!userId) return {};
  const { data, error } = await supabase
    .from('aim_trainer_scores')
    .select('mode, score')
    .eq('user_id', userId)
    .order('score', { ascending: false });
  if (error) {
    console.error('[aim_trainer_scores] échec de la lecture des records perso :', error.message);
    return {};
  }
  const bests = {};
  (data ?? []).forEach((row) => {
    if (bests[row.mode] === undefined) bests[row.mode] = row.score;
  });
  return bests;
}

// Meilleur score de TOUS les joueurs pour chaque mode. `aim_trainer_global_bests`
// est une vue côté base : elle ne renvoie que le maximum par mode, jamais la
// liste des scores individuels des autres joueurs.
export async function loadGlobalBests() {
  const { data, error } = await supabase.from('aim_trainer_global_bests').select('mode, best_score');
  if (error) {
    console.error('[aim_trainer_scores] échec de la lecture des records globaux :', error.message);
    return {};
  }
  const bests = {};
  (data ?? []).forEach((row) => {
    bests[row.mode] = row.best_score;
  });
  return bests;
}

// Historique complet de l'utilisateur : sert aux courbes de progression
// (score, temps de réaction, précision) et au calcul de la série de jours
// consécutifs.
export async function loadHistory(userId, limit = 300) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('aim_trainer_scores')
    .select('mode, score, accuracy, avg_reaction, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[aim_trainer_scores] échec de la lecture de l'historique :", error.message);
    return [];
  }
  return data ?? [];
}

// Série de jours consécutifs avec au moins une session, en repartant
// d'aujourd'hui (ou d'hier : une série n'est pas rompue tant que la journée
// en cours n'est pas terminée).
export function computeStreak(history) {
  const days = new Set(history.map((row) => row.created_at.slice(0, 10)));
  if (days.size === 0) return 0;

  const cursor = new Date();
  const key = (d) => d.toISOString().slice(0, 10);
  if (!days.has(key(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(key(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(key(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Classement du défi du jour : meilleur score de chaque joueur sur le défi
// d'aujourd'hui, avec son profil pour l'affichage.
export async function loadDailyLeaderboard(date, limit = 20) {
  const { data, error } = await supabase
    .from('aim_trainer_scores')
    .select(`user_id, score, accuracy, dpi, sens, profiles!inner(${PROFILE_FIELDS})`)
    .eq('challenge_date', date)
    .order('score', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[aim_trainer_scores] échec du classement du jour :', error.message);
    return [];
  }
  // Un joueur peut retenter le défi : on ne garde que sa meilleure tentative.
  const bestByUser = new Map();
  (data ?? []).forEach((row) => {
    if (!bestByUser.has(row.user_id)) bestByUser.set(row.user_id, row);
  });
  return [...bestByUser.values()].slice(0, limit);
}

// Classement entre amis sur un mode donné (soi-même inclus).
export async function loadFriendsLeaderboard(userId, mode) {
  if (!userId) return [];

  const { data: friendships, error: friendsError } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (friendsError) {
    console.error('[aim_trainer_scores] échec de la lecture des amis :', friendsError.message);
    return [];
  }

  const ids = new Set([userId]);
  (friendships ?? []).forEach((f) => {
    ids.add(f.requester_id === userId ? f.addressee_id : f.requester_id);
  });

  const { data, error } = await supabase
    .from('aim_trainer_scores')
    .select(`user_id, score, accuracy, dpi, sens, profiles!inner(${PROFILE_FIELDS})`)
    .eq('mode', mode)
    .in('user_id', [...ids])
    .order('score', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[aim_trainer_scores] échec du classement amis :', error.message);
    return [];
  }

  const bestByUser = new Map();
  (data ?? []).forEach((row) => {
    if (!bestByUser.has(row.user_id)) bestByUser.set(row.user_id, row);
  });
  return [...bestByUser.values()];
}
