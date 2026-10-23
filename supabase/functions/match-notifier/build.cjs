// Outil de développement (pas déployé) : régénère matchLogic.ts et index.dashboard.ts.
//
// - matchLogic.ts : copie, issue de l'app mobile (même code que celui qui calcule les
//   résultats sur le téléphone), des fonctions qui lisent une partie HenrikDev
//   (normalizeV4Match, findMe, resultLabel, matchScore, hitStats, excludeDeathmatch).
//   Le notifier calcule ainsi le résultat, le K/D et le % de tirs à la tête EXACTEMENT
//   comme l'app. À regénérer si ces fonctions changent côté mobile.
// - index.dashboard.ts : index.ts + matchLogic.ts en UN fichier, à coller dans le
//   dashboard Supabase (qui n'accepte pas toujours plusieurs fichiers).
//
// Utilisation : node supabase/functions/match-notifier/build.cjs
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const mobile = path.resolve(__dirname, '../../../../mvp-tracker-mobile/src/lib');
const dir = __dirname;

const logic = esbuild.buildSync({
  stdin: {
    contents: `export { normalizeV4Match } from './matchNormalizer';\nexport { excludeDeathmatch, findMe, resultLabel, matchScore, hitStats } from './valorantStats';`,
    resolveDir: mobile,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: 'esnext',
  legalComments: 'none',
  logLevel: 'error',
});
const logicHeader = `// @ts-nocheck
// FICHIER GÉNÉRÉ par build.cjs à partir de l'app mobile (matchNormalizer.ts, valorantStats.ts).
// Ne pas modifier ici : régénérer.
`;
fs.writeFileSync(path.join(dir, 'matchLogic.ts'), logicHeader + logic.outputFiles[0].text);

const bundle = esbuild.buildSync({
  entryPoints: [path.join(dir, 'index.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: 'esnext',
  external: ['https://*', 'npm:*'], // résolus par Deno
  loader: { '.ts': 'ts' },
  legalComments: 'none',
  logLevel: 'error',
});
const header = `// Edge Function « match-notifier » — VERSION EN UN SEUL FICHIER, à coller dans l'éditeur
// de fonctions du dashboard Supabase. Générée à partir de index.ts + matchLogic.ts
// (supabase/functions/match-notifier/) : en cas de modification, régénérer plutôt que
// d'éditer ici. Prérequis : secrets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// et CRON_SECRET, tables web_push_subscriptions et match_push_state (dossier sql/),
// planification (sql/match_notifier_cron.sql).
`;
fs.writeFileSync(path.join(dir, 'index.dashboard.ts'), header + bundle.outputFiles[0].text);
console.log('✓ matchLogic.ts et index.dashboard.ts générés');
