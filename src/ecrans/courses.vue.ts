// La liste de courses, telle qu'elle se lit dans un rayon.
//
// LA LISTE N'EST PAS STOCKÉE, ELLE EST CALCULÉE. Ce qui se stocke, c'est
// l'ÉTAT d'un article — coché, rentré — parce que ça, aucun calcul ne peut le
// retrouver. La conséquence, qu'il vaut mieux dire tout de suite : changer la
// semaine change la liste, et un état peut se retrouver orphelin. On les compte
// plutôt que de les cacher (voir `orphelins`).
//
// Port de `apps/proto-shell/comptoir.js` (`ecranCourses`).

import type { EtatCourse } from "../db";
import { cleDeLArticle } from "../db";
import { boitesAAcheter, type LignePanier } from "../model/calcul";
import { pluriel } from "../model/paquet";
import { enUnitesDAchat, UNITE_PLANCHER, unitesDAchat, type LignePlancher } from "../model/plancherGardeManger";
import { parRayon } from "../model/scoring";
import type { Catalogue, Provenance } from "../model/types";
import { fmt } from "../ui/format";

export type Mode = "magasin" | "maison";

export interface Article {
  cle: string;
  ligne: LignePanier;
  coche: boolean;
  rentre: boolean;
  /**
   * Ce que le plancher dit de cet ingrédient, quand il en dit quelque chose.
   *
   * DEUX SOURCES, UNE SEULE LIGNE. Un ingrédient peut être réclamé par la
   * semaine ET être sous son plancher ; l'écrire deux fois ferait acheter deux
   * fois, ce qu'une liste de courses n'a pas le droit de faire. La demande de la
   * semaine porte la ligne, le plancher l'ANNOTE — et quand la semaine ne
   * demande rien, le plancher fait la ligne à lui tout seul, ce qui est
   * exactement le propos de T41 : le canal ne vient pas du plan.
   */
  plancher: LignePlancher | null;
}

export interface Rayon {
  nom: string;
  articles: Article[];
}

export interface VueCourses {
  rayons: Rayon[];
  /** Tous les articles de la liste, à plat — pour compter. */
  articles: Article[];
  /** Cochés, donc dans le caddie. */
  coches: number;
  /** Rentrés, donc rangés. */
  rentres: number;
  /** Des états qui ne correspondent plus à aucun article de la liste : la
   *  semaine a changé sous eux. */
  orphelins: number;
  /**
   * La semaine PLUS les planchers, prêt pour `rentrer`.
   *
   * `calc.panier` ne suffit plus : c'est lui qui porte la quantité au moment de
   * rentrer un article au stock (T27), et une ligne de plancher n'y est pas.
   * Sans cette carte, cocher « 2 boîtes de maïs » puis les rentrer ne mettrait
   * rien dans le placard — la boucle serait coupée exactement là où T27 l'avait
   * refermée.
   */
  panier: Map<string, LignePanier>;
  /** Combien de lignes n'existent QUE par leur plancher. Le chiffre de la
   *  promesse de T41 : la liste vit sans plan. */
  parPlancher: number;
}

/**
 * La liste, telle qu'elle se lit dans un rayon.
 *
 * DEUX SOURCES QUI SE FONDENT AVANT LE TRI, JAMAIS DEUX SECTIONS. Un rayon se
 * traverse une fois ; deux listes obligeraient à revenir sur ses pas devant les
 * conserves. C'est aussi ce que dit T41 en toutes lettres — « ce qui est sous
 * son plancher EST la liste Carrefour », pas un appendice de la liste.
 */
export function vueDesCourses(
  catalogue: Catalogue,
  panier: Map<string, LignePanier>,
  etats: Map<string, EtatCourse>,
  planchers: readonly LignePlancher[] = [],
  /**
   * T134 — le début du jour, en ms. Une ligne née du SEUL plancher dont l'état
   * (coché, rentré) date d'avant n'en a plus : elle est revenue parce que la
   * cuisine a remangé ce qu'on avait rentré. Sans ça, les carottes rentrées
   * samedi restaient « déjà rentré » pour toujours — la clé `id|unité` ne
   * change jamais — et le fond ne se rachetait plus. Les lignes de la semaine
   * gardent leur état : elles ont leur propre « vider ».
   */
  depuis = 0,
): VueCourses {
  const parIngredient = new Map(planchers.map((p) => [p.ingredient, p]));
  const dejaDemandes = new Set([...panier.values()].map((l) => l.id));

  // Les planchers que la semaine ne réclame pas deviennent des lignes à part
  // entière. Ceux qu'elle réclame déjà n'en font pas une de plus : ils
  // annoteront la ligne existante, plus bas.
  const complet = new Map(panier);
  const achats = unitesDAchat(catalogue);
  for (const p of planchers) {
    if (dejaDemandes.has(p.ingredient)) continue;
    complet.set(`${p.ingredient}|${UNITE_PLANCHER}`, {
      id: p.ingredient,
      nom: p.nom,
      qty: p.manque,
      unit: UNITE_PLANCHER,
      ...(achats.has(p.ingredient) ? { achat: achats.get(p.ingredient)! } : {}),
      // ZÉRO PLAT, ET C'EST L'INFORMATION. `n` compte les plats de la semaine
      // qui réclament la ligne ; pour un plancher il n'y en a aucun, et écrire
      // 1 pour faire joli dirait qu'un plat la demande.
      n: 0,
    });
  }

  const vus = new Set<string>();
  const annotes = new Set<string>();
  const rayons = parRayon(catalogue, complet).map(([nom, lignes]) => ({
    nom,
    articles: lignes.map((ligne) => {
      const cle = cleDeLArticle(ligne);
      vus.add(cle);
      const brut = etats.get(cle);
      const e = brut && ligne.unit === UNITE_PLANCHER && ligne.n === 0 && brut.maj < depuis ? undefined : brut;
      // UNE SEULE ANNOTATION PAR INGRÉDIENT. `farine` peut paraître en `g` et en
      // `kg` sur la même semaine ; répéter « sous son plancher » sur chaque
      // ligne ferait croire à deux manques.
      const p = annotes.has(ligne.id) ? null : (parIngredient.get(ligne.id) ?? null);
      if (p) annotes.add(ligne.id);
      return { cle, ligne, coche: e?.coche ?? false, rentre: e?.rentre ?? false, plancher: p };
    }),
  }));

  const articles = rayons.flatMap((r) => r.articles);
  return {
    rayons,
    articles,
    coches: articles.filter((a) => a.coche).length,
    rentres: articles.filter((a) => a.rentre).length,
    orphelins: [...etats.values()].filter(
      (e) => !vus.has(e.cle) && (e.coche || e.rentre) && !(e.cle.endsWith(`|${UNITE_PLANCHER}`) && e.maj < depuis),
    ).length,
    panier: complet,
    parPlancher: articles.filter((a) => a.plancher && a.ligne.n === 0).length,
  };
}

/**
 * Pourquoi cette ligne est là, quand ce n'est pas la semaine qui la demande.
 *
 * « 0 PLAT » AURAIT ÉTÉ EXACT ET INCOMPRÉHENSIBLE. Le chiffre sous un article
 * répond à « pourquoi cette quantité » ; pour un plancher la réponse n'est pas
 * dans la semaine, elle est dans le placard — « il en reste 1, j'en veux 2 ».
 *
 * LA CONFIANCE VOYAGE JUSQU'AU RAYON, en mots de rayon : quand l'app n'a pas
 * regardé, elle ne prétend pas savoir ce qu'il reste (« il en reste 0 · jamais
 * vu » se contredisait) — elle dit d'aller voir.
 */
/** « 2026-10-13 » → « 13/10 » ; tout autre format passe tel quel. */
const court = (iso: string): string => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[1]}` : iso;
};

export function phraseDuPlancher(p: LignePlancher, plats: number): string {
  const bouts: string[] = [];
  if (plats > 0) bouts.push(plats > 1 ? `pour ${plats} plats` : "pour 1 plat");
  if (p.usage === "apero") bouts.push("pour l’apéro");
  else if (p.hebdo) bouts.push("pour la semaine");
  else if (p.fond) bouts.push("à toujours avoir");
  const a = String(p.a).replace(".", ",");
  if (p.confiance !== "sur")
    bouts.push(
      p.rentreLe
        ? `acheté le ${court(p.rentreLe)}, à vérifier`
        : p.vuLe
          ? `vu le ${court(p.vuLe)}, à vérifier`
          : "à vérifier",
    );
  else if (!p.sansPlancher) bouts.push(`il en reste ${a}, vous en voulez ${p.niveau}`);
  else if (p.a > 0) bouts.push(`il en reste ${a}`);
  return bouts.join(" · ");
}

/** La quantité d'un article, dite comme elle se compte. Les unités d'achat
 *  s'accordent — « 2 unité » se lit comme un bug, et une liste de courses qui a
 *  l'air cassée ne se croit plus. Les autres unités ne s'accordent pas : on
 *  écrit « 500 g », jamais « 500 gs ».
 *
 *  T140 : une ligne qu'un plat prend en boîtes entières s'achète en boîtes —
 *  « 2 boîtes (570 g) » —, puisque c'est ce qui partira dans la casserole. */
export const quantiteDeLArticle = (l: LignePanier): string => {
  if (l.unit === UNITE_PLANCHER) return enUnitesDAchat(l.qty, l.achat);
  const n = boitesAAcheter(l);
  if (n != null && l.boite) return `${n} ${pluriel(l.boite.nom, n)} (${fmt(l.qty)} ${l.unit})`;
  return `${fmt(l.qty)} ${l.unit}`;
};

/**
 * Ce que le doigt fait, selon l'endroit où l'on est.
 *
 * DEUX GESTES, DEUX LIEUX, et c'est toute la raison d'être des deux modes. Au
 * magasin, cocher veut dire « c'est dans le caddie » ; à la maison, rentrer
 * veut dire « c'est rangé ». Les confondre donnait, dans le proto, une liste
 * qui s'effaçait sous le doigt au milieu d'un rayon.
 */
export const basculeDe = (mode: Mode, a: Article): { rentrer: boolean; valeur: boolean } =>
  mode === "magasin" ? { rentrer: false, valeur: !a.coche } : { rentrer: true, valeur: !a.rentre };

/** L'état d'un article dans le mode courant — c'est lui qui allume la puce. */
export const marque = (mode: Mode, a: Article): boolean => (mode === "magasin" ? a.coche : a.rentre);

/** Ce que la semaine demande et qu'on n'achète PAS, par provenance. « À
 *  cuisiner d'avance » est le cas contre-intuitif : une base manquante ne
 *  s'achète nulle part, elle se cuisine. */
export function horsListe(
  catalogue: Catalogue,
  provenances: Partial<Record<Provenance, number>>,
): [string, number][] {
  return Object.entries(provenances)
    .filter(([p, n]) => p !== "courses" && !!n)
    .map(([p, n]) => [catalogue.provenances[p as Provenance] ?? p, n as number]);
}

/**
 * Ce qu'on ne met pas au panier parce qu'on l'a déjà — séparé par la RAISON.
 *
 * DEUX LISTES, PARCE QUE CE SONT DEUX CERTITUDES DIFFÉRENTES. `placard` est une
 * appartenance : on a toujours du sel, la question de la quantité ne se pose
 * pas. `garde-manger` est un stock relevé qui s'épuise, et dont personne ne suit
 * la consommation — la seule phrase honnête y est « va voir combien ».
 *
 * Les fondre en une seule ferait passer la seconde pour la première, et c'est le
 * genre de raccourci qui fait rentrer du magasin sans le maïs.
 */
export function aVerifierParRaison(
  aVerifier: Map<string, { nom: string; prov: Provenance }>,
): { stock: string[]; fond: string[] } {
  const stock: string[] = [];
  const fond: string[] = [];
  for (const v of aVerifier.values()) (v.prov === "garde-manger" ? stock : fond).push(v.nom);
  return { stock, fond };
}
