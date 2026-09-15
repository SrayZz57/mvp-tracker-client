import { createWorker } from 'tesseract.js';

// Point d'entrée séparé, lancé via `utilityProcess.fork()` depuis main.js —
// isole tesseract.js (qui gère son propre moteur OCR via worker_threads)
// dans son propre process Node, à l'écart du process principal de l'app.
//
// `workerPath` (reçu à chaque message, voir plus bas) est indispensable :
// sans lui, tesseract.js calcule lui-même l'emplacement de son moteur via
// son propre `__dirname` — qui, une fois ce fichier compilé par Vite, pointe
// vers NOTRE fichier de sortie au lieu du vrai dossier de tesseract.js dans
// node_modules. Ça faisait planter le worker interne au tout premier job
// (silencieusement à l'usage : ni erreur ni timeout ne remontaient jusqu'à
// l'app, juste un chargement qui ne se terminait jamais — bug identifié et
// corrigé le 2026-09-16).
let workerPromise = null;

function getWorker(langPath, workerPath) {
  if (!workerPromise) {
    workerPromise = createWorker('eng', undefined, {
      langPath,
      workerPath,
      cacheMethod: 'none',
      gzip: true,
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        // Une seule ligne de texte, pas un "document" — sans ce réglage,
        // l'OCR essaie de segmenter le crop en paragraphes et n'arrive à
        // rien reconnaître du tout sur un petit compteur comme celui-ci.
        tessedit_pageseg_mode: '7',
      });
      return worker;
    });
  }
  return workerPromise;
}

process.parentPort.on('message', async (e) => {
  const { id, buffer, langPath, workerPath } = e.data;
  try {
    const worker = await getWorker(langPath, workerPath);
    const {
      data: { text },
    } = await worker.recognize(Buffer.from(buffer));
    process.parentPort.postMessage({ id, ok: true, text });
  } catch (err) {
    process.parentPort.postMessage({ id, ok: false, error: err?.message ?? String(err) });
  }
});
