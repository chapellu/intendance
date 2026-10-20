// Lire une photo de ticket, sur le téléphone — T138.
//
// SUR L'APPAREIL, SANS SERVEUR NI CLÉ. tesseract.js tourne dans un worker ; il
// n'est importé qu'au moment du scan (chunk à part, hors du bundle principal),
// et ses fichiers lourds viennent de `/ocr/`, sur l'origine de l'app (voir
// `src/pwa/ocr.ts`). La photo reste en mémoire le temps de la lecture : elle
// n'est ni stockée ni envoyée, et le texte brut — où figure le numéro de carte
// de fidélité — ne sort pas de cette fonction autrement que vers `lireTicket`.

import { preparerImage, type QuartDeTour } from "./preparer";

export async function lireImage(
  image: Blob,
  progres: (p: number) => void,
  tour: QuartDeTour = 0,
): Promise<string> {
  // Réduite à ~1 800 px, en gris contrasté, orientée : voir `preparer.ts`.
  const preparee = await preparerImage(image, tour);
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("fra", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
    workerBlobURL: false,
    // Le service worker garde déjà les données de langue (`/ocr/`) : pas de
    // seconde copie dans IndexedDB.
    cacheMethod: "none",
    logger: (m) => {
      if (m.status === "recognizing text") progres(0.2 + 0.8 * m.progress);
      else if (m.status.startsWith("loading")) progres(0.2 * m.progress);
    },
  });
  try {
    // Un ticket est une colonne de texte : on garde les espaces, ce sont eux
    // qui séparent le libellé du prix.
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(preparee);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
