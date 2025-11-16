# WebSocket Server

Real-time WebSocket gateway for the MEAN Blog Platform. Handles comment streams, typing indicators, and notifications.

## Scripts

- `npm start` – run production server
- `npm run dev` – run development server with nodemon

## Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and configure MongoDB (read-only), Redis, RabbitMQ, and JWT secret.

## Docker

```bash
docker build -t websocket-server .
docker run --env-file .env -p 3001:3001 websocket-server
```
