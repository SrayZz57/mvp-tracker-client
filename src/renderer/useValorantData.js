import { useEffect, useRef, useState } from 'react';

function useValorantData(settings) {
  const [matches, setMatches] = useState([]);
  const [pingSamples, setPingSamples] = useState([]);
  const [rank, setRank] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Incrémenté à chaque changement de profil suivi. Une requête réseau lancée
  // pour un profil précédent peut répondre APRÈS que l'utilisateur soit déjà
  // passé à un autre profil (ex. rate limit qui retarde la réponse) — sans ce
  // garde-fou, cette réponse tardive écraserait l'affichage du nouveau profil
  // avec les données de l'ancien.
  const requestIdRef = useRef(0);

  // Chrono anti-spam sur le clic manuel du bouton "Rafraîchir" (voir
  // manualRefresh plus bas) — n'affecte pas les rechargements automatiques
  // (montage, changement de profil suivi), qui appellent refresh()
  // directement. Seule l'heure de fin est gardée ici : le décompte affiché
  // chaque seconde vit dans le bouton lui-même (RefreshButton, App.jsx) —
  // avant, ce tick faisait refaire le rendu de TOUTE l'app chaque seconde
  // pendant la minute de chrono.
  const [refreshCooldownUntil, setRefreshCooldownUntil] = useState(0);
  const REFRESH_COOLDOWN_MS = 60000;

  const refresh = async () => {
    if (!settings) return;
    const requestId = requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const { matches: freshMatches, rank: freshRank } = await window.electronAPI.getMatches(settings);
      const pingData = await window.electronAPI.getPingSamples();
      if (requestId !== requestIdRef.current) return;
      setMatches(freshMatches || []);
      setRank(freshRank);
      setPingSamples(pingData);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err.message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!settings) return;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    // Vide tout de suite (synchrone) avant même de relire le cache — sinon,
    // le temps que les appels async ci-dessous répondent, le nom affiché en
    // haut peut déjà être le nouveau pendant que la photo/le rang à l'écran
    // sont encore ceux du profil précédent.
    setMatches([]);
    setRank(null);
    // Recharge le cache local puis relance une recherche en direct dès que le
    // profil suivi change (nouvelle recherche depuis la barre du haut).
    window.electronAPI.getCachedMatches().then((cached) => {
      if (requestId === requestIdRef.current) setMatches(cached);
    });
    window.electronAPI.getPingSamples().then((samples) => {
      if (requestId === requestIdRef.current) setPingSamples(samples);
    });
    if (settings.puuid) {
      window.electronAPI.getRankFor(settings.puuid).then((cachedRank) => {
        if (requestId === requestIdRef.current) setRank(cachedRank);
      });
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.name, settings?.tag]);

  // Version exposée au bouton "Rafraîchir" — refuse de relancer une requête
  // tant que le chrono n'est pas écoulé, plutôt que de compter uniquement sur
  // le disabled du bouton côté App.jsx (defense en profondeur).
  const manualRefresh = () => {
    if (Date.now() < refreshCooldownUntil) return;
    setRefreshCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
    refresh();
  };

  return { matches, pingSamples, rank, loading, error, refresh: manualRefresh, refreshCooldownUntil };
}

export default useValorantData;
