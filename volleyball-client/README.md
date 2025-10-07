# Volleyball Signup

Interactive volleyball training signup with Firebase Auth and Firestore.

## Quick start

1. Copy `.env.example` to `.env` and set real Firebase values (or use demo mode).
2. Install dependencies:

```bash
npm install
```

3. Run in demo mode with Firebase Emulator:

- Requires Firebase CLI installed locally (`npm i -g firebase-tools`).
- In one terminal:
```bash
firebase emulators:start --project demo-volleyball
```
- In another terminal:
```bash
npm run dev:demo
```

4. Or run against real Firebase:
```bash
npm run dev
```

Open http://localhost:5173

## Notes
- Live session is stored at `state/currentSession` document.
- Previous sessions saved in `sessions` collection.
- User stats are under `users/{uid}.stats`.
