# Grain of Sand

Monorepo с двумя сервисами для будущего мультиплеерного 3D-шутера:

- `frontend/` — React + Babylon.js клиент, который рендерится в браузере и может быть собран в Android/iOS приложения через Capacitor.
- `backend/` — Fastify + Socket.io сервер, рассылающий состояние сессии.

## Быстрый старт

```bash
# Frontend
cd frontend
npm install
cp .env.example .env.local
npm run dev

# Backend
cd backend
npm install
cp .env.example .env.local
npm run dev
```

Клиент по умолчанию подключается к `http://localhost:4000` (см. `frontend/.env.example`). Сервер разрешает `http://localhost:5173` как origin, но список можно расширить в `backend/.env.local`.

## Мобильные билды

После готовой веб‑сборки (`npm run build` в `frontend/`) добавьте платформы:

```bash
cd frontend
npx cap add android
npx cap add ios
npm run mobile:sync
```

Это сгенерирует проекты в `frontend/android` и `frontend/ios`, которые можно открывать в Android Studio / Xcode, собирать и публиковать.
