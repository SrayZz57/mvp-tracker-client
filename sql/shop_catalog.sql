-- GÉNÉRÉ par scripts/generate-battle-pass-sql.mjs — ne pas modifier à la main.
-- À exécuter dans le SQL Editor de Supabase, après sql/shop.sql.
-- Rejouable : met à jour, ne supprime rien.

insert into public.shop_settings (id, welcome_bonus, pass_level_points, daily_login_points)
values (true, 1000, 100, 100)
on conflict (id) do update set
  welcome_bonus = excluded.welcome_bonus,
  pass_level_points = excluded.pass_level_points,
  daily_login_points = excluded.daily_login_points;

insert into public.shop_items (id, type, rarity, price)
values
  ('skin:vandal:celeste', 'weaponSkin', 'legendary', 800),
  ('skin:vandal:clockwork', 'weaponSkin', 'mythic', 1200),
  ('skin:vandal:sakura', 'weaponSkin', 'legendary', 800),
  ('skin:vandal:radiation', 'weaponSkin', 'legendary', 800),
  ('skin:vandal:pharaoh', 'weaponSkin', 'legendary', 800),
  ('skin:vandal:hologram', 'weaponSkin', 'legendary', 800),
  ('skin:vandal:titan', 'weaponSkin', 'ultimate', 1700),
  ('skin:vandal:arcane', 'weaponSkin', 'ultimate', 1700),
  ('skin:vandal:sylvan', 'weaponSkin', 'ultimate', 1700),
  ('skin:vandal:spectre', 'weaponSkin', 'ultimate', 1700),
  ('skin:vandal:lithosphere', 'weaponSkin', 'ultimate', 1700),
  ('skin:vandal:symbiote', 'weaponSkin', 'ultimate', 1700),
  ('skin:vandal:heliopause', 'weaponSkin', 'ultimate', 1700),
  ('skin:vandal:reliquary', 'weaponSkin', 'ultimate', 1700),
  ('skin:vandal:nullbyte', 'weaponSkin', 'ultimate', 1700),
  ('skin:vandal:patchbay', 'weaponSkin', 'ultimate', 1700),
  ('skin:vandal:downforce', 'weaponSkin', 'ultimate', 1700),
  ('skin:vandal:origami', 'weaponSkin', 'transcendent', 2500),
  ('skin:vandal:hive', 'weaponSkin', 'transcendent', 2500),
  ('skin:vandal:voxel', 'weaponSkin', 'transcendent', 2500),
  ('skin:vandal:maelstrom', 'weaponSkin', 'transcendent', 2500),
  ('skin:vandal:sumi', 'weaponSkin', 'transcendent', 2500),
  ('skin:glock:banana', 'weaponSkin', 'epic', 500),
  ('skin:glock:kraken', 'weaponSkin', 'legendary', 800),
  ('skin:glock:oni', 'weaponSkin', 'legendary', 800),
  ('skin:glock:prism', 'weaponSkin', 'legendary', 800),
  ('skin:glock:xeno', 'weaponSkin', 'legendary', 800),
  ('skin:glock:monarch', 'weaponSkin', 'ultimate', 1700),
  ('skin:glock:scorpion', 'weaponSkin', 'ultimate', 1700),
  ('skin:glock:quantum', 'weaponSkin', 'ultimate', 1700),
  ('skin:glock:harlequin', 'weaponSkin', 'ultimate', 1700),
  ('skin:glock:metamorph', 'weaponSkin', 'transcendent', 2500),
  ('skin:glock:arcade', 'weaponSkin', 'transcendent', 2500),
  ('skin:glock:hanabi', 'weaponSkin', 'transcendent', 2500),
  ('skin:glock:mirage', 'weaponSkin', 'transcendent', 2500),
  ('skin:glock:candy', 'weaponSkin', 'transcendent', 2500),
  ('skin:glock:kintsugi', 'weaponSkin', 'transcendent', 2500),
  ('skin:sniper:void', 'weaponSkin', 'legendary', 800),
  ('skin:sniper:storm', 'weaponSkin', 'legendary', 800),
  ('skin:sniper:crown', 'weaponSkin', 'legendary', 800),
  ('skin:sniper:ossuary', 'weaponSkin', 'ultimate', 1700),
  ('skin:sniper:stained', 'weaponSkin', 'ultimate', 1700),
  ('skin:sniper:abyssal', 'weaponSkin', 'ultimate', 1700),
  ('skin:sniper:supernova', 'weaponSkin', 'ultimate', 1700),
  ('skin:sniper:rift', 'weaponSkin', 'transcendent', 2500),
  ('skin:sniper:locomotive', 'weaponSkin', 'transcendent', 2500),
  ('skin:sniper:kaleidoscope', 'weaponSkin', 'transcendent', 2500),
  ('skin:sniper:marble', 'weaponSkin', 'transcendent', 2500),
  ('skin:sniper:weaver', 'weaponSkin', 'transcendent', 2500),
  ('skin:sniper:corsair', 'weaponSkin', 'transcendent', 2500),
  ('title:collectionneur', 'title', 'epic', 400),
  ('title:fortune', 'title', 'epic', 400),
  ('title:tireur_elite', 'title', 'epic', 400),
  ('bundle:welcome', 'bundle', 'legendary', 800)
on conflict (id) do update set
  type = excluded.type,
  rarity = excluded.rarity,
  price = excluded.price;

-- Contenu des packs, et leur offre permanente (hors rotation).
insert into public.shop_bundle_items (bundle_id, item_id)
values
  ('bundle:welcome', 'skin:glock:prism'),
  ('bundle:welcome', 'skin:vandal:radiation'),
  ('bundle:welcome', 'skin:sniper:crown')
on conflict do nothing;

insert into public.shop_offers (id, item_id, kind, price, starts_at, ends_at)
values
  ('bundle:welcome', 'bundle:welcome', 'bundle', 800, '2026-01-01T00:00:00Z', '2100-01-01T00:00:00Z')
on conflict (id) do update set
  price = excluded.price;
