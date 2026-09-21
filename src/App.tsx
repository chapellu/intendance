// L'app — le shell multi-facettes (Workspace#36), habillé par la direction
// « Le comptoir » du canevas Claude Design.
//
// Ce fichier ne fait qu'une chose : brancher une route sur un écran. Toute la
// donnée passe par les hooks de `db/`, et chaque écran va la chercher lui-même
// — un App qui distribuerait les props de dix écrans deviendrait le seul
// fichier que personne ne peut plus lire.

import { indexDuCreneau } from "./db";
import { useAmorce, useCatalogue, useSemaine } from "./db/hooks";
import { vueAPrevoir } from "./ecrans/prevoir.vue";
import { chemin, ENTREE_CUISINE, pleinEcran, type Route } from "./nav/routes";
import { JOURS_VISIBLES } from "./nav/jours";
import { useRoute } from "./nav/useRoute";
import { Coquille, Corps, type Pastilles } from "./ui/Coquille";
import { Aujourdhui } from "./ecrans/Aujourdhui";
import { Cockpit, useCockpit } from "./ecrans/Cockpit";
import { Courses } from "./ecrans/Courses";
import { Fil } from "./ecrans/Fil";
import { Cuisiner } from "./ecrans/Cuisiner";
import { Jardin } from "./ecrans/Jardin";
import { Parts } from "./ecrans/Parts";
import { Poser } from "./ecrans/Poser";
import { Prevoir } from "./ecrans/Prevoir";
import { Poses } from "./ecrans/Poses";
import { Semaine } from "./ecrans/Semaine";
import { Stock } from "./ecrans/Stock";
import "./styles/organic.css";

const MOIS = (d: Date) => d.toLocaleDateString("fr-FR", { month: "long" });

export function App() {
  const route = useRoute();
  const { catalogue, erreur } = useCatalogue();
  // Le stock du catalogue n'entre en base qu'une fois ; à partir de là c'est le
  // foyer qui fait foi. Voir `db/stock.ts`. Depuis T15, c'est aussi ce que le
  // dépôt sert : on n'affiche rien avant que la table ait sa réponse, sinon le
  // premier rendu montre une cuisine vide qui n'existe pas.
  const amorce = useAmorce(catalogue);
  const { jeu, calc, chargement } = useSemaine(catalogue);

  if (erreur) return <Panne message={erreur.message} />;
  if (chargement || !amorce || !jeu || !calc) return <Chargement />;

  // Les hooks de la coquille ne peuvent pas vivre au-dessus de ces gardes : ils
  // ont besoin d'un jeu. On monte donc la coquille dans un composant à part,
  // dont le premier rendu a déjà tout — plutôt que d'appeler des hooks sous une
  // condition, ce qui les désaligne au premier écran qui change de branche.
  return <Monte route={route} jeu={jeu} calc={calc} />;
}

type Jeu = NonNullable<ReturnType<typeof useSemaine>["jeu"]>;
type Calcul = NonNullable<ReturnType<typeof useSemaine>["calc"]>;

function Monte({ route, jeu, calc }: { route: Route; jeu: Jeu; calc: Calcul }) {
  // CE QUI ATTEND UNE RÉPONSE. Les deux chiffres viennent de l'écran qui y
  // répondra — « À prévoir » pour la cuisine, le cockpit pour la journée — et
  // pas d'un compte refait ici. Une pastille qui annonce un autre nombre que la
  // liste qu'elle ouvre est pire que pas de pastille.
  const cockpit = useCockpit(jeu, calc);
  const pastilles: Pastilles = {
    cuisine: vueAPrevoir(jeu, calc).enAttente,
    // `null` tant que la base n'a pas répondu : la pastille apparaît alors,
    // au lieu d'afficher un zéro qu'elle corrige aussitôt.
    cockpit: cockpit?.taches.length ?? 0,
  };

  const j0 = jeu.jours[0]!;
  const jN = jeu.jours[jeu.jours.length - 1]!;
  const sous = `semaine du ${j0.date.getDate()} au ${jN.date.getDate()} ${MOIS(jN.date)}`;

  // « En cuisine » sort de la coquille : le mode guidé prend l'écran entier,
  // parce qu'on le lit à bout de bras avec les mains sales.
  if (pleinEcran(route)) return <div className="coquille">{rendre(route, jeu)}</div>;

  return (
    <Coquille route={route} titre="Cuisine" sous={sous} pastilles={pastilles}>
      {rendre(route, jeu)}
    </Coquille>
  );
}

function rendre(route: Route, jeu: Jeu) {
  switch (route.ecran) {
    case "cockpit": return <Cockpit />;
    case "jardin": return <Jardin />;
    case "aujourdhui": return <Aujourdhui />;
    case "semaine": return <Semaine />;
    case "poses": return <Poses />;
    case "prevoir": return <Prevoir />;
    case "courses": return <Courses />;
    case "stock": return <Stock />;
    // Le fil sans créneau est son ouverture : il n'y a rien à valider, et il
    // sait lui-même s'il doit demander l'horizon ou reprendre une passe.
    //
    // ET LE FIL AVEC UN CRÉNEAU DISPARU N'EST PAS UNE IMPASSE — c'est la seule
    // des quatre routes à créneau qui sache se rattraper. `Fil` teste déjà
    // l'index et retombe sur sa reprise ; le garde qui était ici arrivait avant
    // lui et rendait ce rattrapage inatteignable. Une passe qui a vieilli d'un
    // jour visait alors un créneau sorti de la fenêtre, on affichait « ce
    // créneau n'est plus là », et le seul bouton de sortie renvoyait sur la
    // semaine — d'où l'on relançait une passe qui reprenait le même créneau
    // mort. Le 21/09, ça fermait la cuisine entière : sa porte ouvre sur le fil.
    case "fil":
      return route.creneau ? <Fil creneau={route.creneau} /> : <Fil />;
    // Les trois écrans qui visent un créneau. Un lien d'hier rouvert
    // aujourd'hui désigne un jour sorti de la fenêtre : on le dit, plutôt que
    // d'ouvrir l'écran sur un créneau fantôme.
    case "poser":
    case "parts":
    case "cuisiner": {
      const i = indexDuCreneau(jeu, route.creneau.jour, route.creneau.repas);
      if (i < 0) return <HorsSemaine jour={route.creneau.jour} repas={route.creneau.repas} />;
      // Les écrans reçoivent le créneau, pas la route : un écran qui lirait le
      // hash lui-même serait le second endroit à savoir comment une URL est
      // faite, et le premier à s'en désaligner.
      if (route.ecran === "poser") return <Poser creneau={route.creneau} />;
      if (route.ecran === "parts") return <Parts creneau={route.creneau} />;
      return <Cuisiner creneau={route.creneau} {...(route.plat ? { plat: route.plat } : {})} />;
    }
  }
}

const Chargement = () => (
  <div className="coquille">
    <Corps plat>
      <div className="co-note">chargement…</div>
    </Corps>
  </div>
);

const Panne = ({ message }: { message: string }) => (
  <div className="coquille">
    <Corps plat>
      <div className="co-h">Le catalogue n’est pas lisible</div>
      <p className="co-note">{message}</p>
    </Corps>
  </div>
);

/**
 * Un lien d'hier, rouvert aujourd'hui sur un jour sorti de la fenêtre.
 *
 * SA SORTIE SUIT `ENTREE_CUISINE` ET N'EST PLUS ÉCRITE EN DUR. Elle adressait
 * `#/cuisine/semaine`, si bien que le seul bouton de cet écran rallumait à la
 * main l'agenda que T88 venait d'éteindre — la capture du 21/09 montre les deux
 * écrans à la suite. Une impasse qui renvoie sur un écran caché est une impasse
 * deux fois.
 */
const HorsSemaine = ({ jour, repas }: { jour: string; repas: string }) => (
  <Corps plat>
    <div className="co-h">Ce créneau n’est plus là</div>
    <p className="co-note">
      Le {repas} du {jour} est {JOURS_VISIBLES ? "sorti de la semaine affichée" : "passé"}. La
      décision qu’il portait n’est pas perdue&nbsp;: elle attend son tour, rangée sous son jour.
    </p>
    <a
      className="btn btn-primary btn-block"
      href={chemin(ENTREE_CUISINE)}
      style={{ marginTop: "var(--space-3)" }}
    >
      {JOURS_VISIBLES ? "Revenir à la semaine" : "Revenir à la cuisine"}
    </a>
  </Corps>
);
