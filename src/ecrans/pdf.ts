// Lire le texte d'une facture PDF, sur le téléphone — T160.
//
// SUR L'APPAREIL, COMME LA PHOTO. pdf.js n'est importé qu'au moment où un PDF
// arrive (chunk à part, hors du bundle principal), et son « worker » tourne
// dans la page : une facture de six pages se lit en quelques dizaines de
// millisecondes, et l'on évite un second fichier `.mjs` que nginx ne sait pas
// typer. Le document reste en mémoire le temps de la lecture ; le texte brut —
// où figurent le nom, l'adresse et l'identifiant client — ne sort de cette
// fonction que vers `lireFactureDrive`.
//
// LA MISE EN PAGE EST REFAITE ICI, À LA MANIÈRE DE `pdftotext -layout`. pdf.js
// rend des morceaux de texte posés (x, y), dans un ordre quelconque : on les
// range par ligne, de haut en bas, on les place en colonne d'après leur x, et
// on laisse une LIGNE VIDE là où l'écart vertical dépasse l'interligne. C'est
// cette ligne vide qui sépare deux articles : un libellé replié sur deux
// rangées (l'EAN sur celle du milieu) reste d'un seul bloc.

export interface MorceauPdf {
  str: string;
  /** Abscisse et ordonnée de la ligne de base, en points (origine en bas). */
  x: number;
  y: number;
  /** Corps du texte, en points. */
  taille: number;
  /** Largeur du morceau, en points ; estimée d'après le corps si absente. */
  largeur?: number;
}

/** Un point PDF vaut un tiers de colonne : une page A4 fait ~200 colonnes. */
const PT_PAR_COLONNE = 3;

/** Les morceaux d'une page, rendus en lignes de texte à colonnes. */
export function texteDeLaPage(morceaux: readonly MorceauPdf[]): string {
  const pleins = morceaux.filter((m) => m.str.trim().length > 0);
  if (!pleins.length) return "";
  // DEUX MORCEAUX SONT SUR LA MÊME LIGNE à moins de 2 pt d'écart : un libellé
  // replié se décale de ±4,7 pt autour de la ligne de l'EAN, et doit rester
  // sur sa propre rangée.
  const tries = [...pleins].sort((a, b) => b.y - a.y || a.x - b.x);
  const rangs: { y: number; taille: number; morceaux: MorceauPdf[] }[] = [];
  for (const m of tries) {
    const r = rangs[rangs.length - 1];
    if (r && Math.abs(r.y - m.y) < 2) {
      r.morceaux.push(m);
      r.taille = Math.max(r.taille, m.taille);
    } else rangs.push({ y: m.y, taille: m.taille, morceaux: [m] });
  }
  const lignes: string[] = [];
  let avant: (typeof rangs)[number] | null = null;
  for (const r of rangs) {
    // Plus d'une fois et demie le corps : ce n'est plus la même phrase.
    if (avant && avant.y - r.y > 1.6 * Math.max(avant.taille, r.taille)) lignes.push("");
    let l = "";
    let fin = 0;
    for (const m of [...r.morceaux].sort((a, b) => a.x - b.x)) {
      const col = Math.round(m.x / PT_PAR_COLONNE);
      // L'ÉCART RÉEL DÉCIDE : certains PDF (Chromium) posent un morceau par
      // MOT. Collés, c'est le même mot ; moins d'un corps, un blanc entre deux
      // mots ; au-delà, une autre colonne — avec au moins le double blanc, qui
      // est ce qui sépare un libellé de ses quantités.
      const vide = m.x - fin;
      const sep =
        l.length === 0 ? " ".repeat(col)
        : vide < 0.15 * m.taille ? ""
        : vide < 1.2 * m.taille ? " "
        : " ".repeat(Math.max(col - l.length, 2));
      l += sep + m.str;
      fin = m.x + (m.largeur ?? 0.45 * m.taille * m.str.length);
    }
    lignes.push(l.trimEnd());
    avant = r;
  }
  return lignes.join("\n");
}

/** Le texte d'un PDF, page par page, séparées par un saut de page (`\f`). */
export async function lirePdf(document: Blob, progres: (p: number) => void): Promise<string> {
  // L'ORDRE COMPTE : le module du worker pose `globalThis.pdfjsWorker`, et
  // pdf.js le prend alors au lieu de lancer un vrai Worker.
  const [pdfjs] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    // @ts-expect-error — le module du worker n'a pas de types : seul son effet compte.
    import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ]);
  progres(0.2);
  const tache = pdfjs.getDocument({
    data: new Uint8Array(await document.arrayBuffer()),
    // Rien à dessiner : on ne lit que le texte, sans polices ni réseau.
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await tache.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const contenu = await page.getTextContent();
      const morceaux: MorceauPdf[] = [];
      for (const it of contenu.items) {
        if (!("str" in it)) continue;
        const [a, b, , , x, y] = it.transform as number[];
        morceaux.push({ str: it.str, x: x ?? 0, y: y ?? 0, taille: Math.hypot(a ?? 0, b ?? 0) || 8, largeur: it.width });
      }
      pages.push(texteDeLaPage(morceaux));
      progres(0.2 + (0.8 * n) / doc.numPages);
    }
    return pages.join("\n\f");
  } finally {
    await tache.destroy();
  }
}
