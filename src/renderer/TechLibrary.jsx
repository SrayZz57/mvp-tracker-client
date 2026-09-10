import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import Icon from './Icon.jsx';
import { supabase } from './supabaseClient.js';
import { usePlayerCardArt } from './rankData.js';
import { useAgentIcons } from './agentIcons.js';
import { useMapMinimaps } from './mapImages.js';
import { detectClipPlatform, CLIP_PLATFORMS } from './clipEmbed.js';
import { VideoThumbnail, VideoPlayer } from './VideoPlayer.jsx';
import CollapsibleCard from './CollapsibleCard.jsx';

// =============================================================================
// LINEUPS — BIBLIOTHÈQUE DE TECHS COMMUNAUTAIRES (onglet Outils à part)
//
// Demandé sur Discord (Mausquita) : un espace pour partager des lineups/one
// ways/combos en courte vidéo, filtrable par agent/map/mots-clés, ouvert à
// toute la communauté. Même mécanique que les compositions publiées
// (CompositionBuilder.jsx) — table Supabase avec RLS, auteur lié au profil,
// suppression par son propre auteur ou un admin — juste appliquée à des
// vidéos plutôt qu'à des compositions d'équipe.
//
// Vidéo hébergée EN EXTERNE (lien collé, pas d'upload) — même lecteur que
// le module Clips (YouTube/Medal.tv/Streamable, voir VideoPlayer.jsx et
// clipEmbed.js) : miniature avant lecture, vue en grand au clic sur une
// carte, lecteur natif pour Medal.tv (leur page refuse l'iframe).
// =============================================================================

// Même schéma que CompositionAuthor (CompositionBuilder.jsx) : avatar + nom
// réel du compte MVP Tracker, pas un pseudo saisi à la main.
function TechAuthor({ author }) {
  const avatarArt = usePlayerCardArt(author?.avatar_card_uuid);
  if (!author) return null;
  const name = author.display_name || (author.riot_name ? `${author.riot_name}#${author.riot_tag}` : null);
  if (!name) return null;

  return (
    <span className="comp-published-author">
      {avatarArt.icon ? (
        <img src={avatarArt.icon} alt="" className="comp-published-author-avatar" />
      ) : (
        <span className="comp-published-author-avatar comp-published-author-fallback">{name.charAt(0)}</span>
      )}
      {name}
    </span>
  );
}

// Vue en grand, ouverte au clic sur une carte du fil — même principe que
// ClipDetailModal (ClipsFeed.jsx), sans les fonctionnalités sociales
// (likes/commentaires/signalement) qui n'existent que pour Clips.
function TechDetailModal({ tech, myId, isAdmin, onDelete, onClose, agentIcons, t }) {
  const platform = useMemo(() => detectClipPlatform(tech.video_url), [tech.video_url]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card clip-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>{t('clips.close')}</button>

        <VideoPlayer url={tech.video_url} platform={platform} title={tech.title} t={t} />

        <div className="tech-item-header">
          <span className="tech-item-agent">
            {agentIcons.get(tech.agent) && <img src={agentIcons.get(tech.agent)} alt="" />}
            {tech.agent}
          </span>
          {tech.map && <span className="comp-published-map">{tech.map}</span>}
        </div>

        <h2 className="clip-detail-title">{tech.title}</h2>

        {tech.tags?.length > 0 && (
          <div className="tech-item-tags">
            {tech.tags.map((tag) => (
              <span key={tag} className="tech-tag">{tag}</span>
            ))}
          </div>
        )}

        <div className="comp-published-footer">
          <TechAuthor author={tech.author} />
          {(tech.created_by === myId || isAdmin) && (
            <button
              type="button"
              className="strategy-tool icon-only danger"
              title={t(tech.created_by === myId ? 'lineups.deleteOwn' : 'lineups.deleteAdmin')}
              onClick={() => {
                onDelete(tech.id);
                onClose();
              }}
            >
              <Icon icon={Trash2} size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TechLibrary({ myId, isAdmin }) {
  const { t } = useTranslation();
  const agentIcons = useAgentIcons();
  const minimaps = useMapMinimaps();
  const agentNames = useMemo(() => [...agentIcons.keys()].sort(), [agentIcons]);
  const mapNames = useMemo(() => [...minimaps.keys()].sort(), [minimaps]);

  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailTechId, setDetailTechId] = useState(null);
  const detailTech = techs.find((tech) => tech.id === detailTechId) ?? null;

  // Filtres de la liste — indépendants du formulaire de publication.
  const [agentFilter, setAgentFilter] = useState('');
  const [mapFilter, setMapFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  // Formulaire de publication.
  const [formAgent, setFormAgent] = useState('');
  const [formMap, setFormMap] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formVideoUrl, setFormVideoUrl] = useState('');
  const [formTags, setFormTags] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);

  const detectedPlatform = useMemo(() => detectClipPlatform(formVideoUrl), [formVideoUrl]);

  async function loadTechs() {
    setLoading(true);
    let query = supabase
      .from('agent_techs')
      .select('id, agent, map, title, video_url, thumbnail_url, tags, created_at, created_by, author:profiles(display_name, riot_name, riot_tag, avatar_card_uuid)')
      .order('created_at', { ascending: false })
      .limit(60);
    if (agentFilter) query = query.eq('agent', agentFilter);
    if (mapFilter) query = query.eq('map', mapFilter);
    const { data, error } = await query;
    if (!error) setTechs(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadTechs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentFilter, mapFilter]);

  // Recherche par mot-clé : sur les tags ET le titre, en local — la liste
  // reste petite (60 max déjà côté requête), inutile d'aller-retour serveur
  // à chaque frappe.
  const visibleTechs = useMemo(() => {
    const needle = searchFilter.trim().toLowerCase();
    if (!needle) return techs;
    return techs.filter(
      (tech) =>
        tech.title.toLowerCase().includes(needle) ||
        (tech.tags ?? []).some((tag) => tag.toLowerCase().includes(needle)),
    );
  }, [techs, searchFilter]);

  const canPublish = Boolean(formAgent && formTitle.trim() && detectedPlatform && myId);

  async function handlePublish() {
    if (!canPublish) return;
    setPublishing(true);
    setPublishError(null);
    const tags = formTags
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    // YouTube a une miniature déduite de l'id, sans appel réseau (voir
    // VideoThumbnail) — inutile de la résoudre/stocker. Medal/Streamable
    // n'exposent pas ça dans leur URL : une seule résolution ici, à la
    // publication, plutôt qu'à chaque affichage du fil pour chaque visiteur
    // (même mécanique que le module Clips).
    let thumbnailUrl = null;
    if (detectedPlatform !== 'youtube' && window.electronAPI?.resolveClipMetadata) {
      const metadata = await window.electronAPI.resolveClipMetadata(formVideoUrl.trim());
      thumbnailUrl = metadata?.thumbnail ?? null;
    }

    const { error } = await supabase.from('agent_techs').insert({
      agent: formAgent,
      map: formMap || null,
      title: formTitle.trim(),
      video_url: formVideoUrl.trim(),
      thumbnail_url: thumbnailUrl,
      tags,
      created_by: myId,
    });
    setPublishing(false);
    if (error) {
      setPublishError(error.message);
      return;
    }
    setFormTitle('');
    setFormVideoUrl('');
    setFormTags('');
    // Si le filtre courant correspond déjà à ce qu'on vient de publier, la
    // nouvelle tech doit apparaître sans attendre un changement de filtre.
    if (agentFilter === formAgent && mapFilter === (formMap || '')) {
      loadTechs();
    } else {
      setAgentFilter(formAgent);
      setMapFilter(formMap || '');
    }
  }

  async function handleDelete(id) {
    await supabase.from('agent_techs').delete().eq('id', id);
    loadTechs();
  }

  return (
    <div>
      <div className="card">
        <h3>{t('lineups.title')}</h3>
        <p className="label">{t('lineups.description')}</p>
      </div>

      <CollapsibleCard id="lineups.publish" title={t('lineups.publishTitle')}>
        <p className="label">{t('lineups.publishIntro')}</p>

        <div className="tech-publish-form">
          <select value={formAgent} onChange={(e) => setFormAgent(e.target.value)}>
            <option value="">{t('lineups.chooseAgent')}</option>
            {agentNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select value={formMap} onChange={(e) => setFormMap(e.target.value)}>
            <option value="">{t('lineups.noSpecificMap')}</option>
            {mapNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder={t('lineups.titlePlaceholder')}
            value={formTitle}
            maxLength={80}
            onChange={(e) => setFormTitle(e.target.value)}
          />
          <input
            type="url"
            placeholder={t('lineups.videoUrlPlaceholder')}
            value={formVideoUrl}
            onChange={(e) => setFormVideoUrl(e.target.value)}
          />
          <input
            type="text"
            placeholder={t('lineups.tagsPlaceholder')}
            value={formTags}
            onChange={(e) => setFormTags(e.target.value)}
          />
          <button className="refresh" onClick={handlePublish} disabled={!canPublish || publishing}>
            {publishing ? t('lineups.publishing') : t('lineups.publish')}
          </button>
        </div>

        {formVideoUrl && !detectedPlatform && <p className="warning">{t('clips.unsupportedLink')}</p>}
        {formVideoUrl && detectedPlatform && (
          <p className="label">{t('clips.detectedPlatform', { platform: t(CLIP_PLATFORMS[detectedPlatform].labelKey) })}</p>
        )}
        {!myId && <p className="label">{t('lineups.needAccount')}</p>}
        {publishError && <p className="warning">{publishError}</p>}
      </CollapsibleCard>

      <div className="card">
        <div className="filter-bar">
          <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
            <option value="">{t('lineups.allAgents')}</option>
            {agentNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select value={mapFilter} onChange={(e) => setMapFilter(e.target.value)}>
            <option value="">{t('lineups.allMaps')}</option>
            {mapNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <input
            type="text"
            className="tech-search-input"
            placeholder={t('lineups.searchPlaceholder')}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="label">{t('lineups.loading')}</p>
        ) : visibleTechs.length === 0 ? (
          <p className="label">{t('lineups.empty')}</p>
        ) : (
          <ul className="tech-list clip-list">
            {visibleTechs.map((tech) => (
              <li key={tech.id} className="tech-item clip-item clip-item-clickable" onClick={() => setDetailTechId(tech.id)}>
                <VideoThumbnail
                  url={tech.video_url}
                  platform={detectClipPlatform(tech.video_url)}
                  thumbnailUrl={tech.thumbnail_url}
                  t={t}
                />

                <div className="tech-item-header">
                  <span className="tech-item-agent">
                    {agentIcons.get(tech.agent) && <img src={agentIcons.get(tech.agent)} alt="" />}
                    {tech.agent}
                  </span>
                  {tech.map && <span className="comp-published-map">{tech.map}</span>}
                </div>

                <p className="tech-item-title">{tech.title}</p>

                {tech.tags?.length > 0 && (
                  <div className="tech-item-tags">
                    {tech.tags.map((tag) => (
                      <span key={tag} className="tech-tag">{tag}</span>
                    ))}
                  </div>
                )}

                <div className="comp-published-footer" onClick={(e) => e.stopPropagation()}>
                  <TechAuthor author={tech.author} />
                  {(tech.created_by === myId || isAdmin) && (
                    <button
                      type="button"
                      className="strategy-tool icon-only danger"
                      title={t(tech.created_by === myId ? 'lineups.deleteOwn' : 'lineups.deleteAdmin')}
                      onClick={() => handleDelete(tech.id)}
                    >
                      <Icon icon={Trash2} size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detailTech && (
        <TechDetailModal
          tech={detailTech}
          myId={myId}
          isAdmin={isAdmin}
          onDelete={handleDelete}
          onClose={() => setDetailTechId(null)}
          agentIcons={agentIcons}
          t={t}
        />
      )}
    </div>
  );
}

export default TechLibrary;
