import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Download, Check } from 'lucide-react';
import { toBlob, toPng } from 'html-to-image';
import Icon from './Icon.jsx';
import logoText from '../assets/logo-text.png';
import { useAgentIcons, useAgentPortraits } from './agentIcons.js';
import { usePlayerCardArt, useRankTiers } from './rankData.js';
import { computePlayerProfile } from './playerProfile.js';
import { excludeDeathmatch, formStats, groupStats, kastStats, overallHsPercent } from './valorantStats.js';

// Bannière choisie dans « Personnaliser mon profil » : gardée sur l'appareil, sous
// une clé partagée avec la page Mon compte pour que la carte et la page suivent
// toujours le même choix.
export const profileBannerKey = (profile) => `mvptracker-profile-banner:${profile?.id ?? profile?.riot_puuid ?? 'me'}`;

export const SHARE_CARD_INTRO_KEY = 'mvptracker-share-card-intro-seen';

const pct = (value, digits = 0) => (value === null || value === undefined ? '—' : `${value.toFixed(digits)}%`);

// Carte affichée et exportée en image : purement visuelle, elle ne calcule rien
// (voir ShareProfileModal). Taille fixe (800×450) pour que l'image partagée soit
// identique quel que soit l'écran de celui qui l'exporte.
export function ProfileCardView({ data }) {
  const { t } = useTranslation();
  const color = data.tierColor || '#ff4655';

  return (
    <div
      className="sp-card"
      style={{
        '--rank-color': color,
        backgroundImage: data.bannerUrl ? `url(${data.bannerUrl})` : undefined,
      }}
    >
      <div className="sp-shade" />
      <div className="sp-agent-panel" />
      <div className="sp-agent-edge" />
      {data.agentName && (
        <span
          className="sp-agent-ghost"
          aria-hidden="true"
          style={{ fontSize: Math.min(120, Math.round(320 / (data.agentName.length * 0.62))) }}
        >
          {data.agentName}
        </span>
      )}
      {data.agentPortrait && <img className="sp-agent-art" src={data.agentPortrait} alt="" crossOrigin="anonymous" />}
      <div className="sp-foot-fade" />

      <div className="sp-content">
        <div className="sp-head">
          {data.avatarUrl && <img className="sp-avatar" src={data.avatarUrl} alt="" crossOrigin="anonymous" />}
          <div className="sp-id">
            <h2 className="sp-name">
              {data.name}
              <span className="sp-tag">#{data.tag}</span>
            </h2>
            <span className="sp-eyebrow">{t('shareCard.playerType')}</span>
            <span className="sp-type">{data.archetypeTitle ?? t('shareCard.typePending')}</span>
          </div>
        </div>

        <div className="sp-rank">
          {data.tierIcon && <img className="sp-rank-icon" src={data.tierIcon} alt="" crossOrigin="anonymous" />}
          <div className="sp-rank-body">
            <span className="sp-eyebrow">{t('shareCard.rank')}</span>
            <span className="sp-rank-name" style={{ color }}>{data.rankName ?? t('shareCard.unranked')}</span>
            {data.rr !== null && (
              <span className="sp-rr">
                <strong>{data.rr}</strong> RR
              </span>
            )}
            {data.rr !== null && (
              <span className="sp-rr-track">
                <span style={{ width: `${Math.min(100, data.rr)}%`, background: color }} />
              </span>
            )}
          </div>
        </div>

        <div className="sp-figures">
          <div className="sp-figure">
            <span className="sp-figure-label">{t('shareCard.kd')}</span>
            <span className="sp-figure-value">{data.kd === null ? '—' : data.kd.toFixed(2)}</span>
          </div>
          <div className="sp-figure">
            <span className="sp-figure-label">{t('shareCard.accuracy')}</span>
            <span className="sp-figure-value">{pct(data.hsPercent)}</span>
          </div>
          <div className="sp-figure">
            <span className="sp-figure-label">{t('shareCard.kast')}</span>
            <span className="sp-figure-value">{pct(data.kast)}</span>
          </div>
        </div>

        <div className="sp-foot">
          <div className="sp-fav">
            {data.agentIcon && <img src={data.agentIcon} alt="" crossOrigin="anonymous" />}
            <span>
              <em>{t('shareCard.favoriteAgent')}</em>
              {data.agentName ?? '—'}
            </span>
          </div>
          <span className="sp-games">{t('shareCard.matches', { count: data.matchesCount })}</span>
          <img className="sp-logo" src={logoText} alt="MVP Tracker" />
        </div>
      </div>
    </div>
  );
}

// Fenêtre de partage : calcule les chiffres à partir des vraies parties du
// joueur, affiche la carte, et l'exporte en PNG (téléchargement ou presse-papiers).
function ShareProfileModal({ profile, settings, matches, rank, avatarUrl, bannerUrl, intro = false, onClose }) {
  const { t } = useTranslation();
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(null); // null | 'download' | 'copy'
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const rankTiers = useRankTiers();
  const portraits = useAgentPortraits();
  const icons = useAgentIcons();

  const data = useMemo(() => {
    const ranked = excludeDeathmatch(matches ?? []);
    const tier = rank ? rankTiers.get(rank.tierId) : null;
    const agentRows = groupStats(ranked, settings.name, settings.tag, (match, me) => me.character);
    const favorite = profile?.main_agent || agentRows[0]?.key || null;
    const player = computePlayerProfile(matches ?? [], settings.name, settings.tag);
    return {
      name: profile?.display_name || settings.name,
      tag: settings.tag,
      avatarUrl,
      bannerUrl,
      tierIcon: tier?.icon ?? null,
      tierColor: tier?.color ?? null,
      rankName: rank?.tierName ?? null,
      rr: rank?.rr ?? null,
      kd: formStats(ranked, settings.name, settings.tag).overallKd,
      hsPercent: overallHsPercent(ranked, settings.name, settings.tag),
      kast: kastStats(ranked, settings.name, settings.tag),
      agentName: favorite,
      agentIcon: favorite ? icons.get(favorite) ?? null : null,
      agentPortrait: favorite ? portraits.get(favorite) ?? null : null,
      archetypeTitle: player.ready ? t(`profile.archetypes.${player.archetype}.title`) : null,
      matchesCount: ranked.length,
    };
  }, [matches, settings, profile, rank, rankTiers, portraits, icons, avatarUrl, bannerUrl, t]);

  const run = async (kind, action) => {
    if (!cardRef.current || busy) return;
    setBusy(kind);
    setError(false);
    try {
      await action(cardRef.current);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  const download = () =>
    run('download', async (node) => {
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `mvp-profil-${settings.name}.png`;
      link.click();
    });

  const copy = () =>
    run('copy', async (node) => {
      const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card sp-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>{t('detail.close')}</button>
        <h3 className="sp-modal-title">{t('shareCard.title')}</h3>
        <p className="label">{t('shareCard.hint')}</p>
        {intro && <p className="sp-intro">{t('shareCard.intro')}</p>}

        <div className="sp-card-wrap">
          <div ref={cardRef} className="sp-card-export">
            <ProfileCardView data={data} />
          </div>
        </div>

        <div className="sp-actions">
          <button type="button" className="refresh" onClick={download} disabled={busy !== null}>
            <Icon icon={Download} size={16} /> {busy === 'download' ? t('shareCard.exporting') : t('shareCard.download')}
          </button>
          <button type="button" className="account-forgot-password" onClick={copy} disabled={busy !== null}>
            <Icon icon={copied ? Check : Copy} size={15} /> {copied ? t('shareCard.copied') : t('shareCard.copy')}
          </button>
        </div>
        {error && <p className="warning">{t('shareCard.error')}</p>}
      </div>
    </div>
  );
}

// Ouverture automatique une seule fois, après la mise à jour qui ajoute la carte :
// retrouve lui-même la photo et la bannière du joueur (l'appelant n'a que le profil).
export function ShareCardIntro({ profile, settings, matches, rank, onClose }) {
  const avatarUuid = profile?.avatar_card_uuid ?? rank?.cardUuid;
  const avatarArt = usePlayerCardArt(avatarUuid);
  let bannerUuid = null;
  try {
    bannerUuid = localStorage.getItem(profileBannerKey(profile));
  } catch {
    // stockage indisponible : la bannière suit la photo
  }
  const bannerArt = usePlayerCardArt(bannerUuid ?? avatarUuid);
  return (
    <ShareProfileModal
      intro
      profile={profile}
      settings={settings}
      matches={matches}
      rank={rank}
      avatarUrl={avatarArt.icon}
      bannerUrl={bannerArt.banner}
      onClose={onClose}
    />
  );
}

export default ShareProfileModal;
