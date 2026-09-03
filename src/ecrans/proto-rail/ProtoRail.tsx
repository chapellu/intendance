// PROTOTYPE — à jeter. Workspace#45.
//
// « Trois variantes du rail de planification, commutées par `?variant=`, sur la
//   route jetable `#/cuisine/proto-rail`. »
//
// L'hôte : il charge le VRAI catalogue, le VRAI placard rejoué et la VRAIE
// semaine en base, puis n'écrit plus rien. Toutes les décisions du rail vivent
// dans un `RailEtat` en mémoire, jeté au rechargement — on doit pouvoir
// rejouer la cérémonie vingt fois pour la juger.

import { useMemo, useState } from "react";
import { useCatalogue, useJournal, useSemaine } from "../../db/hooks";
import { calculer, type Calcul } from "../../model/calcul";
import type { Rejeu } from "../../model/journal";
import { SAUTE, type Jeu } from "../../model/jeu";
import { contexte, rejouer } from "../../model/journal";
import type { Catalogue } from "../../model/types";
import { Corps } from "../../ui/Coquille";
import { ProtoBarre, lireVariante } from "./ProtoBarre";
import { VarianteA } from "./VarianteA";
import { VarianteB } from "./VarianteB";
import { VarianteC } from "./VarianteC";
import {
  etatDuSlot,
  journalDemo,
  railNeuf,
  type RailEtat,
  type Reglages,
  type Variante,
} from "./rail";

export interface Actes {
  poser: (i: number, plat: string) => void;
  sauter: (i: number) => void;
  horsPlan: (i: number) => void;
  rouvrir: (i: number) => void;
  repiocher: (i: number) => void;
  repondre: (cle: string, v: "oui" | "non" | null) => void;
  ecarter: (cle: string) => void;
  retenir: (i: number) => void;
}

export interface PropsVariante {
  jeu: Jeu;
  calc: Calcul;
  catalogue: Catalogue;
  placard: Rejeu | null;
  st: RailEtat;
  actes: Actes;
  reglages: Reglages;
  cuisinesRecentes: ReadonlySet<string>;
}

/** Le libellé d'un créneau, tel que le rail le dit à voix haute. */
export function quand(jeu: Jeu, i: number): string {
  const c = jeu.creneaux[i];
  if (!c) return "?";
  return `${jeu.jours[c.jour]?.nom ?? "?"} ${c.label}`;
}

export function ProtoRail() {
  const { catalogue } = useCatalogue();
  const { jeu } = useSemaine(catalogue);
  const journal = useJournal();

  const [variante, setVariante] = useState<Variante>(lireVariante);
  const [configHonoree, setConfig] = useState(false);
  const [demo, setDemo] = useState(true);
  const [st, setSt] = useState<RailEtat | null>(null);

  // Le journal RÉEL, plus une histoire de démo quand la base est neuve : sans
  // elle le placard est « sûr » partout et le rail n'a rien à demander. Voir
  // `journalDemo`.
  const evenements = useMemo(() => {
    if (!catalogue || !journal) return null;
    return demo ? [...journalDemo(catalogue, new Date()), ...journal] : journal;
  }, [catalogue, journal, demo]);

  // Le placard rejoué : c'est lui qui porte la confiance, donc lui qui décide
  // de ce que le rail a le droit de demander.
  const placard = useMemo(
    () =>
      catalogue && evenements
        ? rejouer(catalogue, evenements, contexte(catalogue), new Date().toISOString().slice(0, 10))
        : null,
    [catalogue, evenements],
  );

  // Ce qui a été cuisiné dans les `cooldown_jours` derniers jours — la seule
  // source honnête du cooldown dans l'app réelle (`historique.yaml` n'est pas
  // exporté). Journal vide = ensemble vide, et le bouton ne fait rien : c'est
  // exact, pas cassé.
  const cuisinesRecentes = useMemo(() => {
    if (!catalogue || !evenements) return new Set<string>();
    const limite = new Date();
    limite.setDate(limite.getDate() - catalogue.equilibre.main.cooldown_jours);
    const seuil = limite.toISOString().slice(0, 10);
    return new Set(
      evenements
        .filter((e) => e.sorte === "cuisine" && e.jour >= seuil)
        .map((e) => (e as { plat: string }).plat),
    );
  }, [catalogue, evenements]);

  const etat = st ?? (jeu ? railNeuf(jeu) : null);

  // Le calcul, rejoué sur les choix DU RAIL et non sur ceux de la base : c'est
  // ce qui fait bouger le panier pendant la cérémonie.
  const calc = useMemo(
    () => (jeu && etat ? calculer(jeu, etat.choix, [], jeu.parts, new Set<string>()) : null),
    [jeu, etat],
  );

  if (!catalogue || !jeu || !etat || !calc) {
    return (
      <Corps plat>
        <div className="co-note">chargement…</div>
      </Corps>
    );
  }

  const maj = (f: (s: RailEtat) => RailEtat) => setSt((v) => f(v ?? railNeuf(jeu)));

  const actes: Actes = {
    poser: (i, plat) =>
      maj((s) => {
        const choix = [...s.choix];
        choix[i] = plat;
        const hors = new Set(s.hors);
        hors.delete(i);
        return { ...s, choix, hors };
      }),
    sauter: (i) =>
      maj((s) => {
        const choix = [...s.choix];
        choix[i] = SAUTE;
        const hors = new Set(s.hors);
        hors.delete(i);
        return { ...s, choix, hors };
      }),
    horsPlan: (i) =>
      maj((s) => {
        const choix = [...s.choix];
        choix[i] = null;
        const hors = new Set(s.hors);
        hors.add(i);
        return { ...s, choix, hors };
      }),
    rouvrir: (i) =>
      maj((s) => {
        const choix = [...s.choix];
        choix[i] = null;
        const hors = new Set(s.hors);
        hors.delete(i);
        return { ...s, choix, hors };
      }),
    repiocher: (i) =>
      maj((s) => {
        const repioches = [...s.repioches];
        repioches[i] = (repioches[i] ?? 0) + 1;
        return { ...s, repioches };
      }),
    repondre: (cle, v) => maj((s) => ({ ...s, reponses: { ...s.reponses, [cle]: { valeur: v } } })),
    ecarter: (cle) => maj((s) => ({ ...s, ecartees: new Set(s.ecartees).add(cle) })),
    retenir: (i) =>
      maj((s) => {
        const retenus = new Set(s.retenus);
        if (retenus.has(i)) retenus.delete(i);
        else retenus.add(i);
        return { ...s, retenus };
      }),
  };

  const props: PropsVariante = {
    jeu, calc, catalogue, placard, st: etat, actes,
    reglages: { configHonoree },
    cuisinesRecentes,
  };

  const compte = { pose: 0, saute: 0, hors: 0, vide: 0 };
  for (const i of jeu.creneaux.keys()) {
    const e = etatDuSlot(etat, i);
    if (e === "pose") compte.pose++;
    else if (e === "saute") compte.saute++;
    else if (e === "hors-plan") compte.hors++;
    else compte.vide++;
  }

  const resume =
    `posés ${compte.pose} · sautés ${compte.saute} · hors-plan ${compte.hors} · vides ${compte.vide}` +
    ` | réponses ${Object.keys(etat.reponses).length} (écartées ${etat.ecartees.size})` +
    ` | panier ${calc.panier.size} | cooldown écarte ${cuisinesRecentes.size} plat(s)`;

  return (
    <>
      <div style={{ paddingBottom: 120 }}>
        {variante === "A" ? <VarianteA {...props} /> : null}
        {variante === "B" ? <VarianteB {...props} /> : null}
        {variante === "C" ? <VarianteC {...props} /> : null}
      </div>
      <ProtoBarre
        variante={variante}
        changer={setVariante}
        configHonoree={configHonoree}
        basculerConfig={() => setConfig((v) => !v)}
        demo={demo}
        basculerDemo={() => setDemo((v) => !v)}
        recommencer={() => setSt(railNeuf(jeu))}
        etat={resume}
      />
    </>
  );
}
