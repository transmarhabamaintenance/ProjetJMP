# JMP Planner — Dossier technique du projet

> Document de référence destiné à reprendre le projet plus tard, avec ou sans aide d'une IA.
> Donne à lire **avant toute modification** : ce que fait l'application, comment elle est
> construite, les règles métier exactes, les pièges déjà rencontrés et où brancher une
> nouvelle fonctionnalité.  

---

## 1. Le projet en une page

**JMP Planner** planifie les tournées de livraison de carburant (camions-citernes) à partir
du **programme de livraison Excel** (format Shell / « Programe VIVO »). Pour chaque voyage,
l'application déduit la station de livraison, calcule la distance et l'itinéraire routier,
puis produit un horaires complet : heure de départ, arrivée à la station, fin de
déchargement, retour au dépôt, pauses obligatoires — et signale les anomalies.

Ce que fait l'application, étape par étape :

1. **Import** d'un classeur `.xlsx` : création des voyages et de leurs lignes produit.
2. **Planification manuelle** d'un voyage au formulaire, avec les mêmes paramètres et le même
   résultat qu'un import.
3. **Géocodage** des stations (Nominatim, avec repli sur le centre-ville connu).
4. **Routage** dépôt → station (OSRM profil voiture, repli distance à vol d'oiseau × 1,3).
5. **Calcul des horaires** par un moteur de calcul déterministe (pauses, nuit, retours).
6. **Détection des conflits** : un même chauffeur ou un même véhicule sur deux voyages qui se recouvrent.
7. **Consultation** : plan journalier filtrable, fiche détail, carte Leaflet, tableau de bord.
8. **Exports** Excel et PDF du plan du jour.

**Contexte** : projet pédagogique ENAA School (Maroc). Les données et les messages métier
sont en **français**. L'accès est protégé par **authentification JWT** et deux rôles :
`USER` (consulter et créer) et `ADMIN` (créer, consulter, modifier, supprimer, gérer les
comptes). Application mono-entreprise, sans multi-tenant.

---

## 2. Comment lire ce document (note pour une IA)

Avant de coder :

- **Respecter les messages d'alerte en français existants** : ils sont vérifiés par les tests
  et affichés tels quels dans le front. Ne pas les reformuler sans modifier les tests.
- **Garder la parité des noms de champs JSON** (DTO) : le front est typé en dur
  (`frontend/src/lib/api.ts`). Un champ renommé côté API casse le front silencieusement.
- Les conventions non négociables sont listées en [section 11](#11-pièges-connus--décisions-architecturales).
- Une modification de backend se fait **dans `backend/src/...`** ; penser à répercuter dans
  `frontend/src/lib/` si le contrat de l'API évolue.

---

## 3. Stack et arborescence

| Couche              | Technologies                                                                             |
|---------------------|------------------------------------------------------------------------------------------|
| Backend             | Node.js 20+ (testé 24), **NestJS 11**, TypeScript, **TypeORM 0.3**                       |
| Import Excel        | `exceljs`                                                                                |
| Exports             | `exceljs` (Excel), `pdfkit` (PDF)                                                        |
| Routage / géocodage | OSRM HTTP, Nominatim HTTP, Haversine (repli local)                                       |
| Base                | **MySQL 8** (`mysql2`), schéma synchronisé au démarrage                                  |
| Auth              | `@nestjs/jwt` (JWT bearer), `bcryptjs` (empreintes de mots de passe), gardes `APP_GUARD` |
| Doc API             | `@nestjs/swagger`                                                                        |
| Tests               | `jest` + `ts-jest` + `supertest`                                                         |
| Frontend            | React 18, Vite, TypeScript, React Router, Leaflet, Recharts                              |
| Déploiement         | Docker / docker-compose, nginx pour le front                                             |

```
jmp-planner-node/
├── backend/
│   ├── src/
│   │   ├── main.ts                     # bootstrap : CORS, Swagger, port
│   │   ├── app.module.ts                # DB + modules + filtre d'erreur global
│   │   ├── config/data-initializer.ts   # amorçage dépôt + settings + compte admin
│   │   ├── config/mysql-bootstrap.ts    # CREATE DATABASE avant la connexion TypeORM
│   │   ├── domain/enums.ts               # TripStatus, GeocodeSource, DrivingMethod, UserRole
│   │   ├── entities/                     # Plant, Station, Trip, TripLine, RouteCache, PlanningSettings, User
│   │   ├── auth/                         # AuthService/Controller + guards JWT/Rôles + @Public/@Roles
│   │   ├── engine/calculation-engine.ts  # moteur de calcul pur (sans I/O)
│   │   ├── importer/                     # excel-trip.importer.ts + material-normalizer.ts
│   │   ├── routing/                      # geocoder, osrm.client, haversine, city-center-fallback, services
│   │   ├── trips/                        # TripService + controllers import/trip + DTOs
│   │   ├── stations/  settings/  stats/  export/
│   │   └── common/                       # datetime.ts, global-exception.filter.ts
│   ├── jest.config.js  Dockerfile  package.json
│   ├── .env.example                      # copier en .env (jamais commité)
│   └── data/jmp.db                       # reste d'exécutions SQLite (ignoré par git, plus utilisé)
├── frontend/
│   ├── src/
│   │   ├── pages/        # Dashboard, PlanPage, PlanifierPage, TripDetail, MapPage, ImportPage, StationsPage, SettingsPage, UsersPage, LoginPage
│   │   ├── components/   # Layout.tsx, TripMap.tsx
│   │   └── lib/          # client.ts (fetch + token + ApiError), auth.tsx (contexte + gardes), api.ts (types), format.ts (fmt*)
│   ├── vite.config.ts    # proxy /api -> http://localhost:8080
│   └── Dockerfile, nginx.conf
├── samples/Programe_VIVO.xlsx           # jeu de test de référence
├── docker-compose.yml                    # backend:8080, frontend:8081, mysql:8.4, volume jmp-data
└── README.md                             # guide d'utilisation / API
```

---

## 4. Modèle de données

Schéma créé automatiquement (`synchronize: true`) — pas de migrations.

| Entité (table)                           | Rôle                                      | Champs clés |
|------------------------------------------|-------------------------------------------| --- |
| `Plant` (`plants`)                       | Dépôt / usine d'expédition                | `name` (unique), `lat`, `lon` |
| `Station` (`stations`)                   | Client / point de livraison               | `name`, `city`, `lat`, `lon`, `geocodeSource`, `geocodeConfirmed` |
| `Trip` (`trips`)                         | Voyage (une tournée camion)               | `tripNum`, `salesOrder`, `patDoc`, `tourDate`, `vehicleId`, `customerName`, `driverName`, `tranche`, `totalLiters`, `status`, `plant`/`station` (FK), `lines` (1‑N), champs calculés ci-dessous, `warnings` (`simple-json`), `computedAt` |
| `TripLine` (`trip_lines`)                | Ligne produit chargée                     | `materialName`, `liters`, `shipToName`, `city`, FK `trip_id` |
| `RouteCache` (`route_cache`)             | Itinéraires calculés mis en cache         | `originId`, `destId` (unique ensemble), `distanceKm`, `durationCarMin`, `geometry` (polyline encodée) |
| `PlanningSettings` (`planning_settings`) | Réglages globaux, **ligne unique id = 1** | voir §6 |
| `User` (`users`)                         | Compte de connexion                       | `username` (unique), `passwordHash` (bcrypt, jamais le clair), `fullName`, `role` (`USER` / `ADMIN`) |

Champs calculés de `Trip` : `distanceOneWayKm`, `distanceRoundTripKm`, `distanceEstimated`,
`drivingMinOneWay`, `drivingMinRoundTrip`, `breakMinutes`, `loadingMinutes`,
`unloadingMinutes`, `adminMinutes`, `plannedDeparture`, `etaStation`, `endUnloading`,
`etaReturnPlant`, `totalDurationMin`, `includeReturn`.

**Enums** (`backend/src/domain/enums.ts`) :

- `TripStatus` : `IMPORTED` → `PLANNED`
- `GeocodeSource` : `NOMINATIM`, `CITY_CENTER`, `MANUAL`
- `DrivingMethod` : `OSRM`, `AVERAGE_SPEED`
- `UserRole` : `USER` (consulter + créer), `ADMIN` (tout)

> ⚠️ **Incohérence connue** : `frontend/src/pages/PlanPage.tsx` gère aussi les badges
> `IN_TRANSIT`, `DELIVERED`, `CANCELLED`, qui n'existent pas dans `TripStatus` côté API.
> branches mortes. À arbitrer : ajouter ces statuts au backend (suivi de réalisation réel)
> ou retirer ces cas du front.

**Typage des dates** : les dates sont stockées en **colonnes `varchar` au format naïf**, sans
fuseau — `YYYY-MM-DD` et `YYYY-MM-DDTHH:mm[:ss]` (les secondes sont omises quand elles
valent 0). Tous les allers-retours passent par `backend/src/common/datetime.ts`
(`formatDate`, `formatDateTime`, `parseDate`, `parseDateTime`, `addMinutes`,
`hoursMinutesOf`, `parseHm`, `today`). **Ne jamais utiliser le type `datetime` natif** :
le driver convertirait selon le fuseau et ferait dériver les horaires. Les colonnes de date
sont des `varchar` et non des `text` parce que MySQL refuse d'indexer une colonne `text`.

---

## 5. Chaîne de traitement (le flux principal)

```
POST /api/import (multipart "file", 10 Mo max)
  └─ TripService.importWorkbook()                 [backend/src/trips/trips.service.ts]
       ├─ ExcelTripImporter.parse(buffer, standardTankLiters)   [importer/]
       │    ├─ findHeaderRow()   : détecte l'en-tête dans les 21 premières lignes
       │    ├─ mapColumns()      : alias FR/EN, reconnaissance par nom (ordre libre)
       │    ├─ lecture des lignes: fill-down A→G, héritage Trip Num/Sales Order/Pat.Doc/Date
       │    └─ assembleTrips()    : totaux, contrôle capacité citerne, issues ERROR/WARN
       ├─ transaction : persist() par voyage (statut IMPORTED, Plant/Station case-insensitive)
       ├─ recalculateTrips(trips, settings)   ← PLANIFICATION AUTOMATIQUE à l'import
       │    ├─ GeocodingService.locate(station)
       │    ├─ RoutingService.route(plant, station)  [cache → OSRM → Haversine]
       │    ├─ CalculationEngine.calculate(input)
       │    └─ addOverlapWarnings(trips)
       └─ ImportReportDto { trips, lines, issues, journeyList }
```

Points à connaître :

- La **planification est déclenchée à l'import** (et aussi par `POST /api/trips/recalculate`
  et par chaque `PATCH`). Un voyage importé est donc directement `PLANNED`, avec distances
  et durées renseignées — c'est ce qui alimente le tableau de bord.
- Un ré-import du même classeur **remplace** les lignes : `tripNum` + `tourDate` servent de
  clé d'upsert ; les `TripLine` anciens sont supprimés explicitement avant réécriture.
- Le **géocodage ne relance pas** si `lat`/`lon` sont déjà posés ; une station corrigée
  manuellement (`MANUAL`) est considérée confirmée.

### Planification manuelle (`POST /api/trips`)

Le formulaire « Planifier » saisit, colonne par colonne, ce que le classeur Excel apportait :
mêmes champs, mêmes relations. `TripService.createTrip()` construit un `ParsedTrip` exactement
comme `ExcelTripImporter`, puis rappelle **la même chaîne** `persist()` → `recalculateTrips()` →
`getDetail()`. Un voyage saisi à la main obtient donc des résultats identiques à un voyage importé
(distance, pauses, horaires, alertes) — vérifié en e2e par comparaison avec le voyage Marrakech du
classeur d'exemple.

```
POST /api/trips  (TripCreateRequest)
  └─ TripService.createTrip()
       ├─ validation FR : date du voyage, station, dépôt, lignes de produits obligatoires
       ├─ shipToName / plantName normalisés (material-normalizer) → Station/Plant case-insensitive
       ├─ plannedDeparture optionnel (`YYYY-MM-DDTHH:mm`) ; sinon réglage defaultDepartureTime
       ├─ transaction : persist() puis recalculateTrips([trip], settings)
       └─ retourne TripDetailDto (statut PLANNED, alertes comprises)
```

`DELETE /api/trips/{id}` supprime un voyage et ses lignes (ordre FK explicite, cf. §11.1) puis
**replanifie les voyages du même jour**, car les alertes de chevauchement dépendent des voisins.

---

## 6. Moteur de calcul — règles métier exactes

Fichier : `backend/src/engine/calculation-engine.ts`. Classe **pure** (aucune dépendance
Nest ni I/O), donc testable isolément. C'est le cœur métier du projet.

**Durée de conduite aller** (`drivingMinutesOneWay`)

- `drivingMethod = OSRM` et durée voiture connue : `arrondi(routeDurationCarMin × heavyTruckFactor)`
- sinon : `ceil(distance / averageSpeedKmh × 60)`

**Pauses** (`breakCount`)

- blocs = `ceil(drivingMinutes / breakAfterMinutes)` ; pauses = `max(0, blocs − 1)`
- durée totale des pauses = `pauses × breakDurationMinutes`
- logique : on ne place une pause que s'il reste de la conduite après le bloc.

**Chronologie** (`calculate`)

```
départ (plannedDeparture)
  → +adminMinutes          = début de conduite
  → +conduite + pauses     = etaStation
  → +unloadingMinutes      = endUnloading
  → +conduite + pauses     = etaReturnPlant   (seulement si includeReturn)
totalDurationMin = minutes entre départ et etaReturnPlant
distanceRoundTripKm = distanceOneWay × 2       (sinon = aller si includeReturn = false)
```

**Départ résolu** (`resolveDeparture`) : l'heure demandée, sinon `defaultDepartureTime` du
jour du tour, sinon — si `noNightDriving` — le **départ le plus tôt dans un créneau de 30 min
qui évite toute conduite de nuit** (`earliestNightFreeDeparture`).

**Nuit** (`overlapsNight` / `isNight`) : balayage minute par minute de la plage
`nightStart → nightEnd` ; la plage peut chevaucher minuit (ex. 21:00 → 05:00).

**Alertes produites** (chaînes exactes, à ne pas reformuler) :

- `Conduite journalière de X h Y min supérieure à la limite de Z h`
- `Conduite de nuit détectée sur le trajet aller` / `sur le trajet retour`
- `Aucun départ n'évite entièrement la conduite de nuit ; départ par défaut retenu`
- `Distance estimée à vol d'oiseau ×1,3 (OSRM indisponible) : 425.3 km`
- `Station non géocodée : distance et horaires indisponibles`
- `Station non confirmée : coordonnées approximatives (centre-ville)`
- `Dépôt non géolocalisé : distance et horaires indisponibles`
- `Total chargé de 31000.0 L différent de la capacité standard (33000.0 L)`
- `Chevauchement avec le voyage 1023 (le chauffeur Ahmed)` / `(le véhicule TR-12)`

À l'import, `ExcelTripImporter` émet aussi `Total du voyage X (N L) différent de la capacité
standard (33000 L)` et des issues de type `ERROR`/`WARN` avec numéro de ligne du fichier.

**Réglages par défaut** (`PlanningSettings`, modifiables via `PUT /api/settings`, partiels acceptés) :

| Champ                     | Défaut            | Sens |
|---------------------------|-------------------| --- |
| `heavyTruckFactor`        | 1,25              | coefficient camion sur la durée voiture |
| `drivingMethod`           | `OSRM`            | `OSRM` ou `AVERAGE_SPEED` |
| `averageSpeedKmh`         | 65                | vitesse si pas d'OSRM |
| `breakAfterMinutes`       | 270               | seuil de pause (4 h 30) |
| `breakDurationMinutes`    | 45                | durée d'une pause |
| `loadingMinutes`          | 60                | chargement (exposé, non chronométré) |
| `unloadingMinutes`        | 60                | déchargement à la station |
| `adminMinutes`            | 15                | formalités avant départ |
| `defaultDepartureTime`    | `06:00`           | départ par défaut |
| `noNightDriving`          | false             | interdit la conduite de nuit |
| `nightStart` / `nightEnd` | `21:00` / `05:00` | plage de nuit |
| `maxDrivingMinutesPerDay` | 540               | 9 h de conduite max |
| `includeReturn`           | true              | compte le retour au dépôt |
| `standardTankLiters`      | 33000             | capacité citerne |
| `fuelConsumptionLPer100`  | 38                | consommation |
| `fuelPricePerLiter`       | 13,5              | prix gasoil (MAD) |

`TripSummaryDto` ajoute deux champs dérivés non stockés :
`estimatedFuelLiters = distanceRoundTrip × conso / 100` et
`estimatedFuelCost = litres × prix`.

---

## 7. API REST

| Méthode       | Chemin                   | Description |
|---------------|--------------------------| --- |
| `POST`        | `/api/auth/login`        | `{ username, password }` → `{ token, user }` — seule route publique, **401** si couple invalide |
| `GET`         | `/api/auth/me`           | Compte du porteur du token |
| `GET`         | `/api/auth/users`        | Liste des comptes (**ADMIN**), sans jamais exposer `passwordHash` |
| `POST`        | `/api/auth/users`        | Création de compte (**ADMIN**) — 409 si l'identifiant existe |
| `PUT`         | `/api/auth/users/{id}`   | Rôle / mot de passe (**ADMIN**) — refusé si aucun admin ne resterait actif |
| `DELETE`      | `/api/auth/users/{id}`   | Suppression d'un compte (**ADMIN**) |
| `POST`        | `/api/import`            | Import `.xlsx` (multipart `file`) **+ planification automatique** → `ImportReportDto` |
| `GET`         | `/api/trips`             | Liste (filtres `date`, `driver`, `vehicle`, `city`), tri `tourDate` puis `plannedDeparture` |
| `POST`        | `/api/trips`             | **Planification manuelle** d'un voyage (`TripCreateRequest`, voir §5) → `TripDetailDto` |
| `GET`         | `/api/trips/{id}`        | Détail (`TripDetailDto` : lignes, coordonnées, géométrie de route) |
| `PATCH`       | `/api/trips/{id}`        | Départ / chauffeur / véhicule / client / tranche, puis **recalcul** (**ADMIN**) |
| `DELETE`      | `/api/trips/{id}`        | Suppression du voyage et replanification du jour (**ADMIN**) |
| `POST`        | `/api/trips/recalculate` | Corps `{"ids": []}` ; vide = tous les voyages |
| `GET`         | `/api/stations`          | Stations + nombre de voyages + statut de géocodage |
| `PUT`         | `/api/stations/{id}`     | Correction des coordonnées (`MANUAL`, confirmé) (**ADMIN**) |
| `GET` / `PUT` | `/api/settings`          | Réglages de planification (mise à jour partielle ; `PUT` = **ADMIN**) |
| `GET`         | `/api/stats`             | KPI d'une date (voir ci-dessous) |
| `GET`         | `/api/export/excel`      | `plan-jmp-{date}.xlsx`, 16 colonnes, freeze + autofilter |
| `GET`         | `/api/export/pdf`        | `plan-jmp-{date}.pdf`, A4 paysage, 15 colonnes |
| `GET`         | `/swagger-ui.html`       | Documentation interactive |

**Authentification et rôles** — toutes les routes `/api/*` sauf `/api/auth/login` exigent un
en-tête `Authorization: Bearer <jwt>`. Deux gardes globales (`APP_GUARD` déclarées dans
`auth/auth.module.ts`) s'appliquent dans l'ordre :

1. `JwtAuthGuard` : vérifie le token, recharge le compte en base (un compte supprimé est
   immédiatement refusé) et pose `request.user`. Messages : `Authentification requise`,
   `Session expirée, reconnectez-vous`, `Compte supprimé, reconnectez-vous`.
2. `RolesGuard` : respecte d'abord une éventuelle `@Roles(...)`, sinon applique la politique par
   défaut — `GET` et `POST` ouverts à tout connecté (consulter et créer), `PUT`/`PATCH`/`DELETE`
   réservés à `ADMIN`. **Une nouvelle route est donc protégée sans rien déclarer.**

Le compte administrateur est amorcé au premier démarrage (`JMP_ADMIN_USERNAME` /
`JMP_ADMIN_PASSWORD`, par défaut `admin` / `admin123`) par `DataInitializer` via
`AuthService.ensureAdmin()` — d'où `@Global()` sur `AuthModule`.

**`GET /api/stats?date=YYYY-MM-DD`** renvoie `StatsDto` : `tripsCount`, `totalDistanceKm`
(somme des A/R), `totalDurationHours` (arrondi), et trois agrégations `Record<label, valeur>` :
`litersByProduct` (regroupement insensible à la casse/espaces via `materialKey`), `kmByDriver`,
`hoursByVehicle`. Le tableau de bord consomme ces clés telles quelles.

⚠️ **`/api/stats` filtre sur une date unique** et le tableau de bord arrive sur la date du
jour : si le programme importé porte une autre date, le dashboard affiche des zéros. C'est
le premier réflexe à avoir quand « les chiffres ne s'affichent pas ».

**Codes HTTP** : les `POST` renvoient **200** (pas 201), conformes à l'ancien comportement.
Erreurs : JSON `{ timestamp, status, error, message }` produit par
`backend/src/common/global-exception.filter.ts` (enregistré comme `APP_FILTER`, donc actif
aussi dans les tests). `date` invalide → 400 `Invalid date value "..."`.
Auth : **401** non connecté / token expiré, **403** rôle insuffisant.

---

## 8. Frontend

React + Vite, routé par `frontend/src/App.tsx`. Un seul client HTTP
(`frontend/src/lib/client.ts`) : `api.get/post/put/patch/del/upload`, qui lève une `ApiError`
en utilisant `body.message` (ou `body.detail`) — l'autre bout doit donc rester au format du §7.
La base des URLs vient de `VITE_API_URL` (vide en dev, le proxy Vite suffit).

**Session** : le JWT est stocké dans `localStorage['jmp.token']` et `client.ts` ajoute
l'en-tête `Authorization` à chaque requête. Un **401** (hors `/api/auth/login`) efface le token
et déclenche le handler enregistré par `AuthProvider` → redirection vers `/login`. Les
téléchargements d'export passent par `downloadExport('excel' | 'pdf', date)` : un `fetch` authentifié
puis un `Blob`, parce qu'un `<a href>` ne peut pas porter l'en-tête.

Le contexte d'auth (`frontend/src/lib/auth.tsx`) expose `useAuth()` (`user`, `isAdmin`, `login`,
`logout`) et deux garde de route : `RequireAuth` (recharge la session via `GET /api/auth/me` au
chargement) et `RequireAdmin`.

| Page                                     | Endpoint consommé                                             |
|------------------------------------------|---------------------------------------------------------------|
| `LoginPage.tsx`                          | `POST /api/auth/login`                                        |
| `ImportPage.tsx`                         | `POST /api/import`                                            |
| `PlanifierPage.tsx`                      | `POST /api/trips` (formulaire = colonnes du classeur)         |
| `PlanPage.tsx`                           | `GET /api/trips`, `POST /api/trips/recalculate`, `DELETE /api/trips/{id}`, `downloadExport` |
| `TripDetail.tsx`                         | `GET /api/trips/{id}`, `PATCH`                                |
| `MapPage.tsx` + `components/TripMap.tsx` | voyages + géométrie polyline                                  |
| `Dashboard.tsx`                          | `GET /api/stats` (KPI + 3 graphiques Recharts)                |
| `StationsPage.tsx`                       | `GET/PUT /api/stations`                                       |
| `SettingsPage.tsx`                       | `GET/PUT /api/settings`                                       |
| `UsersPage.tsx`                          | `GET/POST/PUT/DELETE /api/auth/users`                         |

Une page en **lecture seule pour le rôle `USER`** : les boutons de modification/suppression sont
masqués ou désactivés (`isAdmin`), la sécurité réelle restant assurée côté API (§7).

Types TS en dur dans `frontend/src/lib/api.ts`, formatage (`fmtKm`, `fmtLiters`, `fmtTime`,
`fmtDuration`, `todayIso`) dans `lib/format.ts`. En dev, Vite proxifie `/api` vers `:8080` ;
en prod, nginx fait le relais.

---

## 9. Services externes et dégradation

| Service               | Variable d'env   | Défaut                           | Repli si indisponible |
|-----------------------|------------------|----------------------------------| --- |
| OSRM (itinéraires)    | `OSRM_BASE_URL`  | `http://router.project-osrm.org` | Haversine × 1,3, `fallbackUsed` / `distanceEstimated = true` + alerte |
| Nominatim (géocodage) | `NOMINATIM_URL`  | API publique                     | `city-center-fallback.ts` : centroïdes de villes marocaines, `geocodeSource = CITY_CENTER` + alerte |

- La requête de géocodage est `"${nom de la station}, ${ville}, Maroc"`, filtrée
  `countrycodes=ma`, `limit=1`.
- **Nominatim impose 1 requête/seconde** : le client dort volontairement entre les appels.
  Une modification qui parallélise le géocodage se fera bannir — garder la limitation.
- User-Agent déclaré : `JMP-Planner/0.0.1 (projet pédagogique ENAA)`.
- Chaque itinéraire réussi est mis en cache dans `route_cache` (`originId`/`destId`) : la
  géométrie y est stockée en polyline encodée et sert à tracer le parcours sur la carte.
- Résolution des noms de ville : accents supprimés (NFD) + minuscules, donc « Casablanca »
  et `CASABLANCA` matchent.

Pour un usage hors-ligne ou intensif : auto-héberger OSRM (conteneurs `osrm-*` avec une
extraction Geofabrik) et Nominatim, puis pointer les variables d'env dessus.

---

## 10. Environnement, base de données, Docker

| Variable                                    | Défaut                      | Rôle |
|---------------------------------------------|-----------------------------| --- |
| `SERVER_PORT`                               | `8080`                      | port d'écoute |
| `JMP_CORS_ORIGINS`                          | `http://localhost:5173`     | origines autorisées (liste CSV) |
| `MYSQL_HOST` / `MYSQL_PORT`                 | `localhost` / `3306`        | serveur MySQL |
| `MYSQL_USER` / `MYSQL_PASSWORD`             | `root` / *(vide)*           | identifiants, `CREATE` requis |
| `MYSQL_DATABASE`                            | `jmp`                       | base applicative, créée si absente |
| `MYSQL_TEST_DATABASE`                       | `jmp_test`                  | base vidée par la suite e2e |
| `JWT_SECRET`                                | `jmp-secret-de-development` | signature des tokens — **à changer** ailleurs qu'en dev |
| `JWT_EXPIRES_IN`                            | `8h`                        | durée de vie d'une session |
| `JMP_ADMIN_USERNAME` / `JMP_ADMIN_PASSWORD` | `admin` / `admin123`        | administrateur amorcé au premier démarrage |
| `OSRM_BASE_URL`, `NOMINATIM_URL`            | voir §9                     | endpoints externes |
| `VITE_API_URL`                              | *(vide)*                    | Base des URLs API côté front (inutile en dev grâce au proxy) |

- La base `MYSQL_DATABASE` (et `jmp_test` pour les tests) est créée au premier démarrage par
  `config/mysql-bootstrap.ts`, avec un jeu de caractères `utf8mb4` — voir le piège 16 de §11. L'utilisateur
  connecté doit donc avoir le droit `CREATE` (à défaut de quoi `synchronize` ne peut rien faire).
- Au premier démarrage, `config/data-initializer.ts` amorce le dépôt
  **`C.E.C MOHAMMEDIA FUELS` (33.6866, −7.3830)**, la ligne `planning_settings` id = 1 et le
  compte administrateur (cf. §7).
- Docker : `docker compose up --build` → front `http://localhost:8081`, API `http://localhost:8080`.
  Un conteneur `mysql:8.4` est démarré (base/utilisateur `jmp`, mot de passe `jmp`) et ses données
  vivent dans le volume `jmp-data` monté sur `/var/lib/mysql`. Son port n'est pas publié sur l'hôte,
  donc un MySQL local sur `3306` reste utilisable à côté. Le healthcheck du backend vérifie que
  le **port 8080 écoute** : depuis l'authentification, toute route `/api/*` répond 401 sans jeton,
  donc un test HTTP « qui renvoie 200 » n'est plus disponible.

Commandes de développement :

```bash
cd backend  && npm install && npm run start:dev     # API + Swagger sur :8080
cd backend  && npm run build                         # tsc -> dist/
cd backend  && npm test                              # jest (toutes les suites)
cd frontend && npm install && npm run dev            # Vite sur :5173
```

---

## 11. Pièges connus & décisions architecturales

Ce sont les erreurs réellement rencontrées ; les ignorer fait perdre du temps.

1. **MySQL et colonnes indexées** : driver `mysql2`. MySQL refuse d'indexer une colonne `text`
   sans longueur de préfixe — `trip.tourDate` (index `idx_trip_date`) et les dates calculées sont
   donc des `varchar`. Autre piège : `Repository.clear()` émet un `TRUNCATE`, refusé sur une table
   référencée par une FK ; les tests suppriment donc ligne à ligne dans l'ordre
   `trip_lines → trips → stations → route_cache`.
2. **TypeORM 0.3 a supprimé `orphanRemoval`** : ne pas le réintroduire. Pour remplacer les
   enfants d'une relation, **supprimer explicitement** les lignes (`DELETE FROM trip_lines
   WHERE trip_id = …`) avant de ré-insérer — voir `TripService.persist()`.
3. **Interdiction d'initialiser une relation par un tableau** (`lines: TripLine[] = []`) :
   TypeORM lève `InitializedRelationError`. Laisser la propriété déclarée sans valeur et
   faire `this.lines = this.lines ?? []` dans `addLine()`.
4. **Injection d'interfaces** : une interface TypeScript n'existe pas à l'exécution. Les
   ports sont injectés par **jeton string** : `GEOCODER`, `OSRM_CLIENT`, déclarés avec
   `{ provide: GEOCODER, useExisting: NominatimGeocoder }` et consommés par
   `@Inject(GEOCODER)`. C'est ce qui permet de les remplacer par des faux dans les tests.
5. **Dates naïves en texte** (voir §4) : le format est maîtrisé par le code, jamais par le
   driver, ce qui rend les horaires identiques quel que soit le fuseau de la machine. Toute
   l'horlogerie passe par `common/datetime.ts`.
6. **Les `POST` renvoient 200** (`@HttpCode(200)`) : le front et les tests attendent 200.
7. **Ordre des routes Nest** : `@Post('recalculate')` doit être déclaré **avant**
   `@Get(':id')`, sinon `recalculate` est avalé par la route paramétrée.
8. **Jest** : `testRegex: '\.spec\.ts$'` — un fichier nommé `*.e2e-spec.ts` (tiret) n'est pas
   exécuté. Les e2e montent l'`AppModule` complet avec `MYSQL_DATABASE=jmp_test` (variable
   `MYSQL_TEST_DATABASE`) et `overrideProvider(GEOCODER / OSRM_CLIENT)` pour zéro appel réseau.
   Il faut donc un MySQL démarré pour lancer `npm test`.
9. **Chemin du classeur de test** dans `trips.e2e.spec.ts` :
   `../../../samples/Programe_VIVO.xlsx` — relatif à la **racine du dépôt**, donc ne pas
   changer la profondeur `backend/src/trips` sans corriger le test.
10. **Nommage Excel** : l'importeur normalise `U+00A0` et `U+202F`, accepte les en-têtes dans
    n'importe quel ordre et avec des alias FR/EN. Les cellules formule sont lues via leur
    résultat en cache. Une date peut arriver en **numéro de série Excel** (bug 1900 géré :
    `46304` = `2026-10-09`) ou en texte (`MM-dd-yy` entre autres).
11. **Jeu de test de référence** : `samples/Programe_VIVO.xlsx` = 3 voyages / 8 lignes produit,
    tous à la date `2026-10-09`, chacun à 33 000 L (capacité standard) : SHELL MARHABA TANGER,
    SHELL OUTATE L HAJ, SHELL HAOUZ (Marrakech).
12. **Deux `APP_GUARD`, dans cet ordre** : `JwtAuthGuard` puis `RolesGuard`. Une garde déclarée
    dans `AuthModule` ne protège que ce module ; enregistrées via `APP_GUARD`, elles couvrent
    toute l'app, ce qui est voulu : **une route oubliée est sécurisée par défaut**, pas ouverte.
    `@Public()` est le seul moyen de sortir du dispositif (utilisé pour le login).
13. **`AuthModule` est `@Global()`** : la clause `imports` de `AppModule` n'explorera pas les
    providers des modules enfants, or `DataInitializer` (déclaré dans `AppModule`) a besoin
    d'`AuthService` pour amorcer l'admin. Sans `@Global()`, l'échec est en `Nest can't resolve
    dependencies` au démarrage, pas à la compilation.
14. **`bcryptjs` et non `bcrypt`** : `bcrypt` est natif et exige Visual Studio Build Tools à
    l'installation ; `bcryptjs` est du JS pur, même empreinte (`$2a$`/`$2b$` compatibles), et
    rend le livrable clonable sur n'importe quelle machine. **`@nestjs/jwt`** : la durée de vie
    se passe dans `signOptions.expiresIn`, pas à la racine des options, et elle est typée
    `number | StringValue`, donc `as SignOptions['expiresIn']` derrière une variable d'env.
15. **Le token ne suffit pas côté front** : `downloadExport` fait un `fetch` authentifié puis un
    `Blob`. Remettre un `<a href={url}>` sur les exports provoque un **401** silencieux
    (l'en-tête `Authorization` ne peut pas être posé par le navigateur).
16. **`createDatabaseIfNotExist` ne fait rien sur MySQL** : option héritée de sql.js, absente du
    driver `mysql` de TypeORM 0.3 — la connexion échouait en `Unknown database 'jmp_test'` sur une
    instance neuve. `config/mysql-bootstrap.ts` ouvre donc une connexion **sans base** et exécute
    `CREATE DATABASE IF NOT EXISTS … utf8mb4` avant que TypeORM se branche. Retirer cet appel
    casse le premier démarrage sur toute machine fraîche.

---

## 12. Recette : ajouter une fonctionnalité

**Nouveau champ de voyage**

1. Entité : ajouter la colonne dans `backend/src/entities/trip.entity.ts`
   (date → type `varchar`, jamais `text` si la colonne est indexée).
2. Calcul : l'alimenter dans `TripService.planTrip()` (et dans `CalculationEngine` si c'est une
   règle métier).
3. Exposition : ajouter le champ à `TripSummaryDto`/`TripDetailDto` **et** au mapping
   `toSummary()`, à la même position que l'ordre des champs de l'ancien contrat.
4. Front : déclarer le champ dans `frontend/src/lib/api.ts`, l'afficher (plan ou détail).
5. Test : étendre `trips.e2e.spec.ts` ; `npm test` doit rester vert.
   (`synchronize: true` crée la colonne au redémarrage — pas de migration à écrire.)

**Nouvel objet / nouvel écran**

1. `backend/src/<domaine>/` : `<x>.entity.ts`, `<x>.dto.ts`, `<x>.service.ts`,
   `<x>.controller.ts`, `<x>.module.ts`.
2. Ajouter l'entité à la liste `entities` du datasource MySQL dans `app.module.ts`
   et le module dans `imports`.
3. `frontend/src/pages/<X>.tsx` + route dans `App.tsx` + lien dans `components/Layout.tsx` ;
   appels via `api` (jamais `fetch` direct), route enveloppée dans `RequireAuth` (voire
   `RequireAdmin` si elle écrit).
4. Aucune déclaration d'accès n'est nécessaire : les gardes globales appliquent la politique du §7.
   Un `DELETE`/`PUT` est donc réservé à `ADMIN` dès sa création ; pour l'ouvrir à `USER`,
   poser `@Roles(UserRole.USER, UserRole.ADMIN)` sur la méthode.

**Nouvelle règle de calcul** : l'écrire dans `CalculationEngine` (classe pure), jamais dans le
service, et ajouter immédiatement un cas dans `calculation-engine.spec.ts`.

**Conventions de code** : préfixe `@InjectRepository(...)` pour les repositories, `async/await`
partout, commentaires courts en français sur les règles métier, pas de commentaire sur l'évidence.

---

## 13. Pistes d'amélioration (par intérêt/effort)

| Idée                                                                                                                    | Effort      | Points d'ancrage |
|-------------------------------------------------------------------------------------------------------------------------|-------------| --- |
| Statuts de réalisation (`IN_TRANSIT`, `DELIVERED`, `CANCELLED`) — débloquer les badges déjà présents dans le front      | Faible      | `domain/enums.ts`, `PATCH /api/trips/{id}`, `PlanPage.tsx` |
| Tableau de bord multi-jours / semaine au lieu d'une date unique                                                         | Faible      | `stats.service.ts` (plage), `Dashboard.tsx` |
| Couverture de la capacité citerne par produit (plusieurs compartiments)                                                 | Moyen       | `TripLine.liters`, import `finalizeTrip()` |
| Optimisation de la séquence des stations (TSP glouton + 2-opt) sur une tournée                                          | Moyen/élevé | `routing/`, nouveau service + endpoint |
| Réglementation sociale complète : pauses hebdo, repos minimal entre deux voyages, cumul conducteurs sur plusieurs jours | Moyen       | `CalculationEngine`, `addOverlapWarnings()` |
| Notifications (email/Telegram) sur alertes de chevauchement ou dépassement                                              | Faible      | fin de `recalculateTrips()` |
| Plans pluri-quotidiens (départ 2ᵉ rotation) et gestion du parc de camions                                               | Élevé       | nouvelle entité `Vehicle`, contraintes dans le moteur |
| Historisation des imports (quelle version du programme, quand)                                                          | Faible      | entité `ImportRun` + champ sur `Trip` |
| Migrations explicites (`synchronize: false`) pour un environnement de prod                                              | Moyen       | `app.module.ts`, `typeorm migration:*` |
| Self-host OSRM/Nominatim + cache de tuiles                                                                              | Moyen       | §9, `docker-compose.yml` |

---

## 14. Glossaire métier

| Terme v                   | Signification |
|---------------------------| --- |
| **Trip Num**              | N° de voyage/tournée dans le programme Shell |
| **Sales Order / Pat.Doc** | N° de commande client / document patrimoniel associé |
| **Tour Start Date**       | Date du tour (ancre de toute la planification) |
| **Vehicle Id**            | Immatriculation ou ID camion-citerne |
| **Tranche**               | Créneau horaire de livraison (matin / après-midi) |
| **Ship To Name**          | Station/client destinataire (entité `Station`) |
| **Plant Name**            | Dépôt d'expédition (entité `Plant`) — ex. « C.E.C MOHAMMEDIA FUELS » |
| **Material Name**         | Produit chargé (gasoil, essence…). Deux libellés de même clé (`materialKey`) sont regroupés dans les stats |
| **Total**                 | Litres chargés sur la ligne |
| **A/R**                   | Aller-retour (`includeReturn`) |
| **fallbackUsed**          | Distance estimée à vol d'oiseau × 1,3 (OSRM indisponible) |

---

## 15. Historique et état du dépôt

- Application d'abord écrite en **Java / Spring Boot** ; le backend a été réécrit en
  **Node.js / NestJS** sur demande, en conservant le contrat d'API au caractère près, ce qui
  a permis de ne **pas modifier le frontend**.
- Ce dossier (`jmp-planner-node`) est la **version livrée, propre et autonome** : uniquement
  `backend/` (NestJS), `frontend/` (React), `samples/`, `docker-compose.yml`. Aucun `node_modules`,
  aucune donnée locale, un seul commit d'historique à créer.
- L'ancien dépôt `jmp-planner` reste disponible en interne comme référence (backend Java +
  première mouture Node).

**État vérifié** (MySQL 8.0.44 local, `root`) : `npm test` → 4 suites / **25 tests** au vert
(moteur de calcul, haversine, import du classeur réel, et e2e : import → planification →
dashboard → export, plus planification manuelle paritaire, 401/403 et matrice des rôles) ;
`npm run build` backend OK ; `vite build` frontend OK ; parcours complet vérifié dans le navigateur
(connexion admin, création d'un compte `USER`, import du classeur, voyage saisi à la main →
277 km / 554 km A/R / 9 h 07, identiques au voyage importé, export Excel téléchargé via le jeton).

Évolutions récentes, dans l'ordre :

1. **L'import planifie désormais les voyages automatiquement.** Avant ce changement, il fallait
   cliquer « Recalculer tout » pour que les distances A/R, les km par chauffeur et les heures par
   véhicule apparaissent dans le tableau de bord.
2. **MySQL remplace SQLite/PostgreSQL** partout, y compris dans les tests (voir §10 et §11.1).
3. **Planification manuelle** (`POST /api/trips`, écran « Planifier ») : mêmes champs que le
   classeur, mêmes résultats, sans passer par un fichier.
4. **Authentification JWT et rôles** `USER` / `ADMIN` : consulter et créer pour tous les connectés,
   modifier, supprimer et gérer les comptes pour les administrateurs.

---

## 16. Détail technique : Géocodage, calcul du kilométrage et des horaires

Documentation technique détaillée du fonctionnement interne du backend pour la localisation, les distances et la planification horaire.

### 16.1. Le Géocodage (Recherche des coordonnées GPS)

Le géocodage est géré par `GeocodingService` (`backend/src/routing/geocoding.service.ts`).
Lorsqu'un voyage est importé ou créé, le système localise la station destinataire selon une stratégie en cascade (*fallback*) :

1. **Vérification du cache en base :**
   Si la station a déjà `lat` et `lon` renseignés en base de données, elle n'est pas ré-interrogée.
2. **Recherche OpenStreetMap / Nominatim :**
   `NominatimGeocoder` (`backend/src/routing/nominatim.geocoder.ts`) envoie une requête HTTP à l'API Nominatim :
   - Requête : `q={station.name}, {station.city}, Maroc&countrycodes=ma&limit=1`
   - Respecte les conditions d'utilisation d'OpenStreetMap (User-Agent personnalisé `JMP-Planner/0.0.1` et temporisation minimale d'1 seconde entre les requêtes).
   - En cas de succès : les coordonnées sont enregistrées avec `geocodeSource = NOMINATIM` et `geocodeConfirmed = false`.
3. **Repli sur le dictionnaire des centres-villes :**
   Si Nominatim échoue ou ne renvoie aucun résultat, `centerOf()` (`backend/src/routing/city-center-fallback.ts`) consulte une table interne prédéfinie de coordonnées de centres-villes marocains (Casablanca, Tanger, Marrakech, Fès, Agadir, etc.).
   La station est alors enregistrée avec `geocodeSource = CITY_CENTER` et `geocodeConfirmed = false`.
   Une alerte avertit l'utilisateur : `Station non confirmée : coordonnées approximatives (centre-ville)`.

---

### 16.2. Le Calcul du Kilométrage (Distance)

Le calcul d'itinéraire est orchestré par `RoutingService` (`backend/src/routing/routing.service.ts`).

1. **Cache des trajets (`RouteCache`) :**
   Avant tout appel réseau, le service vérifie si la liaison `(originId = plant.id, destId = station.id)` existe dans la table `route_cache`. Si oui, la distance, la durée et le tracé géométrique sont directement réutilisés.
2. **Calcul d'itinéraire réel (OSRM) :**
   `OsrmRestClient` (`backend/src/routing/osrm.client.ts`) interroge le serveur OSRM (`/route/v1/driving/{lon1},{lat1};{lon2},{lat2}`) :
   - Distance en km : `distanceKm = distanceMeters / 1000.0`.
   - Durée automobile : `durationCarMin = Math.round(durationSeconds / 60.0)`.
   - Géométrie : polyline encodée conservée pour le tracé de la carte Leaflet.
   - Le résultat est enregistré en base dans `route_cache`.
3. **Secours en cas d'indisponibilité OSRM (Haversine × 1,3) :**
   Si OSRM est injoignable ou échoue, `haversine.estimateRoadKm()` (`backend/src/routing/haversine.ts`) calcule la distance à vol d'oiseau (formule de Haversine) et lui applique un coefficient de sinuosité routière de 1,3 :
   $$\text{Distance estimée} = \text{Distance Haversine} \times 1.3$$
   Un avertissement est ajouté au voyage : `Distance estimée à vol d'oiseau ×1,3 (OSRM indisponible) : ... km`.
4. **Aller-Retour (`distanceRoundTripKm`) :**
   Si le paramètre `includeReturn` est actif dans les paramètres (`planning_settings`), la distance aller est doublée :
   $$\text{distanceRoundTripKm} = \text{distanceOneWayKm} \times 2$$

---

### 16.3. Le Calcul des Heures et de la Planification

Le moteur métier central se trouve dans `CalculationEngine` (`backend/src/engine/calculation-engine.ts`) et s'appuie sur la configuration de `PlanningSettings` (`backend/src/entities/planning-settings.entity.ts`).

#### A. Temps de conduite (`drivingMinutesOneWay`)
- **Mode OSRM (par défaut)** : OSRM calculant un temps pour véhicule léger, le moteur applique un coefficient poids lourd :
  $$\text{drivingMinOneWay} = \text{round}(\text{routeDurationCarMin} \times \text{heavyTruckFactor (ex. 1.25)})$$
- **Mode Vitesse moyenne** : Si OSRM n'est pas disponible ou si le mode `AVERAGE_SPEED` est configuré :
  $$\text{drivingMinOneWay} = \left\lceil \frac{\text{distanceKm}}{\text{averageSpeedKmh (ex. 65 km/h)}} \times 60 \right\rceil$$

#### B. Gestion des pauses obligatoires (`breakMinutes`)
- Règle de sécurité : une pause de `breakDurationMinutes` (45 min) est insérée après chaque bloc de conduite de `breakAfterMinutes` (270 min = 4h30) :
  $$\text{nbPauses} = \max\left(0, \left\lceil \frac{\text{drivingMinutes}}{\text{breakAfterMinutes}} \right\rceil - 1\right)$$
  $$\text{pausesMinutes} = \text{nbPauses} \times \text{breakDurationMinutes}$$

#### C. Chronologie complète des étapes d'un voyage
Le planning temporel est calculé séquentiellement :

1. **Départ planifié (`plannedDeparture`)** :
   - Heure demandée manuellement, ou heure par défaut (`defaultDepartureTime`, ex. `06:00`).
   - Si l'interdiction de conduite nocturne est activée (`noNightDriving = true`), le moteur teste les créneaux par pas de 30 minutes entre 00:00 et 23:30 (`earliestNightFreeDeparture`) pour retenir le départ le plus tôt évitant la plage de nuit (`nightStart` à `nightEnd`, ex. 21h00 - 05h00).
2. **Début de conduite (`driveStart`)** :
   $$\text{driveStart} = \text{plannedDeparture} + \text{adminMinutes (15 min)}$$
3. **Arrivée à la station (`etaStation`)** :
   $$\text{etaStation} = \text{driveStart} + \text{drivingMinOneWay} + \text{pausesAller}$$
4. **Fin de déchargement (`endUnloading`)** :
   $$\text{endUnloading} = \text{etaStation} + \text{unloadingMinutes (60 min)}$$
5. **Retour au dépôt (`etaReturnPlant`)** *(si `includeReturn = true`)* :
   $$\text{etaReturnPlant} = \text{endUnloading} + \text{drivingMinRetour} + \text{pausesRetour}$$
6. **Durée totale du voyage (`totalDurationMin`)** :
   $$\text{totalDurationMin} = \text{etaReturnPlant} - \text{plannedDeparture}$$

---

### 16.4. Contrôles et Détection d'Anomalies (Warnings)

Lors du calcul dans `TripService.planTrip()` (`backend/src/trips/trips.service.ts`), des vérifications automatiques émettent des alertes non bloquantes :
- **Dépassement de conduite journalière** : alerte si le cumul dépasse `maxDrivingMinutesPerDay` (ex. 9 heures / 540 min).
- **Conduite de nuit (`NIGHT_WARNING`)** : alerte si le trajet aller ou retour chevauche la plage nocturne configurée.
- **Écart de chargement** : alerte si le total en litres diffère de `standardTankLiters` (33 000 L).
- **Chevauchement d'itinéraires (`addOverlapWarnings`)** : détection de conflits si un même chauffeur ou un même véhicule est affecté à deux voyages distincts sur des plages horaires qui se recouvrent le même jour.

---

## 17. Export Excel au format JMP imprimable officiel

L'export Excel (`/api/export/excel`) produit désormais des fiches de voyage conformes au modèle officiel imprimable (`samples/jmp imprime ..xlsx` / `backend/templates/jmp-template.xlsx`) :

1. **Structure multi-feuilles :**
   - Chaque voyage du jour génère un onglet dédié formaté en fiche JMP imprimable (`JMP - [Numéro de voyage]`).
   - Un onglet final `Synthèse du plan` présente la vue tabulaire récapitulative des voyages (16 colonnes d'exploitation).
   - Si l'export est demandé pour un voyage individuel (`GET /api/export/excel?tripId=...`), seule la fiche JMP du voyage concerné est générée.

2. **Traduction intégrale en français :**
   - Toutes les mentions en arabe du modèle d'origine sont traduites en français : consignes de sécurité, métadonnées du voyage, en-têtes de tableau, contrôles télématiques et blocs de visa.

3. **Données calculées vs saisie manuelle :**
   - **Données pré-remplies (calculs & géocodage) :**
     * Date, chauffeur, matricule camion, destination et volume.
     * Nombre de clients (`[ X ] Un seul client`, etc.) compté sur les **Ship To Name distincts**
       du voyage — plusieurs clients = même `Vehicle Id`, même chauffeur, Ship To différents — et
       **un client par ligne** au Tableau 3 (ville et volume propres à chaque Ship To).
     * Tableau 4 en horaires uniquement : départ, fin de trajet (`etaStation`), arrivée au lieu de
       chargement (`etaReturnPlant`) puis sortie du lieu de chargement (arrivée + `loadingMinutes`
       + `adminMinutes`) ; les deux derniers restent vides si `includeReturn` est faux.
     * Détection de nuitée ou conduite de nuit (`Oui [ X ]` ou `Non [ X ]`).
     * Alertes et anomalies dans le bloc Observations.
     * `Points noirs` et `Zones interdites` rapprochés du classeur de sûreté ; le poste
       `Produits & Quantités` du tableau d'itinéraire a été supprimé sur demande du management.
     * `Points de repos autorisés` ventilés en **aller** et **retour** : le sens est lu dans la
       colonne arabe « المسار وعلاقته بالاتجاه » (الذهاب / الإياب) et les aires sans sens
       précisé dans le classeur figurent dans les deux colonnes.
   - **Champs laissés vides pour remplissage manuel / réel sur le terrain :**
     * Colonne `Réel` (horaires réels relevés sur le terrain).
     * Compteurs kilométriques départ et arrivée.
     * Créneaux ETA / fin de déchargement des clients au-delà du premier (une seule arrivée calculée).
     * Pointages des infractions télématiques GPS (plus de `NON` pré-rempli, la cellule est vide).
     * Visas et signature du chauffeur.


