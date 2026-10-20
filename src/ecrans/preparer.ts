// Préparer la photo avant l'OCR — T138.
//
// UNE PHOTO DE TÉLÉPHONE FAIT 12 MP ; un ticket n'en demande pas tant.
// Tesseract lit mieux et plus vite un texte de ~30 px de haut sur une image de
// 1 800 px qu'un texte de 80 px sur 4 000 : on réduit, on passe en gris, et on
// étire le contraste — le papier thermique sort gris sur crème.
//
// L'ORIENTATION EXIF EST APPLIQUÉE, MAIS ELLE PEUT MENTIR (relevé des livres :
// orientation=6 sur des pixels déjà droits). `preparerImage` prend donc un
// quart de tour de correction, et l'écran relit tourné si la première lecture
// ne trouve aucune ligne. (Pas `imageOrientation: "none"` : Chromium le traite
// désormais comme « from-image ».)

/** Le côté long visé : assez pour un libellé de 22 caractères lisible. */
export const COTE_LONG = 1800;

/** Les dimensions réduites, proportions gardées. On n'agrandit jamais. */
export function dimensionsCible(l: number, h: number, max = COTE_LONG): { l: number; h: number } {
  const k = Math.min(1, max / Math.max(l, h));
  return { l: Math.max(1, Math.round(l * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * Gris, puis étirement du contraste entre les 2e et 98e centiles — en place,
 * sur des pixels RGBA. Les extrêmes (un reflet, une ombre de doigt) ne décident
 * pas de l'échelle.
 */
export function griserEtContraster(px: Uint8ClampedArray): void {
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const y = Math.round(0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!);
    px[i] = y;
    hist[y]! += 1;
  }
  const n = px.length / 4;
  let bas = 0;
  let haut = 255;
  for (let c = 0, v = 0; v < 256; v += 1) {
    c += hist[v]!;
    if (c <= n * 0.02) bas = v;
    if (c < n * 0.98) haut = v + 1;
  }
  const ecart = Math.max(1, haut - bas);
  for (let i = 0; i < px.length; i += 4) {
    const y = Math.min(255, Math.max(0, ((px[i]! - bas) * 255) / ecart));
    px[i] = px[i + 1] = px[i + 2] = y;
    px[i + 3] = 255;
  }
}

export type QuartDeTour = 0 | 90 | -90;

export async function preparerImage(fichier: Blob, tour: QuartDeTour = 0): Promise<Blob> {
  const bmp = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  const { l: lb, h: hb } = dimensionsCible(bmp.width, bmp.height);
  const [l, h] = tour ? [hb, lb] : [lb, hb];
  const c = document.createElement("canvas");
  c.width = l;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  g.translate(l / 2, h / 2);
  g.rotate((tour * Math.PI) / 180);
  g.drawImage(bmp, -lb / 2, -hb / 2, lb, hb);
  g.setTransform(1, 0, 0, 1, 0, 0);
  bmp.close();
  const img = g.getImageData(0, 0, l, h);
  griserEtContraster(img.data);
  g.putImageData(img, 0, 0);
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("image illisible"))), "image/png"));
}
