import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, MessageSquare, Flag, Trash2, ExternalLink, Send } from 'lucide-react';
import Icon from './Icon.jsx';
import { supabase } from './supabaseClient.js';
import { usePlayerCardArt } from './rankData.js';
import { useAgentIcons } from './agentIcons.js';
import { useMapMinimaps } from './mapImages.js';
import { detectClipPlatform, CLIP_PLATFORMS } from './clipEmbed.js';
import { VideoThumbnail, VideoPlayer } from './VideoPlayer.jsx';
import CollapsibleCard from './CollapsibleCard.jsx';

// =============================================================================
// CLIPS — mini réseau social de highlights
//
// Un fil communautaire de liens vers des clips (YouTube, Medal.tv,
// Streamable) — jamais de vidéo hébergée par nous, juste le lien et ses
// métadonnées. Même mécanique de base que TechLibrary.jsx (Lineups) —
// table Supabase avec RLS, auteur lié au profil — étendue avec likes,
// commentaires et signalements (voir sql/clips.sql).
// =============================================================================

// Même schéma que TechAuthor (TechLibrary.jsx) / CompositionAuthor
// (CompositionBuilder.jsx) : avatar + nom réel du compte MVP Tracker.
function ClipAuthor({ author }) {
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

// Miniature + lecteur vidéo : composants partagés avec TechLibrary.jsx
// (Lineups), voir VideoPlayer.jsx — les deux modules intègrent les mêmes 3
// plateformes de la même façon (miniature avant lecture, lecteur natif pour
// Medal.tv).
const ClipThumbnail = VideoThumbnail;
const ClipPlayer = VideoPlayer;

function ClipComments({ clipId, myId, isAdmin, t }) {
  const [comments, setComments] = useState(null); // null = pas encore chargé
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from('clip_comments')
      .select('id, content, created_at, user_id, author:profiles(display_name, riot_name, riot_tag, avatar_card_uuid)')
      .eq('clip_id', clipId)
      .order('created_at', { ascending: true });
    if (!error) setComments(data ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  async function handlePost() {
    if (!draft.trim() || !myId) return;
    setPosting(true);
    const { error } = await supabase.from('clip_comments').insert({
      clip_id: clipId,
      user_id: myId,
      content: draft.trim(),
    });
    setPosting(false);
    if (!error) {
      setDraft('');
      load();
    }
  }

  async function handleDelete(id) {
    await supabase.from('clip_comments').delete().eq('id', id);
    load();
  }

  return (
    <div className="clip-comments">
      {comments === null ? (
        <p className="label">{t('clips.loading')}</p>
      ) : comments.length === 0 ? (
        <p className="label">{t('clips.noComments')}</p>
      ) : (
        <ul className="clip-comment-list">
          {comments.map((c) => (
            <li key={c.id} className="clip-comment">
              <ClipAuthor author={c.author} />
              <p className="clip-comment-text">{c.content}</p>
              {(c.user_id === myId || isAdmin) && (
                <button type="button" className="strategy-tool icon-only danger" onClick={() => handleDelete(c.id)}>
                  <Icon icon={Trash2} size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {myId && (
        <div className="clip-comment-form">
          <input
            type="text"
            placeholder={t('clips.commentPlaceholder')}
            value={draft}
            maxLength={400}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePost()}
          />
          <button type="button" className="strategy-tool icon-only" disabled={!draft.trim() || posting} onClick={handlePost}>
            <Icon icon={Send} size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// Vue en grand, ouverte au clic sur une carte du fil : lecteur plus large,
// description complète, actions et commentaires. Les commentaires ne vivent
// QUE là (plus de repli/dépli dans la carte compacte) — un fil qui charge
// les commentaires de chaque clip visible d'un coup serait inutilement
// lourd pour une info qu'on ne consulte qu'en ouvrant le clip qui intéresse.
function ClipDetailModal({ clip, myId, isAdmin, liked, reported, onToggleLike, onReport, onDelete, onClose, agentIcons, t }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card clip-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>{t('clips.close')}</button>

        <ClipPlayer url={clip.url} platform={clip.platform} title={clip.title} t={t} />

        <div className="tech-item-header">
          {clip.agent && (
            <span className="tech-item-agent">
              {agentIcons.get(clip.agent) && <img src={agentIcons.get(clip.agent)} alt="" />}
              {clip.agent}
            </span>
          )}
          {clip.map && <span className="comp-published-map">{clip.map}</span>}
        </div>

        <h2 className="clip-detail-title">{clip.title}</h2>
        {clip.description && <p className="clip-description">{clip.description}</p>}

        <div className="clip-actions">
          <button
            type="button"
            className={liked ? 'clip-action-btn liked' : 'clip-action-btn'}
            disabled={!myId}
            onClick={() => onToggleLike(clip)}
            title={t('clips.like')}
          >
            <Icon icon={Heart} size={15} /> {clip.likeCount}
          </button>
          <span className="clip-action-btn clip-action-static">
            <Icon icon={MessageSquare} size={15} /> {clip.commentCount}
          </span>
          <button
            type="button"
            className={reported ? 'clip-action-btn reported' : 'clip-action-btn'}
            disabled={!myId || reported}
            onClick={() => onReport(clip)}
            title={t(reported ? 'clips.alreadyReported' : 'clips.report')}
          >
            <Icon icon={Flag} size={15} />
          </button>
          <button type="button" className="clip-action-btn" onClick={() => window.electronAPI.openExternal(clip.url)} title={t('clips.openExternal')}>
            <Icon icon={ExternalLink} size={15} />
          </button>
        </div>

        <div className="comp-published-footer">
          <ClipAuthor author={clip.author} />
          {(clip.created_by === myId || isAdmin) && (
            <button
              type="button"
              className="strategy-tool icon-only danger"
              title={t(clip.created_by === myId ? 'clips.deleteOwn' : 'clips.deleteAdmin')}
              onClick={() => {
                onDelete(clip.id);
                onClose();
              }}
            >
              <Icon icon={Trash2} size={14} />
            </button>
          )}
        </div>

        <ClipComments clipId={clip.id} myId={myId} isAdmin={isAdmin} t={t} />
      </div>
    </div>
  );
}

function ClipCard({ clip, myId, isAdmin, liked, reported, onToggleLike, onReport, onDelete, onOpen, agentIcons, t }) {
  return (
    <li className="tech-item clip-item clip-item-clickable" onClick={() => onOpen(clip)}>
      <ClipThumbnail url={clip.url} platform={clip.platform} thumbnailUrl={clip.thumbnail_url} t={t} />

      <div className="tech-item-header">
        {clip.agent && (
          <span className="tech-item-agent">
            {agentIcons.get(clip.agent) && <img src={agentIcons.get(clip.agent)} alt="" />}
            {clip.agent}
          </span>
        )}
        {clip.map && <span className="comp-published-map">{clip.map}</span>}
      </div>

      <p className="tech-item-title">{clip.title}</p>
      {clip.description && <p className="clip-description">{clip.description}</p>}

      <div className="clip-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={liked ? 'clip-action-btn liked' : 'clip-action-btn'}
          disabled={!myId}
          onClick={() => onToggleLike(clip)}
          title={t('clips.like')}
        >
          <Icon icon={Heart} size={15} /> {clip.likeCount}
        </button>
        <span className="clip-action-btn clip-action-static">
          <Icon icon={MessageSquare} size={15} /> {clip.commentCount}
        </span>
        <button
          type="button"
          className={reported ? 'clip-action-btn reported' : 'clip-action-btn'}
          disabled={!myId || reported}
          onClick={() => onReport(clip)}
          title={t(reported ? 'clips.alreadyReported' : 'clips.report')}
        >
          <Icon icon={Flag} size={15} />
        </button>
        <button type="button" className="clip-action-btn" onClick={() => window.electronAPI.openExternal(clip.url)} title={t('clips.openExternal')}>
          <Icon icon={ExternalLink} size={15} />
        </button>
      </div>

      <div className="comp-published-footer" onClick={(e) => e.stopPropagation()}>
        <ClipAuthor author={clip.author} />
        {isAdmin && clip.reportCount > 0 && (
          <span className="clip-report-badge" title={t('clips.reportedByCount', { count: clip.reportCount })}>
            <Icon icon={Flag} size={12} /> {clip.reportCount}
          </span>
        )}
        {(clip.created_by === myId || isAdmin) && (
          <button
            type="button"
            className="strategy-tool icon-only danger"
            title={t(clip.created_by === myId ? 'clips.deleteOwn' : 'clips.deleteAdmin')}
            onClick={() => onDelete(clip.id)}
          >
            <Icon icon={Trash2} size={14} />
          </button>
        )}
      </div>
    </li>
  );
}

function ClipsFeed({ myId, isAdmin }) {
  const { t } = useTranslation();
  const agentIcons = useAgentIcons();
  const minimaps = useMapMinimaps();
  const agentNames = useMemo(() => [...agentIcons.keys()].sort(), [agentIcons]);
  const mapNames = useMemo(() => [...minimaps.keys()].sort(), [minimaps]);

  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(false);
  // Distinct de publishError : une erreur ici veut dire que le FIL n'a pas
  // pu être rechargé (jamais montré avant — un échec restait invisible,
  // "Aucun clip publié" alors qu'en fait la requête avait planté).
  const [loadError, setLoadError] = useState(null);
  const [likedIds, setLikedIds] = useState(new Set());
  const [reportedIds, setReportedIds] = useState(new Set());
  // Id du clip ouvert en grand (ClipDetailModal), ou `null` en vue compacte
  // normale — un id plutôt que l'objet clip lui-même, pour que le like/les
  // compteurs affichés dans la modale restent synchronisés avec `clips` au
  // lieu de figer une copie prise au moment de l'ouverture.
  const [detailClipId, setDetailClipId] = useState(null);
  const detailClip = clips.find((c) => c.id === detailClipId) ?? null;

  const [agentFilter, setAgentFilter] = useState('');
  const [mapFilter, setMapFilter] = useState('');

  const [formUrl, setFormUrl] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAgent, setFormAgent] = useState('');
  const [formMap, setFormMap] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);

  const detectedPlatform = useMemo(() => detectClipPlatform(formUrl), [formUrl]);

  async function loadClips() {
    setLoading(true);
    let query = supabase
      .from('clips')
      .select(
        'id, url, platform, title, description, agent, map, thumbnail_url, created_at, created_by, author:profiles(display_name, riot_name, riot_tag, avatar_card_uuid), likes:clip_likes(count), comments:clip_comments(count), reports:clip_reports(count)',
      )
      .order('created_at', { ascending: false })
      .limit(60);
    if (agentFilter) query = query.eq('agent', agentFilter);
    if (mapFilter) query = query.eq('map', mapFilter);
    const { data, error } = await query;
    if (error) {
      console.error('[clips] échec du chargement du fil :', error.message);
      setLoadError(error.message);
    } else {
      setLoadError(null);
      setClips(
        (data ?? []).map((clip) => ({
          ...clip,
          likeCount: clip.likes?.[0]?.count ?? 0,
          commentCount: clip.comments?.[0]?.count ?? 0,
          reportCount: clip.reports?.[0]?.count ?? 0,
        })),
      );
    }
    setLoading(false);
  }

  async function loadMyInteractions() {
    if (!myId) {
      setLikedIds(new Set());
      setReportedIds(new Set());
      return;
    }
    const [likesRes, reportsRes] = await Promise.all([
      supabase.from('clip_likes').select('clip_id').eq('user_id', myId),
      supabase.from('clip_reports').select('clip_id').eq('user_id', myId),
    ]);
    setLikedIds(new Set((likesRes.data ?? []).map((r) => r.clip_id)));
    setReportedIds(new Set((reportsRes.data ?? []).map((r) => r.clip_id)));
  }

  useEffect(() => {
    loadClips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentFilter, mapFilter]);

  useEffect(() => {
    loadMyInteractions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  const canPublish = Boolean(detectedPlatform && formTitle.trim() && myId);

  async function handlePublish() {
    if (!canPublish) return;
    setPublishing(true);
    setPublishError(null);

    // YouTube a une miniature déduite de l'id, sans appel réseau (voir
    // ClipThumbnail) — inutile de la résoudre/stocker. Medal/Streamable
    // n'exposent pas ça dans leur URL, donc une seule résolution ici, à la
    // publication, plutôt qu'à chaque affichage du fil pour chaque visiteur.
    let thumbnailUrl = null;
    if (detectedPlatform !== 'youtube' && window.electronAPI?.resolveClipMetadata) {
      const metadata = await window.electronAPI.resolveClipMetadata(formUrl.trim());
      thumbnailUrl = metadata?.thumbnail ?? null;
    }

    const { error } = await supabase.from('clips').insert({
      url: formUrl.trim(),
      platform: detectedPlatform,
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      agent: formAgent || null,
      map: formMap || null,
      thumbnail_url: thumbnailUrl,
      created_by: myId,
    });
    setPublishing(false);
    if (error) {
      setPublishError(error.message);
      return;
    }
    setFormUrl('');
    setFormTitle('');
    setFormDescription('');
    setFormAgent('');
    setFormMap('');
    loadClips();
  }

  async function handleToggleLike(clip) {
    if (!myId) return;
    const isLiked = likedIds.has(clip.id);
    // Optimiste : la réaction doit être instantanée, pas attendre l'aller-
    // retour réseau avant de refléter le clic.
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (isLiked) next.delete(clip.id);
      else next.add(clip.id);
      return next;
    });
    setClips((prev) =>
      prev.map((c) => (c.id === clip.id ? { ...c, likeCount: c.likeCount + (isLiked ? -1 : 1) } : c)),
    );
    if (isLiked) {
      await supabase.from('clip_likes').delete().eq('clip_id', clip.id).eq('user_id', myId);
    } else {
      await supabase.from('clip_likes').insert({ clip_id: clip.id, user_id: myId });
    }
  }

  async function handleReport(clip) {
    if (!myId || reportedIds.has(clip.id)) return;
    setReportedIds((prev) => new Set(prev).add(clip.id));
    await supabase.from('clip_reports').insert({ clip_id: clip.id, user_id: myId });
  }

  async function handleDelete(id) {
    await supabase.from('clips').delete().eq('id', id);
    loadClips();
  }

  return (
    <div>
      <div className="card">
        <h3>{t('clips.title')}</h3>
        <p className="label">{t('clips.description')}</p>
      </div>

      <CollapsibleCard id="clips.publish" title={t('clips.publishTitle')}>
        <p className="label">{t('clips.publishIntro')}</p>

        <div className="tech-publish-form clip-publish-form">
          <input
            type="url"
            placeholder={t('clips.urlPlaceholder')}
            value={formUrl}
            onChange={(e) => setFormUrl(e.target.value)}
          />
          <input
            type="text"
            placeholder={t('clips.titlePlaceholder')}
            value={formTitle}
            maxLength={80}
            onChange={(e) => setFormTitle(e.target.value)}
          />
          <input
            type="text"
            placeholder={t('clips.descriptionPlaceholder')}
            value={formDescription}
            maxLength={280}
            onChange={(e) => setFormDescription(e.target.value)}
          />
          <select value={formAgent} onChange={(e) => setFormAgent(e.target.value)}>
            <option value="">{t('clips.noAgent')}</option>
            {agentNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select value={formMap} onChange={(e) => setFormMap(e.target.value)}>
            <option value="">{t('clips.noMap')}</option>
            {mapNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button className="refresh" onClick={handlePublish} disabled={!canPublish || publishing}>
            {publishing ? t('clips.publishing') : t('clips.publish')}
          </button>
        </div>

        {formUrl && !detectedPlatform && <p className="warning">{t('clips.unsupportedLink')}</p>}
        {formUrl && detectedPlatform && (
          <p className="label">{t('clips.detectedPlatform', { platform: t(CLIP_PLATFORMS[detectedPlatform].labelKey) })}</p>
        )}
        {!myId && <p className="label">{t('clips.needAccount')}</p>}
        {publishError && <p className="warning">{publishError}</p>}
      </CollapsibleCard>

      <div className="card">
        <div className="filter-bar">
          <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
            <option value="">{t('clips.allAgents')}</option>
            {agentNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select value={mapFilter} onChange={(e) => setMapFilter(e.target.value)}>
            <option value="">{t('clips.allMaps')}</option>
            {mapNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {loadError && <p className="warning">{loadError}</p>}
        {loading ? (
          <p className="label">{t('clips.loading')}</p>
        ) : loadError ? null : clips.length === 0 ? (
          <p className="label">{t('clips.empty')}</p>
        ) : (
          <ul className="tech-list clip-list">
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                myId={myId}
                isAdmin={isAdmin}
                liked={likedIds.has(clip.id)}
                reported={reportedIds.has(clip.id)}
                onToggleLike={handleToggleLike}
                onReport={handleReport}
                onDelete={handleDelete}
                onOpen={(c) => setDetailClipId(c.id)}
                agentIcons={agentIcons}
                t={t}
              />
            ))}
          </ul>
        )}
      </div>

      {detailClip && (
        <ClipDetailModal
          clip={detailClip}
          myId={myId}
          isAdmin={isAdmin}
          liked={likedIds.has(detailClip.id)}
          reported={reportedIds.has(detailClip.id)}
          onToggleLike={handleToggleLike}
          onReport={handleReport}
          onDelete={handleDelete}
          onClose={() => setDetailClipId(null)}
          agentIcons={agentIcons}
          t={t}
        />
      )}
    </div>
  );
}

export default ClipsFeed;
