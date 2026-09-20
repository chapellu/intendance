// Les jours sont cachés — et c'est un INTERRUPTEUR, pas une amputation.
//
// Demandé le 20/09/2026, deuxième journée d'usage réel, capture à l'appui :
//
//   « Est-ce que tu peux cacher pour le moment cet agenda de la semaine. Ça ne
//     me sert à rien actuellement et ça me complique plus les choses. […]
//     j'aimerais plutôt me focus sur un flow autour de la gestion des stocks
//     que sur des jours. »
//
// CE QUE L'AGENDA COÛTAIT, DIT PAR CELUI QUI L'A PAYÉ : on répond à des
// questions de stock, on reçoit des propositions, on touche la pastille du
// dîner plutôt que celle du déjeuner — et la main se retire, parce qu'une main
// est tirée POUR UN CRÉNEAU. On repart donc sur d'autres questions, et les
// cartes qu'on voulait poser ne se rejouent plus. Le choix du créneau n'était
// jamais la décision qu'on voulait prendre ; c'était le prix d'entrée pour en
// prendre une autre.
//
// ON CACHE, ON NE SUPPRIME PAS, et la différence est tout l'objet de ce fichier.
// Les créneaux restent le seul index du modèle : `choix[i]`, `parts[i]`,
// `gamelles`, la liste de courses qui dérive des repas posés, la clé
// `(jour, repas)` en base. Les arracher serait réécrire l'app pour un essai
// d'une semaine. Poser un plat continue donc de le poser SUR un créneau — celui
// où le fil en est — et plus rien ne le montre ni ne le demande.
//
// CE QUE ÇA ÉTEINT, EXACTEMENT :
//   — la sous-navigation « Aujourd'hui · La semaine · À prévoir », remplacée
//     par « Proposer · Stock · Courses » ;
//   — le sous-titre « semaine du 17 au 23 septembre » ;
//   — la barre de pastilles du fil, donc le saut d'un créneau à l'autre ;
//   — le nom du jour en tête de chaque pas ;
//   — la pastille de la facette cuisine, qui comptait des offres et des
//     gamelles qu'on ne peut plus atteindre. Une pastille qui n'ouvre rien est
//     pire qu'une pastille qui compte mal.
//
// Les écrans eux-mêmes restent montés et leurs URL restent valides : `#/cuisine
// /semaine` s'ouvre encore si on la tape, et les parcours e2e qui en dépendent
// ne mentent pas sur du code mort. Remettre `true` ici rallume tout.
export const JOURS_VISIBLES: boolean = false;
