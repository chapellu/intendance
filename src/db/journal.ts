// Le journal, côté base — T25, T26, T27, T32.
//
// TROIS EFFETS, UNE SEULE TRANSACTION. Un événement cuisiné écrit l'événement,
// retire du dépôt ce que le plat a pris, et y range ce qu'il a produit. Les
// trois ou rien : une cuisson dont l'événement passe mais dont les bocaux
// n'arrivent pas fabrique un journal qui ment, et c'est le genre de mensonge
// qu'on ne découvre qu'un mois plus tard, devant un congélateur qui ne
// ressemble pas à l'écran.

import { accepte } from "../model/depot";
import type { Constat, Evenement, EvtCuisine, LigneEntree } from "../model/journal";
import type { Catalogue, Plat, RepasId } from "../model/types";
import { jourISO, type Base, type LotStock } from "./schema";

export const lireJournal = (base: Base): Promise<Evenement[]> =>
  base.evenements.orderBy("jour").toArray();

/** Les événements d'un jour — pour savoir si un créneau a DÉJÀ été cuisiné. */
export const journalDuJour = (base: Base, jour: string): Promise<Evenement[]> =>
  base.evenements.where("jour").equals(jour).toArray();

/* ══════════════════════════════════════════════════ l'événement cuisiné */

/**
 * Un lot que la SORTIE a décidé de ranger quelque part — T99.
 *
 * QUATRE CHAMPS, ET AUCUN QUI SE CALCULE. Le type, le `kind` et l'espace de
 * destination se relisent sur `plat.emits[emit]` ; les boîtes à laver, elles,
 * sont de l'affichage. Ce qui arrive ici est ce qu'un doigt a décidé : où c'est
 * parti, en combien de morceaux, et de quelle taille.
 */
export interface RangementLot {
  /** Le rang de l'emit dans `plat.emits`. */
  emit: number;
  /** Où le lot SE TROUVE ce soir — voir `LotStock.location`. */
  location: LotStock["location"];
  band: string;
  qty: number | null;
}

export interface Cuisson {
  jour: string;
  repas: RepasId;
  plat: Plat;
  /** Les parts au moment de cuisiner. Figées ici, jamais relues du foyer. */
  parts: number;
  /**
   * Ce que la sortie a rangé, quand quelqu'un l'a dit — T99.
   *
   * ABSENT = LE VIEUX DÉFAUT, et c'est ce qui rend ce paramètre sûr : un lot
   * par emit, au frigo, exactement comme avant. Les trois appels de test et le
   * chemin « j'ai fait autrement » passent tous par là.
   */
  rangement?: readonly RangementLot[] | null;
  /**
   * La réponse à la proposition de rangement.
   *
   * POSÉE SUR L'ÉVÉNEMENT PARCE QU'ELLE MESURE L'APP, PAS LE FOYER. C'est le
   * premier endroit où l'app apprend si son arithmétique est suivie ; sans ce
   * champ, « deux bocaux au congélateur » resterait une suggestion dont
   * personne ne saurait jamais si elle vaut quelque chose.
   */
  sortie?: EvtCuisine["sortie"];
}

/**
 * Journalise une cuisson et engage ses trois effets.
 *
 * NE SE DÉCLENCHE QUE SUR UN CRÉNEAU POSÉ, et l'appelant doit s'en assurer :
 * c'est ce qui donne le jour et le plat sans une seule saisie. Cuisiner hors
 * plan NE SE JOURNALISE PAS — c'est le plus souvent du hors-catalogue, donc
 * sans id, sans rien à décrémenter ni à produire. Le trou que ça laisse (un
 * plat du catalogue cuisiné sans créneau, dont les bocaux n'atteignent jamais
 * le dépôt) se referme par le relevé du dépôt, pas en élargissant l'événement.
 *
 * LE TROISIÈME EFFET EST CELUI QUI FERME LA BOUCLE. Ranger ce que le plat
 * `emit` est ce qui rend vraie la phrase qui a lancé toute cette carte — « si je
 * déstocke la dernière bolognaise alors il faut encourager d'en refaire pour
 * restocker ». Elle était impossible tant que cuisiner une bolognaise n'en
 * produisait aucune.
 */
export async function journaliserCuisson(
  base: Base,
  { jour, repas, plat, parts, rangement, sortie }: Cuisson,
  aujourdhui = new Date(),
): Promise<number> {
  const saisi = jourISO(aujourdhui);
  const maj = Date.now();
  const f = plat.portions > 0 ? parts / plat.portions : 1;

  return base.transaction("rw", base.evenements, base.stock, async () => {
    const lots = await base.stock.toArray();
    // Les lots déjà servis DANS CETTE CUISSON. Un plat à deux `accepts` ne doit
    // pas les satisfaire tous les deux sur le même bocal — c'est exactement le
    // jeu de jetons que `Depot` a été écrit pour tuer. Local à la transaction :
    // au niveau du module, il retiendrait la cuisson d'hier.
    const consomme = new Set<number>();

    // ── effet 2 : le dépôt rend ce que le plat lui prend ────────────────────
    //
    // `calculer()` appelait déjà `depot.prelever()`, mais SUR UNE PROJECTION
    // recomputée à chaque rendu : le bocal de bolognaise n'était jamais retiré
    // de la base. C'est ici qu'il l'est, et c'est la seule différence qui
    // compte entre une prévision et un fait.
    for (const acc of plat.accepts) {
      const trouve = lots.find(
        (l) => !consomme.has(l.id!) && accepte({ type: l.type, kind: l.kind }, acc),
      );
      if (!trouve) continue;
      const besoin = acc.qty?.amount ?? null;
      if (besoin == null || trouve.qty == null || trouve.unite !== acc.qty?.unit) {
        // Une des deux faces ne chiffre rien : le lot part en entier, comme
        // `Depot.prelever` le fait déjà, et il le dit au lieu de faire semblant.
        consomme.add(trouve.id!);
        await base.stock.delete(trouve.id!);
        continue;
      }
      const reste = trouve.qty - besoin * f;
      if (reste <= 1e-9) {
        consomme.add(trouve.id!);
        await base.stock.delete(trouve.id!);
      } else {
        await base.stock.update(trouve.id!, { qty: reste, maj });
      }
    }

    // ── effet 3 : ce que le plat produit entre au dépôt ─────────────────────
    //
    // `location: "frigo"` ET `espace: e.espace`, ET LES DEUX SONT NÉCESSAIRES.
    // Ce commentaire disait déjà « pas l'espace de destination : ce qu'on vient
    // de cuisiner refroidit au frigo, même quand ça se congèle » — mais le code
    // en dessous n'écrivait qu'un seul champ, et c'était la destination. La
    // table n'en avait pas d'autre (voir `LotStock.location`), donc la phrase
    // était vraie du modèle et fausse de la base depuis T26.
    //
    // CE QUE ÇA CORRIGEAIT DANS L'ÉCRAN : 81 des 126 emits du corpus déclarent
    // `espace: congelo`. Cuisiner des lentilles mijotées les faisait donc
    // apparaître au congélateur à la seconde où on cochait « fait », et la carte
    // du plat suivant annonçait « 250 g du congélo » — une provenance que le
    // foyer n'avait pas. Congeler reste un geste qu'on n'a pas encore fait ;
    // c'est l'inventaire qui l'enregistrera quand un doigt le dira.
    //
    // T99 — ET LE DOIGT EXISTE DEPUIS LA SORTIE. Quand elle a été suivie, elle
    // dit où chaque morceau est parti, et c'est la seule source qui puisse le
    // dire. Sans elle, RIEN NE CHANGE : un lot par emit, au frigo, sur la bande
    // que le corpus déclare. Le défaut reste donc la vieille prudence, et il
    // reste écrit ici, en une ligne qu'on peut lire.
    for (const r of rangement?.length ? rangement : defaut(plat, f)) {
      const e = plat.emits[r.emit];
      if (!e) continue;
      await base.stock.add({
        type: e.type,
        kind: e.kind,
        qty: r.qty,
        unite: e.qty ? e.qty.unit : null,
        band: r.band,
        espace: e.espace,
        location: r.location,
        born: jour,
        origine: plat.id,
        maj,
      } as LotStock);
    }

    // ── effet 1 : l'événement lui-même ─────────────────────────────────────
    const evt: EvtCuisine = {
      sorte: "cuisine", jour, saisi, repas, plat: plat.id, parts, maj,
      ...(sortie ? { sortie } : {}),
    };
    return (await base.evenements.add(evt as never)) as number;
  });
}

/** Le rangement de celui qui n'a rien rangé : un lot par emit, au frigo, sur la
 *  bande du corpus. C'est ce que l'app écrit depuis T26, et ce qu'elle continue
 *  d'écrire partout où la sortie ne s'est pas prononcée. */
const defaut = (plat: Plat, f: number): RangementLot[] =>
  plat.emits.map((e, emit) => ({
    emit,
    location: "frigo" as const,
    band: e.band,
    qty: e.qty ? e.qty.amount * f : null,
  }));

/**
 * Le créneau a-t-il déjà été cuisiné ? Marquer deux fois « fait » décrémenterait
 * deux fois, et rien dans l'app ne le rattraperait.
 */
export async function dejaCuisine(base: Base, jour: string, repas: RepasId): Promise<boolean> {
  const jours = await base.evenements.where("jour").equals(jour).toArray();
  return jours.some((e) => e.sorte === "cuisine" && e.repas === repas);
}

/** Annule une cuisson mal cochée. Le journal rend ce geste ordinaire — c'est
 *  l'une des trois choses qui tombent gratuitement une fois qu'on journalise. */
export async function annulerCuisson(base: Base, id: number): Promise<void> {
  await base.transaction("rw", base.evenements, base.stock, async () => {
    const e = await base.evenements.get(id);
    if (!e || e.sorte !== "cuisine") return;
    // Les lots produits par cette cuisson repartent. CE QU'ELLE A PRÉLEVÉ NE
    // REVIENT PAS, et l'app ne prétend pas le contraire : reconstituer un bocal
    // à moitié vidé demanderait de savoir ce qu'il portait avant, ce que le
    // journal ne dit pas. Un relevé le dira — c'est son métier.
    const produits = await base.stock.filter((l) => l.origine === e.plat && l.born === e.jour).toArray();
    await base.stock.bulkDelete(produits.map((l) => l.id!));
    await base.evenements.delete(id);
  });
}

/* ══════════════════════════════════════════════════════ les observations */

/**
 * Une correction ponctuelle, ou la réponse à une question.
 *
 * PAR INGRÉDIENT, JAMAIS PAR LOT. C'est ce qu'un œil voit en ouvrant un
 * placard : on compte des boîtes de maïs, pas « le lot n°17 ». Par lot, il
 * faudrait connaître une structure que l'app a inventée — et qui cache déjà,
 * pour `farine` et `concentre-tomate`, une réserve pesée derrière un
 * distributeur non pesé.
 */
export async function observerIngredient(
  base: Base,
  ingredient: string,
  unites: number | null,
  reste?: Constat["reste"],
  aujourdhui = new Date(),
): Promise<number> {
  const jour = jourISO(aujourdhui);
  const evt: Evenement = {
    sorte: "observation",
    portee: "ingredient",
    zone: null,
    jour,
    saisi: jour,
    constats: [{ ingredient, unites, ...(reste ? { reste } : {}) }],
    maj: Date.now(),
  };
  return (await base.evenements.add(evt as never)) as number;
}

/**
 * Un relevé de zone — le geste qui achète des semaines de silence.
 *
 * EXHAUSTIF : ce qui n'est pas dans `constats` n'est plus dans la zone. Zéro,
 * pas silence. C'est le seul geste capable de dire « il n'y en a plus » sans
 * énumérer les absents ; l'alternative laisse pourrir les fantômes, c'est-à-dire
 * exactement la façon dont le relevé du 26/08 vieillit.
 */
export async function releverZone(
  base: Base,
  zone: string,
  constats: Constat[],
  aujourdhui = new Date(),
): Promise<number> {
  const jour = jourISO(aujourdhui);
  const evt: Evenement = {
    sorte: "observation",
    portee: "zone",
    zone,
    jour,
    saisi: jour,
    constats,
    maj: Date.now(),
  };
  return (await base.evenements.add(evt as never)) as number;
}

/**
 * Le relevé du DÉPÔT — frigo, congélateur.
 *
 * C'est lui qui referme le trou laissé par « cuisiner hors plan ne se
 * journalise pas » : un plat du catalogue cuisiné sans créneau met des bocaux
 * au congélo dont l'app n'entend jamais parler, et aucun relevé de placard ne
 * les rattraperait puisqu'ils vivent au dépôt. Un congélateur est d'ailleurs
 * PLUS facile à relever qu'un placard : petit, compté en repas, ouvert tous les
 * jours.
 */
export async function releverDepot(
  base: Base,
  espace: LotStock["espace"],
  gardes: readonly number[],
): Promise<void> {
  const garde = new Set(gardes);
  await base.transaction("rw", base.stock, async () => {
    // SUR `location`, PAS SUR L'INDEX `espace`. Relever une zone, c'est ouvrir
    // une porte et regarder : ce qui compte est où le lot EST, pas où sa recette
    // voulait qu'il aille. L'index ne sert donc plus ici, et on balaye — la
    // table tient les lots d'un seul foyer, jamais plus de quelques dizaines.
    const lots = await base.stock.toArray();
    const partis = lots.filter(
      (l) => l.id != null && (l.location ?? l.espace) === espace && !garde.has(l.id),
    );
    await base.stock.bulkDelete(partis.map((l) => l.id!));
  });
}

/* ═══════════════════════════════════════════════════════════ les entrées */

/**
 * Une course rentrée devient un lot — T27.
 *
 * LE POIDS APPARTIENT AU LOT, PAS À L'INGRÉDIENT, et le relevé le prouve :
 * `thon-boite` existe en 140 g ET 160 g, `petits-pois-carottes` en 465 g et
 * 530 g. Le lot porte donc le poids que son canal lui a donné. Le défaut par
 * ingrédient, lui, se DÉRIVE — le dernier poids vu pour cet id — donc aucun des
 * 61 ids d'épicerie n'a besoin d'être rempli à la main.
 */
export async function journaliserEntree(
  base: Base,
  lignes: LigneEntree[],
  aujourdhui = new Date(),
): Promise<number> {
  const jour = jourISO(aujourdhui);
  const evt: Evenement = { sorte: "entree", jour, saisi: jour, lignes, maj: Date.now() };
  return (await base.evenements.add(evt as never)) as number;
}

/**
 * Le dernier poids vu pour un ingrédient, dérivé du journal et du catalogue.
 *
 * DÉRIVÉ, JAMAIS SAISI — même instinct que la dérive : le journal le calcule,
 * personne ne le tape. Sans poids connu, on ne rend rien, et le mode non
 * chiffré s'applique : « il y en a » reste une information.
 */
export function poidsConnu(
  catalogue: Catalogue,
  evenements: readonly Evenement[],
  ingredient: string,
): { amount: number; unit: string } | null {
  for (let i = evenements.length - 1; i >= 0; i -= 1) {
    const e = evenements[i]!;
    if (e.sorte !== "entree") continue;
    const l = e.lignes.find((x) => x.ingredient === ingredient && x.parUnite);
    if (l?.parUnite) return l.parUnite;
  }
  const d = catalogue.gardeManger.denrees.find((x) => x.ingredient === ingredient && x.parUnite);
  return d?.parUnite ?? null;
}
