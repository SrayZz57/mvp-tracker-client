// Clé API HenrikDev du joueur connecté. Elle vit dans la table PRIVÉE `profile_secrets`
// (voir sql/profile_secrets.sql), plus dans `profiles` : tous les joueurs connectés
// peuvent lire les profils des autres, donc la clé ne doit pas y rester.
//
// Repli sur l'ancienne colonne `profiles.henrikdev_api_key` tant que la table n'existe
// pas (base pas encore migrée), pour que l'app continue de marcher dans les deux cas.

// 42P01 = table inconnue (Postgres), PGRST205 = table absente du cache de PostgREST.
const tableMissing = (error) => error && (error.code === '42P01' || error.code === 'PGRST205');

export async function loadOwnApiKey(supabase, userId) {
  const { data, error } = await supabase.from('profile_secrets').select('henrikdev_api_key').eq('user_id', userId).maybeSingle();
  if (!error) return data?.henrikdev_api_key ?? null;
  if (!tableMissing(error)) {
    console.error('[profile_secrets] lecture impossible :', error.message);
    return null;
  }
  const legacy = await supabase.from('profiles').select('henrikdev_api_key').eq('id', userId).maybeSingle();
  return legacy.data?.henrikdev_api_key ?? null;
}

// Enregistre (ou efface, si `key` est vide) la clé du joueur connecté. Renvoie true si c'est fait.
export async function saveOwnApiKey(supabase, userId, key) {
  const trimmed = (key ?? '').trim();
  const res = trimmed
    ? await supabase.from('profile_secrets').upsert({ user_id: userId, henrikdev_api_key: trimmed, updated_at: new Date().toISOString() })
    : await supabase.from('profile_secrets').delete().eq('user_id', userId);
  if (!res.error) return true;
  if (!tableMissing(res.error)) {
    console.error('[profile_secrets] enregistrement impossible :', res.error.message);
    return false;
  }
  const legacy = await supabase.from('profiles').update({ henrikdev_api_key: trimmed || null }).eq('id', userId);
  return !legacy.error;
}
