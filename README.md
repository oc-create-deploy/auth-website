# Auth Website

Simple email/password authentication app using:

- React + Bootstrap frontend
- Node.js + Express backend
- MySQL database
- Slotopol slot engine container plus a Node.js slot settlement service
- Docker Compose for all services

## Run With Docker

```bash
docker compose up --build
```

Then open:

- Frontend: http://localhost:5173
- Backend health: http://localhost:3000/health
- Slot service health: http://localhost:3100/health
- Slotopol health: http://localhost:8080/ping

## Casino Module

Logged-in users can deposit demo funds, then spin the `Lucky Dollar` slot panel from the same page. The slot settlement service accepts the same `Authorization: Bearer <token>` header as the main API and debits or credits the shared MySQL user balance inside a transaction.

The Slotopol server runs in its own container and is checked by the slot service through `SLOTOPOL_URL`. The current UI uses a compact 3x3 slot panel and stores spin history in `slot_spins`.

## Development

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Environment

The compose file sets development defaults. Change these before using the app outside local development:

- `MYSQL_ROOT_PASSWORD`
- `MYSQL_PASSWORD`
- `JWT_SECRET`
