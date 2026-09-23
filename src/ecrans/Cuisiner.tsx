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
import { dejaCuisine, journaliserCuisson } from "../db/journal";
import { cleEtape, cleMinuteur, poserReglage, useNombre, useObjet } from "../db/reglages";
import { base } from "../db/schema";
import { echelleTexte, facteurAffiche, type Calcul } from "../model/calcul";
import { joue, type Jeu } from "../model/jeu";
import { heureDe } from "../model/heures";
import type { Etape, Foyer, Plat } from "../model/types";
import type { CleCreneau } from "../nav/routes";
import { aller } from "../nav/useRoute";
import { armer, arreter, demanderBandeau, desarmer, plateforme, promesse } from "../pwa/alarme";
import { duree, fmt, hhmm, mmss } from "../ui/format";
import { Icone } from "../ui/icones";
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
  outilDe,
  phraseDuRole,
  pourLire,
  provenanceIngredient,
  sansRecette,
  tempsDuPlat,
  type EtatMinuteur,
} from "./cuisiner.vue";

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
 *  a ouvert la fiche : depuis « Poser » on revient choisir, depuis
 *  « Aujourd'hui » on revient à la journée. Sans histoire — la fiche ouverte
 *  directement par son URL — on retombe sur la journée. */
function sortir() {
  if (window.history.length > 1) window.history.back();
  else aller({ ecran: "aujourdhui" });
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
  const cle = cleEtape(creneau.jour, creneau.repas, p.id);
  const range = useNombre(cle);

  if (range === undefined) return null;
  const steps = p.steps;
  const etape = Math.min(range, Math.max(0, steps.length - 1));

  const temps = tempsDuPlat(steps);
  const parts = (i >= 0 ? jeu.parts[i] : undefined) ?? jeu.catalogue.foyer.parts;
  const f = (i >= 0 ? calc.facteurs[i] : undefined) || facteurAffiche(p, parts);

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
  const terminer = async () => {
    if ((lecture && !guide) || i < 0) return;
    if (await dejaCuisine(base, creneau.jour, creneau.repas)) return;
    await journaliserCuisson(base, {
      jour: creneau.jour,
      repas: creneau.repas,
      plat: p,
      parts,
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
  // s'ouvre alors dessus, plutôt que sur un écran vide.
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
        <Ingredients p={p} parts={parts} f={f} jeu={jeu}>
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

  if (ingr || !steps.length)
    return (
      <>
        {tete}
        {/* LA FICHE LE DIT AVANT LA LISTE, PAS APRÈS. C'est la plainte du
            14/09 : « tu m'as encore fourni une recette sans étapes ». L'écran
            ne mentait pas — il n'avait simplement rien à dire, et un écran qui
            se tait sur ce qui lui manque se lit comme un écran cassé. La
            phrase se pose donc là où l'œil arrive, entre le titre et les
            quantités, et pas en bas près du bouton où elle ressemblerait à un
            avertissement de dernière minute.

            On l'affiche même quand l'utilisateur est venu voir la liste d'un
            plat qui A des étapes : `sansRecette` rend `null` dans ce cas, donc
            la condition tient toute seule et il n'y a pas deux chemins à
            garder d'accord. */}
        {muet ? (
          <div className="co-sansrecette">
            <Icone nom="info" />
            <span>{muet.long}</span>
          </div>
        ) : null}
        <Ingredients p={p} parts={parts} f={f} jeu={jeu} />
        <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
          {steps.length ? (
            <button className="btn btn-secondary btn-block" onClick={() => setIngr(false)}>
              Revenir à l’étape {etape + 1}
            </button>
          ) : (
            // Le même geste et le même mot que la dernière étape du guide, parce
            // que c'est le même événement : ce plat n'a qu'une étape, la faire.
            <button
              className="btn btn-primary btn-block"
              onClick={() => void terminer().finally(sortir)}
            >
              Terminer
            </button>
          )}
        </div>
      </>
    );

  return (
    <>
      {tete}
      <Guide
        p={p}
        foyer={jeu.catalogue.foyer}
        steps={steps}
        etape={etape}
        repas={creneau.repas}
        cle={cle}
        cleM={cleMinuteur(creneau.jour, creneau.repas, p.id, steps[etape]!.id)}
        terminer={terminer}
      />
    </>
  );
}

/* ─────────────────────────────────────────────────────────── les ingrédients */

function Ingredients({
  p,
  parts,
  f,
  jeu,
  children,
}: {
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
}) {
  const produit = +(p.portions * f).toFixed(1);
  const ustensile = aSortir(p);
  const cr = credit(p);
  const table = aTable(jeu, p, parts);
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
      {/* T74 — « à sortir avant de commencer », sur la FICHE et pas sur
          l'étape : le guide se lit à bout de bras et tout ce qui n'est pas
          l'étape en cours y est du bruit. Muet sur les 72 plats sans
          vaisselle. */}
      {ustensile && (
        <div className="co-sortir">
          <Icone nom="info" />
          <span>
            À sortir : <b>{ustensile}</b>
          </span>
        </div>
      )}
      <div className="co-ing">
        {p.ingredients.map((x) => {
          const prov = provenanceIngredient(jeu, x);
          // `key` sur `ref` ET PAS SUR `id` : onze plats portent deux lignes du
          // même ingrédient — la farine de la pâte et celle de la crème — et
          // React recevait deux fois la même clé. C'est `ref` qui les
          // distingue, et elle n'existait pas avant T72.
          return (
            <div key={x.ref} className="l">
              <span className="nom">{x.nom}</span>
              <span className="q">{echelleTexte(x, f)}</span>
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
      {/* T73 — le crédit ferme la fiche au lieu de l'ouvrir : on vient y lire
          des quantités, pas une bibliographie. Il est là, lisible, et il ne
          prend la place de rien. */}
      <div className="co-credit">
        {cr.url ? (
          <a href={cr.url} target="_blank" rel="noreferrer">
            {cr.texte}
          </a>
        ) : (
          cr.texte
        )}
      </div>
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
  steps,
  etape,
  repas,
  cle,
  cleM,
  terminer,
}: {
  p: Plat;
  foyer: Foyer;
  steps: Etape[];
  etape: number;
  repas: string;
  cle: string;
  cleM: string;
  terminer: () => Promise<void>;
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

  const bouger = (d: number) => {
    if (d > 0 && dernier) {
      // LE SEUL ENDROIT DE L'APP OÙ LE STOCK DESCEND. Terminer journalise la
      // cuisson et engage ses trois effets ; l'avancement s'efface ensuite,
      // parce que la prochaine ouverture de cette fiche sera pour la refaire.
      //
      // L'ordre compte : on sort APRÈS que l'écriture est partie, sinon un
      // démontage de composant peut emporter la promesse avec lui.
      void terminer().finally(() => {
        void poserReglage(cle, null);
        sortir();
      });
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
        <button className="prec" onClick={() => bouger(-1)} disabled={etape === 0}>
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
