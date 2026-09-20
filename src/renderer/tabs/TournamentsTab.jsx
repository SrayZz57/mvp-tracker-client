import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trophy, Plus, Search } from 'lucide-react';
import Icon from '../Icon.jsx';
import { supabase } from '../supabaseClient.js';
import { useMapImages } from '../mapImages.js';
import { useAgentPortraits } from '../agentIcons.js';
import { useRankLadder } from '../rankData.js';
import { pickSplash } from '../tournamentVisuals.js';
import TournamentDetail from '../TournamentDetail.jsx';
import TournamentCreateForm from '../TournamentCreateForm.jsx';

const STATUS_LABELS = {
  registration: 'tournaments.status.registration',
  ongoing: 'tournaments.status.ongoing',
  completed: 'tournaments.status.completed',
};

// Nombre de cartes affichées avant "Voir plus" — le panneau promo à droite a
// une hauteur fixe (calée sur la fenêtre) : sans cette limite, une longue
// liste l'étirerait avec elle plutôt que de simplement défiler/se replier.
// Ne s'applique qu'à la section Communauté (voir plus bas) : la section
// Officiels reste courte par nature (curée par les admins), jamais paginée.
const VISIBLE_COUNT = 4;

function rankRangeLabel(ladderByTier, rankMin, rankMax, t) {
  if (!rankMin && !rankMax) return t('tournaments.anyRank');
  const minName = rankMin ? ladderByTier.get(rankMin)?.tierName ?? rankMin : t('tournaments.noMin');
  if (rankMin === rankMax) return minName;
  const maxName = rankMax ? ladderByTier.get(rankMax)?.tierName ?? rankMax : t('tournaments.noMax');
  return `${minName} — ${maxName}`;
}

// Panneau décoratif dans l'espace vide à droite de la liste — Neon en
// vedette (thème électrique/néon, cohérent avec l'identité du module),
// purement visuel, ne réagit à aucune donnée.
function TournamentsPromo() {
  const { t } = useTranslation();
  const agentPortraits = useAgentPortraits();
  const portrait = agentPortraits.get('Neon');

  return (
    <aside className="tournaments-promo">
      <span className="tournaments-promo-watermark" aria-hidden="true">
        {t('tournaments.promoWatermark')}
      </span>
      <div className="tournaments-promo-logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path
            fill="currentColor"
            d="M4 3h16v2h-2v2a6 6 0 0 1-5 5.92V15h3v2H8v-2h3v-2.08A6 6 0 0 1 6 7V5H4V3Zm4 2v2a4 4 0 0 0 8 0V5H8Z"
          />
        </svg>
        <span>{t('tournaments.promoTag')}</span>
      </div>
      {portrait && <img className="tournaments-promo-portrait" src={portrait} alt="" />}
    </aside>
  );
}

const HOW_IT_WORKS_STEPS = [
  { titleKey: 'tournaments.howItWorks.step1Title', textKey: 'tournaments.howItWorks.step1Text' },
  { titleKey: 'tournaments.howItWorks.step2Title', textKey: 'tournaments.howItWorks.step2Text' },
  { titleKey: 'tournaments.howItWorks.step3Title', textKey: 'tournaments.howItWorks.step3Text' },
  { titleKey: 'tournaments.howItWorks.step4Title', textKey: 'tournaments.howItWorks.step4Text' },
];

// Petit panneau explicatif entre la liste et le panneau promo — purement
// informatif, ne dépend d'aucune donnée.
function TournamentsHowItWorks() {
  const { t } = useTranslation();

  return (
    <aside className="tournaments-how">
      <h2 className="tournaments-how-title">{t('tournaments.howItWorks.title')}</h2>
      <ol className="tournaments-how-steps">
        {HOW_IT_WORKS_STEPS.map((step, index) => (
          <li key={step.titleKey} className="tournaments-how-step" style={{ '--i': index }}>
            <span className="tournaments-how-step-number">{index + 1}</span>
            <div>
              <p className="tournaments-how-step-title">{t(step.titleKey)}</p>
              <p className="tournaments-how-step-text">{t(step.textKey)}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

// Sous "Comment ça marche" : accès rapide aux tournois où ce compte a une
// équipe inscrite (n'importe quel statut sauf refusée) — évite d'avoir à
// rechercher son propre tournoi dans la liste générale.
function TournamentsMine({ myId, onSelect }) {
  const { t } = useTranslation();
  const [mine, setMine] = useState(null);

  useEffect(() => {
    supabase
      .from('tournament_teams')
      .select('status, tournaments(id, name, status)')
      .eq('captain_id', myId)
      .neq('status', 'rejected')
      .then(({ data, error }) => {
        if (error) {
          setMine([]);
          return;
        }
        // Un même compte peut avoir plusieurs équipes dans UN MÊME tournoi
        // (le formulaire admin en ajoute autant que voulu) — un seul lien
        // par tournoi suffit ici, pas un doublon par équipe.
        const seen = new Set();
        const unique = [];
        for (const row of data ?? []) {
          if (!row.tournaments || seen.has(row.tournaments.id)) continue;
          seen.add(row.tournaments.id);
          unique.push(row);
        }
        setMine(unique);
      });
  }, [myId]);

  // Toujours affichée — même vide, avec un message plutôt que de disparaître
  // et casser la colonne (voir .tournaments-mine, dimensionnée pour occuper
  // le reste de la colonne jusqu'au bas du panneau Neon).
  const list = mine ?? [];

  return (
    <aside className="tournaments-mine">
      <h2 className="tournaments-how-title">{t('tournaments.mine.title')}</h2>
      {list.length === 0 ? (
        <p className="tournaments-mine-empty">{t('tournaments.mine.empty')}</p>
      ) : (
        <ul className="tournaments-mine-list">
          {list.map((row) => (
            <li key={row.tournaments.id}>
              <button onClick={() => onSelect(row.tournaments.id)}>
                <span className="tournaments-mine-name">{row.tournaments.name}</span>
                <span className={`tournament-status-badge ${row.tournaments.status}`}>
                  {t(STATUS_LABELS[row.tournaments.status] ?? row.tournaments.status)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

// Une carte de tournoi — partagée entre la section Officiels et la section
// Communauté. La suppression est proposée à l'admin (modération) ET au
// créateur du tournoi (gère le sien) — voir sql/tournaments_community.sql,
// la policy delete autorise les deux.
function TournamentCard({
  tournament,
  index,
  splash,
  winner,
  canDelete,
  confirming,
  deleting,
  onSelect,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
}) {
  const { t } = useTranslation();
  return (
    <div
      className="tournament-card"
      role="button"
      tabIndex={0}
      style={{ '--i': index, ...(splash ? { backgroundImage: `url(${splash})` } : null) }}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      {canDelete && (
        <div className="tournament-card-admin-actions" onClick={(e) => e.stopPropagation()}>
          {confirming ? (
            <>
              <button className="tournament-card-delete-confirm" disabled={deleting} onClick={onDelete}>
                {deleting ? t('tournaments.saving') : t('tournaments.confirmDelete')}
              </button>
              <button className="tournament-card-delete-cancel" onClick={onCancelDelete}>
                {t('tournaments.cancel')}
              </button>
            </>
          ) : (
            <button className="tournament-card-delete" title={t('tournaments.deleteTournament')} onClick={onConfirmDelete}>
              <Icon icon={X} size={14} />
            </button>
          )}
        </div>
      )}
      <span className={`tournament-status-badge ${tournament.status}`}>
        {t(STATUS_LABELS[tournament.status] ?? tournament.status)}
      </span>
      {tournament.game_mode && (
        <span className="tournament-mode-badge">{t(`tournaments.gameMode.${tournament.game_mode}`)}</span>
      )}
      <div className="tournament-card-content">
        <span className="tournament-card-name">{tournament.name}</span>
        {tournament.description && <p className="tournament-card-description">{tournament.description}</p>}
        {tournament.status === 'completed' && winner && (
          <p className="tournament-card-winner">
            <Icon icon={Trophy} size={16} aria-hidden="true" /> {t('tournaments.winner', { name: winner })}
          </p>
        )}
      </div>
    </div>
  );
}

// Liste des tournois — sert de page d'entrée pour tous les comptes connectés
// (pas encore une vraie page publique accessible sans compte, ça viendra
// séparément si besoin). Cliquer un tournoi ouvre TournamentDetail, qui gère
// l'affichage + l'inscription d'équipe.
//
// Deux catégories : les tournois "officiels" (créés par un admin, épinglés
// en premier, is_official posé par un trigger côté base à la création) et
// les tournois "communauté" (créés par n'importe quel compte connecté),
// avec leur propre recherche + filtre de rang. Voir
// sql/tournaments_community.sql pour le schéma/les policies.
function TournamentsTab({ myId, isAdmin }) {
  const { t } = useTranslation();
  const mapImages = useMapImages();
  const ladder = useRankLadder();
  const ladderByTier = useMemo(() => new Map(ladder.map((tier) => [tier.tier, tier])), [ladder]);
  const [tournaments, setTournaments] = useState([]);
  const [winnerNames, setWinnerNames] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [communitySearch, setCommunitySearch] = useState('');
  const [communityRankFilter, setCommunityRankFilter] = useState('');

  // Masque (sans JAMAIS supprimer) les tournois en inscriptions dont la date
  // limite est passée ET qui n'ont aucune équipe : plus rien à y faire, mais
  // les données restent en base. Avant, ce nettoyage SUPPRIMAIT tout tournoi
  // expiré non complet — équipes comprises — donc un tournoi à 6 équipes sur 8
  // disparaissait au lieu de pouvoir démarrer avec des byes. Un tournoi expiré
  // qui a des équipes reste visible (fermé) pour que son créateur le lance.
  async function hideEmptyExpiredTournaments(rows) {
    const now = Date.now();
    const expired = rows.filter(
      (tm) => tm.status === 'registration' && tm.registration_deadline && new Date(tm.registration_deadline).getTime() < now,
    );
    if (expired.length === 0) return rows;

    const { data: teamRows } = await supabase
      .from('tournament_teams')
      .select('tournament_id')
      .in('tournament_id', expired.map((tm) => tm.id));
    const withTeams = new Set((teamRows ?? []).map((row) => row.tournament_id));

    const hidden = new Set(expired.filter((tm) => !withTeams.has(tm.id)).map((tm) => tm.id));
    return hidden.size === 0 ? rows : rows.filter((tm) => !hidden.has(tm.id));
  }

  function loadTournaments() {
    supabase
      .from('tournaments')
      .select(
        'id, name, description, status, max_teams, created_by, is_official, rank_min, rank_max, registration_deadline, game_mode',
      )
      .order('created_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (error) {
          setLoading(false);
          return;
        }
        const rows = await hideEmptyExpiredTournaments(data ?? []);
        setTournaments(rows);
        setLoading(false);

        // Vainqueur affiché sur les tournois terminés : le vainqueur du
        // match du tour le plus élevé (la finale) qui en a un.
        const completedIds = rows.filter((tm) => tm.status === 'completed').map((tm) => tm.id);
        if (completedIds.length === 0) return;

        const { data: matches } = await supabase
          .from('tournament_matches')
          .select('tournament_id, round, winner_id')
          .in('tournament_id', completedIds)
          .not('winner_id', 'is', null);

        const finalByTournament = new Map();
        for (const match of matches ?? []) {
          const current = finalByTournament.get(match.tournament_id);
          if (!current || match.round > current.round) finalByTournament.set(match.tournament_id, match);
        }
        const winnerTeamIds = [...finalByTournament.values()].map((m) => m.winner_id);
        if (winnerTeamIds.length === 0) return;

        const { data: teamRows } = await supabase.from('tournament_teams').select('id, name').in('id', winnerTeamIds);
        const nameById = new Map((teamRows ?? []).map((tm) => [tm.id, tm.name]));
        const winners = new Map();
        for (const [tournamentId, match] of finalByTournament) {
          const name = nameById.get(match.winner_id);
          if (name) winners.set(tournamentId, name);
        }
        setWinnerNames(winners);
      });
  }

  useEffect(() => {
    loadTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (selectedId) {
    return <TournamentDetail tournamentId={selectedId} myId={myId} isAdmin={isAdmin} onBack={() => setSelectedId(null)} />;
  }

  if (loading) return <p className="label">{t('tournaments.loading')}</p>;

  // Suppression : admin (modération, comme avant) OU créateur du tournoi
  // (gère le sien) — côté serveur (RLS), voir
  // sql/tournaments_community.sql/tournaments_delete_own_or_admin_or_expired.
  // La suppression cascade sur les équipes/matchs de ce tournoi (contrainte
  // déjà posée sur ces tables).
  async function handleDelete(tournamentId) {
    setDeleting(true);
    await supabase.from('tournaments').delete().eq('id', tournamentId);
    setDeleting(false);
    setConfirmDeleteId(null);
    loadTournaments();
  }

  const official = tournaments.filter((tm) => tm.is_official);
  const rankFilterValue = communityRankFilter ? Number(communityRankFilter) : null;
  const community = tournaments.filter((tm) => {
    if (tm.is_official) return false;
    if (communitySearch.trim() && !tm.name.toLowerCase().includes(communitySearch.trim().toLowerCase())) return false;
    if (rankFilterValue) {
      if (tm.rank_min && tm.rank_min > rankFilterValue) return false;
      if (tm.rank_max && tm.rank_max < rankFilterValue) return false;
    }
    return true;
  });
  const visibleCommunity = showAll ? community : community.slice(0, VISIBLE_COUNT);

  function renderCard(tournament, index) {
    const splash = pickSplash(tournament.id, mapImages);
    const winner = winnerNames.get(tournament.id);
    const confirming = confirmDeleteId === tournament.id;
    return (
      <TournamentCard
        key={tournament.id}
        tournament={tournament}
        index={index}
        splash={splash}
        winner={winner}
        canDelete={isAdmin || tournament.created_by === myId}
        confirming={confirming}
        deleting={deleting}
        onSelect={() => setSelectedId(tournament.id)}
        onConfirmDelete={() => setConfirmDeleteId(tournament.id)}
        onCancelDelete={() => setConfirmDeleteId(null)}
        onDelete={() => handleDelete(tournament.id)}
      />
    );
  }

  return (
    <div className="tournaments-page">
      <div className="tournaments-list-block">
        {official.length === 0 && community.length === 0 && (
          <div className="tournaments-empty-state">
            <span className="tournaments-empty-icon" aria-hidden="true">
              {/* Même dessin que le logo du panneau promo, mais recadré : le
                  trophée n'occupe que le haut d'un cadre 24x24 (y de 3 à
                  17) — laissé tel quel là où l'icône est à côté d'un texte,
                  mais visiblement pas centré une fois seule dans son cadre. */}
              <svg viewBox="4 2 16 16" width="48" height="48">
                <path
                  fill="currentColor"
                  d="M4 3h16v2h-2v2a6 6 0 0 1-5 5.92V15h3v2H8v-2h3v-2.08A6 6 0 0 1 6 7V5H4V3Zm4 2v2a4 4 0 0 0 8 0V5H8Z"
                />
              </svg>
            </span>
            <h2 className="tournaments-empty-title">{t('tournaments.empty')}</h2>
            <p className="tournaments-empty-subtitle">{t('tournaments.emptySubtitle')}</p>
          </div>
        )}

        {official.length > 0 && (
          <div className="tournaments-list">{official.map((tournament, index) => renderCard(tournament, index))}</div>
        )}

        <div className="card tournaments-community-card">
          <div className="tournaments-community-header">
            <h2 className="tournaments-how-title">{t('tournaments.community.title')}</h2>
            <button className="refresh tournaments-create-btn" onClick={() => setShowCreateForm(true)}>
              <Icon icon={Plus} size={14} /> {t('tournaments.createOwn')}
            </button>
          </div>
          <div className="filter-bar tournaments-community-filters">
            <div className="tournaments-search">
              <Icon icon={Search} size={14} />
              <input
                type="text"
                placeholder={t('tournaments.community.searchPlaceholder')}
                value={communitySearch}
                onChange={(e) => setCommunitySearch(e.target.value)}
              />
            </div>
            <select value={communityRankFilter} onChange={(e) => setCommunityRankFilter(e.target.value)}>
              <option value="">{t('tournaments.community.anyRankFilter')}</option>
              {ladder.map((tier) => (
                <option key={tier.tier} value={tier.tier}>{tier.tierName}</option>
              ))}
            </select>
          </div>

          {community.length === 0 ? (
            <div className="tournaments-community-empty">
              <Icon icon={Trophy} size={26} aria-hidden="true" />
              <p>{t('tournaments.community.empty')}</p>
            </div>
          ) : (
            <div className="tournaments-list">
              {visibleCommunity.map((tournament, index) => (
                <div key={tournament.id}>
                  {renderCard(tournament, index)}
                  <p className="label tournament-card-rank-hint">
                    {rankRangeLabel(ladderByTier, tournament.rank_min, tournament.rank_max, t)}
                  </p>
                </div>
              ))}
              {!showAll && community.length > VISIBLE_COUNT && (
                <button className="tournaments-show-more" onClick={() => setShowAll(true)}>
                  {t('tournaments.showMore', { count: community.length - VISIBLE_COUNT })}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="tournaments-middle-column">
        <TournamentsHowItWorks />
        <TournamentsMine myId={myId} onSelect={setSelectedId} />
      </div>
      <TournamentsPromo />
      {showCreateForm && (
        <div className="custom-config-overlay" onClick={() => setShowCreateForm(false)}>
          <div className="custom-config-card" onClick={(e) => e.stopPropagation()}>
            <TournamentCreateForm
              myId={myId}
              onCreated={() => {
                setShowCreateForm(false);
                loadTournaments();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default TournamentsTab;
