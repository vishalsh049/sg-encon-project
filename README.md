# SG ENCON – Project Overview

This repo contains a React frontend and a Node/Express + MySQL backend. The goal of this file is to make the structure and responsibilities easy to follow at a glance.

## Structure

- `frontend/` – React (Vite) app
  - `src/pages/` – screen-level pages (Dashboard, Login, UploadReports, AddData)
  - `src/components/` – reusable UI parts (Sidebar, etc.)
  - `src/layout/` – layout wrappers (DashboardLayout)
  - `src/lib/` – shared helpers (API base URL builder)
- `backend/` – Express API + MySQL
  - `server.js` – app entry, env loading, middleware, route mounts
  - `config/db.js` – MySQL connection
  - `routes/` – API endpoints grouped by feature
  - `models/` – DB models/helpers
  - `seed.js` – seed script

## Local Dev

Backend:
1. Create `backend/.env.development` with your local DB settings.
2. Run:
```
cd backend
$env:NODE_ENV="development"
npm start
```

Frontend:
1. Create `frontend/.env.development` with:
```
VITE_API_BASE_URL=http://localhost:5000
```
2. Run:
```
cd frontend
npm run dev
```

## API Flow

- Frontend calls `buildApiUrl(...)` from `frontend/src/lib/api.js`
- Filters send `circle`, `cmp`, `domain` as comma-separated values
- Backend builds dynamic `WHERE IN (...)` queries in `backend/routes/dashboardRoutes.js`

## Notes

- Filters are multi-select with summary display; CMP depends on Circle.
- Menu portal for react-select is used to avoid clipping (z-index configured in selectStyles).

