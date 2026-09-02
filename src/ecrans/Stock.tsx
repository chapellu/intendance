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
// UN SEUL GESTE, ET IL EST RÉVERSIBLE : « je n'en ai plus ». C'est le mensonge
// que la persistance rendait possible — un bocal mangé hors de l'app reste au
// congélo pour toujours, et l'app continue de chaîner dessus. Il ne s'offre que
// sur les lots CONSTATÉS : ce que la semaine produit est un résultat de calcul,
// et se retire en changeant la semaine.
//
// Port de `apps/proto-shell/comptoir.js` (`ecranStock`).

import { useMemo, useState } from "react";
import { ajouterLot, base, retirerLot, type LotStock } from "../db";
import { useCatalogue, usePlacard, useSemaine } from "../db/hooks";
import { releverZone } from "../db/journal";
import type { Calcul } from "../model/calcul";
import type { Jeu } from "../model/jeu";
import type { Confiance, EtatIngredient, Rejeu } from "../model/journal";
import type { Espace } from "../model/types";
import { chemin } from "../nav/routes";
import { aller } from "../nav/useRoute";
import { Corps } from "../ui/Coquille";
import { Icone, iconeEspace } from "../ui/icones";
import { fmt } from "../ui/format";
import { vueDeLInventaire, type LotVue, type ZoneVue } from "./stock.vue";

export function Stock() {
  const { catalogue } = useCatalogue();
  const { jeu, calc } = useSemaine(catalogue);
  if (!jeu || !calc) return null;
  return <Contenu jeu={jeu} calc={calc} />;
}

function Contenu({ jeu, calc }: { jeu: Jeu; calc: Calcul }) {
  // LE RANGEMENT OUVERT EST UN REGARD, PAS UNE DÉCISION — donc rien en base,
  // comme la case dépliée de « La semaine ». Rouvrir l'inventaire sur « Congélo »
  // parce qu'on y avait jeté un œil mardi cacherait le frigo sans qu'on l'ait
  // demandé.
  const [filtre, setFiltre] = useState<Espace | null>(null);

  // CE QU'ON VIENT DE RETIRER, LE TEMPS DE SE RAVISER. Un lot supprimé d'un
  // doigt sur un téléphone qu'on tient d'une main est un lot supprimé par
  // erreur une fois sur dix ; il n'existe aucun ailleurs où aller le rechercher.
  // La mémoire est celle de l'écran : quitter l'inventaire vaut confirmation.
  const [retire, setRetire] = useState<LotStock | null>(null);

  const vue = useMemo(() => vueDeLInventaire(jeu, calc, filtre), [jeu, calc, filtre]);

  // LE PLACARD REJOUÉ. Rien de ce qu'il rend n'existe en base : c'est l'amorce
  // du catalogue plus le journal, et c'est là que T25 devient visible à l'œil.
  const placard = usePlacard(jeu.catalogue);

  const retirer = async (ref: string) => {
    const id = Number(ref);
    const lot = await base.stock.get(id);
    if (!lot) return;
    await retirerLot(base, id);
    setRetire(lot);
  };

  const rendre = async () => {
    if (!retire) return;
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
      born: retire.born,
      origine: retire.origine,
    });
    setRetire(null);
  };

  return (
    <Corps plat>
      <button className="co-retour" onClick={() => aller({ ecran: "semaine" })}>
        ‹ La semaine
      </button>
      <div className="co-h" style={{ marginTop: "var(--space-2)" }}>L’inventaire</div>
      <div className="co-note" style={{ marginTop: "var(--space-1)" }}>
        {vue.nomDuFiltre
          ? `Ce que le ${vue.nomDuFiltre.toLowerCase()} porte, et d’où vient chaque chiffre.`
          : "Ce qui est chez vous, par où c’est rangé. Chaque rangement porte en mots la fiabilité de son chiffre."}
      </div>

      <div className="co-cats">
        {vue.categories.map((c) => (
          <button
            key={c.espace}
            className={vue.filtre === c.espace ? "on" : ""}
            onClick={() => setFiltre(vue.filtre === c.espace ? null : c.espace)}
          >
            <span style={{ flex: 1 }}>
              <div className="nom">{c.nom}</div>
              <div className="note">{c.note}</div>
            </span>
            <span className={`co-jauge ${c.conf}`}>
              {[0, 1, 2, 3].map((k) => (
                <i key={k} className={k < c.barres ? "on" : ""} />
              ))}
            </span>
          </button>
        ))}
      </div>

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
      <div className="co-note" style={{ margin: "var(--space-2) var(--space-1) 0" }}>
        Deux plafonds par espace&nbsp;: les étagères et les contenants. Le plus bas commande,
        et c’est lui qui passe en terre cuite — laver deux bocaux n’est pas dégager une étagère.
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          margin: "var(--space-4) var(--space-1) var(--space-2)",
        }}
      >
        <span className="co-kicker">
          {vue.nomDuFiltre ? `Lots · ${vue.nomDuFiltre}` : "Tous les lots"}
        </span>
        {vue.filtre ? (
          <button className="co-retour" onClick={() => setFiltre(null)}>
            Tout voir
          </button>
        ) : null}
      </div>

      {vue.lots.length ? (
        vue.lots.map((l) => <Lot key={l.cle} lot={l} retirer={retirer} />)
      ) : (
        <div className="co-vide">Rien ici.</div>
      )}

      {/* LE RETOUR EN ARRIÈRE, tant qu'on est sur l'écran. Il dit ce qui est
          parti : « retiré » sans nom laisse chercher lequel. */}
      {retire ? (
        <div className="co-note" style={{ marginTop: "var(--space-3)" }}>
          « {retire.type} » retiré de l’inventaire.{" "}
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12.5, padding: "2px 8px" }}
            onClick={() => void rendre()}
          >
            Annuler
          </button>
        </div>
      ) : null}

      {/* CE QUE LA SEMAINE PRODUIT N'EST PAS À VOUS — au sens où aucun doigt ne
          l'a constaté. Le dire une fois vaut mieux que de laisser chercher
          pourquoi certaines lignes n'ont pas de bouton. */}
      {vue.lots.some((l) => !l.ref) ? (
        <div className="co-note" style={{ margin: "var(--space-2) var(--space-1) 0" }}>
          Les lots cuisinés cette semaine sont calculés&nbsp;: ils se retirent en changeant la
          semaine, pas ici.{" "}
          <a
            className="btn btn-ghost"
            style={{ fontSize: 12.5, padding: "2px 8px" }}
            href={chemin({ ecran: "semaine" })}
          >
            La semaine ›
          </a>
        </div>
      ) : null}

      <div className="co-encart" style={{ marginTop: "var(--space-3)" }}>
        <Icone nom="info" />
        <span>
          <b>Compté</b>&nbsp;: la quantité vient de l’export, elle est juste. <b>Estimé</b>&nbsp;:
          déduite d’un plat cuisiné cette semaine, à vérifier de l’œil. <b>En bloc</b>&nbsp;: pas
          compté du tout — on sait seulement que ça existe.
        </span>
      </div>

      <GardeManger vue={vue.gardeManger} placard={placard} />
    </Corps>
  );
}

/**
 * Le garde-manger — les placards eux-mêmes, et la matière première dedans.
 *
 * IL VIENT APRÈS LES LOTS, ET L'ORDRE EST ENCORE L'ARGUMENT. Les lots sont ce
 * que la semaine bouge ; le garde-manger est ce qui ne bouge pas. On ouvre cet
 * écran pour savoir si la semaine tient, et la réponse est en haut ; on descend
 * ici pour savoir ce qu'il reste de farine, ce qui est une autre question et une
 * question plus rare.
 *
 * LES ALERTES SONT EN TÊTE PARCE QU'ELLES NE PARLENT PAS DE DONNÉES. Tout le
 * reste de cet écran décrit un état ; ces lignes-là demandent d'aller déplacer un
 * sachet. C'est la seule chose de l'inventaire qui appelle un geste dans la
 * cuisine plutôt qu'un doigt sur le téléphone.
 */
function GardeManger({
  vue,
  placard,
}: {
  vue: ReturnType<typeof vueDeLInventaire>["gardeManger"];
  placard: Rejeu | null;
}) {
  if (!vue.zones.length) return null;
  return (
    <>
      <div className="co-kicker" style={{ margin: "var(--space-4) var(--space-1) var(--space-2)" }}>
        Le garde-manger
      </div>
      <div className="co-note" style={{ margin: "0 var(--space-1) var(--space-2)" }}>
        {vue.denrees} denrées dans {vue.zones.length} rangements
        {vue.volume ? `, ${vue.volume} mesurés` : ""}. {vue.pesees} sont pesées, pour {vue.poids}.
      </div>

      {/* UNE ALERTE PAR LIGNE, PARCE QU'UNE ALERTE EST UN GESTE. Enfilées avec
          des points médians elles formaient un pavé de sept lignes qu'on ne lit
          pas — et une liste qu'on ne lit pas vaut une liste vide. */}
      {vue.alertes.length ? (
        <div className="co-encart" style={{ marginBottom: "var(--space-3)", display: "block" }}>
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

      {/* DEUX LISTES, DEUX GESTES, ET IL NE FAUT PAS LES CONFONDRE. « À
          déplacer » dit de ranger autrement — un sachet à mettre ailleurs.
          « À manger en premier » dit de cuisiner. Le même oignon peut être dans
          les deux, et ce n'est pas une redite : il est mal rangé ET il court. */}
      {vue.aSauver.length ? (
        <>
          <div className="co-kicker" style={{ margin: "0 var(--space-1) var(--space-2)" }}>
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
              </span>
              <span>
                <div className={`src ${s.urgence === "haute" ? "estime" : ""}`}>
                  {s.urgence === "haute" ? "pressé" : "entamé"}
                </div>
              </span>
            </div>
          ))}
          <div className="co-note" style={{ margin: "var(--space-2) var(--space-1) var(--space-3)" }}>
            « Poser un plat » remonte les recettes qui les mangent. Un aromate qu’on met partout —
            l’oignon est dans 42&nbsp;% des plats — sera consommé de toute façon&nbsp;: c’est le reste
            de cette liste qui se perd vraiment.
          </div>
        </>
      ) : null}

      {vue.zones.map((z) => (
        <Zone key={z.id} z={z} placard={placard} />
      ))}

      <div className="co-encart" style={{ marginTop: "var(--space-2)" }}>
        <Icone nom="info" />
        <span>
          Ces chiffres sont <b>déduits</b>, pas relevés&nbsp;: le stock descend quand on termine une
          recette, et rien d’autre ne le regarde. C’est pour ça que chaque ligne dit de quand elle
          date. <b>Relever une zone</b> remet tout ce qu’elle contient à ce que vos yeux voient — un
          quart d’heure achète des semaines de silence.
        </span>
      </div>
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
function Zone({ z, placard }: { z: ZoneVue; placard: Rejeu | null }) {
  const [releve, setReleve] = useState<Map<string, number> | null>(null);

  const etatDe = (ing: string) => placard?.parIngredient.get(ing) ?? null;

  const ouvrir = () =>
    setReleve(new Map(z.denrees.map((d) => [d.ingredient, etatDe(d.ingredient)?.unites ?? 0])));

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
    <div className="co-espace" style={{ marginBottom: "var(--space-2)" }}>
      <div className="nom" style={{ display: "flex", justifyContent: "space-between" }}>
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
        {z.poids ? ` · ${z.poids}` : ""}
      </div>

      {releve ? (
        <>
          {z.denrees.map((d) => (
            <div key={d.cle} className="co-lot">
              <span style={{ flex: 1 }}>
                <div className="nom">{d.nom}</div>
                {d.note ? <div className="ou">{d.note}</div> : null}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: "2px 10px" }}
                  onClick={() =>
                    setReleve(
                      new Map(releve).set(
                        d.ingredient,
                        Math.max(0, (releve.get(d.ingredient) ?? 0) - 1),
                      ),
                    )
                  }
                >
                  −
                </button>
                <b style={{ minWidth: "1.5em", textAlign: "center" }}>
                  {releve.get(d.ingredient) ?? 0}
                </b>
                <button
                  className="btn btn-secondary"
                  style={{ padding: "2px 10px" }}
                  onClick={() =>
                    setReleve(new Map(releve).set(d.ingredient, (releve.get(d.ingredient) ?? 0) + 1))
                  }
                >
                  +
                </button>
              </span>
            </div>
          ))}
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: "var(--space-2)" }}
            onClick={() => void valider()}
          >
            Valider le relevé — ce qui est à 0 n’y est plus
          </button>
        </>
      ) : z.denrees.length ? (
        z.denrees.map((d) => {
          const e = etatDe(d.ingredient);
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
              </span>
              <span>
                <div className="q">{e ? quantiteDite(e) : d.quantite}</div>
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

/** Ce qu'on sait dire d'un ingrédient rejoué : des grammes quand tout est
 *  chiffré, un compte sinon. « 1 » est une information, pas un tiret. */
function quantiteDite(e: EtatIngredient): string {
  if (e.grammes == null) return `${e.unites}`;
  return e.grammes >= 1000 ? `${fmt(e.grammes / 1000)} kg` : `${fmt(e.grammes)} g`;
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
      </span>
    </div>
  );
}
