import { useEffect, useMemo, useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';
import Icon from './Icon.jsx';
import { clipEmbedUrl, clipThumbnailUrl, CLIP_PLATFORMS } from './clipEmbed.js';

// =============================================================================
// LECTEUR VIDÉO PARTAGÉ — utilisé par ClipsFeed.jsx (Clips) et TechLibrary.jsx
// (Lineups), les deux modules qui intègrent des vidéos externes (YouTube/
// Medal.tv/Streamable). Extrait ici pour que les deux se comportent
// EXACTEMENT pareil (miniature avant lecture, lecteur natif pour Medal) —
// demandé en vrai après que Lineups soit resté sur son ancien comportement
// (iframe montée d'office, pas de vue en grand) pendant que Clips évoluait.
// =============================================================================

// Miniature non-interactive : vraie image pour YouTube (déduite de l'id,
// sans appel réseau) et pour Medal/Streamable si une `thumbnailUrl` a été
// résolue à la publication (voir clips:resolve-clip-metadata côté main.js),
// sinon repli sur une plaque avec le nom de la plateforme. Cliquer dessus
// n'est PAS géré ici — c'est au composant appelant (la carte du fil) de
// décider quoi faire au clic (typiquement ouvrir une vue en grand), pour ne
// jamais monter de vidéo juste en faisant défiler une liste.
export function VideoThumbnail({ url, platform, thumbnailUrl, t }) {
  const youtubeThumbnail = useMemo(() => clipThumbnailUrl(url), [url]);
  const thumbnail = youtubeThumbnail ?? thumbnailUrl;

  return (
    <div className="clip-video-thumb" style={thumbnail ? { backgroundImage: `url(${thumbnail})` } : undefined}>
      {!thumbnail && <span className="clip-video-platform">{t(CLIP_PLATFORMS[platform]?.labelKey ?? platform)}</span>}
      <span className="clip-video-play"><Icon icon={Play} size={26} /></span>
    </div>
  );
}

// Medal.tv refuse d'être intégré en iframe (x-frame-options: SAMEORIGIN,
// vérifié) — mais expose un lien MP4 direct dans ses balises Open Graph
// (même mécanisme que Discord utilise pour lire les clips Medal dans ses
// propres embeds). Résolu à la demande via le process principal (voir
// clips:resolve-clip-metadata dans main.js — un lien signé, propre à
// chaque requête, donc jamais mis en cache côté renderer).
function MedalVideoPlayer({ url, t }) {
  const [videoUrl, setVideoUrl] = useState(undefined); // undefined = en cours, null = échec

  useEffect(() => {
    let cancelled = false;
    setVideoUrl(undefined);
    // Repli sur `null` (échec) plutôt que de rester sur "Chargement..." pour
    // de bon si jamais l'IPC n'existe pas encore côté fenêtre courante (un
    // ajout côté preload ne prend effet qu'après un vrai redémarrage complet
    // de l'app, pas juste un rechargement de la fenêtre).
    if (!window.electronAPI?.resolveClipMetadata) {
      setVideoUrl(null);
      return undefined;
    }
    window.electronAPI
      .resolveClipMetadata(url)
      .then((resolved) => {
        if (!cancelled) setVideoUrl(resolved?.video ?? null);
      })
      .catch(() => {
        if (!cancelled) setVideoUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (videoUrl === undefined) {
    return <div className="clip-video-external-cta">{t('clips.loading')}</div>;
  }

  if (videoUrl) {
    return (
      <div className="clip-video-frame clip-video-frame-large">
        {/* muted : Chromium bloque l'autoplay non muet, ce qui laisse la
            vidéo figée sur sa première image sans qu'on comprenne pourquoi —
            son coupé au départ, réactivable d'un clic sur les contrôles. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- clip perso, pas de sous-titres à fournir */}
        <video src={videoUrl} controls autoPlay muted />
      </div>
    );
  }

  // Résolution ratée (page introuvable, balises absentes...) : repli sur
  // l'ouverture externe plutôt qu'un lecteur cassé.
  return (
    <button type="button" className="clip-video-external-cta" onClick={() => window.electronAPI.openExternal(url)}>
      <Icon icon={ExternalLink} size={22} />
      {t('clips.openExternalHint')}
    </button>
  );
}

// Lecteur en grand (vue détail) : iframe pour YouTube/Streamable (s'intègre
// sans restriction, vérifié), lecteur natif via MedalVideoPlayer pour
// Medal.tv (voir plus haut).
export function VideoPlayer({ url, platform, title, t }) {
  const embedUrl = useMemo(() => clipEmbedUrl(url), [url]);

  if (embedUrl) {
    return (
      <div className="clip-video-frame clip-video-frame-large">
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (platform === 'medal') return <MedalVideoPlayer url={url} t={t} />;

  return (
    <button type="button" className="clip-video-external-cta" onClick={() => window.electronAPI.openExternal(url)}>
      <Icon icon={ExternalLink} size={22} />
      {t('clips.openExternalHint')}
    </button>
  );
}
