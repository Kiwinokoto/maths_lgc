# Audit des exercices — 2026-09-28

Objectif : vérifier explicitement la cohérence entre **énoncé, réponse attendue et corrigé affiché** avant la première utilisation en classe.

## Diagnostic de rentrée

| # | Situation | Réponse vérifiée | Contrôle |
|---|---|---:|---|
| 1 | 12 bouteilles à 1,50 € | 18 € | 12 × 1,50 = 18 |
| 2 | 3,6 kg en grammes | 3 600 g | 3,6 × 1 000 |
| 3 | 9 h 35 + 50 min | 10 h 25 | +25 min jusqu'à 10 h, puis +25 min |
| 4 | moitié en pourcentage | 50 % | 1/2 = 0,5 = 50 % |
| 5 | 400 g pour 5 portions → 15 portions | 1 200 g | coefficient 15 ÷ 5 = 3 |
| 6 | monnaie sur 20 € pour 13,70 € | 6,30 € | 20 − 13,70 |
| 7 | moyenne 18, 22, 20, 20 | 20 | somme 80 ÷ 4 |
| 8 | 3 × x = 24 | x = 8 | 24 ÷ 3 |
| 9 | 6 barquettes / 10 min pendant 30 min | 18 | 30 ÷ 10 = 3, puis 6 × 3 |
| 10 | ordre de grandeur de 10 × 4,98 € | 50 € | 4,98 ≈ 5, donc 5 × 10 |

**Résultat de l'audit :** les dix clés et explications sont cohérentes.

## Défi PSR

Base : 10 portions ; pommes 800 g ; oranges 600 g ; bananes 400 g ; jus 250 mL ; coût matière 8,50 €.

À 24 portions :
- coefficient = 24 ÷ 10 = **2,4** ;
- pommes = 800 × 2,4 = **1 920 g** ;
- oranges = 600 × 2,4 = **1 440 g** ;
- bananes = 400 × 2,4 = **960 g** ;
- jus = 250 × 2,4 = **600 mL** ;
- coût estimé = 8,50 × 2,4 = **20,40 €**.

Questions :
1. méthode : **nombre de portions ÷ 10**, puis multiplier chaque quantité par le coefficient obtenu ;
2. 11 h 45 − 35 min = **11 h 10** ;
3. si toutes les portions sont vendues à 2,50 €, chiffre d'affaires = **nombre de portions × 2,50 €** ; à 24 portions : **60 €**.

Le libellé de la question 1 a été clarifié après audit pour éviter l'ambiguïté repérée en revue.

## Modules post-diagnostic

### Durées
- 9 h 35 + 50 min = **10 h 25** ;
- 11 h 45 − 35 min = **11 h 10** ;
- 10 h 15 → 12 h 00 = **105 min = 1 h 45** ;
- 1 h 30 = **90 min**.

### Recettes & proportionnalité
- 400 g / 5 portions → 15 portions = **1 200 g** ;
- 2 L / 8 personnes → 20 personnes = **5 L** ;
- 750 g / 6 portions → 18 portions = **2 250 g** ;
- 10 → 25 portions : coefficient **2,5**.

### Pourcentages
- 25 % de 40 = **10** ;
- remise de 50 % sur 18 € → **9 €** à payer ;
- remise de 10 % sur 20 € → **18 €** à payer ;
- 30 sur 50 = **60 %**.

### Données & statistiques
- maximum de 20, 35, 30 : **mardi, 35** ;
- moyenne de 20, 30, 40 = **30** ;
- 12 sur 40 = **30 %** ;
- valeur la plus fréquente de 18, 22, 22, 30 : **22**.

### Équations
- 3 × x = 24 → **8** ;
- x + 7 = 19 → **12** ;
- 36 € pour 4 menus → **9 €** par menu ;
- x − 4 = 11 → **15**.

### Graphiques & fonctions
- 6 menus à 8 € → **48 €** ;
- y = 8 × x pour x = 10 → **80 €** ;
- 96 € à 8 € le menu → **12 menus** ;
- si x double dans y = 8x, **y double**.

### Prix & commerce
- 6 × 8,50 € = **51 €** ;
- remise de 10 % sur 40 € → **36 €** à payer ;
- marge simple d'exercice : 12 − 7,50 = **4,50 €** ;
- taxe fournie de 10 % sur 50 € = **5 €**.

Le taux de taxe est toujours fourni dans l'énoncé ; aucun taux légal n'est demandé de mémoire.

### Probabilités
- 2 cas favorables sur 10 = **20 %** ;
- événement impossible : probabilité **0** ;
- contraire d'un événement à 30 % : **70 %** ;
- observer 40 % sur 10 essais alors que p = 30 % est **possible** : la fréquence fluctue sur un petit nombre d'essais.

## Politique de corrigé

- La **vue enseignant** affiche toujours les solutions détaillées.
- La vue `?preview=teacher` nécessite désormais une session enseignant authentifiée ouverte via `/teacher` ; le paramètre d'URL seul ne suffit plus.
- Côté élève, les solutions détaillées du **diagnostic** et du **défi** sont verrouillées par défaut.
- L'enseignant peut les débloquer globalement depuis `/teacher`.
- Le verrou est persistant dans `data/class_state.json`, sans migration SQLite.
- Ce verrou protège contre la consultation normale des corrigés, pas contre l'inspection volontaire du JavaScript client. Pour une future évaluation notée, les clés sensibles devront être validées côté serveur.
- Les modules d'apprentissage post-diagnostic conservent leur feedback immédiat : ils servent à apprendre et s'entraîner, pas à positionner la classe.
