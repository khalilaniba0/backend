# Architecture Backend - Talentia ATS (Express + MongoDB)

Mise a jour: 2026-04-05

## Objectif

Ce document liste les fichiers backend importants, leur role, et ou ils sont utilises.
Perimetre: `backend/` (code source maintenable, pas `node_modules/`).

## Fichiers racine backend/

- `backend/package.json` : dependances Node (Express, Mongoose, JWT, Google APIs, multer) et scripts `start`/`dev`.
- `backend/package-lock.json` : verrouillage des versions npm.
- `backend/app.js` : point d'entree serveur HTTP, montage middlewares globaux, montage routes, gestion erreurs, lancement DB.
- `backend/architecture.md` : cartographie backend (ce fichier).

## Configuration

- `backend/config/db.js` : connexion MongoDB via `mongoose.connect(process.env.url_db)`.
  Utilise par: `backend/app.js`.

## Routes (couche HTTP)

- `backend/routes/utilisateur.route.js` : endpoints users/auth RH-admin (`/getAllUsers`, `/createRh`, `/login`, etc.).
  Utilise par: `backend/app.js` sous `/user`.
  Depend de: `controllers/utilisateur.controller`, `middlewares/authMiddleware`, `requireAdmin`, `requireTenant`, `logMiddlewares`.
- `backend/routes/offreEmploi.route.js` : endpoints offres (`/getAllOffres`, `/createOffre`, `/updateOffreStatus/:id`, etc.).
  Utilise par: `backend/app.js` sous `/offre`.
  Depend de: `controllers/offreEmploi.controller`, `middlewares/authMiddleware`, `requireTenant`.
- `backend/routes/candidature.route.js` : endpoints candidatures cote candidat et cote RH/admin.
  Utilise par: `backend/app.js` sous `/candidature`.
  Depend de: `controllers/candidature.controller`, `middlewares/authMiddleware`, `requireTenant`, `requireCandidat`, `uploadfile`.
- `backend/routes/entretien.route.js` : endpoints entretiens (`/getAllEntretiens`, CRUD entretien).
  Utilise par: `backend/app.js` sous `/entretien`.
  Depend de: `controllers/entretien.controller`, `middlewares/authMiddleware`, `requireTenant`.
- `backend/routes/entreprise.route.js` : endpoints entreprise (`register`, `getMyEntreprise`, `updateEntreprise`, `deleteEntreprise`).
  Utilise par: `backend/app.js` sous `/entreprise`.
  Depend de: `controllers/entreprise.controller`, `middlewares/authMiddleware`, `requireAdmin`, `requireTenant`, `uploadLogo`.
- `backend/routes/candidat.route.js` : auth/profil candidat (`inscrire`, `connecter`, `monProfil`, `mettreAJourProfil`).
  Utilise par: `backend/app.js` sous `/candidat`.
  Depend de: `controllers/candidat.controller`, `middlewares/requireCandidat`, `uploadfile`.
- `backend/routes/google.route.js` : OAuth Google Calendar (demarrage OAuth + callback).
  Routes:
    - `GET /auth/google` [protege par `requireAuth`] : lance la redirection vers Google.
    - `GET /auth/google/callback` [public] : recupere `code`/`state`, sauvegarde les tokens OAuth sur l'utilisateur, puis redirige frontend.
  Utilise par: `backend/app.js` sous `/`.
  Depend de: `middlewares/authMiddleware`, `models/utilisateur.model`, `utils/googleCalendar`.

## Controllers (logique metier)

- `backend/controllers/utilisateur.controller.js` : gestion utilisateurs RH/admin (CRUD user, change password, login/logout, normalisation payload API).
  Utilise par: `backend/routes/utilisateur.route.js`.
  Depend de: `models/utilisateur.model`, `jsonwebtoken`, `bcrypt`.
- `backend/controllers/entreprise.controller.js` : creation entreprise + admin initial, lecture/mise a jour/suppression entreprise (avec cascade sur users/offres/candidatures/entretiens).
  Utilise par: `backend/routes/entreprise.route.js`.
  Depend de: `models/entreprise.model`, `utilisateur.model`, `offreEmploi.model`, `candidature.model`, `entretien.model`.
- `backend/controllers/offreEmploi.controller.js` : CRUD offres, filtres, statut open/closed, suppression cascade des candidatures liees.
  Utilise par: `backend/routes/offreEmploi.route.js`.
  Depend de: `models/offreEmploi.model`, `models/candidature.model`, `controllers/candidature.controller` (fonction `supprimerCandidaturesParOffre`).
- `backend/controllers/candidature.controller.js` : postuler/annuler/modifier cote candidat, lecture cote RH, transitions d'etapes, creation entretien lie.
  Utilise par: `backend/routes/candidature.route.js` et indirectement `offreEmploi.controller.js`.
  Depend de: `models/candidature.model`, `offreEmploi.model`, `candidat.model`, `entretien.model`, `utilisateur.model`, `utils/googleCalendar`.
- `backend/controllers/entretien.controller.js` : CRUD entretiens, detection conflits, synchronisation Google Calendar (create/update/delete event), rollback etape candidature si suppression entretien.
  Utilise par: `backend/routes/entretien.route.js`.
  Depend de: `models/entretien.model`, `candidature.model`, `utilisateur.model`, `utils/googleCalendar`.
- `backend/controllers/candidat.controller.js` : inscription/connexion/deconnexion candidat, profil candidat, upload/maj CV.
  Utilise par: `backend/routes/candidat.route.js`.
  Depend de: `models/candidat.model`, `jsonwebtoken`, `fs`, `path`.

## Models (Mongoose)

- `backend/models/utilisateur.model.js` : schema user RH/admin, hash password, login with lock after failed attempts, aliases API (`name`, `password`, `block`, etc.).
  Utilise par: `controllers/utilisateur.controller`, `controllers/entreprise.controller`, `controllers/candidature.controller`, `controllers/entretien.controller`, `middlewares/authMiddleware`, `routes/google.route`.
- `backend/models/entreprise.model.js` : schema entreprise (nom, email, logo, plan, isActive).
  Utilise par: `controllers/entreprise.controller`, `models/utilisateur.model`, `models/offreEmploi.model`, `models/candidature.model`, `models/entretien.model`.
- `backend/models/offreEmploi.model.js` : schema offre, aliases (`post`, `status`, `requirements`), contrat/mode/niveau.
  Utilise par: `controllers/offreEmploi.controller`, `controllers/entreprise.controller`, `controllers/candidature.controller`.
- `backend/models/candidature.model.js` : schema candidature + etapes pipeline + aliases (`lettre_motivation`, `score_ia`, `date_entretien`, `type_entretien`).
  Utilise par: `controllers/candidature.controller`, `controllers/offreEmploi.controller`, `controllers/entreprise.controller`, `controllers/entretien.controller`.
- `backend/models/entretien.model.js` : schema entretien, details evaluation, aliases snake_case/camelCase, lien Google event.
  Utilise par: `controllers/entretien.controller`, `controllers/candidature.controller`, `controllers/entreprise.controller`.
- `backend/models/candidat.model.js` : schema candidat, hash password, verification mot de passe.
  Utilise par: `controllers/candidat.controller`, `controllers/candidature.controller`.

## Middlewares

- `backend/middlewares/authMiddleware.js` : auth JWT RH/admin via cookie `jwt`, hydrate `req.utilisateur`, `req.entrepriseId`, `req.user` (compat).
  Utilise par: routes `utilisateur`, `offreEmploi`, `candidature` (RH), `entretien`, `entreprise`, `google`.
- `backend/middlewares/requireAdmin.js` : bloque acces si role != `admin`.
  Utilise par: `routes/utilisateur.route.js`, `routes/entreprise.route.js`.
- `backend/middlewares/requireTenant.js` : exige `entrepriseId` (depuis token ou user courant).
  Utilise par: la majorite des endpoints RH/admin multi-tenant.
- `backend/middlewares/requireCandidat.js` : auth JWT candidat via cookie `jwt_candidat`, hydrate `req.candidatId`.
  Utilise par: `routes/candidat.route.js`, `routes/candidature.route.js`.
- `backend/middlewares/uploadfile.js` : upload CV via multer vers `public/cv` avec gestion anti-collision de nom.
  Utilise par: `routes/candidat.route.js`, `routes/candidature.route.js`.
- `backend/middlewares/uploadLogo.js` : upload logo entreprise vers `public/logo`, filtre mime-type image + limite taille.
  Utilise par: `routes/entreprise.route.js`.
- `backend/middlewares/logMiddlewares.js` : log detaille requete/reponse dans `logs/doc.log`.
  Utilise par: `routes/utilisateur.route.js` (certaines routes).

## Utils

- `backend/utils/googleCalendar.js` : OAuth URL + create/update/delete Google Calendar events (avec conference Meet pour visio).
  Utilise par: `controllers/candidature.controller`, `controllers/entretien.controller`, `routes/google.route.js`.
- `backend/utils/iaScoringClient.js` : client HTTP vers le service IA (`/api/process-job`, `/api/match-cv`) pour reformulation d'offre et scoring CV.
  Contrat d'integration detaille: `backend/docs/integration-ia.md`.

## Dossiers runtime et support

- `backend/public/cv/` : stockage CV uploades.
  Utilise par: `middlewares/uploadfile.js`.
- `backend/public/logo/` : stockage logos entreprise.
  Utilise par: `middlewares/uploadLogo.js`.
- `backend/logs/doc.log` : fichier de logs applicatifs (si middleware de log actif).
  Alimente par: `middlewares/logMiddlewares.js`.
- `backend/tests/smoke-multitenant.http` : scenarios smoke API multi-tenant.
- `backend/scripts/` : dossier present mais vide actuellement.

## Flux techniques cles

- Flux auth RH/admin:
  `routes/utilisateur.route.js` -> `controllers/utilisateur.controller.login` -> cookie `jwt` -> `middlewares/authMiddleware` sur routes protegees.
- Flux candidature candidat:
  `routes/candidature.route.js` (`requireCandidat`, `uploadfile`) -> `controllers/candidature.controller.postuler` -> `models/candidature.model`.
- Flux transition vers entretien:
  `controllers/candidature.controller.updateCandidatureEtape` -> creation/maj `models/entretien.model` -> sync Google via `utils/googleCalendar`.

## Exemple demande (trace explicite)

- `backend/routes/candidature.route.js` consomme les fonctions de `backend/controllers/candidature.controller.js`.
- Ce controller utilise `createCalendarEvent` depuis `backend/utils/googleCalendar.js` pour synchroniser les entretiens avec Google Calendar.
