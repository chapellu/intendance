// Écran « En cuisine » — T12 du backlog.
//
// LE SEUL ÉCRAN QUI SORT DE LA COQUILLE. Pas de barre du bas, pas de
// sous-navigation : on le lit à bout de bras, avec les mains sales, et tout ce
// qui n'est pas l'étape en cours est du bruit. Une étape par écran, en gros.
//
// CE QUI SE PERSISTE ICI EST DIFFÉRENT DU RESTE DE L'APP. Ailleurs on range des
// décisions ; ici on range un AVANCEMENT — où l'on en est dans la recette, et
// jusqu'à quand le minuteur court. C'est le seul état dont la perte fasse
// vraiment mal : un téléphone qui se verrouille à l'étape 5 sur 9 avec une
// casserole sur le feu. Le reste (la liste d'ingrédients dépliée) est un regard,
// et reste en mémoire.
//
// Port de `apps/proto-shell/comptoir.js` (`ecranCuisine`).

import { useEffect, useState, type ReactNode } from "react";
import { indexDuCreneau } from "../db";
import { useCatalogue, useSemaine } from "../db/hooks";
import { dejaCuisine, journaliserCuisson, type RangementLot } from "../db/journal";
import {
  cleEtape,
  cleMinuteur,
  cleMiseEnPlace,
  poserReglage,
  useDrapeau,
  useNombre,
  useObjet,
} from "../db/reglages";
import { base } from "../db/schema";
import { facteurAffiche, quantiteACuire, type Calcul } from "../model/calcul";
import { estUneFournee, lotsEnBoites, platDuSoir } from "../model/repas";
import { joue, type Jeu } from "../model/jeu";
import { heureDe } from "../model/heures";
import type { Catalogue, Etape, Foyer, Plat } from "../model/types";
import { ENTREE_CUISINE, type CleCreneau } from "../nav/routes";
import { aller } from "../nav/useRoute";
import { armer, arreter, demanderBandeau, desarmer, plateforme, promesse } from "../pwa/alarme";
import { duree, fmt, hhmm, mmss } from "../ui/format";
import { Icone, iconeEspace } from "../ui/icones";
import { nomEspace } from "../ui/phrases";
import {
  aArmer,
  aSortir,
  aTable,
  avancement,
  basculerMinuteur,
  chauffeDe,
  credit,
  minuteur,
  minuteurUtile,
  miseEnPlace,
  montrerMiseEnPlace,
  outilDe,
  phraseAussi,
  phraseDuRole,
  pourLire,
  provenanceIngredient,
  quantitesDeLEtape,
  SANS_USES,
  sansRecette,
  tempsDuPlat,
  type EtatMinuteur,
  type Recipient,
} from "./cuisiner.vue";
import { phraseDesBoites, phraseDuManque, quantiteDuLot, vueDeLaSortie } from "./sortie.vue";

export function Cuisiner({ creneau, plat }: { creneau: CleCreneau; plat?: string }) {
  const { catalogue } = useCatalogue();
  const { jeu, calc } = useSemaine(catalogue);
  if (!jeu || !calc) return null;

  const i = indexDuCreneau(jeu, creneau.jour, creneau.repas);
  // `?? null` PARCE QU'UN INDEX HORS SEMAINE NE REND RIEN : « pas de créneau »
  // et « un créneau qui ne porte rien » se cuisinent pareil — pas du tout.
  const pose = (i >= 0 ? jeu.choix[i] : null) ?? null;
  // Sans plat dans l'URL, c'est celui du créneau ; avec, c'est le candidat
  // qu'on est venu lire depuis « Poser ».
  const rid = plat ?? pose;
  const p = joue(rid ?? null) ? jeu.plats[rid as string] : undefined;
  if (!p) return <Introuvable />;

  return (
    <Fiche
      jeu={jeu}
      calc={calc}
      i={i}
      creneau={creneau}
      p={p}
      lecture={pourLire(plat, pose)}
    />
  );
}

const Introuvable = () => (
  <div className="co-corps plat">
    <div className="co-vide">Ce plat n’existe pas — ou plus.</div>
  </div>
);

/** « Sortir » rend la main à ce qu'on faisait avant, quel que soit l'écran qui
 *  a ouvert la fiche : depuis « Poser » on revient choisir, depuis le fil on
 *  revient au pas. Sans histoire — la fiche ouverte directement par son URL —
 *  on retombe sur l'ENTRÉE de la cuisine, pas sur « Aujourd'hui » en dur : sans
 *  les jours, c'était un renvoi vers un écran éteint (balayage de T110). */
function sortir() {
  if (window.history.length > 1) window.history.back();
  else aller(ENTREE_CUISINE);
}

function Fiche({
  jeu,
  calc,
  i,
  creneau,
  p,
  lecture,
}: {
  jeu: Jeu;
  calc: Calcul;
  i: number;
  creneau: CleCreneau;
  p: Plat;
  /** On est venu LIRE cette recette pour décider, pas la cuisiner — T91. */
  lecture: boolean;
}) {
  const [ingr, setIngr] = useState(false);
  // LA PORTE DU GUIDE, DEPUIS UN RÉSUMÉ — T91. Un regard, donc un état de
  // composant et pas un réglage persisté : rouvrir cette fiche demain, c'est
  // revenir décider, pas reprendre une cuisson qu'on n'avait pas commencée.
  // (Ce qui se persiste ici est un AVANCEMENT — voir l'en-tête du fichier.)
  const [guide, setGuide] = useState(false);
  // LA SORTIE — T99. Pas persistée, et l'avancement la rattrape : tant qu'on
  // n'a pas répondu, l'étape reste la dernière, donc rouvrir la fiche ramène
  // sur « Terminer », qui ramène ici. Persister cet écran-là ferait rouvrir
  // demain matin une question sur une casserole qu'on a rangée hier soir.
  const [sortie, setSortie] = useState(false);
  const cle = cleEtape(creneau.jour, creneau.repas, p.id);
  const range = useNombre(cle);
  // LA MISE EN PLACE PASSÉE — T112. Persistée comme l'avancement, et pour la
  // même raison : c'en est le premier cran. Un regard (`ingr`) se perd sans
  // dommage ; revoir la liste de ce qu'on a déjà sorti, la casserole sur le feu,
  // serait l'écran qui fait sortir du guide au mauvais moment.
  const cleP = cleMiseEnPlace(creneau.jour, creneau.repas, p.id);
  const passee = useDrapeau(cleP);

  if (range === undefined || passee === undefined) return null;
  const steps = p.steps;
  const etape = Math.min(range, Math.max(0, steps.length - 1));

  const temps = tempsDuPlat(steps);
  const parts = (i >= 0 ? jeu.parts[i] : undefined) ?? jeu.catalogue.foyer.parts;
  const f = (i >= 0 ? calc.facteurs[i] : undefined) || facteurAffiche(p, parts);
  // T142 — le midi de demain, mis de côté ce soir : compris dans `parts`, et
  // c'est la sortie qui le range.
  const midi = (i >= 0 && !lecture ? jeu.midi?.[i] : null) ?? 0;
  const pSoir = platDuSoir(p, midi);

  /**
   * Terminer une recette JOURNALISE la cuisson — T26.
   *
   * SEULEMENT SUR LE PLAT QUE LE CRÉNEAU PORTE. La garde disait `i >= 0` et
   * croyait dire ça ; elle disait en fait « le créneau est dans la semaine »,
   * ce qui est vrai pendant toute une passe. Lire un candidat sur le dîner de
   * jeudi, c'était donc `i >= 0`, et « Terminer » y journalisait la cuisson
   * d'un plat jamais posé — le placard descendait pour avoir feuilleté une
   * recette. Le cas se touchait au doigt sur les plats sans étapes, dont la
   * fiche s'ouvre directement sur son bouton.
   *
   * T91 ferme le chemin par en haut : une lecture n'ouvre plus le guide, donc
   * plus de « Terminer » à toucher par accident. Elle le rouvre à la demande
   * — `guide` —, et LÀ, terminer journalise pour de bon : faire un plat qu'on
   * n'avait pas posé reste une cuisson, et le placard doit le savoir. La
   * différence n'est pas le créneau, c'est qu'un doigt l'a demandé.
   *
   * `parts` est figé ICI, à l'instant où l'on cuisine, et pas relu du foyer plus
   * tard : un foyer qui grandit ne doit pas changer rétroactivement ce qui a
   * été mangé.
   *
   * `dejaCuisine` protège du double décrément — marquer deux fois « fait » est
   * un geste qu'on fait vraiment, et rien d'autre dans l'app ne le rattraperait.
   */
  const terminer = async (rangement: RangementLot[] | null, marque?: "suivie" | "autre") => {
    if ((lecture && !guide) || i < 0) return;
    if (await dejaCuisine(base, creneau.jour, creneau.repas)) return;
    await journaliserCuisson(base, {
      jour: creneau.jour,
      repas: creneau.repas,
      plat: pSoir,
      parts,
      midi,
      rangement,
      sortie: marque,
      foyer: jeu.catalogue.foyer,
    });
  };

  /**
   * Répondre à la sortie EST le geste qui journalise — T99.
   *
   * LE DÉCOMPTE ARRIVE APRÈS LA QUESTION, ET PAS AVANT. Jusqu'ici « Terminer »
   * engageait les trois effets puis sortait de l'écran sans un mot : les quatre
   * issues possibles — journalisée, refusée parce qu'on lisait, refusée faute
   * de créneau, refusée parce que déjà cuisinée — rendaient le MÊME écran, à
   * savoir celui d'avant. « Même arrivé au bout de la recette je n'ai pas eu de
   * message pour la clore » (24/09) ne dit pas que le décompte a raté : il dit
   * qu'il n'avait aucun témoin.
   *
   * L'AVANCEMENT NE S'EFFACE QU'UNE FOIS LA RÉPONSE PARTIE. Quitter la sortie
   * sans répondre laisse donc la fiche à sa dernière étape, et « Terminer » la
   * rouvre. On ne perd pas une cuisson pour avoir posé le téléphone.
   */
  const repondre = (rangement: RangementLot[] | null, marque?: "suivie" | "autre") => {
    void terminer(rangement, marque).finally(() => {
      // La mise en place s'efface AVEC l'avancement : la prochaine cuisson du
      // même plat sur le même créneau — une seconde fournée — repart du début.
      void Promise.all([poserReglage(cle, null), poserReglage(cleP, null)]).finally(sortir);
    });
  };

  const tete = (
    <>
      <div className="co-fiche-tete">
        <button className="co-retour" onClick={sortir}>
          ‹ Sortir
        </button>
        <span className="t">{p.titre}</span>
        <button
          className={`btn ${ingr ? "btn-primary" : "btn-secondary"}`}
          style={{ fontSize: 12.5, padding: "7px 13px" }}
          onClick={() => setIngr(!ingr)}
        >
          Ingrédients
        </button>
      </div>
      <div className="co-segments">
        {steps.map((s, n) => (
          <i key={s.id} className={n < etape ? "faite" : n === etape ? "ici" : ""} />
        ))}
      </div>
    </>
  );

  // Un plat sans étapes n'a pas de mode guidé — il n'a qu'une liste. La fiche
  // s'ouvre alors dessus, plutôt que sur un écran vide ; depuis T112, cette
  // liste est sa mise en place, qui porte son « Terminer ».
  //
  // ⚠ ET IL POUVAIT ALORS N'ÊTRE JAMAIS TERMINÉ, ce qui est un trou dans la
  // promesse centrale de l'app. « Terminer » est le SEUL endroit où le stock
  // descend, et il ne vivait que dans le mode guidé : les 15 plats du corpus
  // sans `steps` — la bolognaise, le poulet rôti, la quiche aux poireaux —
  // pouvaient être cuisinés sans que rien ne soit jamais journalisé. Le parcours
  // e2e ne l'a pas vu pendant des mois parce qu'il tirait toujours une carte qui,
  // elle, avait des étapes ; c'est un simple changement de classement qui a fini
  // par lui en tirer une autre. Trouvé et bouché en marge de Workspace#50.
  const muet = sansRecette(p);

  // LA SORTIE PASSE AVANT TOUT LE RESTE — T99. C'est le dernier écran de la
  // cuisson, et il n'a ni ingrédients, ni étapes, ni minuteur : la casserole
  // est vide, il ne reste qu'à ranger.
  if (sortie)
    return (
      <Sortie
        p={pSoir}
        parts={parts - midi}
        sachets={estUneFournee(jeu.catalogue, p)}
        f={f}
        foyer={jeu.catalogue.foyer}
        stock={lotsEnBoites(jeu.catalogue, jeu.stock, new Date())}
        revenir={() => setSortie(false)}
        repondre={repondre}
      />
    );

  // LE RÉSUMÉ, QUAND ON EST VENU LIRE — T91. Il passe AVANT la bascule
  // « Ingrédients » et avant le guide, parce que ce n'est pas une troisième
  // vue du même écran mais l'autre moitié de son métier : décider. Il n'a ni
  // segments d'avancement (rien n'est commencé), ni minuteur, ni « Terminer ».
  if (lecture && !guide)
    return (
      <>
        <div className="co-fiche-tete">
          {/* « REVENIR » ET PAS « SORTIR ». On n'est entré nulle part : on est
              allé voir, et le mot doit ramener là où la décision se prend —
              c'est `sortir()` qui sait où, par l'histoire de navigation. */}
          <button className="co-retour" onClick={sortir}>
            ‹ Revenir
          </button>
          <span className="t">{p.titre}</span>
          <span className="d">{duree(temps.total)}</span>
        </div>
        {muet ? (
          <div className="co-sansrecette">
            <Icone nom="info" />
            <span>{muet.long}</span>
          </div>
        ) : null}
        <Ingredients p={p} parts={parts} f={f} jeu={jeu} i={i}>
          <Deroule steps={steps} temps={temps} />
        </Ingredients>
        {/* LE GUIDE RESTE ATTEIGNABLE, ET C'EST UNE PORTE, PLUS UN COULOIR.
            On peut décider de faire ce plat SANS l'avoir posé — c'était déjà
            vrai avant ce ticket, et la cuisine ne demande pas la permission du
            planning. Ce qui change est l'ordre : le pas-à-pas s'ouvre parce
            qu'on l'a demandé, au lieu d'accueillir quelqu'un qui venait lire.
            Secondaire, et en bas : la sortie de cet écran est « Revenir », en
            haut, parce que neuf fois sur dix on repart choisir. */}
        <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
          <button className="btn btn-secondary btn-block" onClick={() => setGuide(true)}>
            {steps.length ? "Ouvrir le guide" : "Cuisiner ce plat"}
          </button>
        </div>
      </>
    );

  // LA MISE EN PLACE, AVANT L'ÉTAPE 1 — T112. Après la lecture (une lecture ne
  // cuisine pas : elle y arrive par « Ouvrir le guide ») et avant la bascule
  // « Ingrédients », qui est un regard en cours de route. Un plat sans étapes
  // n'a qu'elle, et elle porte alors son « Terminer » — voir
  // `montrerMiseEnPlace`.
  if (!ingr && montrerMiseEnPlace(steps, range, passee))
    return (
      <MiseEnPlace
        i={i}
        p={p}
        parts={parts}
        f={f}
        jeu={jeu}
        commencer={() => void poserReglage(cleP, true)}
        terminer={() => setSortie(true)}
      />
    );

  // LA LISTE, EN COURS DE ROUTE. Seulement sur un plat qui a des étapes : celui
  // qui n'en a pas reste sur sa mise en place, qui porte déjà la phrase de T78
  // (« ce plat n'a pas encore ses étapes ») et son « Terminer ».
  if (ingr)
    return (
      <>
        {tete}
        <Ingredients p={p} parts={parts} f={f} jeu={jeu} i={i} />
        <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
          <button className="btn btn-secondary btn-block" onClick={() => setIngr(false)}>
            Revenir à l’étape {etape + 1}
          </button>
        </div>
      </>
    );

  return (
    <>
      {tete}
      <Guide
        p={p}
        foyer={jeu.catalogue.foyer}
        catalogue={jeu.catalogue}
        steps={steps}
        etape={etape}
        repas={creneau.repas}
        cle={cle}
        cleM={cleMinuteur(creneau.jour, creneau.repas, p.id, steps[etape]!.id)}
        fin={() => setSortie(true)}
        avant={() => void poserReglage(cleP, null)}
        f={f}
      />
    </>
  );
}

/* ───────────────────────────────────────────────────────── la mise en place */

/**
 * LE PREMIER ÉCRAN D'UNE CUISSON — T112, demandé le 2026-10-16 : « un écran
 * résumé au début d'une séance de cuisine ».
 *
 * CE N'EST PAS LE RÉSUMÉ DE T91, ET IL N'EN REPREND PAS LA FORME. Le résumé
 * répond à « est-ce que je le pose ? » : il a le déroulé, et rend la main. La
 * mise en place répond à « qu'est-ce que je sors avant d'allumer le feu ? » :
 * les quantités aux parts du créneau, le récipient et s'il suffit, les boîtes
 * qu'il faudra au bout, et le temps qu'on y passera devant. Pas de déroulé — le
 * guide le donne une étape à la fois, et c'est le bouton d'en bas.
 *
 * LES BOÎTES SONT ANNONCÉES AVANT, PARCE QUE C'EST LÀ QU'ON PEUT ENCORE LES
 * CHERCHER. La sortie de T99 les nomme quand la casserole est pleine et les
 * mains occupées ; les découvrir sales au fond de l'évier à ce moment-là est
 * exactement le retour d'usage du pot-au-feu (« pas assez de boîtes »).
 *
 * UN PLAT SANS ÉTAPES N'A QUE CET ÉCRAN, et il y garde son « Terminer » : le
 * même geste que la dernière étape du guide, qui mène à la même sortie.
 */
function MiseEnPlace({
  i,
  p,
  parts,
  f,
  jeu,
  commencer,
  terminer,
}: {
  /** Le créneau de la fiche — pour ce que la carte de 15 h disait là. */
  i: number;
  p: Plat;
  parts: number;
  f: number;
  jeu: Jeu;
  /** « C'est parti » — passe la mise en place, ouvre l'étape 1. */
  commencer: () => void;
  /** Le plat sans étapes : directement la sortie. */
  terminer: () => void;
}) {
  const m = miseEnPlace(p, parts, f, jeu.catalogue.foyer);
  const muet = sansRecette(p);
  const avecEtapes = p.steps.length > 0;
  return (
    <>
      <div className="co-fiche-tete">
        <button className="co-retour" onClick={sortir}>
          ‹ Sortir
        </button>
        <span className="t">{p.titre}</span>
      </div>
      {/* LA FICHE LE DIT AVANT LA LISTE, PAS APRÈS — la plainte du 14/09, « tu
          m'as encore fourni une recette sans étapes ». Un écran qui se tait sur
          ce qui lui manque se lit comme un écran cassé ; la phrase se pose là
          où l'œil arrive, entre le titre et les quantités, et pas près du
          bouton où elle ressemblerait à un avertissement de dernière minute.
          (Venue de l'ancienne liste des plats sans étapes, que cet écran
          remplace.) */}
      {muet ? (
        <div className="co-sansrecette">
          <Icone nom="info" />
          <span>{muet.long}</span>
        </div>
      ) : null}
      <Ingredients p={p} parts={parts} f={f} jeu={jeu} i={i} tient={m.recipient}>
        {/* LE TEMPS, PUIS LA SORTIE — sous la liste, parce que la liste est ce
            qu'on sort en premier et que l'œil y arrive directement. */}
        <div className="co-mep">
          {avecEtapes ? (
            <div className="temps">
              <div>
                <span className="co-kicker">En tout</span>
                <div className="v">{duree(m.total)}</div>
              </div>
              <div>
                {/* « DEVANT LE FEU », pas « actif » : c'est la question qu'on
                    se pose — combien de temps je ne peux pas quitter la
                    cuisine. Le reste se dit dessous, avec le même mot que le
                    guide. */}
                <span className="co-kicker">Devant le feu</span>
                <div className="v">{duree(m.actif)}</div>
              </div>
            </div>
          ) : null}
          {avecEtapes && m.libre ? (
            <div className="co-note">dont {duree(m.libre)} sans surveiller, à côté.</div>
          ) : null}
          <div className="co-kicker accent" style={{ margin: "var(--space-4) 0 var(--space-2)" }}>
            Pour ranger à la fin
          </div>
          {m.rien ? (
            <div className="co-note">Rien à mettre de côté : tout part dans les assiettes.</div>
          ) : (
            m.ranger.map((l, n) => (
              <div key={`${l.location}-${n}`} className="co-lot">
                <Icone nom={iconeEspace(l.location)} />
                <span style={{ flex: 1 }}>
                  <div className="nom">
                    {nomEspace(l.location)} · {l.quantite}
                  </div>
                  {/* Muet quand le foyer n'a déclaré aucun contenant pour cet
                      espace — même silence que la sortie. */}
                  {l.boites ? <div className="ou">{l.boites}</div> : null}
                </span>
              </div>
            ))
          )}
        </div>
      </Ingredients>
      <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
        {avecEtapes ? (
          <button className="btn btn-primary btn-block" onClick={commencer}>
            C’est parti
          </button>
        ) : (
          // Le même geste et le même mot que la dernière étape du guide, parce
          // que c'est le même événement : ce plat n'a qu'une étape, la faire.
          // Et depuis T99 la même suite : un plat sans étapes laisse les mêmes
          // bocaux sur le plan de travail qu'un plat qui en a douze.
          <button className="btn btn-primary btn-block" onClick={terminer}>
            Terminer
          </button>
        )}
      </div>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────── la sortie */

/**
 * LE DERNIER ÉCRAN DE LA CUISSON — T99, demandé le 24/09 au sortir d'une
 * ratatouille : « même arrivé au bout de la recette je n'ai pas eu de message
 * pour la clore ».
 *
 * TROIS DESTINATIONS, ET L'ÉCRAN LES NOMME TOUTES LES TROIS. Les assiettes —
 * les parts du soir, qu'on ne range pas —, le frigo pour ce qui se mange dans
 * les jours qui viennent, le congélateur pour le surplus. C'est le découpage
 * que la demande décrivait mot pour mot, et `sortie.vue.ts` le calcule à partir
 * de ce que la recette et le foyer déclaraient déjà.
 *
 * LA QUESTION EST « AVEZ-VOUS SUIVI », PAS « AVEZ-VOUS CUISINÉ ». Les deux
 * réponses journalisent : le plat a été fait dans les deux cas, et faire
 * dépendre le décompte de l'obéissance à une suggestion serait la meilleure
 * façon de perdre des cuissons. Ce qui change entre les deux, c'est ce que la
 * base apprend du RANGEMENT — « suivie » écrit les `location` proposées, et
 * c'est le seul chemin de l'app vers un `location: "congelo"` ; « autre » les
 * laisse au frigo, là où la prudence de T87 les mettait déjà.
 *
 * PAS DE TROISIÈME BOUTON POUR PASSER. Un « plus tard » en un doigt rendrait
 * exactement l'écran d'avant — celui qui ne disait rien — et c'est ce qu'on
 * répare. La porte de sortie sans réponse existe quand même, et c'est
 * « ‹ Le guide » : elle ne journalise rien et laisse la fiche à sa dernière
 * étape, d'où « Terminer » ramène ici.
 */
function Sortie({
  p,
  parts,
  f,
  foyer,
  stock,
  sachets = false,
  revenir,
  repondre,
}: {
  p: Plat;
  parts: number;
  f: number;
  foyer: Foyer;
  /** Ce que le dépôt porte déjà — ses boîtes ne sont pas libres (T109). */
  stock: Jeu["stock"];
  /** T142 — une fournée part en sachets de congélation, pas en boîtes. */
  sachets?: boolean;
  revenir: () => void;
  repondre: (rangement: RangementLot[] | null, marque?: "suivie" | "autre") => void;
}) {
  const v = vueDeLaSortie(p, parts, f, foyer, stock, sachets);
  return (
    <>
      <div className="co-fiche-tete">
        <button className="co-retour" onClick={revenir}>
          ‹ Le guide
        </button>
        <span className="t">{p.titre}</span>
      </div>
      <div className="co-corps">
        <div className="co-encart">
          <Icone nom="info" />
          <span>
            <b>C’est prêt.</b> {fmt(v.table)} parts passent à table.
          </span>
        </div>

        {v.rien ? (
          /* 23 plats du corpus sur 138 ne déclarent aucun `emit`. Se taire ici
             laisserait croire à un écran qui n'a pas fini de charger ; la
             phrase dit que le vide est une réponse. */
          <div className="co-note" style={{ margin: "var(--space-3) var(--space-1)" }}>
            Rien à mettre de côté pour cette recette&nbsp;: tout part dans les assiettes.
          </div>
        ) : (
          <>
            <div className="co-kicker accent" style={{ margin: "var(--space-4) 0 var(--space-2)" }}>
              Et le reste se range
            </div>
            {v.lots.map((l, n) => (
              <div key={`${l.emit}-${l.location}-${n}`} className="co-lot">
                <Icone nom={iconeEspace(l.location)} />
                <span style={{ flex: 1 }}>
                  <div className="nom">
                    {nomEspace(l.location)} · {quantiteDuLot(l)}
                  </div>
                  {/* LE GESTE, ET PAS SEULEMENT LA DESTINATION. « Au congélateur »
                      laisse la question qu'on se pose vraiment, les mains pleines :
                      dans quoi. Muet quand le foyer n'a déclaré aucun contenant
                      pour cet espace — inventer une boîte serait pire que de se
                      taire. */}
                  {l.boites.length ? <div className="ou">{phraseDesBoites(l.boites)}</div> : null}
                  {/* T109 — LE MANQUE SE DIT, au lieu de proposer une boîte
                      qu'on n'a plus : « il manque 2 × … : sacs congélation ? ». */}
                  {l.manque ? <div className="ou">⚠ {phraseDuManque(l.manque)}</div> : null}
                  {/* La phrase de la recette, à l'instant où elle sert. */}
                  {l.note ? <div className="ou">{l.note}</div> : null}
                </span>
                {l.garde != null ? (
                  <span>
                    <div className="q">{l.garde} j</div>
                    <div className="src">à manger</div>
                  </span>
                ) : null}
              </div>
            ))}
          </>
        )}

        <div style={{ marginTop: "var(--space-6)" }}>
          {v.rien ? (
            <button className="btn btn-primary btn-block" onClick={() => repondre(null)}>
              C’est fait
            </button>
          ) : (
            <>
              <button
                className="btn btn-primary btn-block"
                onClick={() => repondre(v.lots, "suivie")}
              >
                C’est rangé comme ça
              </button>
              {/* MÊME POIDS DE DOIGT, MOINS DE POIDS À L'ŒIL. Les deux réponses
                  ferment la recette ; celle-ci dit seulement qu'on ne sait pas
                  où les boîtes sont parties, donc la base retombe sur sa
                  prudence au lieu d'inscrire un congélateur qu'elle n'a pas vu. */}
              <button
                className="btn btn-secondary btn-block"
                style={{ marginTop: "var(--space-2)" }}
                onClick={() => repondre(null, "autre")}
              >
                J’ai fait autrement
              </button>
            </>
          )}
          {/* CE QUE LE BOUTON FAIT VRAIMENT, ÉCRIT SOUS LE BOUTON. C'est la
              deuxième moitié de la demande du 24/09 — « valider la réalisation
              de la recette, déduire les ingrédients des stocks et enlever la
              recette de la liste des choses à faire » — et ces trois effets
              partaient jusqu'ici sans que personne ne les annonce. */}
          <div className="co-note" style={{ margin: "var(--space-2) var(--space-1) 0" }}>
            Le plat est compté comme cuisiné&nbsp;: ses ingrédients descendent du placard, et il
            quitte la liste des posés.
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────── les ingrédients */

function Ingredients({
  p,
  parts,
  f,
  jeu,
  i,
  tient,
  children,
}: {
  /** Le créneau de la fiche : la provenance lit ce que la carte de 15 h y
   *  disait là (`Jeu.dejaLa`), comme la liste de courses. */
  i: number;
  p: Plat;
  parts: number;
  f: number;
  // LE JEU, ET PLUS LE SEUL CATALOGUE : la provenance d'un ingrédient dépend de
  // ce qu'il reste au garde-manger, que le rejeu du journal repose sur le jeu.
  jeu: Jeu;
  /** Ce que le résumé glisse entre la liste et le crédit — T91. Un enfant
   *  plutôt qu'un second bloc collé dessous, parce que le crédit FERME la
   *  fiche : posé après le déroulé, il resterait dernier ; posé avant, il
   *  couperait la lecture en deux. */
  children?: ReactNode;
  /** L'ustensile ET s'il tient — T112, sur la mise en place seulement. Absent,
   *  la ligne « À sortir » reste neutre, comme T74 l'a voulue pour la fiche et
   *  le résumé (voir `aSortir`). */
  tient?: Recipient | null;
}) {
  const produit = +(p.portions * f).toFixed(1);
  const ustensile = aSortir(p);
  const cr = credit(p);
  const table = aTable(jeu, p, parts, i);
  return (
    <div className="co-corps">
      <div className="co-encart">
        <Icone nom="info" />
        <span>
          <b>
            Pour {fmt(parts)} parts · on en cuisine {fmt(produit)}.
          </b>{" "}
          {produit > parts + 0.05
            ? p.lotEntier
              ? "Le lot ne se coupe pas."
              : "Ça se garde, autant faire le lot."
            : ""}{" "}
          {/* LE RÔLE, DANS LA LIGNE QUI PORTE DÉJÀ LES PARTS, parce que c'est
              cette phrase-là qu'il corrige : « on en cuisine 6 » ne veut pas
              dire six dîners quand la recette compte ses parts en
              accompagnement. Muette sur un plat — 121 fiches sur 138. */}
          {phraseDuRole(p)}
        </span>
      </div>
      {/* T159 — LE CRÉDIT OUVRE LA FICHE (il la fermait depuis T73). Le
          24/10, le foyer a voulu vérifier des recettes dans le livre : il faut
          le livre et la page sous les yeux, sans descendre sous les
          ingrédients — et savoir tout de suite quand il n'y a pas de livre. */}
      <div className="co-credit">
        {cr.url ? (
          <a href={cr.url} target="_blank" rel="noreferrer">
            {cr.texte}
          </a>
        ) : (
          cr.texte
        )}
      </div>
      {/* T74 — « à sortir avant de commencer », sur la FICHE et pas sur
          l'étape : le guide se lit à bout de bras et tout ce qui n'est pas
          l'étape en cours y est du bruit. Muet sur les 72 plats sans
          vaisselle. */}
      {ustensile && (
        <div className={`co-sortir${tient && !tient.tient ? " deborde" : ""}`}>
          <Icone nom={tient && !tient.tient ? "alerte" : "info"} />
          <span>
            À sortir : <b>{ustensile}</b>
            {/* LA MÊME LIGNE, PAS UNE SECONDE. Le récipient et la question de
                savoir s'il suffit se lisent ensemble, au moment où la main va
                le chercher dans le placard. */}
            {tient ? <span className="tient">{tient.phrase}</span> : null}
          </span>
        </div>
      )}
      <div className="co-ing">
        {p.ingredients.map((x) => {
          const prov = provenanceIngredient(jeu, x, { i, plat: p.id });
          // `key` sur `ref` ET PAS SUR `id` : onze plats portent deux lignes du
          // même ingrédient — la farine de la pâte et celle de la crème — et
          // React recevait deux fois la même clé. C'est `ref` qui les
          // distingue, et elle n'existait pas avant T72.
          return (
            <div key={x.ref} className="l">
              <span className="nom">{x.nom}</span>
              <span className="q">{quantiteACuire(jeu.catalogue, x, f)}</span>
              <span className={`p ${prov.acheter ? "acheter" : ""}`}>{prov.label}</span>
            </div>
          );
        })}
      </div>
      {children}
      {/* À TABLE — ce qu'il faut À CÔTÉ, sous les ingrédients et pas dedans.
          « Il manque toujours les accompagnements, je n'ai pas un repas
          complet » (22/09) : la fiche listait ce qui entre dans le plat et
          s'arrêtait là, alors que le riz et la salade verte des escalopes
          décident autant du repas que les 500 g de champignons.

          DEUX LISTES ET PAS UNE, parce que ce ne sont pas les mêmes gestes ni
          les mêmes quantités : ce qui est au-dessus se pèse et se mélange, ce
          qui est ici se pose sur la table à côté, et se compte pour ceux qui
          sont là ce soir plutôt que pour le lot cuisiné (cf. `aTable`).
          Muet sur les plats qui ne le disent pas — se taire dit « on ne sait
          pas », une section vide dirait « rien à ajouter ». */}
      {table.length > 0 && (
        <div className="co-atable">
          <div className="tt">À table, à côté</div>
          {table.map((x) => (
            <div key={x.id} className="l">
              <span className="nom">{x.nom}</span>
              <span className="q">{x.quantite}</span>
              <span className={`p ${x.prov.acheter ? "acheter" : ""}`}>{x.prov.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── le déroulé, en lecture */

/**
 * La suite des gestes, sans les faire — T91.
 *
 * LES GESTES ET LEURS MINUTES, RIEN DE PLUS. Pas d'astuce, pas d'encart
 * enfant, pas de chauffe : le guide les donne au moment où ils servent, c'est-
 * à-dire l'étape sous la main, et les empiler ici rendrait douze écrans en un
 * seul. La question du résumé n'est pas « comment on fait » mais « qu'est-ce
 * que ça me demande » — et ça, ça tient dans une liste numérotée.
 *
 * MUET SANS ÉTAPES, et la fiche l'a déjà dit plus haut : le plat entré « niveau
 * plan » porte sa phrase entre le titre et les quantités (T78). Un bloc
 * « Le déroulé » vide juste en dessous répéterait le manque en ayant l'air
 * d'une panne.
 */
function Deroule({
  steps,
  temps,
}: {
  steps: Etape[];
  temps: { total: number; libre: number };
}) {
  if (!steps.length) return null;
  return (
    <div className="co-etapes">
      <div className="tete">
        {/* LE TEMPS N'EST PAS DANS LE KICKER, et ce n'est pas un détail de
            goût : `.co-kicker` passe en capitales, et « 1 h » y devient
            « 1 H ». Un titre de bloc se crie, une durée se lit. */}
        <span className="co-kicker">Le déroulé</span>
        <span className="d">
          {steps.length} étape{steps.length > 1 ? "s" : ""} · {duree(temps.total)}
          {/* CE QUI FAIT DIRE OUI UN MARDI SOIR. Voir `tempsDuPlat` : le total
              seul se lit comme un refus, alors que l'essentiel de l'heure se
              passe souvent sans personne devant. */}
          {temps.libre ? `, dont ${duree(temps.libre)} sans surveiller` : ""}
        </span>
      </div>
      {steps.map((e, n) => (
        <div key={e.id} className="l">
          <span className="n">{n + 1}</span>
          <span className="a">{e.action}</span>
          {e.minutes ? <span className="m">{duree(e.minutes)}</span> : null}
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── le guide */

function Guide({
  p,
  foyer,
  catalogue,
  steps,
  etape,
  repas,
  cle,
  cleM,
  fin,
  avant,
  f,
}: {
  p: Plat;
  foyer: Foyer;
  /** T140 : pour dire « 1 boîte entière » à l'étape comme dans la liste. */
  catalogue: Catalogue;
  steps: Etape[];
  etape: number;
  repas: string;
  cle: string;
  cleM: string;
  /** La dernière étape est faite — T99. Le guide ne journalise plus rien
   *  lui-même : il passe la main à la sortie, qui pose la question. */
  fin: () => void;
  /** « ‹ » sur l'étape 1 : revenir à la mise en place — T112. */
  avant: () => void;
  /** Le facteur de la fiche — celui de la liste des ingrédients — T113. */
  f: number;
}) {
  const e = steps[etape]!;
  const etat = useObjet<EtatMinuteur>(cleM);
  const maintenant = useHorloge(!!etat && etat !== null && "fin" in etat);

  // T82 — l'app rouverte sur un minuteur qui courait déjà. `armer` est
  // idempotente sur l'échéance, donc cet effet ne défait pas ce que le doigt
  // vient de faire ; `false` dit qu'aucun geste ne le porte, et seul le bandeau
  // s'arme alors — le son, lui, exige une interaction et ne se rattrape pas.
  //
  // AUCUN NETTOYAGE AU DÉMONTAGE, ET C'EST LE POINT DU TICKET. Avancer d'une
  // étape pendant que la casserole mijote est le cas NORMAL — c'est même ce que
  // « sans surveiller » invite à faire. Désarmer en quittant l'étape retirerait
  // l'alarme exactement quand elle sert ; ce qui la retire, c'est la pause, le
  // relancement, ou l'échéance atteinte.
  useEffect(() => {
    const fin = aArmer(etat ?? null, Date.now());
    if (fin !== null) armer(cleM, fin, false);
  }, [cleM, etat]);

  const { reste, total } = avancement(steps, etape);
  const chauffe = chauffeDe(e);
  const outil = outilDe(foyer, e);
  // Le minuteur demande DEUX conditions, et elles ne disent pas la même chose :
  // qu'il y ait une durée à compter, et que la compter serve à quelque chose.
  const avecMinuteur = e.minutes > 0 && minuteurUtile(e);
  const m = minuteur(etat ?? null, e.minutes, maintenant);
  const dernier = etape === steps.length - 1;
  const quantites = quantitesDeLEtape(p, etape, f, catalogue);

  const bouger = (d: number) => {
    if (d > 0 && dernier) {
      // LA DERNIÈRE ÉTAPE OUVRE LA SORTIE, ELLE NE JOURNALISE PLUS — T99.
      //
      // Le stock descend toujours en un seul endroit, mais ce n'est plus ici :
      // c'est la réponse à la sortie. Ce bouton engageait les trois effets et
      // rendait la main sans un mot, si bien qu'une cuisson journalisée et une
      // cuisson refusée quittaient le même écran de la même façon.
      //
      // L'AVANCEMENT NE S'EFFACE PLUS ICI NON PLUS, et c'est ce qui rend cet
      // écran rattrapable : tant que la sortie n'a pas répondu, la fiche est
      // restée à sa dernière étape, donc « Terminer » y ramène.
      fin();
      return;
    }
    // « ‹ » SUR L'ÉTAPE 1 RAMÈNE À LA MISE EN PLACE — T112. Le bouton était
    // grisé là, faute d'avant ; il y en a un maintenant, et c'est le seul
    // chemin pour revoir ce qu'il fallait sortir sans quitter la cuisson.
    if (d < 0 && etape === 0) {
      avant();
      return;
    }
    void poserReglage(cle, Math.max(0, Math.min(steps.length - 1, etape + d)));
  };

  return (
    <div className="co-etape">
      <div className="bandeau">
        <span>À table {hhmm(heureDe(repas))}</span>
        <em>
          reste {duree(reste)} sur {duree(total)}
        </em>
      </div>
      <div className="co-kicker accent">
        Étape {etape + 1} sur {steps.length}
      </div>
      <div className="geste">{e.action}</div>
      <div className="texte">
        {/* « Sans surveiller » est la seule chose qui sépare une journée de
            90 minutes tenable d'une autre qui ne l'est pas. */}
        {e.surveille ? "" : "Sans surveiller. "}
        {e.minutes ? `${e.minutes} min.` : ""}
      </div>

      {/* L'ASTUCE SOUS LE GESTE, EN CORPS DE TEXTE, ET JAMAIS DANS LE TITRE.
          Elle y était : 196 étapes du corpus portaient leur explication soudée
          à `action`, que cet écran rend en Caprasimo 27 px. Le geste se lit à
          bout de bras et doit tenir en un coup d'œil ; le pourquoi se lit
          après, une fois qu'on sait quoi faire, et n'a pas à peser le même
          poids typographique. Pas un encart coloré non plus — un encart dit
          « attention », et une astuce ne prévient de rien. */}
      {/* CE QUE L'ÉTAPE PREND, SOUS LE GESTE — T113. Avant l'astuce : on
          verse avant de se demander pourquoi. Même échelle que la liste des
          ingrédients (`quantitesDeLEtape`). `null` le dit en une ligne
          discrète, `[]` se tait — voir `SANS_USES`. */}
      {quantites === null ? (
        <div className="co-qetape-muet">{SANS_USES}</div>
      ) : quantites.length ? (
        <div className="co-qetape">
          {quantites.map((x) => (
            <div key={x.ref} className="l">
              <span className="q">{x.quantite}</span>
              <span className="nom">
                {x.nom}
                {x.aussi.length ? <span className="aussi"> · {phraseAussi(x.aussi)}</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {e.astuce ? <div className="co-astuce">{e.astuce}</div> : null}

      {e.enfant ? (
        <div className="co-encart enfant">
          <Icone nom="enfant" />
          <span>
            <span className="co-kicker" style={{ color: "inherit" }}>
              Avec l’enfant{e.enfantDes ? ` · dès ${e.enfantDes} mois` : ""}
            </span>
            <br />
            {e.enfant}
          </span>
        </div>
      ) : null}

      {e.porteAssaisonnement && p.bebe ? (
        <div className="co-encart">
          <Icone nom="info" />
          <span>
            Prélever la portion bébé <b>avant</b> d’assaisonner — {p.bebe}
          </span>
        </div>
      ) : null}

      <div style={{ flex: 1 }} />

      {/* L'OUTIL SE LIT AU-DESSUS DES RÉGLAGES, PAS DANS LA LIGNE DU GESTE.
          Les deux derniers blocs de l'écran sont ceux sur lesquels la main
          part — le récipient qu'on attrape, le feu qu'on règle, le minuteur
          qu'on lance — et les garder ensemble en bas les met dans le pouce.
          Complémentaire de « Chauffe » plutôt que redondant : l'une dit la
          source de chaleur, l'autre dit dans quoi on met. Muet sur 374 étapes
          des 692. */}
      {outil ? (
        <div className="co-outil">
          <Icone nom="ustensile" />
          <span>
            <span className="co-kicker">Outil</span>
            <br />
            {outil.methode ? outil.texte : <b>{outil.texte}</b>}
          </span>
        </div>
      ) : null}

      {chauffe.niveau > 0 || avecMinuteur ? (
        <div className="co-reglages">
          {chauffe.niveau > 0 ? (
            <div>
              <span className="co-kicker">Chauffe</span>
              <div className="chauffe-nom">{chauffe.nom}</div>
              <div className="barres">
                {[1, 2, 3, 4].map((n) => (
                  <i key={n} className={n <= chauffe.niveau ? "on" : ""} />
                ))}
              </div>
            </div>
          ) : null}
          {avecMinuteur ? (
            <button
              className={`co-minuteur${m.actif ? " actif" : ""}`}
              onClick={() => {
                const t = Date.now();
                const suivant = basculerMinuteur(etat ?? null, e.minutes, t);
                // TOUT SE FAIT DANS LE GESTE, AVANT L'ÉCRITURE EN BASE. La
                // politique d'autoplay ne regarde pas l'intention mais la pile
                // d'appels : la même demande de son, passée de l'autre côté
                // d'un `await` de Dexie, est refusée. Même raison pour la
                // permission du bandeau, qu'iOS n'accorde que sous un doigt.
                demanderBandeau();
                const fin = aArmer(suivant, t);
                if (fin !== null) armer(cleM, fin, true);
                else desarmer(cleM);
                void poserReglage(cleM, suivant);
              }}
            >
              <span
                className="k"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span className="co-kicker">Minuteur</span>
                <span
                  style={{
                    color: m.actif ? "var(--color-accent-800)" : "var(--color-neutral-600)",
                    display: "flex",
                  }}
                >
                  <Icone nom="minuteur" />
                </span>
              </span>
              <div className="n">{mmss(m.reste)}</div>
              <div className="aide">
                {m.actif
                  ? "en cours"
                  : m.sonne
                    ? "terminé · toucher pour relancer"
                    : m.reste < e.minutes * 60
                      ? "en pause · toucher pour reprendre"
                      : "toucher pour lancer"}
              </div>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* T82 — ce que l'alarme NE peut pas faire ici, et seulement ça. Muette
          quand tout va bien : une ligne qui dirait « armée » à chaque minuteur
          serait lue trois fois puis jamais plus, et cet écran se lit à bout de
          bras. Voir `promesse()` — c'est la doctrine de T78 appliquée à une
          capacité de plateforme plutôt qu'à une lacune du corpus. */}
      {m.actif ? <Aveu /> : null}

      {m.sonne ? (
        <div className="co-encart enfant co-sonne" style={{ marginTop: "var(--space-2)" }}>
          <Icone nom="cloche" />
          <span>
            <b>Minuteur terminé.</b>
          </span>
          {/* « Arrêter » est ICI et pas dans la barre du bas : les deux boutons
              du bas font avancer la recette, et un geste qui ne la fait pas
              avancer n'y a pas sa place. Il ne touche pas au minuteur — celui-ci
              reste « terminé », et se relance par son propre bouton, comme
              avant. Faire taire n'est pas remettre à zéro. */}
          <button className="btn btn-secondary" onClick={() => arreter()}>
            Arrêter
          </button>
        </div>
      ) : null}

      <div className="co-pas">
        <button className="prec" aria-label="Étape précédente" onClick={() => bouger(-1)}>
          ‹
        </button>
        <button className="suiv" onClick={() => bouger(1)}>
          {dernier ? "Terminer" : "C’est fait"}
        </button>
      </div>
    </div>
  );
}

/** Ce que la plateforme sous l'app ne sait pas faire, quand il y a quelque
 *  chose à en dire. Relu à chaque rendu, et c'est voulu : la permission du
 *  bandeau change SOUS l'écran — elle est demandée au premier doigt sur le
 *  minuteur et la réponse arrive une seconde plus tard. L'horloge de 250 ms
 *  qui bat déjà pendant qu'un minuteur court suffit à l'afficher. */
function Aveu() {
  const dire = promesse(plateforme());
  return dire ? <div className="co-promesse">{dire}</div> : null;
}

/** Une horloge qui ne bat QUE pendant qu'un minuteur court. Un `setInterval`
 *  permanent ferait redessiner l'écran toute la nuit pour rien. */
function useHorloge(actif: boolean): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    if (!actif) return;
    const h = setInterval(() => setT(Date.now()), 250);
    return () => clearInterval(h);
  }, [actif]);
  return actif ? t : Date.now();
}
