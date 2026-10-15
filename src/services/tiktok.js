// Résolution des liens TikTok pour le lecteur intégré (voir clipEmbed.js).
//
// Le lecteur TikTok n'accepte que l'identifiant numérique de la vidéo
// (`tiktok.com/embed/v2/{id}`). Un lien copié depuis l'app mobile est un lien
// COURT (vm.tiktok.com/XXXX, tiktok.com/t/XXXX) qui n'expose pas cet
// identifiant : on le résout ici, une seule fois à la publication, vers
// l'adresse complète `tiktok.com/@auteur/video/{id}`, qui est celle stockée en
// base. Fonctionne côté process principal (Node n'a pas la restriction CORS
// qui bloquerait ces appels dans le renderer).
//
// La miniature renvoyée par l'oEmbed TikTok est une URL signée qui EXPIRE au
// bout d'environ 48 h (paramètre x-expires, vérifié) : on ne la renvoie donc
// volontairement pas, un lien mort s'afficherait comme une image cassée. Le
// fil affiche une plaque « TikTok » à la place.

const TIKTOK_URL = /^https?:\/\/(?:(?:www|m|vm|vt)\.)?tiktok\.com\//i;
const FULL_VIDEO_URL = /^(https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+)/i;

export function isTikTokUrl(url) {
  return typeof url === 'string' && TIKTOK_URL.test(url.trim());
}

/**
 * @returns {Promise<{ video: null, thumbnail: null, canonicalUrl: string|null }>}
 * `canonicalUrl` est l'adresse complète de la vidéo, ou null si elle n'a pas pu
 * être déterminée (lien invalide, vidéo supprimée, TikTok injoignable).
 */
export async function resolveTikTokMetadata(url, fetchImpl = fetch) {
  const result = { video: null, thumbnail: null, canonicalUrl: null };
  const headers = { 'User-Agent': 'Mozilla/5.0' };
  const link = url.trim();

  // 1) Lien déjà complet : rien à résoudre.
  const full = link.match(FULL_VIDEO_URL);
  if (full) {
    result.canonicalUrl = full[1];
    return result;
  }

  // 2) oEmbed officiel : donne l'auteur et l'identifiant, même pour un lien court.
  try {
    const res = await fetchImpl(`https://www.tiktok.com/oembed?url=${encodeURIComponent(link)}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const json = await res.json();
      const id = json.embed_product_id ?? json.html?.match(/data-video-id="(\d+)"/)?.[1];
      if (id && json.author_url) {
        result.canonicalUrl = `${json.author_url}/video/${id}`;
        return result;
      }
    }
  } catch {
    // On tente le suivi de redirection juste après.
  }

  // 3) Repli : suivre la redirection du lien court jusqu'à l'adresse complète.
  try {
    const res = await fetchImpl(link, { redirect: 'follow', headers, signal: AbortSignal.timeout(10000) });
    const landed = res.url?.match(FULL_VIDEO_URL);
    if (landed) result.canonicalUrl = landed[1];
  } catch {
    // Lien injoignable : canonicalUrl reste null.
  }
  return result;
}
