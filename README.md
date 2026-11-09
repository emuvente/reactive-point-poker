# reactive-point-poker

Planning poker on Firebase Realtime Database, built with Vite, deployed to Firebase Hosting.

## Prerequisites

- Node via nvm: `nvm install`
- Java 11+ for the Realtime Database emulator
- `.firebaserc` (gitignored) pointing at the real project, for `deploy:rules`

## Scripts

- `npm run dev`: Auth and Database emulators plus Vite dev server on a demo project. Emulator UI at http://localhost:4000.
- `npm run build`: production build to `dist`
- `npm run preview`: serve `dist`
- `npm run lint`: ESLint
- `npm run check:rules`: load `database.rules.json` into the Database emulator; fails on invalid rules
- `npm run deploy:rules`: run `check:rules`, then deploy `database.rules.json` to the real project

## Config

- `.env.development` holds demo-project values used by `npm run dev`. Override with a gitignored `.env.local` to run against the real project.
- GitHub secrets for the hosting workflow: `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_DATABASE_URL`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_APP_ID`, plus the service account secret created by `firebase init hosting:github`. The repository variable `FIREBASE_SERVICE_ACCOUNT_SECRET` holds that secret's name.

## Deploy

- Hosting: push to master. GitHub Actions lints, builds and deploys to the live channel.
- Database rules: `npm run deploy:rules` from a local checkout after changing `database.rules.json`. CI does not deploy rules.
