# Deploy Backend · Render + Neon

## Preparado en este repo

Este backend ya quedó listo con:

- soporte para `DATABASE_URL`
- `render.yaml`
- migraciones automáticas con `preDeployCommand`
- health check en `/healthz`
- CORS con wildcard simple para previews tipo Vercel

## Variables para Render

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
PGSSL=true
JWT_SECRET=un_secreto_largo_y_aleatorio
JWT_EXPIRES_IN=8h
CORS_ORIGINS=https://tu-frontend.vercel.app,https://tu-frontend-git-*.vercel.app
RATE_LIMIT_LOGIN_MAX=10
RATE_LIMIT_LOGIN_WINDOW_MIN=15
```

## Comandos

- Build: `npm ci`
- Pre-Deploy: `npm run db:migrate`
- Start: `npm start`

## Validación

- URL pública del backend
- `GET /healthz`
- login desde el frontend publicado
