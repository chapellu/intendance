// La coquille — ce qui ne change jamais d'un écran à l'autre.
//
// La direction « Le comptoir » lui donne un rôle précis : la barre du bas
// appartient à la COQUILLE, pas à la facette. C'est la seule chose qui ne bouge
// jamais, et c'est tout ce qu'on lui demande. Une facette en sommeil (le jardin
// en janvier) y reste listée, sans chiffre — on ne la désinstalle pas.
//
// La sous-navigation de cuisine, elle, appartient à la facette : elle n'existe
// que dans ses quatre vues courtes, et disparaît au cockpit comme au jardin.

import type { ReactNode } from "react";
import { JOURS_VISIBLES } from "../nav/jours";
import { chemin, dansCuisine, ENTREE_CUISINE, type Route } from "../nav/routes";
import { aller } from "../nav/useRoute";
import { MiseAJour } from "./MiseAJour";

interface Onglet {
  route: Route;
  nom: string;
  pastille?: number;
}

/** Les écrans qui sont encore « Proposer », vus de la sous-navigation. */
const EN_PASSE: ReadonlySet<Route["ecran"]> = new Set<Route["ecran"]>(["poser", "parts"]);

/** Les vues de la cuisine quand les jours sont là : trois lectures du calendrier
 *  et la liste qui en tombe. */
const SOUS_NAV_JOURS: { route: Route; nom: string }[] = [
  { route: { ecran: "aujourdhui" }, nom: "Aujourd’hui" },
  { route: { ecran: "semaine" }, nom: "La semaine" },
  { route: { ecran: "prevoir" }, nom: "À prévoir" },
  { route: { ecran: "courses" }, nom: "Courses" },
];

/**
 * Les vues de la cuisine sans les jours — voir `nav/jours.ts`.
 *
 * TROIS ONGLETS, ET C'EST UNE BOUCLE PLUTÔT QU'UN CALENDRIER : ce qu'on a
 * (Stock), ce qu'on peut en faire (Proposer), ce qu'il faut aller chercher
 * (Courses). L'inventaire n'était jusqu'ici atteignable que par le lien « à
 * vérifier » d'une carte, c'est-à-dire seulement quand l'app avait un doute —
 * alors que c'est l'écran autour duquel le foyer veut tourner.
 */
const SOUS_NAV_STOCK: { route: Route; nom: string }[] = [
  { route: { ecran: "fil" }, nom: "Proposer" },
  { route: { ecran: "stock" }, nom: "Stock" },
  { route: { ecran: "courses" }, nom: "Courses" },
];

const SOUS_NAV = JOURS_VISIBLES ? SOUS_NAV_JOURS : SOUS_NAV_STOCK;

export interface Pastilles {
  /** Ce qui attend une réponse côté cuisine : offres et gamelles. */
  cuisine: number;
  /** Ce que la journée réclame, toutes facettes confondues. */
  cockpit: number;
}

export function Coquille({
  route,
  titre,
  sous,
  pastilles,
  children,
}: {
  route: Route;
  /** Le titre de la facette, quand elle en a un. */
  titre?: string;
  sous?: string;
  pastilles: Pastilles;
  children: ReactNode;
}) {
  const cuisine = dansCuisine(route);

  return (
    <div className="coquille">
      {cuisine && titre ? (
        <>
          <div className="co-tete">
            <div>
              <div className="titre">{titre}</div>
              {/* Le sous-titre EST un agenda : « semaine du 17 au 23 septembre »
                  n'a pas d'autre contenu que la fenêtre de sept jours. Il part
                  avec elle. */}
              {sous && JOURS_VISIBLES ? <div className="sous">{sous}</div> : null}
            </div>
            <button className="btn btn-secondary" onClick={() => aller({ ecran: "cockpit" })}>
              Cockpit
            </button>
          </div>
          <nav className="co-sousnav" aria-label="Vues de la cuisine">
            {SOUS_NAV.map((o) => (
              <Lien
                key={o.route.ecran}
                onglet={{ ...o, ...(o.route.ecran === "prevoir" ? { pastille: pastilles.cuisine } : {}) }}
                // « Proposer » reste allumé pendant toute la passe, pas
                // seulement sur son ouverture : `poser` et `parts` sont des
                // détours du même geste, et un onglet qui s'éteint sous le doigt
                // fait croire qu'on a quitté ce qu'on était en train de faire.
                actif={route.ecran === o.route.ecran || (o.route.ecran === "fil" && EN_PASSE.has(route.ecran))}
              />
            ))}
          </nav>
        </>
      ) : null}

      {children}

      <MiseAJour />

      <nav className="co-barre" aria-label="Facettes">
        <Facette
          nom="Cockpit"
          couleur="var(--color-neutral-500)"
          actif={route.ecran === "cockpit"}
          pastille={pastilles.cockpit}
          onClick={() => aller({ ecran: "cockpit" })}
        />
        <Facette
          nom="Cuisine"
          couleur="var(--color-accent)"
          actif={cuisine}
          // SANS LES JOURS, LA PASTILLE NE COMPTE PLUS RIEN D'ATTEIGNABLE. Elle
          // annonçait les offres et les gamelles d'« À prévoir », qui sont des
          // objets de calendrier — une gamelle est le midi de demain pris sur le
          // dîner de ce soir. L'écran étant éteint, le chiffre n'ouvrirait plus
          // rien, ce qui est pire que de compter faux.
          pastille={JOURS_VISIBLES ? pastilles.cuisine : 0}
          onClick={() => aller(ENTREE_CUISINE)}
        />
        <Facette
          nom="Jardin"
          couleur="var(--color-accent-2)"
          actif={route.ecran === "jardin"}
          pastille={0}
          onClick={() => aller({ ecran: "jardin" })}
        />
      </nav>
    </div>
  );
}

/** Un onglet de sous-navigation. C'est une VRAIE ancre : le pouce peut la
 *  garder appuyée pour copier le lien, et le geste de retour d'iOS la connaît. */
function Lien({ onglet, actif }: { onglet: Onglet; actif: boolean }) {
  return (
    <a
      href={chemin(onglet.route)}
      className={actif ? "actif" : ""}
      aria-current={actif ? "page" : undefined}
    >
      <span>{onglet.nom}</span>
      {onglet.pastille ? <span className="co-pastille">{onglet.pastille}</span> : null}
    </a>
  );
}

function Facette({
  nom,
  couleur,
  actif,
  pastille,
  onClick,
}: {
  nom: string;
  couleur: string;
  actif: boolean;
  pastille: number;
  onClick: () => void;
}) {
  return (
    <button className={actif ? "actif" : ""} onClick={onClick} aria-current={actif ? "page" : undefined}>
      <span className="point" style={{ background: couleur }} />
      <span>{nom}</span>
      {pastille ? <span className="co-pastille">{pastille}</span> : null}
    </button>
  );
}

/** Le corps d'un écran : la seule zone qui défile. */
export const Corps = ({ plat = false, children }: { plat?: boolean; children: ReactNode }) => (
  <div className={`co-corps${plat ? " plat" : ""}`}>{children}</div>
);
