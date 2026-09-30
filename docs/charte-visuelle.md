# Charte visuelle LGC — couleurs sémantiques

Cette charte s'applique au parcours élève **et** aux surfaces professeur. Elle doit aussi guider le portail LGC afin que les interfaces aient le même langage visuel.

## Couleurs d'identité

Le violet / indigo porte l'identité principale, la navigation, les boutons et les états sélectionnés.

Le bleu et le rose peuvent être utilisés comme accents décoratifs, pour différencier des blocs ou rendre les supports plus vivants. Ils ne doivent pas porter à eux seuls une information pédagogique critique.

## Couleurs réservées à un sens

| Couleur | Sens réservé | Exemples |
| --- | --- | --- |
| Vert | correct, réussi, validé, terminé | bonne réponse, étape terminée, équilibre correct |
| Orange | à reprendre, erreur pédagogique, attention | réponse incorrecte à retravailler, domaine « à travailler » |
| Rouge | important, objectif fort, à retenir | règle essentielle, point à mémoriser, erreur système/destructive si nécessaire |
| Violet / indigo | identité, navigation, sélection, action | CTA, onglet actif, progression courante |
| Bleu / rose | décoration et différenciation neutre | cartes, graphiques, pictogrammes, variations visuelles |

## Règles

- Ne jamais utiliser le vert ou l'orange comme simple décoration.
- Une mauvaise réponse pédagogique est orange, pas rouge : le rouge ne doit pas donner au feedback d'apprentissage une tonalité punitive.
- Une bonne réponse ou une étape réellement acquise peut être verte.
- « À retenir » et les objectifs importants peuvent utiliser un rouge doux, avec parcimonie.
- Une couleur sémantique doit toujours être accompagnée d'un mot, d'une icône, d'un symbole ou d'une structure explicite : la couleur seule ne suffit pas.
- Les surfaces professeur restent majoritairement neutres + violet/indigo ; elles n'empruntent vert/orange que lorsqu'elles affichent réellement un état sémantique.
- Vérifier le contraste et la lisibilité sur mobile comme sur desktop.

## Tokens actuels

Les tokens CSS principaux vivent dans `assets/styles.css` :

- `--accent*` : identité violet/indigo ;
- `--blue*`, `--rose*` : accents neutres ;
- `--ok*` : succès/correct ;
- `--attention*` : à reprendre/attention ;
- `--important*` : à retenir/important ;
- `--danger*` : erreurs système ou actions destructives.
