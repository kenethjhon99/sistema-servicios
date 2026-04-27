# Migraciones de base de datos

Esquema SQL versionado del sistema `servicio_mantenimiento`.

## Convención

- Cada cambio al schema vive en un archivo `NNNN_descripcion.sql`.
- Se aplican en orden lexicográfico (`0001_…`, `0002_…`, `0010_…`).
- Cada archivo se ejecuta dentro de **una transacción**: si algo falla, no queda nada aplicado a medias.
- El runner registra cada versión aplicada en la tabla `schema_migrations`.

## Comandos

Desde `backend/`, con `.env` apuntando a la BD destino:

```bash
npm run db:status     # qué está aplicado y qué falta
npm run db:migrate    # aplica las pendientes
```

Ejemplo de salida:

```
📋 Estado de migraciones:

  ✅ aplicada  0001_initial_schema.sql
  ⏳ pendiente 0002_indices_recomendados.sql

Total: 2 · Pendientes: 1
```

## Crear una migración nueva

1. Crear archivo `NNNN_que_hace.sql` (incrementar el número).
2. Escribir SQL idempotente cuando sea posible (`IF NOT EXISTS`, `DROP IF EXISTS`).
3. Probar localmente: `npm run db:migrate`.
4. Commit del archivo. **Nunca editar una migración ya aplicada**: crear una nueva.

## Estado actual

| # | Archivo | Qué hace |
|---|---|---|
| 0001 | `0001_initial_schema.sql` | Schema base — 22 tablas, 22 PKs, 72 FKs, 29 índices. Generado del backup `bd/copiabd.sql` (16.12) |
| 0002 | `0002_indices_recomendados.sql` | Índices adicionales para queries de filtros frecuentes (estado, rol, tipo, metodo_pago, fechas, índice compuesto auditoría) |

## Aplicar a una BD ya existente

Si tu BD ya tiene el schema (porque partiste del backup), antes de correr `npm run db:migrate` por primera vez, marca la 0001 como aplicada para que no intente recrear las tablas:

```sql
INSERT INTO schema_migrations (version) VALUES ('0001_initial_schema.sql');
```

Luego ejecuta `npm run db:migrate` y aplicará sólo la 0002 en adelante.

## Mapa del schema por dominio

```
auth         · usuarios
catálogos    · categorias_servicio · servicios · insumos
clientes     · clientes · propiedades
operación    · programaciones_servicio · ordenes_trabajo
              · ordenes_trabajo_detalle · evidencias_orden
rrhh         · cuadrillas · empleados · ordenes_empleados
financiero   · cotizaciones · cotizaciones_detalle
              · pagos · creditos · pagos_credito
inventario   · movimientos_insumo · ordenes_insumos
sistema      · alertas · auditoria_eventos
```

## Relaciones clave (FKs principales)

```
clientes ─┬─< propiedades
          ├─< programaciones_servicio
          ├─< ordenes_trabajo
          ├─< cotizaciones
          ├─< creditos
          └─< pagos

propiedades ─┬─< programaciones_servicio
             ├─< ordenes_trabajo
             └─< cotizaciones

ordenes_trabajo ─┬─< ordenes_trabajo_detalle  (CASCADE)
                 ├─< evidencias_orden          (CASCADE)
                 ├─< ordenes_empleados         (UNIQUE orden+empleado)
                 ├─< ordenes_insumos
                 ├─< pagos                     (opcional)
                 └─< creditos

categorias_servicio ─< servicios
servicios ─< programaciones_servicio
servicios ─< ordenes_trabajo_detalle

cuadrillas ─< empleados
cuadrillas ─< ordenes_trabajo

creditos ─< pagos_credito >─ pagos

usuarios ─< auditoria_eventos.realizado_por
usuarios ─< todas las tablas vía created_by/updated_by (ON DELETE SET NULL)
```

## Estados (ENUM por CHECK constraint)

| Tabla | Columna | Valores |
|---|---|---|
| usuarios | rol | ADMIN, SUPERVISOR, OPERADOR, COBRADOR |
| usuarios | estado | ACTIVO, INACTIVO |
| clientes | estado | ACTIVO, INACTIVO |
| clientes | tipo_cliente | HABITUAL, NO_HABITUAL |
| propiedades | estado | ACTIVA, INACTIVA |
| propiedades | tipo_propiedad | CASA, RESIDENCIAL, TERRENO, COMERCIO, BODEGA, OFICINA, OTRA |
| categorias_servicio | estado | ACTIVA, INACTIVA |
| servicios | estado | ACTIVO, INACTIVO |
| programaciones_servicio | estado | ACTIVA, PAUSADA, FINALIZADA, CANCELADA |
| programaciones_servicio | frecuencia | UNICA, SEMANAL, QUINCENAL, MENSUAL |
| programaciones_servicio | prioridad | BAJA, MEDIA, ALTA, URGENTE |
| ordenes_trabajo | estado | PENDIENTE, PROGRAMADA, EN_PROCESO, COMPLETADA, REPROGRAMADA, CANCELADA |
| ordenes_trabajo | tipo_visita | PROGRAMADA, EXTRA, URGENTE |
| ordenes_trabajo | origen | MANUAL, PROGRAMACION, COTIZACION |
| ordenes_trabajo_detalle | estado | PENDIENTE, EN_PROCESO, COMPLETADO, CANCELADO |
| pagos | metodo_pago | EFECTIVO, TRANSFERENCIA, DEPOSITO, TARJETA, OTRO |
| creditos | estado | PENDIENTE, PARCIAL, PAGADO, VENCIDO, CANCELADO |
| auditoria_eventos | accion | CREAR, ACTUALIZAR, CAMBIAR_ESTADO, CANCELAR, LOGIN, RESET_PASSWORD, PAGO, ABONO |
| alertas | tipo_alerta | SERVICIO_HOY, SERVICIO_MANANA, SERVICIO_ATRASADO, PAGO_HOY, PAGO_MANANA, PAGO_VENCIDO |
| alertas | modulo_origen | PROGRAMACION, ORDEN, PAGO, CREDITO |
