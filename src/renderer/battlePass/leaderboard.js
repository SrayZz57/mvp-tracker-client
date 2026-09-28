import { supabase } from '../supabaseClient.js';
import { PROFILE_FIELDS } from '../friendsShared.jsx';

// Classement de saison ou global (phase 6 du battle pass). Le calcul (Aim
// Rating) est entièrement fait côté serveur par `bp_leaderboard` — voir
// sql/battle_pass_leaderboard.sql pour le pourquoi. Ici on appelle la fonction
// puis on va chercher les profils correspondants, comme pour les classements
// d'amis existants (aimScores.js) : la RPC ne connaît que des ids.
//
// scope : 'season' | 'global'. Renvoie [] si la fonction n'existe pas encore
// (migration non appliquée) plutôt que de planter l'écran.
export async function loadLeaderboard(scope, limit = 10) {
  const { data, error } = await supabase.rpc('bp_leaderboard', { p_scope: scope, p_limit: limit });
  if (error) {
    if (error.code !== 'PGRST202' && error.code !== '42883') {
      console.error(`[battle-pass] classement (${scope}) : ${error.message}`);
    }
    return [];
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.user_id);
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select(`${PROFILE_FIELDS}, title_id, card_id`)
    .in('id', ids);
  if (profileError) {
    console.error(`[battle-pass] profils du classement (${scope}) : ${profileError.message}`);
  }
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((row) => ({ ...row, profile: byId.get(row.user_id) ?? null }));
}
