import { supabase } from '../supabaseClient.js';

// Appels serveur du battle pass. Volontairement fins : toute la logique (XP,
// niveaux, validation) est côté serveur ou dans les modules purs de ce dossier.
// Même convention d'erreur que aimScores.js : on journalise et on renvoie une
// valeur neutre, jamais d'exception jusqu'à l'interface.

async function rpc(name, args, fallback) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    console.error(`[battle-pass] ${name} : ${error.message}`);
    return fallback;
  }
  return data ?? fallback;
}

// La migration SQL n'est pas (encore) appliquée : PostgREST ne connaît pas la
// fonction. L'interface masque alors le battle pass au lieu d'afficher une erreur.
const isMissingFunction = (error) =>
  error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function/i.test(error?.message ?? '');

// Saison en cours selon l'horloge du serveur.
//   { status: 'ok', season }      une saison est en cours
//   { status: 'none' }            entre deux saisons
//   { status: 'unavailable' }     migration non appliquée : fonctionnalité éteinte
//   { status: 'error' }           problème réseau ou serveur
export async function loadCurrentSeason() {
  const { data, error } = await supabase.rpc('bp_current_season');
  if (error) {
    if (isMissingFunction(error)) return { status: 'unavailable' };
    console.error(`[battle-pass] bp_current_season : ${error.message}`);
    return { status: 'error' };
  }
  // Une saison absente peut revenir sous forme d'objet dont tous les champs sont null.
  return data?.id ? { status: 'ok', season: data } : { status: 'none' };
}

// À appeler après chaque score enregistré et à l'ouverture de l'écran du pass.
// Renvoie { status: 'ok', xp_gained, total_xp, level_before, level_after,
// challenges: [...] } ou { status: 'no_season' }, ou null en cas d'erreur.
export const awardXp = (seasonId = null) => rpc('bp_award_xp', { p_season: seasonId }, null);

// Défis en cours avec la progression du joueur (valeur, complété, attribué).
export const loadMyChallenges = (seasonId = null) => rpc('bp_my_challenges', { p_season: seasonId }, []);

export const loadMyXp = (seasonId) => rpc('bp_my_xp', { p_season: seasonId }, 0);

// Renvoie true si la récompense vient d'être réclamée, false si elle l'était
// déjà, null si le serveur la refuse (niveau insuffisant…).
export const claimReward = (seasonId, rewardId) =>
  rpc('bp_claim_reward', { p_season: seasonId, p_reward: rewardId }, null);

// kind : 'title' | 'card' | 'icon' ; rewardId = null pour retirer.
export async function equipCosmetic(kind, rewardId = null) {
  const { error } = await supabase.rpc('bp_equip', { p_kind: kind, p_reward: rewardId });
  if (error) {
    console.error(`[battle-pass] bp_equip : ${error.message}`);
    return false;
  }
  return true;
}

// Toutes les récompenses réclamées, toutes saisons confondues : sert à savoir
// quels skins le joueur possède, même ceux d'une saison passée.
export async function loadAllMyClaims() {
  const { data, error } = await supabase.from('bp_claims').select('season_id, reward_id');
  if (error) {
    console.error(`[battle-pass] lecture des réclamations : ${error.message}`);
    return null;
  }
  return data ?? [];
}

// Cosmétiques publics actuellement équipés (titre, carte, icône).
export async function loadMyEquipped(userId) {
  if (!userId) return {};
  const { data, error } = await supabase.from('profiles').select('title_id, card_id, icon_id').eq('id', userId).maybeSingle();
  if (error) {
    console.error(`[battle-pass] lecture du profil : ${error.message}`);
    return {};
  }
  return data ?? {};
}
