# Backend · Sistema de Gestión de Servicios

Backend API para administrar clientes, propiedades, servicios, programaciones, órdenes de trabajo, evidencias, pagos, créditos, alertas, agenda, auditoría y control de usuarios por roles.

Diseñado para empresas que prestan servicios recurrentes y no recurrentes (jardinería, poda, limpieza, fumigación, mantenimiento general, reparaciones menores), bajo una lógica flexible basada en servicios — no limitada a una vertical específica.

---

## Stack

- **Node.js** (ESM, type: module)
- **Express 5** + **helmet** + **cors** + **morgan** + **express-rate-limit**
- **PostgreSQL** vía **pg** (Pool)
- **JWT** + **bcrypt** para autenticación
- **Vitest** + **supertest** para tests (130 tests)
- Migraciones SQL versionadas con runner Node propio

---

## Setup rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno
cp .env.example .env
# Editar .env: PG*, JWT_SECRET (mín 16 chars)

# 3. Aplicar schema (sólo si la BD está vacía)
npm run db:migrate

# 4. Iniciar
npm run dev
```

---

## Variables de entorno

Ver `.env.example`. Todas las variables marcadas como obligatorias son validadas al arrancar — el proceso aborta con un mensaje claro si falta alguna o si `JWT_SECRET` tiene menos de 16 caracteres.

| Variable | Default | Notas |
|---|---|---|
| `NODE_ENV` | `development` | `production` activa morgan en formato `combined` |
| `PORT` | `3000` | |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | — | obligatorias |
| `JWT_SECRET` | — | obligatoria, mín 16 chars |
| `JWT_EXPIRES_IN` | `8h` | |
| `CORS_ORIGINS` | `*` | lista separada por comas, o `*` para abrir todo (sólo dev) |
| `RATE_LIMIT_LOGIN_MAX` | `10` | intentos antes de bloquear |
| `RATE_LIMIT_LOGIN_WINDOW_MIN` | `15` | ventana en minutos |

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con auto-reload (`nodemon`) |
| `npm start` | Servidor producción |
| `npm test` | Suite de tests (130, en `~5s`) |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:coverage` | Coverage HTML en `coverage/` |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:status` | Lista migraciones aplicadas vs pendientes |

---

## Estructura

```
backend/
├── migrations/                 ← schema versionado (ver migrations/README.md)
│   ├── 0001_initial_schema.sql
│   ├── 0002_indices_recomendados.sql
│   └── README.md
├── src/
│   ├── app.js                  ← Express app: helmet, CORS, rate limit, parsers, 404, error handler
│   ├── server.js               ← bootstrap + graceful shutdown (SIGTERM/SIGINT)
│   ├── config/
│   │   ├── env.js              ← validación fail-fast de env vars
│   │   └── db.js               ← pg.Pool
│   ├── controllers/            ← lógica HTTP + SQL por dominio
│   ├── routes/                 ← express.Router por módulo + index.routes.js
│   ├── middlewares/
│   │   ├── auth.middleware.js  ← authRequired + requireRole
│   │   ├── rateLimit.middleware.js  ← loginRateLimiter, apiRateLimiter
│   │   └── validators.middleware.js ← validateIdParam, parsePagination
│   ├── utils/
│   │   ├── jwt.js              ← createToken / verifyToken
│   │   ├── password.js         ← validarPassword (≥8 chars, letra+número)
│   │   ├── auditoria.js        ← registrarAuditoria
│   │   └── response.js
│   └── db/
│       └── migrate.js          ← runner de migraciones
└── tests/
    ├── setup.js                ← env vars de test
    ├── helpers/
    │   ├── auth.js             ← makeUsuario, primeAuth, tokenFor
    │   └── poolMock.js
    ├── unit/                   ← password, jwt, validators, requireRole
    └── integration/            ← app, auth, usuarios, ordenes, pagos
```

---

## Contrato de respuestas API

Estandarizado en Fase 2:

```
GET    /resource             → { data: [...], pagination: { page, limit, total, total_pages } }
GET    /resource/:id         → objeto recurso directo
POST   /resource             → objeto recurso recién creado
PUT    /resource/:id         → objeto recurso actualizado
PATCH  /resource/:id/...     → objeto recurso actualizado
```

**Excepciones documentadas:**

| Endpoint | Forma | Por qué |
|---|---|---|
| `POST /auth/login` | `{ mensaje, token, usuario }` | dos recursos |
| `GET /auth/perfil` | `{ usuario }` | legacy, frontend lo usa así |
| `PATCH /usuarios/mi/password` | `{ mensaje }` | sin recurso a devolver |
| `PATCH /usuarios/:id/reset-password` | `{ mensaje }` | idem |
| `POST /alertas/generar` | `{ mensaje, resumen: {...} }` | bulk operation |
| `PATCH /alertas/marcar-todas-leidas` | `{ mensaje, cantidad }` | bulk operation |

Todos los errores siguen `{ error: string }` con código HTTP semántico.

---

## Roles

| Rol | Permisos clave |
|---|---|
| **ADMIN** | Acceso total, gestión de usuarios, reset de passwords, cancelar créditos |
| **SUPERVISOR** | Catálogos, clientes, propiedades, programaciones, crear/cambiar estado órdenes, crear créditos |
| **OPERADOR** | Crear órdenes, subir evidencias |
| **COBRADOR** | Registrar pagos, aplicar abonos a créditos |

Aplicado vía `requireRole(...rolesPermitidos)` por ruta. Aislamiento verificado en tests.

---

## Endpoints principales

### Auth
- `POST /api/auth/login` *(rate-limited: 10 intentos / 15 min)*
- `GET /api/auth/perfil`

### Usuarios *(ADMIN)*
- `GET    /api/usuarios`
- `GET    /api/usuarios/:id`
- `POST   /api/usuarios`
- `PUT    /api/usuarios/:id`
- `PATCH  /api/usuarios/:id/estado`
- `PATCH  /api/usuarios/mi/password` *(self-service)*
- `PATCH  /api/usuarios/:id/reset-password`

### Catálogos
- `/api/categorias-servicio`  (GET/POST/PUT/PATCH)
- `/api/servicios`            (GET/POST/PUT/PATCH)

### Negocio
- `/api/clientes`             (GET/POST/PUT/PATCH)
- `/api/propiedades`          + `/cliente/:id_cliente`
- `/api/programaciones`
- `/api/ordenes`              ⚠️ **path es `/ordenes`, no `/ordenes-trabajo`**
- `/api/evidencias`           (incluye `POST /lote`)

### Financiero
- `/api/pagos`
- `/api/pagos/creditos`       + `/lista`, `/aplicar-pago`, `/:id/estado`

### Sistema
- `/api/auditoria`            (filtros + paginación)
- `/api/alertas`              + `/generar`, `/dashboard/base`
- `/api/resumenes/cliente/:id` · `/resumenes/orden/:id`
- `/api/agenda/dia` · `/rango` · `/mensual` · `/creditos/vencimientos`

---

## Seguridad

| Capa | Implementación |
|---|---|
| Headers HTTP | `helmet()` con defaults |
| CORS | Whitelist desde `CORS_ORIGINS` (o `*` en dev) |
| Rate limit | Login 10/15min · API general 600/15min |
| Auth | JWT Bearer + `bcrypt(10)` para passwords |
| Roles | Middleware `requireRole(...)` por ruta |
| Inputs | `validateIdParam` evita SQL errors por IDs no numéricos |
| Password policy | mín 8 chars, al menos 1 letra y 1 número |
| Auditoría | Toda acción mutativa registra evento (`tabla`, `id`, `accion`, `valores_anteriores`, `valores_nuevos`, `realizado_por`) |
| Body limit | 2MB por defecto |
| SQL | Siempre parametrizado con `$1, $2, ...` — nunca string concat |
| Transacciones | Operaciones multi-tabla usan `pool.connect()` + `BEGIN/COMMIT/ROLLBACK` |
| Graceful shutdown | SIGTERM/SIGINT cierran HTTP + pool en orden |

---

## Validaciones de negocio críticas

- **Cliente↔Propiedad**: la propiedad debe pertenecer al cliente.
- **Programación↔Orden**: si un detalle referencia una programación, debe coincidir cliente+propiedad+servicio.
- **Cliente inactivo**: bloquea creación de orden / pago / crédito.
- **Crédito**: rechaza pago si está PAGADO/CANCELADO o si el monto excede el saldo. Recalcula saldo y estado en cada abono. Auditoría dual `PAGO` + `ABONO`.
- **Orden cancelada**: requiere `motivo_cancelacion`.
- **Auto-inactivación**: un ADMIN no puede inactivar su propio usuario.

---

## Tests

```
backend/
└── tests/
    ├── unit/                   ← validarPassword, jwt, validators, requireRole
    │   └── (40 tests)
    └── integration/            ← supertest contra app.js con pool mockeado
        ├── app.test.js         ← health, 404, JSON inválido, helmet
        ├── auth.test.js        ← login + perfil + roles + JWT
        ├── usuarios.test.js    ← CRUD + password policy E2E
        ├── ordenes.test.js     ← transacción completa, ROLLBACK, cambio estado
        └── pagos.test.js       ← pagos, créditos, abonos parciales/totales
```

**130 tests · ~5s · cobertura de utilidades 100%, controllers críticos 40-83%.**

---

## Migraciones de BD

Ver `migrations/README.md` para detalles. Resumen:

```bash
npm run db:status       # qué está aplicado
npm run db:migrate      # aplicar pendientes
```

Cada archivo `NNNN_descripcion.sql` se ejecuta en una transacción y se registra en `schema_migrations`.

**Si tu BD ya tiene el schema** (ej: viene de un backup), antes de la primera corrida marca la 0001 como aplicada para no recrear las tablas:

```sql
INSERT INTO schema_migrations (version) VALUES ('0001_initial_schema.sql');
```

---

## Próximas mejoras sugeridas

- Capa de servicios/repositorios (separar SQL de controllers).
- Validación de inputs centralizada con `zod`.
- Refresh tokens + cookies httpOnly (en vez de localStorage).
- OpenAPI/Swagger autogenerado.
- Logger estructurado (`pino`) con request-id.
- Carga real de evidencias con `multer` + storage externo (S3/R2).
