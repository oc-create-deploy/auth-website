# Auth Website

Simple email/password authentication app using:

- React + Bootstrap frontend
- Node.js + Express backend
- MySQL database
- Docker Compose for all services

## Run With Docker

```bash
docker compose up --build
```

Then open:

- Frontend: http://localhost:5173
- Backend health: http://localhost:3000/health

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

