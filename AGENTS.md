# AGENTS.md — maths_lgc

## But du projet
Support web interactif de mathématiques pour les CAP Production et service en restaurations (PSR) de La Grande Classe.

## Principes
- Priorité pédagogique : situations PSR concrètes, progression guidée et remédiation.
- V1 volontairement statique : HTML/CSS/JS, sans compte, sans base de données, sans dépendance runtime.
- Mobile-first : les élèves doivent pouvoir utiliser le site sur téléphone.
- La progression élève est locale au navigateur (`localStorage`) tant qu'aucune décision contraire n'est prise.
- Ne pas transformer le site en Moodle bis : les interactions qui apportent une vraie valeur web restent ici ; les contenus classiques pourront migrer vers Moodle plus tard.
- Ne pas ajouter de géométrie comme axe central du CAP PSR : le parcours suit le groupement 2 de mathématiques.

## Git / livraison
- `main` = version publiable.
- Développement non trivial sur `dev/<sujet>` puis PR.
- Vérifier l'état du repo et les travaux concurrents avant écriture.
- Pas de workflow de déploiement avant validation de la cible VPS et des secrets nécessaires.

## État V1
- Pré-page d'accueil avec placeholder QR.
- Présentation des objectifs.
- Parcours linéaire de séance de rentrée.
- Auto-positionnement « les maths et moi ».
- Diagnostic 10 questions sans note.
- Correction guidée.
- Premier défi PSR interactif (proportionnalité, durée, coût/CA).
- Bilan local.

## Prochaines étapes
1. Déployer une première version publique et remplacer le placeholder par le vrai QR code.
2. Tester sur téléphone en conditions de classe.
3. Ajouter les modules Durées puis Recettes & proportionnalité.
4. Décider après usage réel ce qui reste sur le site et ce qui rejoint Moodle.
