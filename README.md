# Backend · Sistema de Gestión de Servicios de Jardinería y Mantenimiento

Backend API para administrar clientes, propiedades, servicios, programaciones, órdenes de trabajo, evidencias, pagos, créditos, alertas, agenda y control de usuarios por roles.

---

## Descripción

Este proyecto fue diseñado para empresas que brindan servicios recurrentes y no recurrentes, como:

- jardinería
- poda
- limpieza
- mantenimiento general
- fumigación
- reparaciones menores
- otros servicios de propiedad

El sistema permite operar bajo una lógica flexible basada en servicios, no limitada únicamente a jardinería.

---

## Objetivo

Centralizar la gestión operativa y financiera del negocio, permitiendo controlar:

- clientes y múltiples propiedades por cliente
- servicios y categorías personalizables
- programaciones recurrentes
- órdenes de trabajo con múltiples servicios por visita
- evidencias fotográficas antes, después y generales
- pagos y créditos
- alertas y agenda
- usuarios con autenticación y roles

---

## Stack tecnológico

- **Node.js**
- **Express**
- **PostgreSQL**
- **JWT**
- **bcrypt**
- **dotenv**
- **pg**

---

## Arquitectura general

La lógica principal del sistema es:

**Cliente → Propiedad → Servicio → Programación → Orden de trabajo → Evidencias → Pago/Crédito → Alertas**

---

## Estructura sugerida del proyecto

```bash
src/
  config/
    db.js
  controllers/
  routes/
  middlewares/
    auth.middleware.js
  utils/
    jwt.js
  app.js
  index.js
```

---

## Base de datos

### Tablas principales

#### Seguridad
- `usuarios`

#### Catálogo
- `categorias_servicio`
- `servicios`

#### Clientes
- `clientes`
- `propiedades`

#### Operación
- `cuadrillas`
- `empleados`
- `programaciones_servicio`
- `ordenes_trabajo`
- `ordenes_trabajo_detalle`
- `ordenes_empleados`
- `evidencias_orden`

#### Financiero
- `pagos`
- `creditos`
- `pagos_credito`

#### Gestión y soporte
- `alertas`
- `cotizaciones`
- `cotizaciones_detalle`
- `insumos`
- `movimientos_insumo`
- `ordenes_insumos`

---

## Reglas funcionales clave

### Clientes y propiedades
- Un cliente puede tener **una o muchas propiedades**.
- Cada propiedad pertenece a **un solo cliente**.
- Las propiedades pueden almacenar:
  - dirección
  - referencia
  - contacto que recibe
  - teléfono de contacto
  - latitud
  - longitud
  - link de mapa

### Servicios
- El usuario final puede crear sus propias categorías y servicios.
- El `precio_base` del servicio es **opcional** y solo referencial.
- El precio real se define en:
  - programación
  - cotización
  - detalle de orden

### Programaciones
- Una programación representa un servicio recurrente o puntual.
- Frecuencias válidas:
  - `UNICA`
  - `SEMANAL`
  - `QUINCENAL`
  - `MENSUAL`

### Órdenes de trabajo
- Una orden representa una **visita**.
- Una orden puede tener **múltiples servicios** mediante `ordenes_trabajo_detalle`.
- Cada detalle puede tener:
  - cantidad
  - precio unitario
  - descripción del precio
  - subtotal
  - duración
  - estado
  - observaciones

### Evidencias
- Una orden puede tener muchas evidencias.
- Tipos soportados:
  - `ANTES`
  - `DESPUES`
  - `GENERAL`

### Créditos
- Una orden puede pagarse al contado o a crédito.
- Un crédito puede recibir múltiples abonos.
- El estado del crédito se recalcula automáticamente.

---

## Autenticación y roles

### Autenticación
- Login con `username` y `password`
- Contraseñas encriptadas con `bcrypt`
- Token JWT con middleware `authRequired`

### Roles definidos
- `ADMIN`
- `SUPERVISOR`
- `OPERADOR`
- `COBRADOR`

### Uso recomendado de roles

#### ADMIN
Acceso total al sistema.

#### SUPERVISOR
Gestión operativa:
- clientes
- propiedades
- servicios
- programaciones
- órdenes
- evidencias
- agenda
- alertas

#### OPERADOR
Operación de campo:
- ver agenda
- ver clientes y propiedades
- crear/editar órdenes
- subir evidencias

#### COBRADOR
Gestión financiera:
- registrar pagos
- aplicar abonos
- ver créditos
- consultar resúmenes financieros

---

## Endpoints principales

### Auth
- `POST /api/auth/login`
- `GET /api/auth/perfil`
- `POST /api/auth/register`

### Usuarios
- `GET /api/usuarios`
- `GET /api/usuarios/:id`
- `POST /api/usuarios`
- `PUT /api/usuarios/:id`
- `PATCH /api/usuarios/:id/estado`
- `PATCH /api/usuarios/mi/password`
- `PATCH /api/usuarios/:id/reset-password`

### Categorías
- `POST /api/categorias-servicio`
- `GET /api/categorias-servicio`
- `GET /api/categorias-servicio/:id`
- `PUT /api/categorias-servicio/:id`
- `PATCH /api/categorias-servicio/:id/estado`

### Servicios
- `POST /api/servicios`
- `GET /api/servicios`
- `GET /api/servicios/:id`
- `PUT /api/servicios/:id`
- `PATCH /api/servicios/:id/estado`

### Clientes
- `POST /api/clientes`
- `GET /api/clientes`
- `GET /api/clientes/:id`
- `PUT /api/clientes/:id`
- `PATCH /api/clientes/:id/estado`

### Propiedades
- `POST /api/propiedades`
- `GET /api/propiedades`
- `GET /api/propiedades/cliente/:id_cliente`
- `GET /api/propiedades/:id`
- `PUT /api/propiedades/:id`
- `PATCH /api/propiedades/:id/estado`

### Programaciones
- `POST /api/programaciones`
- `GET /api/programaciones`
- `GET /api/programaciones/:id`
- `PUT /api/programaciones/:id`
- `PATCH /api/programaciones/:id/estado`

### Órdenes de trabajo
- `POST /api/ordenes-trabajo`
- `GET /api/ordenes-trabajo`
- `GET /api/ordenes-trabajo/:id`
- `PUT /api/ordenes-trabajo/:id`
- `PATCH /api/ordenes-trabajo/:id/estado`

### Evidencias
- `POST /api/evidencias`
- `POST /api/evidencias/lote`
- `GET /api/evidencias/orden/:id_orden_trabajo`
- `GET /api/evidencias/:id`
- `PUT /api/evidencias/:id`
- `DELETE /api/evidencias/:id`

### Pagos y créditos
- `POST /api/pagos`
- `GET /api/pagos`
- `GET /api/pagos/:id`
- `POST /api/pagos/creditos`
- `GET /api/pagos/creditos/lista`
- `GET /api/pagos/creditos/:id`
- `PATCH /api/pagos/creditos/:id/estado`
- `POST /api/pagos/creditos/aplicar-pago`

### Alertas
- `POST /api/alertas/generar`
- `GET /api/alertas`
- `PATCH /api/alertas/:id/leida`
- `PATCH /api/alertas/marcar-todas/leidas`
- `DELETE /api/alertas/:id`

### Dashboard / Agenda / Resúmenes
- `GET /api/alertas/dashboard/base`
- `GET /api/resumenes/orden/:id_orden_trabajo`
- `GET /api/resumenes/cliente/:id_cliente`
- `GET /api/agenda/dia`
- `GET /api/agenda/rango`
- `GET /api/agenda/mensual`
- `GET /api/agenda/creditos/vencimientos`

---

## Variables de entorno

Crea un archivo `.env` con algo como esto:

```env
PORT=3000

PGHOST=localhost
PGPORT=5432
PGDATABASE=sistema_servicios
PGUSER=postgres
PGPASSWORD=tu_password
PGSSL=false

JWT_SECRET=tu_clave_super_secreta_larga
JWT_EXPIRES_IN=8h
```

---

## Instalación

```bash
npm install
```

### Dependencias necesarias

```bash
npm install express pg dotenv bcrypt jsonwebtoken
```

### Dependencia recomendada para desarrollo

```bash
npm install -D nodemon
```

---

## Ejecución

### Desarrollo

```bash
npm run dev
```

### Producción

```bash
npm start
```

Ejemplo de scripts en `package.json`:

```json
{
  "scripts": {
    "dev": "nodemon src/index.js",
    "start": "node src/index.js"
  }
}
```

---

## Configuración de conexión a base de datos

Archivo sugerido: `src/config/db.js`

```js
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});
```

---

## Seguridad

### Contraseñas
- se almacenan en hash con `bcrypt`
- nunca se devuelve `password_hash`

### JWT
- autenticación con token Bearer
- validación mediante middleware

### Estado del usuario
- si el usuario está `INACTIVO`, no puede operar en el sistema

### Control por rol
- restricciones con middleware `requireRole(...)`

---

## Validaciones críticas del backend

### Clientes / propiedades
- la propiedad debe pertenecer al cliente seleccionado

### Programaciones
- cliente activo
- propiedad activa
- propiedad pertenece al cliente
- servicio activo
- cuadrilla activa si aplica

### Órdenes
- cliente válido
- propiedad válida
- propiedad pertenece al cliente
- cada detalle debe tener un servicio válido
- si el detalle usa programación, debe coincidir con cliente, propiedad y servicio

### Pagos
- la orden debe pertenecer al cliente indicado

### Créditos
- no permitir sobrepago
- recalcular saldo automáticamente
- recalcular estado automáticamente

---

## Flujo de operación recomendado

1. crear categorías
2. crear servicios
3. crear cliente
4. crear propiedades del cliente
5. crear programaciones
6. generar orden de trabajo
7. agregar detalles de servicios
8. subir evidencias
9. registrar pago o crear crédito
10. aplicar abonos si hay crédito
11. generar alertas
12. consultar agenda, dashboard y resúmenes

---

## Ejemplo de protección de rutas

```js
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";

router.post("/", authRequired, requireRole("ADMIN", "SUPERVISOR"), crearServicio);
router.get("/", authRequired, listarServicios);
```

---

## Estado actual del backend

Este backend ya cubre:

- autenticación y roles
- gestión de usuarios
- catálogo de servicios
- clientes y propiedades
- programaciones
- órdenes con múltiples servicios
- evidencias
- pagos y créditos
- alertas
- dashboard base
- agenda
- resúmenes financieros y de cliente

---

## Mejoras futuras sugeridas

- integración real con mapas
- carga real de archivos con `multer` + storage externo
- reportes administrativos
- auditoría de acciones
- cotizaciones
- inventario operativo
- calendario visual en frontend
- refresh tokens
- logs de seguridad

---

## Recomendaciones para producción

- usar variables de entorno seguras
- no exponer `JWT_SECRET`
- usar HTTPS
- validar inputs en todos los endpoints
- implementar rate limiting
- separar entorno de desarrollo y producción
- usar almacenamiento externo para evidencias si el proyecto crece

---

## Autor / proyecto

Backend diseñado para un sistema comercial de servicios de jardinería y mantenimiento, orientado a escalabilidad y trabajo modular.
#   s i s t e m a - s e r v i c i o s  
 