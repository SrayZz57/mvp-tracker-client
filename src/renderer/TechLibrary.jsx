import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, ExternalLink } from 'lucide-react';
import Icon from './Icon.jsx';
import { supabase } from './supabaseClient.js';
import { usePlayerCardArt } from './rankData.js';
import { useAgentIcons } from './agentIcons.js';
import { useMapMinimaps } from './mapImages.js';
import { youtubeEmbedUrl } from './techVideoEmbed.js';
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
// Vidéo hébergée EN EXTERNE (lien collé, pas d'upload) : pas de coût de
// stockage, pas de limite de taille, pas de modération de fichiers à gérer.
// Seul YouTube est intégré en lecteur direct (voir techVideoEmbed.js) ; le
// reste s'ouvre dans le navigateur système.
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

function TechVideo({ url, title }) {
  const embedUrl = youtubeEmbedUrl(url);

  if (embedUrl) {
    return (
      <div className="tech-video-frame">
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // Lien non reconnu (Streamable, Medal.tv, Twitch clip...) : pas de lecteur
  // intégré, on ouvre dans le navigateur système plutôt qu'en iframe.
  return (
    <button type="button" className="tech-video-external" onClick={() => window.electronAPI.openExternal(url)}>
      <Icon icon={ExternalLink} size={16} />
    </button>
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

  async function loadTechs() {
    setLoading(true);
    let query = supabase
      .from('agent_techs')
      .select('id, agent, map, title, video_url, tags, created_at, created_by, author:profiles(display_name, riot_name, riot_tag, avatar_card_uuid)')
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

  const canPublish = Boolean(formAgent && formTitle.trim() && formVideoUrl.trim() && myId);

  async function handlePublish() {
    if (!canPublish) return;
    setPublishing(true);
    setPublishError(null);
    const tags = formTags
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    const { error } = await supabase.from('agent_techs').insert({
      agent: formAgent,
      map: formMap || null,
      title: formTitle.trim(),
      video_url: formVideoUrl.trim(),
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
          <ul className="tech-list">
            {visibleTechs.map((tech) => (
              <li key={tech.id} className="tech-item">
                <TechVideo url={tech.video_url} title={tech.title} />

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

                <div className="comp-published-footer">
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
    </div>
  );
}

export default TechLibrary;
