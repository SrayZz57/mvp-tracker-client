// Écrit sql/battle_pass_season_<n>.sql à partir du catalogue.
//   node scripts/generate-battle-pass-sql.mjs
// Le test battlePass.test.mjs échoue si ces fichiers ne sont pas à jour.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { allGeneratedSql } = await import(pathToFileURL(path.join(root, 'src/renderer/battlePass/seedSql.js')).href);

for (const { file, sql } of allGeneratedSql()) {
  fs.writeFileSync(path.join(root, 'sql', file), sql);
  console.log(`sql/${file} écrit`);
}
