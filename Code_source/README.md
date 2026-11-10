# JMP Planner

Application web de planification des livraisons de carburant à partir du programme Excel Shell.

À partir d'un classeur `.xlsx` (programme de livraison), l'application :

- importe les voyages et les lignes de produit ;
- permet de **planifier un voyage à la main** avec les mêmes paramètres que le fichier, et aboutit
  exactement aux mêmes résultats (formulaire « Planifier ») ;
- géocode les stations et calcule les distances/temps de trajet (OSRM, avec repli Haversine) ;
- calcule les horaires : départ, arrivée station, déchargement, retour dépôt, pauses ;
- détecte les chevauchements chauffeur/véhicule ;
- expose un plan, une carte, un tableau de bord et des exports Excel/PDF ;
- est protégée par **authentification JWT** avec deux rôles, `USER` (consulter, créer) et `ADMIN` (tout).

## Sommaire

- [Stack technique](#stack-technique)
- [Arborescence](#arborescence)
- [Prérequis](#prérequis)
- [Lancement en développement](#lancement-en-développement)
- [Comptes et rôles](#comptes-et-rôles)
- [Lancement avec Docker](#lancement-avec-docker)
- [API REST](#api-rest)
- [Règles de calcul](#règles-de-calcul)
- [Format du fichier Excel](#format-du-fichier-excel)
- [Base de données](#base-de-données)

> **Pour reprendre ou étendre le projet** : lire [`PROJET.md`](PROJET.md) — dossier technique
> complet (modèle de données, règles métier exactes, conventions, pièges connus, pistes d'évolution).

## Stack technique

| Couche     | Technologies                                                |
| ---------- | ----------------------------------------------------------- |
| Backend    | Node.js 20+, NestJS, TypeScript, TypeORM                    |
| Import     | exceljs (lecture .xlsx)                                     |
| Exports    | exceljs (Excel), pdfkit (PDF)                               |
| Routage    | OSRM (routes), Nominatim (géocodage), Haversine (repli)     |
| Base       | MySQL 8 (`mysql2`), schéma créé automatiquement             |
| Auth       | @nestjs/jwt (JWT bearer), bcryptjs, gardes de rôle          |
| API docs   | @nestjs/swagger (Swagger UI)                                |
| Frontend   | React 18, Vite, TypeScript, React Router, Leaflet, Recharts |
| Conteneurs | Docker, docker-compose, nginx                               |

## Arborescence

```
jmp-planner-node/
├── backend/                 # API NestJS (Node.js)
│   ├── src/
│   │   ├── trips/           # TripService, controllers REST, import, planification manuelle
│   │   ├── importer/        # ExcelTripImporter (exceljs), normalisation produits
│   │   ├── engine/          # CalculationEngine (pauses, horaires, nuit)
│   │   ├── routing/         # Géocodage + itinéraires (OSRM / Nominatim / Haversine)
│   │   ├── auth/            # Login JWT, rôles USER/ADMIN, gestion des comptes
│   │   ├── entities/        # Entités TypeORM (dont `User`)
│   │   ├── settings/        # Paramètres de planification
│   │   ├── stations/        # Stations et correction de géocodage
│   │   ├── stats/           # Tableau de bord
│   │   ├── export/          # Export Excel / PDF
│   │   ├── config/          # Initialisation des données de référence + compte admin
│   │   └── common/          # Dates, gestion d'erreurs
│   └── Dockerfile
├── frontend/                # Application React
│   ├── src/
│   │   ├── pages/           # Login, Dashboard, Plan, Planifier, Détail, Carte, Import, Stations, Paramètres, Utilisateurs
│   │   ├── components/      # Layout, TripMap
│   │   └── lib/             # Client API (+ jeton), contexte d'auth, types, formatage
│   ├── Dockerfile
│   └── nginx.conf
├── samples/Programe_VIVO.xlsx   # Exemple de programme
└── docker-compose.yml
```

## Prérequis

- **Backend** : Node 20+ (testé avec Node 24), npm et un serveur **MySQL 8** joignable
- **Frontend** : Node 20+ et npm
- Ou simplement **Docker** + docker-compose (un conteneur `mysql:8.4` est fourni)

## Lancement en développement

### Backend

```bash
cd backend
npm install
cp .env.example .env      # renseigner MYSQL_USER / MYSQL_PASSWORD (et JWT_SECRET)
npm run start:dev
```

La base `MYSQL_DATABASE` et son schéma sont créés au premier démarrage, ainsi qu'un compte
administrateur (`admin` / `admin123` par défaut, variables `JMP_ADMIN_USERNAME` / `JMP_ADMIN_PASSWORD`).
L'API écoute sur <http://localhost:8080>.
Swagger UI : <http://localhost:8080/swagger-ui.html> — cliquer **Authorize** et coller le token
obtenu par `POST /api/auth/login` pour essayer les routes protégées.

Tests :

```bash
# vident la base de test MYSQL_TEST_DATABASE (jmp_test par défaut), jamais MYSQL_DATABASE
npm test
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

L'interface est servie sur <http://localhost:5173>. Le proxy Vite redirige `/api` vers `http://localhost:8080`.
La première page affichée est l'écran de connexion.

## Comptes et rôles

| Rôle    | Peut                                                                                                                                                           |
| ------- |----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `USER`  | consulter le plan, la carte, le tableau de bord, les stations et les paramètres ; **importer** un classeur ; **planifier** un voyage ; télécharger les exports |
| `ADMIN` | tout cela + modifier/supprimer un voyage, corriger une station, enregistrer les paramètres, **gérer les comptes** (écran « Utilisateurs »)                     |

- Un seul bouton de connexion côté front ; le jeton JWT est conservé dans `localStorage` sous
  `jmp.token` et envoyé en en-tête `Authorization: Bearer …` sur chaque appel.
- Une session expirée (8 h par défaut, `JWT_EXPIRES_IN`) renvoie l'interface à l'écran de connexion.
- Les comptes sont créés par un administrateur. Un admin ne peut ni se rétrograder ni se supprimer
  tant qu'il est le seul admin actif ; le mot de passe est stocké sous forme d'empreinte bcrypt.
- En production, changer `JWT_SECRET` et le mot de passe de l'admin amorcé.

## Lancement avec Docker

```bash
docker compose up --build
```

- Frontend : <http://localhost:8081>
- Backend : <http://localhost:8080>
- Connexion : `admin` / `admin123`, ou les valeurs de `JMP_ADMIN_PASSWORD` passées dans
  l'environnement (`JWT_SECRET` se surcharge de la même façon).

`docker compose` démarre aussi un conteneur `mysql:8.4` (base `jmp`, utilisateur `jmp/jmp`) ; ses
données sont persistées dans le volume `jmp-data`. Le port MySQL n'est **pas** publié sur l'hôte,
donc un MySQL local existant sur `3306` continue de fonctionner à côté.

## API REST

Toutes les routes sauf `/api/auth/login` exigent un en-tête `Authorization: Bearer <token>`.
En modification/suppression (`PUT`, `PATCH`, `DELETE`), le rôle `ADMIN` est requis.

| Méthode | Chemin                   | Description                                                     |
| ------- | ------------------------ | --------------------------------------------------------------- |
| POST    | `/api/auth/login`        | Connexion (`{ username, password }`) → `{ token, user }`         |
| GET     | `/api/auth/me`           | Compte connecté                                                 |
| GET/POST | `/api/auth/users`       | Liste / création des comptes (ADMIN)                            |
| PUT/DELETE | `/api/auth/users/{id}` | Rôle, mot de passe, suppression (ADMIN)                         |
| POST    | `/api/import`            | Importe un classeur `.xlsx` (multipart `file`)                  |
| GET     | `/api/trips`             | Liste des voyages (filtres `date`, `driver`, `vehicle`, `city`) |
| POST    | `/api/trips`             | **Planifie un voyage saisi à la main** (mêmes champs que le classeur) |
| GET     | `/api/trips/{id}`        | Détail d'un voyage (lignes, coordonnées, tracé)                 |
| PATCH   | `/api/trips/{id}`        | Modifie départ/chauffeur/véhicule/client/tranche + recalcule (ADMIN) |
| DELETE  | `/api/trips/{id}`        | Supprime un voyage et replanifie la journée (ADMIN)             |
| POST    | `/api/trips/recalculate` | Recalcule un ou tous les voyages (`{"ids": []}`)                |
| GET     | `/api/stations`          | Stations et statut de géocodage                                 |
| PUT     | `/api/stations/{id}`     | Corrige les coordonnées d'une station (ADMIN)                   |
| GET     | `/api/settings`          | Paramètres de planification                                     |
| PUT     | `/api/settings`          | Met à jour les paramètres (ADMIN)                               |
| GET     | `/api/stats`             | Statistiques d'une date (km, litres, heures)                    |
| GET     | `/api/export/excel`      | Export Excel du plan                                            |
| GET     | `/api/export/pdf`        | Export PDF du plan                                              |

## Règles de calcul

- **Distances** : via OSRM (temps de trajet voiture) multiplié par un facteur poids lourd, avec repli automatique sur la distance à vol d'oiseau × 1,3 si OSRM est indisponible (indicateur `fallbackUsed`).
- **Pauses** : une pause de 45 min après le seuil de conduite cumulée (paramétrable), sauf si le reliquat de conduite est inférieur au seuil.
- **Horaires** : départ → formalités/chargement → conduite → déchargement → retour dépôt optionnel.
- **Nuit** : possibilité d'interdire la conduite sur une plage horaire (ex. 21:00–05:00).
- **Chevauchements** : alerte si un chauffeur ou un véhicule est affecté à deux voyages qui se recouvrent.
- **Carburant** : estimation des litres consommés et du coût à partir de la consommation et du prix paramétrés.

## Format du fichier Excel

Le classeur doit contenir une ligne d'en-tête avec les colonnes (l'ordre est libre) :

`Vehicle Id`, `Customer Name`, `Ship To Name`, `City(Ship To)`, `Driver Name`, `Plant Name`, `Tranche`, `Trip Num`, `Sales Order`, `Pat.Doc`, `Tour Start Date`, `Material Name`, `Total`.

- Les cellules vides dans les colonnes d'identification (véhicule, client, station, ville, chauffeur, dépôt, tranche, n° de voyage, commande, document, date) sont héritées de la ligne précédente.
- Les espaces insécables (`U+00A0`) sont normalisés.
- Un exemple est fourni dans `samples/Programe_VIVO.xlsx`.
- Ces mêmes champs sont saisissables dans l'écran **Planifier** (`POST /api/trips`) : le voyage
  passe par la même planification qu'un voyage importé, les résultats sont donc identiques.

## Base de données

MySQL 8 uniquement. Variables lues dans `backend/.env` (ou l'environnement) :

| Variable              | Défaut     | Rôle                                             |
| --------------------- | ---------- | ------------------------------------------------ |
| `MYSQL_HOST`          | `localhost`| serveur MySQL                                     |
| `MYSQL_PORT`          | `3306`     | port                                              |
| `MYSQL_USER`          | `root`     | utilisateur (droits `CREATE` requis)              |
| `MYSQL_PASSWORD`      | ``         | mot de passe                                      |
| `MYSQL_DATABASE`      | `jmp`      | base applicative, créée si absente                |
| `MYSQL_TEST_DATABASE` | `jmp_test`| base vidée par les tests e2e                      |
| `JWT_SECRET`          | `jmp-secret-de-development` | signature des jetons — **à changer** |
| `JWT_EXPIRES_IN`      | `8h`       | durée de vie d'une session                          |
| `JMP_ADMIN_USERNAME` / `JMP_ADMIN_PASSWORD` | `admin` / `admin123` | administrateur créé au premier démarrage |

- Le schéma est synchronisé au démarrage (`synchronize: true`) : pas de migration à écrire en développement.
- Tables : `plants`, `stations`, `trips`, `trip_lines`, `route_cache`, `planning_settings`, `users`.
- Les dates sont stockées en texte naïf (`YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`), d'où des colonnes
  `varchar` — MySQL refuse d'indexer une colonne `text`.
- Pour les tests comme pour un usage partagé, créer un utilisateur dédié :

```sql
CREATE DATABASE IF NOT EXISTS jmp;
CREATE USER IF NOT EXISTS 'jmp'@'%' IDENTIFIED BY 'mot-de-passe';
GRANT ALL PRIVILEGES ON jmp.* TO 'jmp'@'%';
GRANT ALL PRIVILEGES ON jmp_test.* TO 'jmp'@'%';
FLUSH PRIVILEGES;
```

## Licence


