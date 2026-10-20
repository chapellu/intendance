// Écran « L'inventaire » — T15 du backlog.
//
// LE TICKET QUI BRANCHE LA TABLE. Depuis T6, `stock` est semée au premier
// lancement et personne ne la lit : `calculer` construisait son dépôt depuis
// `catalogue.stock`, c'est-à-dire depuis ce que la cuisine portait le jour de
// l'export. Cet écran est le premier à la montrer, et c'est ce qui rend
// visible qu'elle ne servait à rien. Le branchement lui-même est dans
// `model/calcul.ts` et `db/stock.ts` ; ici on en récolte la conséquence : un
// lot qu'on retire cesse vraiment d'exister, pour l'écran comme pour le
// chaînage, la semaine et la liste de courses.
//
// TROIS LECTURES, DANS CET ORDRE, ET L'ORDRE EST L'ARGUMENT :
//   1. ce qu'on a, et à quel point on y croit ;
//   2. ce que la cuisine peut porter — elle est un lieu fini ;
//   3. les lots eux-mêmes, un par un.
// Descendre du général au particulier, parce que la question qu'on se pose en
// ouvrant cet écran est « est-ce que ça tient ? » avant d'être « où est la
// sauce ? ».
//
// T141 — L'ÉCRAN S'OUVRE SUR UN PLAN DE LA CUISINE, et l'ordre ci-dessus se
// relit à la lumière du doigt : on touche d'abord un meuble (le frigo, par
// défaut), on lit ce qu'il porte, et les lectures générales viennent ensuite.
// Le dessin vient du catalogue (`garde-manger.yaml`, `plan:`), pas d'ici.
//
// UN SEUL GESTE, ET IL EST RÉVERSIBLE : « je n'en ai plus ». C'est le mensonge
// que la persistance rendait possible — un bocal mangé hors de l'app reste au
// congélo pour toujours, et l'app continue de chaîner dessus. Il ne s'offre que
// sur les lots CONSTATÉS : ce que la semaine produit est un résultat de calcul,
// et se retire en changeant la semaine.
//
// Port de `apps/proto-shell/comptoir.js` (`ecranStock`).

import { useMemo, useState, type ReactNode } from "react";
import { ajouterLot, base, retirerLot, retirerLots, type LotStock } from "../db";
import {
  useCatalogue,
  useJournal,
  usePlacard,
  usePlanchers,
  usePlanchersDenrees,
  useSemaine,
} from "../db/hooks";
import { corrigerLigne, releverZone } from "../db/journal";
import { poserPlancher, poserPlancherDenree, retirerPlancherDenree } from "../db/planchers";
import type { Calcul } from "../model/calcul";
import { nomDuType } from "../model/plancher";
import type { Jeu } from "../model/jeu";
import type { Confiance, Rejeu } from "../model/journal";
import type { Espace } from "../model/types";
import { JOURS_VISIBLES } from "../nav/jours";
import { chemin } from "../nav/routes";
import { aller } from "../nav/useRoute";
import { Corps } from "../ui/Coquille";
import { Icone, iconeEspace } from "../ui/icones";
import {
  baisserPlancher,
  conseilDe,
  eteint,
  PERIME,
  perte,
  pluriel,
  resteAuPlacard,
  SIGNAUX,
  vueDeLInventaire,
  vueDesPlanchers,
  vueDesPlanchersDenrees,
  vueDuPlan,
  type LotVue,
  type PlanVue,
  type RangementVue,
  type Signal,
  type MesureZone,
  type PlanchersDenreesVue,
  type PlanchersVue,
  type ResteAuPlacard,
  type ZoneVue,
} from "./stock.vue";

export function Stock() {
  const { catalogue } = useCatalogue();
  const { jeu, calc } = useSemaine(catalogue);
  if (!jeu || !calc) return null;
  return <Contenu jeu={jeu} calc={calc} />;
}

function Contenu({ jeu, calc }: { jeu: Jeu; calc: Calcul }) {
  // LE RANGEMENT TOUCHÉ SUR LE PLAN — T141. UN REGARD, PAS UNE DÉCISION — donc
  // rien en base, comme la case dépliée de « La semaine ». L'écran s'ouvre sur le
  // frigo : c'est là que vit ce qui se mange vite, et c'est la première porte
  // qu'on ouvre en rentrant.
  const [sel, setSel] = useState<string>("frigo");
  // UN FILTRE ÉTEINT, IL NE CACHE PAS. Les meubles restent à leur place ; ceux
  // qui n'ont rien à dire sur le signal choisi pâlissent.
  const [signal, setSignal] = useState<Signal | null>(null);

  // CE QU'ON VIENT DE RETIRER, LE TEMPS DE SE RAVISER. Un lot supprimé d'un
  // doigt sur un téléphone qu'on tient d'une main est un lot supprimé par
  // erreur une fois sur dix ; il n'existe aucun ailleurs où aller le rechercher.
  // La mémoire est celle de l'écran : quitter l'inventaire vaut confirmation.
  //
  // UNE LISTE, DEPUIS T105 : « tout est perdu » retire un rangement entier, et
  // se raviser doit le rendre entier aussi.
  const [retire, setRetire] = useState<LotStock[] | null>(null);

  // LA QUESTION DE « TOUT EST PERDU », POSÉE DANS LA PAGE. Pas de `confirm()` :
  // une boîte du navigateur ne dit pas le nombre dans la langue de l'écran, et
  // un parcours ne peut pas la lire. Changer de rangement la referme.
  const [confirme, setConfirme] = useState<Espace | null>(null);

  // SANS FILTRE D'ESPACE, DEPUIS T141 : le plan compte les pastilles de tous
  // les rangements à la fois, et c'est le rangement touché qui trie.
  const vue = useMemo(() => vueDeLInventaire(jeu, calc, null), [jeu, calc]);

  // LE PLACARD REJOUÉ. Rien de ce qu'il rend n'existe en base : c'est l'amorce
  // du catalogue plus le journal, et c'est là que T25 devient visible à l'œil.
  const placard = usePlacard(jeu.catalogue);
  // CE QU'IL EN RESTE, en une phrase — T106. `null` tant que le journal n'a pas
  // répondu : la phrase se tait plutôt que de dire le relevé du 26/08 une frame.
  const reste = useMemo(
    () => (placard ? resteAuPlacard(jeu.catalogue, placard) : null),
    [jeu.catalogue, placard],
  );

  // LES PLANCHERS — T34 à T38. Le journal dit ce qui a été cuisiné, donc ce qui
  // se propose ; les décisions disent ce qu'un doigt en a fait. `null` tant que
  // la base n'a pas répondu, et la section ne s'affiche pas : montrer « aucun
  // plancher » sur une base qui n'a pas encore parlé serait un mensonge de plus
  // dans un écran dont tout le propos est de dire d'où vient chaque chiffre.
  const journal = useJournal();
  const decisions = usePlanchers();
  const planchers = useMemo(
    () => (journal && decisions ? vueDesPlanchers(jeu, calc, decisions, journal) : null),
    [jeu, calc, decisions, journal],
  );

  // LES PLANCHERS DU GARDE-MANGER — T39. Ils se lisent du placard REJOUÉ, pas du
  // dépôt : leur unité est celle du relevé, des unités d'achat qu'un œil compte,
  // et c'est `usePlacard` qui la tient à jour. Même prudence que ci-dessus —
  // `null` tant que la base n'a pas répondu.
  const denrees = usePlanchersDenrees();
  const planchersDenrees = useMemo(
    () => (placard && denrees ? vueDesPlanchersDenrees(jeu.catalogue, placard, denrees) : null),
    [jeu.catalogue, placard, denrees],
  );

  // LE PLAN — T141. Les produits d'une zone sont ceux que le REJEU y voit, pas
  // ceux du relevé : une zone relevée vide dit « 0 produit », pas « 6 ».
  const plan = useMemo(
    () =>
      vueDuPlan(
        jeu.catalogue,
        jeu.gardeManger,
        vue.lots,
        reste ? new Map([...reste.parZone].map(([z, m]) => [z, m.size])) : null,
      ),
    [jeu.catalogue, jeu.gardeManger, vue.lots, reste],
  );
  const touchables = plan ? [...plan.rangements, ...plan.horsPlan] : [];
  const choisi = touchables.find((r) => r.id === sel) ?? touchables[0] ?? null;
  const zoneChoisie = choisi?.zone
    ? (vue.gardeManger.zones.find((z) => z.id === choisi.zone) ?? null)
    : null;
  const conseil = choisi ? conseilDe(jeu.catalogue, choisi, jeu.gardeManger) : [];
  // LES LOTS QUE LA SEMAINE A RANGÉS AU PLACARD n'ont pas de meuble sur le plan :
  // ils ne sont pas du relevé, et aucune zone ne les porte. Ils gardent leur
  // liste, sous le plan, tant qu'il y en a.
  const auPlacard = vue.lots.filter((l) => l.espace === "placard");
  const catPlacard = vue.categories.find((c) => c.espace === "placard") ?? null;

  const retirer = async (ref: string) => {
    const id = Number(ref);
    const lot = await base.stock.get(id);
    if (!lot) return;
    await retirerLot(base, id);
    setRetire([lot]);
  };

  const toutPerdre = async (refs: readonly string[]) => {
    const ids = refs.map(Number);
    const perdus = (await base.stock.bulkGet(ids)).filter((l): l is LotStock => !!l);
    await retirerLots(base, ids);
    setConfirme(null);
    setRetire(perdus);
  };

  const rendre = async () => {
    if (!retire) return;
    for (const lot of retire) await rendreUn(lot);
    setRetire(null);
  };

  const rendreUn = async (retire: LotStock) => {
    // Le lot revient avec son contenu et sa date de naissance — pas celle
    // d'aujourd'hui : annuler une bévue ne doit pas rajeunir un bocal de trois
    // semaines et le remettre dans la fenêtre de fraîcheur.
    await ajouterLot(base, {
      type: retire.type,
      kind: retire.kind,
      qty: retire.qty,
      unite: retire.unite,
      band: retire.band,
      espace: retire.espace,
      // ET SON RANGEMENT AVEC. Un lot rendu sans sa `location` repartirait sur
      // l'horloge de sa destination, c'est-à-dire qu'annuler une bévue au frigo
      // le ressusciterait au congélateur.
      ...(retire.location ? { location: retire.location } : {}),
      born: retire.born,
      origine: retire.origine,
    });
  };

  const choisir = (id: string) => {
    setSel(id);
    setConfirme(null);
  };

  return (
    <Corps plat>
      {/* LE SEUL CHEMIN QUI RESTAIT VERS LA GRILLE, ET IL MENTAIT DEUX FOIS.
          T88 a éteint l'agenda en pensant que plus rien n'y menait ; ce
          bouton-ci y menait encore, et il a été pendant trois jours la seule
          façon d'atteindre la liste de ses plats posés. Un chevron de retour
          en tête d'un ONGLET est de toute façon faux — l'inventaire ne s'ouvre
          plus depuis la semaine, il s'ouvre depuis la barre. */}
      {JOURS_VISIBLES ? (
        <button className="co-retour" onClick={() => aller({ ecran: "semaine" })} /* sous JOURS_VISIBLES, ligne du dessus */>
          ‹ La semaine
        </button>
      ) : null}
      <div className="st-tete">
        <div className="co-h">Stock</div>
        {plan ? <span className="co-note">{pluriel(plan.produits, "produit")} suivis</span> : null}
      </div>

      {plan ? (
        <>
          <div className="st-chips" role="group" aria-label="Allumer sur le plan">
            {SIGNAUX.map((x) => (
              <button
                key={x.genre}
                className={`st-chip${signal === x.genre ? " on" : ""}`}
                aria-pressed={signal === x.genre}
                onClick={() => setSignal(signal === x.genre ? null : x.genre)}
              >
                <span className={`st-puce ${x.genre}`}>{plan.totaux[x.genre]}</span>
                {x.puceLong}
              </button>
            ))}
          </div>
          <Plan vue={plan} sel={choisi?.id ?? null} signal={signal} choisir={choisir} />
        </>
      ) : null}

      {/* LE RANGEMENT TOUCHÉ, ET LUI SEUL. */}
      {zoneChoisie ? (
        <Zone
          key={zoneChoisie.id}
          z={zoneChoisie}
          placard={placard}
          dedans={reste?.parZone.get(zoneChoisie.id) ?? null}
          poids={reste?.poidsParZone.get(zoneChoisie.id) ?? ""}
          connus={vue.gardeManger.connus}
          conseil={conseil}
        />
      ) : choisi && !choisi.zone ? (
        <Appareil
          key={choisi.id}
          nom={choisi.label}
          espace={choisi.espace}
          vue={vue}
          conseil={conseil}
          retirer={retirer}
          confirme={confirme}
          setConfirme={setConfirme}
          toutPerdre={toutPerdre}
          depot={calc}
        />
      ) : null}

      {/* SANS PLAN — un export plus vieux que l'écran : les zones, toutes, comme avant. */}
      {!plan
        ? vue.gardeManger.zones.map((z) => (
            <Zone
              key={z.id}
              z={z}
              placard={placard}
              dedans={reste?.parZone.get(z.id) ?? null}
              poids={reste?.poidsParZone.get(z.id) ?? ""}
              connus={vue.gardeManger.connus}
              conseil={[]}
            />
          ))
        : null}

      {/* LE RETOUR EN ARRIÈRE, tant qu'on est sur l'écran — et HORS du panneau :
          toucher un autre meuble ne doit pas faire oublier ce qu'on vient de
          retirer. Il dit ce qui est parti : « retiré » sans nom laisse chercher
          lequel. */}
      {retire ? (
        <div className="co-note" style={{ marginTop: "var(--space-3)" }}>
          {retire.length === 1
            ? `« ${nomDuType(retire[0]!.type)} » retiré de l’inventaire.`
            : `${retire.length} lots retirés de l’inventaire.`}{" "}
          <button className="btn btn-ghost st-petit" onClick={() => void rendre()}>
            Annuler
          </button>
        </div>
      ) : null}

      <GardeManger
        vue={vue.gardeManger}
        placard={placard}
        reste={reste}
        planchers={planchersDenrees}
      />

      {auPlacard.length ? (
        <>
          <div className="co-kicker" style={{ margin: "var(--space-4) var(--space-1) var(--space-2)" }}>
            Lots au placard
          </div>
          {catPlacard ? (
            <div className="co-note" style={{ margin: "0 var(--space-1) var(--space-2)" }}>
              {catPlacard.note}
            </div>
          ) : null}
          {auPlacard.map((l) => (
            <Lot key={l.cle} lot={l} retirer={retirer} />
          ))}
        </>
      ) : null}

      <div className="co-kicker" style={{ margin: "var(--space-4) var(--space-1) var(--space-2)" }}>
        La cuisine est un lieu fini
      </div>
      <div className="co-espaces">
        {vue.espaces.map((e) => (
          <div key={e.espace} className="co-espace">
            <div className="nom">{e.nom}</div>
            {e.plafonds.map((p) => (
              <div key={p.nom} className={`plafond${p.commande ? " commande" : ""}`}>
                <div className="t">
                  <span>{p.nom}</span>
                  <span>{p.libres} libres</span>
                </div>
                <div className="rail">
                  <i style={{ width: `${p.part}%` }} />
                </div>
              </div>
            ))}
            {e.geste ? <div className="geste">{e.geste}</div> : null}
          </div>
        ))}
      </div>
      <Pourquoi>
        Deux plafonds par espace&nbsp;: les étagères et les contenants. Le plus bas commande,
        et c’est lui qui passe en terre cuite — laver deux bocaux n’est pas dégager une étagère.
      </Pourquoi>

      <Planchers vue={planchers} />
    </Corps>
  );
}

/* ──────────────────────────────────────────────── le plan de la cuisine — T141 */

/**
 * Deux murs vus depuis la porte : les étagères en bois à gauche, en
 * perspective, et le mur de l'évier au fond, à plat.
 *
 * LE DESSIN VIENT DU CATALOGUE (`garde-manger.yaml`, `plan:`), PAS DU CODE.
 * Déplacer un meuble est une ligne de YAML, que `verifier.py` relit : un
 * rangement sous les 44 px d'un doigt, ou qui en chevauche un autre, ne passe
 * pas. Chaque rangement est un vrai bouton — un lecteur d'écran lit son nom, ce
 * qu'il porte et ses signaux.
 */
function Plan({
  vue,
  sel,
  signal,
  choisir,
}: {
  vue: PlanVue;
  sel: string | null;
  signal: Signal | null;
  choisir: (id: string) => void;
}) {
  const { gauche, fond } = vue.murs;
  const meuble = (r: RangementVue) => (
    <button
      key={r.id}
      className={`st-meuble t-${r.teinte}${r.id === sel ? " sel" : ""}${eteint(r, signal) ? " eteint" : ""}`}
      style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
      aria-label={r.aria}
      aria-pressed={r.id === sel}
      onClick={() => choisir(r.id)}
    >
      <span className="court">{r.court}</span>
      <span className="puces" aria-hidden="true">
        {SIGNAUX.filter((x) => r.signaux[x.genre]).map((x) => (
          <span key={x.genre} className={`st-puce ${x.genre}`}>
            {x.puce}
            {r.signaux[x.genre] > 1 ? ` ${r.signaux[x.genre]}` : ""}
          </span>
        ))}
      </span>
    </button>
  );
  const mur = (m: "gauche" | "fond") => [
    ...vue.decor
      .filter((d) => d.mur === m)
      .map((d, i) => (
        <div
          key={`d${i}`}
          className={`st-decor t-${d.teinte}`}
          style={{ left: d.x, top: d.y, width: d.w, height: d.h }}
          aria-hidden="true"
        >
          {d.label}
        </div>
      )),
    ...vue.rangements.filter((r) => r.mur === m).map(meuble),
  ];
  const haut = Math.max(gauche.h, fond.h);
  return (
    <>
      <div
        className="st-plan"
        role="group"
        aria-label="Plan de la cuisine, touchez un rangement"
        style={{ width: gauche.w + fond.w, height: haut + 56 }}
      >
        <div className="st-sol" />
        <div className="st-mur gauche" style={{ width: gauche.w, height: gauche.h }}>
          {mur("gauche")}
        </div>
        <div className="st-mur fond" style={{ left: gauche.w, width: fond.w, height: fond.h }}>
          {mur("fond")}
        </div>
        <div className="st-murs">
          À gauche&nbsp;: {gauche.label} · au fond&nbsp;: {fond.label}
        </div>
      </div>
      {vue.horsPlan.length ? (
        <div className="st-horsplan">
          {vue.horsPlan.map((r) => (
            <button
              key={r.id}
              className={`btn btn-secondary${r.id === sel ? " on" : ""}`}
              aria-label={r.aria}
              aria-pressed={r.id === sel}
              onClick={() => choisir(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="st-legende">
        {SIGNAUX.map((x) => (
          <span key={x.genre}>
            <span className={`st-puce ${x.genre}`}>{x.puce}</span>
            {x.legende}
          </span>
        ))}
      </div>
    </>
  );
}

/** Les notes longues, derrière un « Pourquoi ? » : elles restent là, elles ne
 *  passent plus devant le plan. Fermées à chaque visite — c'est un regard. */
function Pourquoi({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="st-pourquoi">
      <button className="btn btn-ghost st-petit" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        Pourquoi&nbsp;?
      </button>
      {ouvert ? <div className="co-note">{children}</div> : null}
    </div>
  );
}

/** L'encart vert du panneau : le conseil de rangement de ce qui est ici. */
function Conseil({ phrases }: { phrases: readonly string[] }) {
  if (!phrases.length) return null;
  return (
    <div className="st-conseil">
      {phrases.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}

/**
 * Le frigo ou le congélateur, touché sur le plan : les lots du DÉPÔT rangés là.
 *
 * CE N'EST PAS UNE ZONE DU GARDE-MANGER, et le panneau ne fait pas semblant :
 * pas de « Relever » (un lot se constate un par un), mais « Je n'en ai plus »
 * sur chaque lot constaté et, depuis T105, « tout est perdu » pour la porte
 * entière.
 */
function Appareil({
  nom,
  espace,
  vue,
  conseil,
  retirer,
  confirme,
  setConfirme,
  toutPerdre,
  depot,
}: {
  nom: string;
  espace: Espace;
  vue: ReturnType<typeof vueDeLInventaire>;
  conseil: readonly string[];
  retirer: (ref: string) => Promise<void>;
  confirme: Espace | null;
  setConfirme: (e: Espace | null) => void;
  toutPerdre: (refs: readonly string[]) => Promise<void>;
  depot: Calcul;
}) {
  const ici = vue.lots.filter((l) => l.espace === espace);
  const cat = vue.categories.find((c) => c.espace === espace) ?? null;
  const p = perte(depot.depot, espace);
  return (
    <div className="co-espace st-panneau">
      <div className="nom" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>{nom}</span>
        {cat ? (
          <span className={`co-jauge ${cat.conf}`} aria-hidden="true">
            {[0, 1, 2, 3].map((k) => (
              <i key={k} className={k < cat.barres ? "on" : ""} />
            ))}
          </span>
        ) : null}
      </div>
      <div className="co-note">{cat ? cat.note : "Rien de constaté ici."}</div>
      <Conseil phrases={conseil} />

      {ici.length ? (
        ici.map((l) => <Lot key={l.cle} lot={l} retirer={retirer} />)
      ) : (
        <div className="co-vide">Rien ici.</div>
      )}

      {/* T105 — UN GESTE PAR RANGEMENT, sous la liste qu'il vide : on voit ce
          qui part avant de le dire parti. */}
      {p ? (
        confirme === p.espace ? (
          <div className="co-note" style={{ marginTop: "var(--space-3)" }}>
            {p.question}{" "}
            <button className="btn btn-ghost st-petit" onClick={() => void toutPerdre(p.refs)}>
              {p.confirmer}
            </button>{" "}
            <button className="btn btn-ghost st-petit" onClick={() => setConfirme(null)}>
              Non
            </button>
          </div>
        ) : (
          <button
            className="btn btn-ghost st-petit"
            style={{ marginTop: "var(--space-3)" }}
            onClick={() => setConfirme(p.espace)}
          >
            {p.bouton}
          </button>
        )
      ) : null}

      {/* CE QUE LA SEMAINE PRODUIT N'EST PAS À VOUS — au sens où aucun doigt ne
          l'a constaté. Le dire une fois vaut mieux que de laisser chercher
          pourquoi certaines lignes n'ont pas de bouton. */}
      {ici.some((l) => !l.ref) ? (
        <div className="co-note" style={{ marginTop: "var(--space-2)" }}>
          Les lots cuisinés cette semaine sont calculés&nbsp;: ils se retirent en changeant ce
          qui est posé, pas ici.{" "}
          <a
            className="btn btn-ghost st-petit"
            href={chemin(JOURS_VISIBLES ? { ecran: "semaine" } : { ecran: "poses" })}
          >
            {JOURS_VISIBLES ? "La semaine ›" : "Les posés ›"}
          </a>
        </div>
      ) : null}

      <Pourquoi>
        <b>Compté</b>&nbsp;: la quantité vient de l’export, elle est juste. <b>Estimé</b>&nbsp;:
        déduite d’un plat cuisiné cette semaine, à vérifier de l’œil. <b>En bloc</b>&nbsp;: pas
        compté du tout — on sait seulement que ça existe.
      </Pourquoi>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── les planchers */

/**
 * « Ce qu'on veut toujours avoir » — T34 à T38.
 *
 * L'APP PROPOSE, ELLE NE POSE PAS. Sur 48 types congelables, un réglage à la
 * main ne sera jamais fait ; mais poser un plancher d'office ferait réclamer un
 * dîner qu'on n'a peut-être cuisiné deux fois que par hasard. D'où les deux
 * boutons, et le second compte autant que le premier : « non merci » est une
 * DÉCISION qui s'écrit, sinon la proposition revient à chaque ouverture de
 * l'écran et finit par discréditer les autres.
 *
 * LE PLANCHER DE SECOURS EST EN TÊTE ET SANS BOUTON, parce qu'il ne se décide
 * pas : il vient du catalogue et vaut dès le premier jour. Ce n'est pas une
 * hypothèse sur des habitudes, c'est une propriété du foyer — dix-huit places
 * et un soir qui peut s'effondrer.
 */
function Planchers({ vue }: { vue: PlanchersVue | null }) {
  const [ouvert, setOuvert] = useState(false);
  if (!vue) return null;
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          margin: "var(--space-4) var(--space-1) var(--space-2)",
        }}
      >
        <span className="co-kicker">Ce qu’on veut toujours avoir</span>
        {/* T89 — LE MÊME BOUTON QU'AU PLACARD, ET AU MÊME ENDROIT. « En
            ajouter » est le geste qui manquait : sans lui, un plancher de dépôt
            ne pouvait naître que d'une proposition, donc jamais avant que le
            journal ait vu deux cuissons.

            IL EST NOMMÉ, PARCE QU'IL Y EN A DEUX. Deux boutons « En ajouter » à
            trois écrans de distance se lisent très bien à l'œil — la section
            au-dessus dit laquelle — et sont indiscernables pour qui n'entend que
            le bouton, lecteur d'écran ou parcours. Le rangement va donc dans le
            nom accessible, jamais dans le texte : « En ajouter au congélateur »
            écrit en toutes lettres déborderait la ligne du titre. */}
        <button
          className="co-retour"
          aria-label={ouvert ? "fermer les planchers du congélateur" : "en ajouter un au congélateur"}
          onClick={() => setOuvert(!ouvert)}
        >
          {ouvert ? "Fermer" : "En ajouter"}
        </button>
      </div>

      <div className="co-espace">
        <div className="nom">Le stock d’urgence</div>
        <div className="co-note">{vue.secours}</div>
        <div className="co-note">{vue.populations}</div>
        {vue.sous ? (
          <div className="geste">
            sous son plancher — « Poser un plat » remonte les recettes qui le rechargent
          </div>
        ) : null}
        {/* T38 — ce qui prend la place se NOMME. « Ça ne paie plus rien » sans
            raison est un silence, pas une explication. */}
        {vue.plein ? <div className="geste">{vue.plein}</div> : null}
      </div>

      {vue.poses.map((p) => (
        <div key={p.type} className="co-lot">
          <span style={{ flex: 1 }}>
            <div className="nom">{p.nom}</div>
            <div className="ou">
              {p.population === "apport" ? "de quoi accélérer un soir" : "un dîner d’avance"}
              {p.plats.length ? ` · se recharge en cuisinant ${p.plats.join(", ")}` : ""}
            </div>
            <div style={{ display: "flex", gap: "var(--space-1)", marginTop: 4 }}>
              {/* LE NIVEAU SE RÈGLE DEVANT LE TIROIR, comme celui d'une denrée
                  se règle devant le placard. « Deux, finalement » se pense le
                  soir où la dernière portion part et où il n'en reste pas. */}
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => void poserPlancher(base, p.type, baisserPlancher(p.niveau))}
              >
                −
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => void poserPlancher(base, p.type, p.niveau + 1)}
              >
                +
              </button>
              {/* RETIRER ICI, C'EST REFUSER — `niveau: null`, la même écriture
                  que « Non merci ». Un type qu'on cesse de suivre après l'avoir
                  suivi n'a aucune raison de revenir en proposition à la
                  prochaine cuisson : ce serait redemander ce qu'on vient de
                  répondre. Il reste posable à la main, en bas de « Sur quoi ? ». */}
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => void poserPlancher(base, p.type, null)}
              >
                Ne plus suivre
              </button>
            </div>
          </span>
          <span>
            <div className="q">
              {p.a} / {p.niveau}
            </div>
            <div className={`src ${p.sous ? "estime" : ""}`}>{p.sous ? "à refaire" : "tenu"}</div>
          </span>
        </div>
      ))}

      {vue.propositions.map((p) => (
        <div key={p.type} className="co-lot">
          <span style={{ flex: 1 }}>
            <div className="nom">{p.nom}</div>
            <div className="ou">
              cuisiné {p.cuissons} fois
              {p.plats.length ? ` · ${p.plats.join(", ")}` : ""}
            </div>
            <div style={{ display: "flex", gap: "var(--space-1)", marginTop: 4 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => void poserPlancher(base, p.type, p.niveau)}
              >
                En garder {p.niveau}
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => void poserPlancher(base, p.type, null)}
              >
                Non merci
              </button>
            </div>
          </span>
        </div>
      ))}

      {ouvert ? (
        <div className="co-espace" style={{ marginTop: "var(--space-2)" }}>
          <div className="nom">Sur quoi&nbsp;?</div>
          {vue.libres.map((p) => (
            <div key={p.type} className="co-lot">
              <span style={{ flex: 1 }}>
                <div className="nom">{p.nom}</div>
                <div className="ou">
                  {p.refuse ? "déjà écarté · " : ""}
                  {p.population === "apport" ? "de quoi accélérer un soir" : "un dîner d’avance"}
                  {p.plats.length ? ` · ${p.plats.join(", ")}` : ""}
                </div>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <span className="q">{p.a}</span>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: "2px 8px" }}
                  onClick={() => void poserPlancher(base, p.type, 1)}
                >
                  En garder 1
                </button>
              </span>
            </div>
          ))}
          {/* CE QUI N'EST PAS DANS LA LISTE SE DIT, comme T46 le dit au placard.
              Ici la barrière n'est pas une classe mais le froid : un plancher
              compte des portions au congélateur, et le poser sur un reste qui
              tient trois jours au frigo fabriquerait une cible qui réclamerait
              de cuisiner tous les trois jours pour rien. */}
          <div className="co-note" style={{ marginTop: "var(--space-2)" }}>
            Pas de plancher sur ce qui ne se congèle pas&nbsp;: un plancher compte des portions
            au tiroir, et une cible qu’on ne peut pas tenir réclamerait de cuisiner pour rien.
          </div>
        </div>
      ) : null}

      <div className="co-note" style={{ margin: "var(--space-2) var(--space-1) 0" }}>
        Un plancher est une <b>hypothèse sur une habitude</b>&nbsp;: l’app la propose à la deuxième
        cuisson, et on peut la lui dire avant. En dessous, les plats qui le rechargent remontent
        dans la main&nbsp;; au-dessus, rien ne coûte — un plancher est un seuil, pas une cible.
      </div>
    </>
  );
}

/**
 * Le garde-manger — ce qui ne se lit pas rangement par rangement.
 *
 * T141 : LES ZONES ONT QUITTÉ CETTE SECTION POUR LE PLAN. Restent ici les
 * lectures transversales — ce qu'il en reste en une phrase, ce qui se mange en
 * premier, ce qui est mal rangé, ce qu'on veut toujours avoir —, parce qu'elles
 * traversent les placards et qu'aucun meuble ne les porte seul.
 *
 * LES ALERTES NE PARLENT PAS DE DONNÉES. Tout le reste de cet écran décrit un
 * état ; ces lignes-là demandent d'aller déplacer un sachet. Le plan les montre
 * déjà en ↔ ; la liste reste, parce qu'elle dit QUOI déplacer d'un seul regard.
 */
function GardeManger({
  vue,
  placard,
  reste,
  planchers,
}: {
  vue: ReturnType<typeof vueDeLInventaire>["gardeManger"];
  placard: Rejeu | null;
  reste: ResteAuPlacard | null;
  planchers: PlanchersDenreesVue | null;
}) {
  if (!vue.zones.length) return null;
  return (
    <>
      {/* DEUX LISTES, DEUX GESTES, ET IL NE FAUT PAS LES CONFONDRE. « À
          déplacer » dit de ranger autrement — un sachet à mettre ailleurs.
          « À manger en premier » dit de cuisiner. Le même oignon peut être dans
          les deux, et ce n'est pas une redite : il est mal rangé ET il court. */}
      {vue.aSauver.length ? (
        <>
          <div className="co-kicker" style={{ margin: "var(--space-4) var(--space-1) var(--space-2)" }}>
            À manger en premier
          </div>
          {vue.aSauver.map((s) => (
            <div key={s.cle} className="co-lot">
              <span style={{ flex: 1 }}>
                <div className="nom">{s.nom}</div>
                <div className="ou">
                  {s.raison} · {s.ou}
                </div>
                {/* LA SECONDE ISSUE. La cuisiner ce soir n'est pas toujours la
                    bonne réponse — on ne mange pas six kilos de pommes de terre
                    parce qu'ils germent. `conservation.yaml` porte l'autre
                    depuis le prototype : arrêter l'horloge. */}
                {s.conserver ? <div className="ou">ou&nbsp;: {s.conserver}</div> : null}
                {/* Un nœud de compétence, JAMAIS une suggestion d'achat — la
                    règle vient de #29 : l'app nomme ce qu'il faudrait savoir
                    faire, elle n'envoie personne au magasin. */}
                {s.debloquer ? <div className="ou">à débloquer&nbsp;: {s.debloquer}</div> : null}
                <Corriger
                  nom={s.nom}
                  ingredient={s.id}
                  unites={placard?.parIngredient.get(s.id)?.unites ?? 0}
                  zone={null}
                />
              </span>
              <span>
                <div className={`src ${s.urgence === "haute" ? "estime" : ""}`}>
                  {s.urgence === "haute" ? "pressé" : "entamé"}
                </div>
              </span>
            </div>
          ))}
          <Pourquoi>
            « Poser un plat » remonte les recettes qui finissent les <b>paquets entamés</b> — et
            eux seuls, depuis T60. Le frais reste nommé ici, il n’est plus payé au classement&nbsp;:
            un aromate qu’on met partout — l’oignon est dans 42&nbsp;% des plats — sera consommé de
            toute façon, et le pousser revenait à pousser tout ce qui contient un oignon. Mal rangé
            se lit plus bas, dans « À déplacer »&nbsp;: c’est un geste de rangement, pas un dîner.
          </Pourquoi>
        </>
      ) : null}

      {/* UNE ALERTE PAR LIGNE, PARCE QU'UNE ALERTE EST UN GESTE. Enfilées avec
          des points médians elles formaient un pavé de sept lignes qu'on ne lit
          pas — et une liste qu'on ne lit pas vaut une liste vide. */}
      {vue.alertes.length ? (
        <div className="co-encart" style={{ margin: "var(--space-3) 0", display: "block" }}>
          <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "baseline" }}>
            <Icone nom="info" />
            <b>À déplacer</b>
          </div>
          <ul style={{ margin: "var(--space-1) 0 0", paddingLeft: "1.1em" }}>
            {vue.alertes.map((a) => (
              <li key={a} style={{ marginTop: 2 }}>
                {a}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="co-kicker" style={{ margin: "var(--space-4) var(--space-1) var(--space-2)" }}>
        Le garde-manger
      </div>
      {/* CE QU'IL EN RESTE, PUIS CE QU'IL EST — T106. La phrase disait « 53
          denrées … 16 kg » : c'était le relevé du 26/08, lu comme l'état du
          placard, et un placard relevé vide la gardait mot pour mot. Le chiffre
          vient maintenant du rejeu, et le relevé est nommé comme tel : c'est
          lui qui donne le « sur combien ». */}
      {reste ? (
        <div className="co-note" style={{ margin: "0 var(--space-1) var(--space-2)" }}>
          {reste.restent} des {reste.relevees} denrées du relevé
          {reste.releve ? ` du ${reste.releve}` : ""} sont encore là
          {reste.pesees ? `, dont ${reste.pesees} pesées pour ${reste.poids}` : ""}.{" "}
          {vue.zones.length} rangements{vue.volume ? `, ${vue.volume} mesurés` : ""}.
        </div>
      ) : null}
      <Pourquoi>
        Ces chiffres sont <b>déduits</b>, pas relevés&nbsp;: le stock descend quand on termine une
        recette, et rien d’autre ne le regarde. C’est pour ça que chaque ligne dit de quand elle
        date. <b>Relever une zone</b> remet tout ce qu’elle contient à ce que vos yeux voient — un
        quart d’heure achète des semaines de silence.
      </Pourquoi>

      <PlanchersDenrees vue={planchers} />
    </>
  );
}

/**
 * « Ce qu'on veut toujours avoir » — côté placard, T39 à T46.
 *
 * ICI L'APP NE PROPOSE RIEN, ET C'EST LA DIFFÉRENCE AVEC LE CONGÉLATEUR. Là-bas
 * le journal des cuissons sait dire qu'un type est sorti deux fois d'une
 * casserole, donc l'app peut ouvrir la bouche la première. Ici la seule chose
 * qu'elle sache est combien il en reste — ce qui ne dit rien de combien on en
 * VEUT. Proposer « en garder 1 » sur les 41 denrées comptables reviendrait à
 * inventer 41 habitudes, et T37 a tranché la question dans l'autre sens : un
 * plancher est une hypothèse, elle se pose sur quelque chose. T45 rouvrira le
 * dossier, avec la seule mesure qui le permette — ce qui se consomme entre deux
 * grosses courses.
 *
 * D'OÙ UN SEUL GESTE, ET IL EST À L'ENVERS DU RESTE DE L'ÉCRAN : partout
 * ailleurs on constate, ici on décide. Le bouton est donc discret et la liste
 * des candidats fermée par défaut — un placard de 41 lignes ouvertes en
 * permanence noierait le relevé, qui est le vrai sujet de la section.
 */
function PlanchersDenrees({ vue }: { vue: PlanchersDenreesVue | null }) {
  const [ouvert, setOuvert] = useState(false);
  if (!vue) return null;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          margin: "var(--space-3) var(--space-1) var(--space-2)",
        }}
      >
        {/* PAS LE MÊME TITRE QUE LA SECTION DU CONGÉLATEUR, et ce n'est pas
            qu'une affaire de test : deux « Ce qu'on veut toujours avoir » sur le
            même écran laisseraient croire à une répétition, alors que ce sont
            deux mécanismes — l'un pousse un plat, l'autre une ligne de courses.
            Le titre doit porter la différence, puisque c'est tout T41. */}
        <span className="co-kicker">Ce qu’on veut toujours au placard</span>
        {/* NOMMÉ DEPUIS T89, pour la raison écrite en face : le congélateur a
            gagné le même bouton, et deux « En ajouter » anonymes sur un écran
            ne se distinguent que par l'œil. */}
        <button
          className="co-retour"
          aria-label={ouvert ? "fermer les planchers du placard" : "en ajouter un au placard"}
          onClick={() => setOuvert(!ouvert)}
        >
          {ouvert ? "Fermer" : "En ajouter"}
        </button>
      </div>

      {vue.poses.length === 0 && !ouvert ? (
        <div className="co-note" style={{ margin: "0 var(--space-1) var(--space-2)" }}>
          Aucun plancher au garde-manger. En poser un sur une denrée, c’est dire «&nbsp;j’en veux
          toujours autant&nbsp;»&nbsp;: en dessous, elle part d’elle-même dans «&nbsp;Courses&nbsp;»,
          sans qu’aucun plat n’ait à la réclamer.
        </div>
      ) : null}

      {vue.poses.map((p) => (
        <div key={p.ingredient} className="co-lot">
          <span style={{ flex: 1 }}>
            <div className="nom">{p.nom}</div>
            <div className="ou">
              {p.usage ? `${p.usage} · ` : ""}
              {p.sous ? "à racheter" : "tenu"} · {p.fiabilite}
            </div>
            <div style={{ display: "flex", gap: "var(--space-1)", marginTop: 4 }}>
              {/* LE NIVEAU SE RÈGLE ICI, PAS DANS UN ÉCRAN DE RÉGLAGES. « Deux,
                  finalement » se pense devant le placard, au moment où l'on
                  constate qu'une boîte ne passe pas la semaine. */}
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => void poserPlancherDenree(base, p.ingredient, p.niveau - 1)}
              >
                −
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => void poserPlancherDenree(base, p.ingredient, p.niveau + 1)}
              >
                +
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => void retirerPlancherDenree(base, p.ingredient)}
              >
                Ne plus suivre
              </button>
            </div>
          </span>
          <span>
            <div className="q">
              {p.a} / {p.niveau}
            </div>
            <div className={`src ${p.sous ? "estime" : ""}`}>{p.sous ? "sous" : "tenu"}</div>
          </span>
        </div>
      ))}

      {vue.manquent ? (
        <div className="geste" style={{ margin: "var(--space-2) var(--space-1) 0" }}>
          {vue.manquent}
        </div>
      ) : null}

      {ouvert ? (
        <div className="co-espace" style={{ marginTop: "var(--space-2)" }}>
          <div className="nom">Sur quoi&nbsp;?</div>
          {vue.libres.map((p) => (
            <div key={p.ingredient} className="co-lot">
              <span style={{ flex: 1 }}>
                <div className="nom">{p.nom}</div>
                <div className="ou">
                  {p.usage === "apero" ? "pour l’apéro · " : ""}
                  {p.a} en stock
                </div>
              </span>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "2px 8px" }}
                onClick={() => void poserPlancherDenree(base, p.ingredient, 1)}
              >
                En garder 1
              </button>
            </div>
          ))}
          {/* T46 — CE QUI EST INTERDIT SE NOMME. Un placard où quatre denrées
              n'offrent pas le bouton, sans un mot, ressemble à une panne ; et la
              raison est la partie intéressante, puisqu'elle vient de ce que
              l'app peut honnêtement savoir. */}
          {vue.ecartes ? (
            <div className="co-note" style={{ marginTop: "var(--space-2)" }}>
              Pas de plancher sur&nbsp;: {vue.ecartes}. Une cible que l’app est incapable
              d’évaluer serait le premier endroit où elle réclamerait des courses à tort.
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/* ─────────────────────────────────────────────────────────── une zone, relevée */

/** Ce que le rejeu sait dire d'une ligne, en français. */
const MOT_CONFIANCE: Record<Confiance, string> = {
  sur: "vu",
  probable: "estimé",
  inconnu: "à vérifier",
};

/**
 * Une zone du garde-manger, avec son relevé.
 *
 * LA ZONE EST LA CLÔTURE, donc il n'y a pas de bouton « terminé » à part :
 * valider le relevé d'une zone déclare du même geste ce qu'elle contient ET que
 * tout le reste n'y est plus. C'est le seul geste capable de dire « il n'y en a
 * plus » sans énumérer les absents.
 */
function Zone({
  z,
  placard,
  dedans,
  poids,
  connus,
  conseil,
}: {
  z: ZoneVue;
  placard: Rejeu | null;
  /** Ce qui reste DANS cette zone, par ingrédient — `null` tant que le journal
   *  n'a pas répondu. Voir `parZoneDu`. */
  dedans: ReadonlyMap<string, MesureZone> | null;
  /** Le poids de ce qui y reste, pas celui du relevé. */
  poids: string;
  /** Ce que l'éditeur peut ajouter (T139). */
  connus: readonly { id: string; nom: string }[];
  /** L'encart vert : comment ranger ce qui est ici (T141). */
  conseil: readonly string[];
}) {
  const [releve, setReleve] = useState<Map<string, number> | null>(null);
  // T139 — les lignes que le relevé du catalogue ne porte pas : celles qu'un
  // œil a déjà rangées ici, puis celles qu'on ajoute dans l'éditeur.
  const [extras, setExtras] = useState<string[]>([]);
  const [cherche, setCherche] = useState("");

  const etatDe = (ing: string) => placard?.parIngredient.get(ing) ?? null;
  const ajoutes = dedans ? [...dedans].filter(([, m]) => m.ajoute).map(([id]) => id) : [];
  const auReleve = new Set(z.denrees.map((d) => d.ingredient));

  const ouvrir = () => {
    setExtras(ajoutes);
    setCherche("");
    setReleve(
      new Map([
        ...z.denrees.map((d): [string, number] => [d.ingredient, etatDe(d.ingredient)?.unites ?? 0]),
        ...ajoutes.map((id): [string, number] => [id, dedans?.get(id)?.unites ?? 0]),
      ]),
    );
  };

  const ajouter = (id: string) => {
    if (!releve) return;
    if (!auReleve.has(id) && !extras.includes(id)) setExtras([...extras, id]);
    setReleve(new Map(releve).set(id, Math.max(1, releve.get(id) ?? 0)));
    setCherche("");
  };
  const q = cherche.trim().toLowerCase();
  const trouves =
    q.length < 2 ? [] : connus.filter((c) => c.nom.includes(q) || c.id.includes(q)).slice(0, 6);

  // Une ligne de l'éditeur : − n +. Les denrées du relevé et les ajouts
  // partagent le même geste, et le même compte en paquets.
  const ligneDEditeur = (cle: string, ingredient: string, nom: string, note?: string) => (
    <div key={cle} className="co-lot">
      <span style={{ flex: 1 }}>
        <div className="nom">{nom}</div>
        {note ? <div className="ou">{note}</div> : null}
      </span>
      <Compteur
        n={releve?.get(ingredient) ?? 0}
        poser={(n) => releve && setReleve(new Map(releve).set(ingredient, n))}
      />
    </div>
  );

  const valider = async () => {
    if (!releve) return;
    // Les lignes à zéro partent AVEC les autres : c'est bien le relevé complet
    // de la zone qui est déclaré, pas une liste de corrections.
    await releverZone(
      base,
      z.id,
      [...releve].filter(([, n]) => n > 0).map(([ingredient, unites]) => ({ ingredient, unites })),
    );
    setReleve(null);
  };

  return (
    <div className="co-espace st-panneau">
      <div className="nom" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>
          {z.nom}
          {z.volume ? <span className="co-note"> · {z.volume}</span> : null}
        </span>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: "4px 10px" }}
          onClick={() => (releve ? setReleve(null) : ouvrir())}
        >
          {releve ? "Annuler" : "Relever"}
        </button>
      </div>
      <div className="co-note">
        {z.cotes}
        {z.ambiance ? ` · ${z.ambiance}` : ""}
        {poids ? ` · ${poids}` : ""}
      </div>
      <Conseil phrases={conseil} />

      {releve ? (
        <>
          {z.denrees.map((d) => ligneDEditeur(d.cle, d.ingredient, d.nom, d.note || undefined))}
          {extras.map((id) => ligneDEditeur(`+${id}`, id, id.replace(/-/g, " "), "ajouté"))}
          {/* T139 — CE QUE LE RELEVÉ DU 26/08 NE CONNAÎT PAS. On choisit dans
              le catalogue, jamais en texte libre : un id qu'aucune recette ne
              lit ne retirerait aucune ligne de courses. */}
          <div className="co-chercher" style={{ marginTop: "var(--space-2)" }}>
            <input
              type="search"
              aria-label={`ajouter une denrée à ${z.nom}`}
              placeholder="Ajouter une denrée…"
              value={cherche}
              onChange={(ev) => setCherche(ev.target.value)}
            />
          </div>
          {trouves.map((c) => (
            <button
              key={c.id}
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: "2px 8px", marginTop: 4, marginRight: 4 }}
              onClick={() => ajouter(c.id)}
            >
              + {c.nom}
            </button>
          ))}
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: "var(--space-2)" }}
            onClick={() => void valider()}
          >
            Valider le relevé — ce qui est à 0 n’y est plus
          </button>
        </>
      ) : !dedans ? null : dedans.size ? (
        // CE QUI RESTE ICI, ET RIEN D'AUTRE — T107. La ligne retombait sur
        // `d.quantite` quand le rejeu ne portait plus l'ingrédient : la zone
        // qu'on venait de déclarer vide relisait son contenu du 26/08. Le
        // relevé du catalogue dit ce que la zone EST — c'est la liste que
        // l'éditeur ouvre, pour qu'on puisse y remettre ce qui revient — pas
        // ce qu'il en reste.
        [
          ...z.denrees.filter((d) => dedans.has(d.ingredient)),
          // T139 — ce qu'un œil a rangé ici sans que le relevé le connaisse.
          ...ajoutes.map((id) => ({
            cle: `+${id}`,
            ingredient: id,
            nom: id.replace(/-/g, " "),
            note: "ajouté au relevé",
            alerte: "",
            etat: "",
          })),
        ].map((d) => {
          const e = etatDe(d.ingredient);
          const m = dedans.get(d.ingredient)!;
          return (
            <div key={d.cle} className="co-lot">
              <span style={{ flex: 1 }}>
                <div className="nom">{d.nom}</div>
                {/* La note dit pourquoi cette ligne existe à part — « à l’huile
                    d’olive », « distributeur ». Sans elle, deux thons de la
                    même zone se ressemblent à s’y méprendre. */}
                {d.note ? <div className="ou">{d.note}</div> : null}
                {d.alerte ? <div className="ou">⚠ {d.alerte}</div> : null}
                {/* LE CHIFFRE ET SA DATE, TOUJOURS LISIBLES DESSOUS. C'est ce
                    qui remplace un score de confiance : trois mots se lisent,
                    un score se croit. */}
                {e?.vuLe ? <div className="ou">vu le {e.vuLe}</div> : null}
                <Corriger nom={d.nom} ingredient={e?.ingredient ?? d.ingredient} unites={m.unites} zone={m.zone} />
              </span>
              <span>
                <div className="q">{m.quantite}</div>
                <div className={`src ${e && e.confiance !== "sur" ? "estime" : ""}`}>
                  {e ? MOT_CONFIANCE[e.confiance] : d.etat}
                </div>
              </span>
            </div>
          );
        })
      ) : (
        <div className="co-note">Rien de relevé ici.</div>
      )}
    </div>
  );
}

/** − n + : un compte de PAQUETS entiers, jamais de grammes (T139). */
function Compteur({ n, poser }: { n: number; poser: (n: number) => void }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
      <button
        className="btn btn-secondary"
        style={{ padding: "2px 10px" }}
        onClick={() => poser(Math.max(0, n - 1))}
      >
        −
      </button>
      <b style={{ minWidth: "1.5em", textAlign: "center" }}>{n}</b>
      <button
        className="btn btn-secondary"
        style={{ padding: "2px 10px" }}
        onClick={() => poser(n + 1)}
      >
        +
      </button>
    </span>
  );
}

/**
 * Corriger UNE ligne du garde-manger, sur place — T139.
 *
 * « Je n'en ai plus » en un geste, comme sur un lot du dépôt ; « Corriger »
 * ouvre le compte, prérempli de ce que le rejeu croit. L'un et l'autre écrivent
 * une observation à UN constat (`corrigerLigne`) : les autres denrées de la
 * zone ne bougent pas, ce que seul un relevé complet a le droit de faire.
 */
function Corriger({
  nom,
  ingredient,
  unites,
  zone,
}: {
  nom: string;
  ingredient: string;
  unites: number;
  zone: string | null;
}) {
  const [n, setN] = useState<number | null>(null);
  const poser = async (v: number) => {
    await corrigerLigne(base, ingredient, v, zone);
    setN(null);
  };
  const petit = { fontSize: 12, padding: "2px 8px" };
  if (n === null)
    return (
      <div style={{ display: "flex", gap: "var(--space-1)", marginTop: 4 }}>
        <button className="btn btn-ghost" style={petit} aria-label={`corriger : ${nom}`} onClick={() => setN(unites)}>
          Corriger
        </button>
        <button
          className="btn btn-ghost"
          style={petit}
          aria-label={`je n’en ai plus : ${nom}`}
          onClick={() => void poser(0)}
        >
          Je n’en ai plus
        </button>
      </div>
    );
  return (
    <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center", marginTop: 4 }}>
      <Compteur n={n} poser={setN} />
      <button className="btn btn-secondary" style={petit} onClick={() => void poser(n)}>
        C’est ça
      </button>
      <button className="btn btn-ghost" style={petit} onClick={() => setN(null)}>
        Annuler
      </button>
    </div>
  );
}

function Lot({ lot, retirer }: { lot: LotVue; retirer: (ref: string) => Promise<void> }) {
  const ref = lot.ref;
  return (
    <div className={`co-lot${lot.epuise ? " mange" : ""}`}>
      <span style={{ color: "var(--color-neutral-700)", display: "flex" }}>
        <Icone nom={iconeEspace(lot.espace)} />
      </span>
      <span style={{ flex: 1 }}>
        <div className="nom">{lot.nom}</div>
        <div className="ou">{lot.ou}</div>
        {/* L'HORLOGE NE PARLE QUE QUAND ELLE A QUELQUE CHOSE À DIRE, c'est-à-dire
            sur un lot congelé au-delà de son forfait. Il reste servi — son mode
            d'échec est la qualité et non la sécurité — donc la phrase informe :
            elle ne barre pas la ligne et n'offre aucun geste. Le reste de frigo
            périmé parle à droite, à la place de la marque (T103). */}
        {lot.horloge ? <div className="ou">{lot.horloge}</div> : null}
        {ref ? (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: "2px 8px", marginTop: 4 }}
            onClick={() => void retirer(ref)}
          >
            Je n’en ai plus
          </button>
        ) : null}
      </span>
      <span>
        <div className="q">{lot.quantite}</div>
        <div className={`src ${lot.fiabilite.classe}`}>{lot.fiabilite.label}</div>
        {/* LES DEUX MOTS DE L'AXE — T57. Sous la fiabilité, parce que ce sont
            deux lectures du même lot et qu'elles se répondent : « compté » dit
            ce que l'app SAIT, « urgent » dit où le lot EN EST. Rien ne s'affiche
            tant que le lot va bien, et c'est le cas de la plupart : un mot
            permanent ne se remarque plus le jour où il change. */}
        {lot.perime ? (
          // À LA PLACE DE LA MARQUE, PAS EN PLUS : les deux répondent « où en
          // est-il », et un lot passé n'est plus sur l'axe. Sans la couleur
          // d'« urgent » — ce n'est pas à manger vite, c'est à ne pas manger.
          <div className="src">{PERIME}</div>
        ) : lot.marque ? (
          <div className={`src ${lot.marque === "urgent" ? "estime" : ""}`}>{lot.marque}</div>
        ) : null}
      </span>
    </div>
  );
}
