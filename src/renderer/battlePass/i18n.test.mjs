import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SEASONS, listRewards } from './catalog.js';

const load = (lang) =>
  JSON.parse(fs.readFileSync(new URL(`../i18n/locales/${lang}.json`, import.meta.url), 'utf8'));

const has = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj) !== undefined;

for (const lang of ['fr', 'en']) {
  test(`${lang} : tous les titres du catalogue sont traduits`, () => {
    const dict = load(lang);
    for (const season of SEASONS) {
      for (const reward of listRewards(season)) {
        if (reward.type === 'title') {
          assert.ok(has(dict, `battlePass.titles.${reward.id.replace('title:', '')}`), `titre manquant : ${reward.id}`);
        }
      }
    }
  });

  test(`${lang} : toutes les cartes du catalogue sont traduites et dessinées`, () => {
    const dict = load(lang);
    // playerCards.jsx contient du JSX : on lit son texte plutôt que de l'importer.
    const source = fs.readFileSync(new URL('./playerCards.jsx', import.meta.url), 'utf8');
    for (const season of SEASONS) {
      for (const reward of listRewards(season)) {
        if (reward.type !== 'card') continue;
        assert.ok(has(dict, `battlePass.cards.${reward.key}`), `carte non traduite : ${reward.id}`);
        assert.ok(source.includes(`  ${reward.key}: \``), `carte sans dessin : ${reward.id}`);
      }
    }
  });

  test(`${lang} : tous les gants sont traduits`, () => {
    const dict = load(lang);
    // handSkins.js est de la donnée pure : on lit ses clés dans le texte.
    const source = fs.readFileSync(new URL('../handSkins.js', import.meta.url), 'utf8');
    const keys = [...source.matchAll(/^ {2}(\w+): \{ glove/gm)].map((m) => m[1]);
    assert.ok(keys.length >= 2);
    for (const key of keys) assert.ok(has(dict, `battlePass.hands.${key}`), `gants non traduits : ${key}`);
  });

  test(`${lang} : les blocs battlePass du hub existent`, () => {
    const dict = load(lang);
    for (const key of ['title', 'claim', 'state.loading', 'tier.easy', 'periods.season', 'challenge.accuracy', 'lock.unlockAt', 'result.gain']) {
      assert.ok(has(dict, `battlePass.${key}`), `clé manquante : battlePass.${key}`);
    }
    assert.ok(has(dict, 'aimTrainer.hubBattlePass'));
  });
}
