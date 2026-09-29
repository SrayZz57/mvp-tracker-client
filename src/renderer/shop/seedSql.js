import { SEASONS } from '../battlePass/catalog.js';
import { ECONOMY } from './economy.js';
import { SHOP_BUNDLES, SHOP_ITEMS } from './catalog.js';
import { expandShopOffers } from './rotation.js';

// SQL de semis de la boutique, généré depuis le code (même principe que le
// pass) : réglages de l'économie, catalogue, offres datées de chaque saison.
// Idempotent (upsert), ne supprime rien.

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const ts = (ms) => q(new Date(ms).toISOString());

const HEADER = `-- GÉNÉRÉ par scripts/generate-battle-pass-sql.mjs — ne pas modifier à la main.
-- À exécuter dans le SQL Editor de Supabase, après sql/shop.sql.
-- Rejouable : met à jour, ne supprime rien.
`;

export function renderShopCatalogSql() {
  const rows = SHOP_ITEMS.map((i) => `  (${q(i.id)}, ${q(i.type)}, ${q(i.rarity)}, ${i.price})`).join(',\n');
  return `${HEADER}
insert into public.shop_settings (id, welcome_bonus, pass_level_points, daily_login_points)
values (true, ${ECONOMY.welcomeBonus}, ${ECONOMY.passLevelPoints}, ${ECONOMY.dailyLoginPoints})
on conflict (id) do update set
  welcome_bonus = excluded.welcome_bonus,
  pass_level_points = excluded.pass_level_points,
  daily_login_points = excluded.daily_login_points;

insert into public.shop_items (id, type, rarity, price)
values
${rows}
on conflict (id) do update set
  type = excluded.type,
  rarity = excluded.rarity,
  price = excluded.price;

-- Contenu des packs, et leur offre permanente (hors rotation).
insert into public.shop_bundle_items (bundle_id, item_id)
values
${SHOP_BUNDLES.flatMap((b) => b.items.map((item) => `  (${q(b.id)}, ${q(item)})`)).join(',\n')}
on conflict do nothing;

insert into public.shop_offers (id, item_id, kind, price, starts_at, ends_at)
values
${SHOP_BUNDLES.map((b) => `  (${q(b.id)}, ${q(b.id)}, 'bundle', ${b.price}, '2026-01-01T00:00:00Z', '2100-01-01T00:00:00Z')`).join(',\n')}
on conflict (id) do update set
  price = excluded.price;
`;
}

export function renderShopOffersSql(season) {
  const rows = expandShopOffers(season)
    .map((o) => `  (${q(o.id)}, ${q(o.itemId)}, ${q(o.kind)}, ${o.price}, ${ts(o.startsAt)}, ${ts(o.endsAt)})`)
    .join(',\n');
  return `${HEADER}
-- Offre de la semaine retirée : on efface celles déjà semées (aucun achat ne
-- pointe vers une offre, rien d'autre n'est touché).
delete from public.shop_offers where kind = 'featured';

-- Offres de la saison ${season.number} (4 par jour).
insert into public.shop_offers (id, item_id, kind, price, starts_at, ends_at)
values
${rows}
on conflict (id) do update set
  item_id = excluded.item_id,
  kind = excluded.kind,
  price = excluded.price,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at;

-- ⚠️ DEV UNIQUEMENT, À SUPPRIMER AVANT LA SORTIE RÉELLE — les dates ci-dessus
-- sont celles de la VRAIE saison ${season.number} (dans le futur tant qu'elle n'a pas
-- commencé) : ce bloc recale les offres du jour sur "maintenant" à chaque
-- exécution de ce fichier, pour pouvoir tester la boutique dès aujourd'hui.
-- Fait partie du même fichier que le insert ci-dessus (pas une étape à part) :
-- recalé automatiquement à chaque ré-exécution, jamais écrasé par erreur.
update public.shop_offers
set starts_at = starts_at + (now() - (select min(starts_at) from public.shop_offers where kind = 'daily')),
    ends_at   = ends_at   + (now() - (select min(starts_at) from public.shop_offers where kind = 'daily'))
where kind = 'daily';
`;
}

export function allShopSql() {
  return [
    { file: 'shop_catalog.sql', sql: renderShopCatalogSql() },
    ...SEASONS.map((season) => ({ file: `shop_offers_season_${season.number}.sql`, sql: renderShopOffersSql(season) })),
  ];
}
