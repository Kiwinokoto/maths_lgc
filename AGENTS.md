# AGENTS.md — maths_lgc

## But du projet
Support web interactif de mathématiques pour les CAP Production et service en restaurations (PSR) de La Grande Classe.

## Principes
- Priorité pédagogique : situations PSR concrètes, progression guidée et remédiation.
- Frontend mobile-first en HTML/CSS/JS, sans compte élève ni dépendance frontend.
- Collecte V1 minimale : prénom ou code court + résultats pédagogiques, stockés dans SQLite côté serveur.
- La progression reste aussi dans `localStorage` pour éviter de perdre le travail en cas de réseau instable.
- Le tableau enseignant est en lecture seule côté navigateur et protégé par `MATHS_TEACHER_TOKEN`.
- Ne jamais stocker de nom de famille, email ou autre donnée inutile dans cette V1.
- Ne pas transformer le site en Moodle bis : les interactions qui apportent une vraie valeur web restent ici ; les contenus classiques pourront migrer vers Moodle plus tard.
- Ne pas ajouter de géométrie comme axe central du CAP PSR : le parcours suit le groupement 2 de mathématiques.

## Architecture V1
- `server.py` : serveur HTTP Python standard library + API JSON + SQLite.
- `index.html` + `assets/app.js` : parcours élève.
- `teacher.html` : tableau enseignant, export JSON/CSV.
- `data/` : base SQLite locale au serveur, ignorée par Git.
- Routes utiles : `/healthz`, `/api/progress`, `/teacher`, `/api/teacher/summary`.

## Git / livraison
- `main` = version publiable.
- Développement non trivial sur `dev/<sujet>` puis PR.
- Vérifier l'état du repo et les travaux concurrents avant écriture.
- Pas de workflow de déploiement avant inspection de la cible VPS, du routage Traefik/nginx réel et des secrets nécessaires.
- Ne jamais commit `MATHS_TEACHER_TOKEN`, clé SSH, base SQLite ou fichier `.env`.

## État V1
- Pré-page d'accueil avec placeholder QR.
- Prénom/code court demandé avant démarrage.
- Présentation des objectifs et mini-visualisation fractions ↔ pourcentages.
- Parcours linéaire de séance de rentrée.
- Auto-positionnement « les maths et moi ».
- Diagnostic 10 questions sans note.
- Correction guidée.
- Premier défi PSR interactif (proportionnalité, durée, coût/CA).
- Synchronisation serveur des résultats quand le réseau est disponible.
- Tableau enseignant avec forces, difficultés, priorité de travail et exports JSON/CSV.

## Prochaines étapes
1. Inspecter le VPS LGC en lecture seule (reverse proxy, réseaux, ports, chemins) avant d'écrire le déploiement.
2. Configurer `maths.lagrandeclasse.fr`, HTTPS, le service et les secrets.
3. Remplacer le placeholder par le vrai QR code.
4. Tester sur téléphone en conditions de classe.
5. Ajouter les modules Durées puis Recettes & proportionnalité.
6. Après usage réel, décider ce qui reste ici et ce qui rejoint Moodle.
