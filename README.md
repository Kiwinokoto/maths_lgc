# Maths LGC

Support interactif de mathématiques pour les CAP Production et service en restaurations (PSR) de La Grande Classe.

## V1 — rentrée

La V1 est mobile-first, sans compte élève et sans build frontend :

- pré-page d'accueil avec QR vers `https://maths.lagrandeclasse.fr/` ;
- prénom ou code court pour rattacher les résultats au bon élève ;
- présentation des usages des maths en PSR ;
- visualisation fractions ↔ pourcentages ;
- parcours linéaire ;
- auto-positionnement « les maths et moi » ;
- diagnostic de 10 situations sans note ;
- correction guidée ;
- défi PSR interactif autour d'une fiche technique ;
- bilan et priorités enregistrés localement dans le navigateur ;
- synchronisation vers une petite base SQLite quand le serveur est disponible ;
- tableau enseignant protégé avec export CSV et historique JSON complet.

La collecte est volontairement minimale : pas de nom de famille, pas d'email, pas de compte élève.

## Lancer localement

Définir un jeton enseignant puis lancer le serveur Python :

```bash
export MATHS_TEACHER_TOKEN='un-secret-local'
python3 server.py
```

Puis ouvrir :

- élève : `http://localhost:8080/`
- enseignant : `http://localhost:8080/teacher`
- santé : `http://localhost:8080/healthz`

La base est créée dans `data/maths_lgc.sqlite3` et n'est pas versionnée.

## Variables d'environnement

- `MATHS_TEACHER_TOKEN` : secret nécessaire pour lire le tableau enseignant ;
- `MATHS_HOST` : adresse d'écoute, défaut `0.0.0.0` ;
- `MATHS_PORT` : port, défaut `8080` ;
- `MATHS_DATA_DIR` : dossier de données, défaut `./data`.

## Déploiement LGC

Cible production : `https://maths.lagrandeclasse.fr` sur le VPS LGC `173.212.214.227`.

Le service tourne dans son propre conteneur et rejoint le réseau Docker externe `traefik_network`. Le Traefik central LGC détecte automatiquement les labels du service ; aucun changement du repo Traefik n'est requis.

Le workflow `.github/workflows/deploy.yml` déploie uniquement sur un push `main`. Avant de merger la PR de déploiement, ajouter dans **Settings → Secrets and variables → Actions** :

- `DEPLOY_SSH_KEY` : clé privée ed25519 dédiée à ce repo ;
- `DEPLOY_KNOWN_HOSTS` : ligne de clé hôte SSH du VPS ;
- `MATHS_TEACHER_TOKEN` : jeton URL-safe de 32 à 128 caractères, par exemple produit par `openssl rand -hex 24`.

Le workflow :
1. vérifie Docker, Compose, Traefik et `traefik_network` ;
2. conserve `/opt/maths_lgc/data` et `.env` ;
3. synchronise le code dans `/opt/maths_lgc` ;
4. construit une image taguée par commit ;
5. démarre/met à jour uniquement `maths_lgc` ;
6. attend le healthcheck ;
7. vérifie la route HTTPS via Traefik et exige un `401` sans jeton sur l'API enseignant.

Le workflow ne redémarre pas Traefik et ne supprime pas les anciennes images Docker.

## Suivi enseignant

La route `/teacher` affiche l'état courant de la classe. L'export CSV donne une vue synthétique. L'export JSON contient l'historique complet des tentatives afin d'analyser les erreurs initiales, les corrections et les difficultés persistantes après la séance.

## Documentation

- [`AGENTS.md`](AGENTS.md) : contraintes, architecture et état du projet.
- [`docs/seance-1.md`](docs/seance-1.md) : déroulé enseignant pour la séance de rentrée.
