# Grain of Sand · Frontend

Babylon.js + React + Vite прототип будущего 3D-шутера. Рендер идёт в браузере, а мобильные билды собираются через Capacitor, поэтому UI и движок переиспользуют одну кодовую базу.

## Основные фичи

- React 19 + Vite 7 + TypeScript.
- Babylon.js (core/gui/loaders) подготавливает арену, камеру и базовую систему эффектов.
- Socket.io Client уже подключается к `VITE_MULTIPLAYER_URL`, поэтому фронт можно сразу связать с бэкендом.
- Capacitor CLI включён в toolchain → `npm run mobile:*` синхронизирует веб-бандл с Android/iOS оболочками.

## Скрипты

| Команда | Назначение |
| ------- | ---------- |
| `npm run dev` | локальный дев‑сервер на Vite |
| `npm run build` | production сборка + проверка типов |
| `npm run preview` | предпросмотр production бандла |
| `npm run mobile:sync` | синхронизация ресурсов в проекты Capacitor |
| `npm run mobile:android` / `npm run mobile:ios` | открыть соответствующую IDE (Android Studio / Xcode) |

## Настройка окружения

1. Скопируйте `.env.example` → `.env.local` и задайте URL сокет‑сервера.
2. Соберите фронт: `npm install && npm run dev`.
3. Для мобильных обёрток установите Android Studio / Xcode и выполните:

```bash
npm run build
npx cap add android
npx cap add ios
npm run mobile:sync
```

После этого проекты появятся в `frontend/android` и `frontend/ios`, их можно запускать на девайсах или эмуляторе.
