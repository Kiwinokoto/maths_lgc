# Module — Probabilités

## Intention

Présenter les probabilités comme une manière de raisonner sur le hasard, pas comme un chapitre abstrait.

Règle pédagogique de cette V1 : **langage courant d'abord, vocabulaire mathématique ensuite**. On part de « chance », « part observée » et « ne pas arriver », puis on introduit les mots **probabilité**, **fréquence** et **événement contraire** une fois l'idée comprise.

Le module reste aligné avec les attendus CAP :
- expérience aléatoire simple ;
- événement ;
- probabilité entre 0 et 1 ;
- événement impossible et certain ;
- événement contraire ;
- lien entre fréquence observée et probabilité ;
- stabilisation des fréquences par simulation.

## Situation centrale

Le contexte principal est volontairement un jeu dont la règle se comprend immédiatement :

> Un sac contient 10 jetons identiques au toucher : 3 violets et 7 gris. L'élève pioche sans regarder. Violet = gagné. Le jeton est ensuite remis dans le sac, le sac est mélangé, puis on rejoue.

On commence par la formulation concrète :
- 3 jetons font gagner sur 10 jetons en tout ;
- la chance de gagner est donc **3/10 = 30 %** ;
- en maths, les 3 jetons violets sont les **cas favorables** et les 10 jetons sont les **cas possibles** ;
- cette chance de 30 % s'appelle la **probabilité** ;
- en écriture décimale, 30 % = **0,3**.

Remettre le jeton avant de rejouer s'appelle un **tirage avec remise**. Il y a donc toujours 3 jetons violets sur 10 et la probabilité reste 30 %.

## Vocabulaire introduit progressivement

- **Probabilité** : la chance qu'un résultat arrive.
- **Fréquence** : la part réellement observée après plusieurs essais.
- **Événement contraire** : ce qui correspond à « l'événement ne se produit pas ». Si un événement a 30 % de probabilité, son contraire a 70 %.
- **Cas favorables / cas possibles** : résultats qui nous intéressent / tous les résultats possibles lorsque chacun a la même chance d'être obtenu. Dans le jeu du sac : 3 violets / 10 jetons.

Le terme « issues équiprobables » n'est pas nécessaire dans l'explication élève de départ ; l'idée « chaque jeton a la même chance d'être pioché » est montrée avant le vocabulaire technique.

## Simulation

L'élève peut :
- piocher 1 fois ;
- jouer 20 fois ;
- jouer 100 fois.

Les boutons simulent exactement la même règle du jeu ; ils ne changent pas de contexte.

L'interface affiche d'abord des formulations concrètes :
- nombre total de tirages ;
- nombre de violets ;
- part de violets obtenue, puis le mot **fréquence** ;
- chance de départ à 30 %, puis le mot **probabilité** ;
- historique des derniers tirages.

L'objectif est de voir que :
- sur peu d'essais, la part observée peut être loin de 30 % ;
- quand le nombre d'essais augmente, cette fréquence tend à se rapprocher de 30 % ;
- elle n'a pas besoin d'être exactement égale à 30 %.

## Entraînement V1

1. calculer la chance de tirer un jeton rouge quand 2 jetons sur 10 sont rouges ;
2. reconnaître qu'un événement impossible a une probabilité de 0 ;
3. calculer « ne pas tirer un violet » à partir de 30 %, puis nommer l'**événement contraire** ;
4. comprendre que 4 violets sur 10 tirages, soit 40 %, reste possible même si la probabilité de départ est 30 %.

Le feedback reste local dans cette V1.
