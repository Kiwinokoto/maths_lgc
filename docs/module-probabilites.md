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

Un lot contient 10 tickets, dont 3 violets.

On commence par la formulation concrète :
- 3 tickets nous intéressent sur 10 tickets en tout ;
- la chance de tirer un violet est donc **3/10 = 30 %** ;
- en maths, les 3 tickets violets sont les **cas favorables** et les 10 tickets sont les **cas possibles** ;
- en écriture décimale, 30 % = **0,3**.

Chaque tirage est fait **avec remise** : après un tirage, le ticket retourne dans le lot avant le suivant. Il y a donc toujours 3 tickets violets sur 10 et la probabilité reste 30 %.

## Vocabulaire introduit progressivement

- **Probabilité** : la chance qu'un résultat arrive.
- **Fréquence** : la part réellement observée après plusieurs essais.
- **Événement contraire** : ce qui correspond à « l'événement ne se produit pas ». Si un événement a 30 % de probabilité, son contraire a 70 %.
- **Cas favorables / cas possibles** : résultats qui nous intéressent / tous les résultats possibles lorsque chacun a la même chance d'être obtenu.

Le terme « issues équiprobables » n'est pas nécessaire dans l'explication élève de départ ; l'idée « tous les tickets ont la même chance d'être tirés » est montrée avant le vocabulaire technique.

## Simulation

L'élève peut lancer :
- 1 tirage ;
- 20 tirages ;
- 100 tirages.

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

1. calculer la chance de tirer un ticket rouge quand 2 tickets sur 10 sont rouges ;
2. reconnaître qu'un événement impossible a une probabilité de 0 ;
3. calculer « ne pas tirer un violet » à partir de 30 %, puis nommer l'**événement contraire** ;
4. comprendre que 4 violets sur 10 tirages, soit 40 %, reste possible même si la probabilité de départ est 30 %.

Le feedback reste local dans cette V1.
