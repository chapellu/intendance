// Le bandeau « une nouvelle version est prête ».
//
// IL NE PARAÎT QUE DANS LA COQUILLE, jamais dans le mode guidé de « En
// cuisine » : là, on est à bout de bras au-dessus d'une casserole, et la seule
// chose qu'on ne veut pas lire est une proposition de recharger. La version
// attend ; elle attendra bien la fin du plat.

import { useMiseAJour } from "../pwa/maj";

export function MiseAJour() {
  const { prete, passer } = useMiseAJour();
  if (!prete) return null;

  return (
    <div className="co-maj" role="status">
      <span>Une nouvelle version est prête.</span>
      <button className="btn btn-primary" onClick={passer}>
        Recharger
      </button>
    </div>
  );
}
