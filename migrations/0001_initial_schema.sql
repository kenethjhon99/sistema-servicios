-- =============================================================================
-- 0001_initial_schema.sql
-- Migración inicial — schema completo del sistema servicio_mantenimiento.
-- Generado a partir del backup pg_dump (16.12) tomado el 2026-04-26.
-- 22 tablas, 22 PKs, 72 FKs, 29 índices, 1 trigger.
--
-- Dominios:
--   - auth:        usuarios
--   - catálogos:   categorias_servicio, servicios, insumos
--   - clientes:    clientes, propiedades
--   - operación:   programaciones_servicio, ordenes_trabajo,
--                  ordenes_trabajo_detalle, evidencias_orden
--   - rrhh:        cuadrillas, empleados, ordenes_empleados
--   - financiero:  cotizaciones, cotizaciones_detalle, pagos, creditos,
--                  pagos_credito
--   - inventario:  movimientos_insumo, ordenes_insumos
--   - sistema:     alertas, auditoria_eventos
-- =============================================================================


--
-- Name: alertas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alertas (
    id_alerta bigint NOT NULL,
    tipo_alerta character varying(30) NOT NULL,
    titulo character varying(150) NOT NULL,
    mensaje text NOT NULL,
    modulo_origen character varying(30) NOT NULL,
    id_referencia bigint,
    fecha_alerta date DEFAULT CURRENT_DATE NOT NULL,
    leida boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    CONSTRAINT alertas_modulo_origen_check CHECK (((modulo_origen)::text = ANY ((ARRAY['PROGRAMACION'::character varying, 'ORDEN'::character varying, 'PAGO'::character varying, 'CREDITO'::character varying])::text[]))),
    CONSTRAINT alertas_tipo_alerta_check CHECK (((tipo_alerta)::text = ANY ((ARRAY['SERVICIO_HOY'::character varying, 'SERVICIO_MANANA'::character varying, 'SERVICIO_ATRASADO'::character varying, 'PAGO_HOY'::character varying, 'PAGO_MANANA'::character varying, 'PAGO_VENCIDO'::character varying])::text[])))
);


--
-- Name: alertas_id_alerta_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alertas_id_alerta_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alertas_id_alerta_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alertas_id_alerta_seq OWNED BY public.alertas.id_alerta;


--
-- Name: auditoria_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria_eventos (
    id_auditoria bigint NOT NULL,
    tabla_afectada character varying(100) NOT NULL,
    id_registro bigint NOT NULL,
    accion character varying(30) NOT NULL,
    descripcion text,
    valores_anteriores jsonb,
    valores_nuevos jsonb,
    realizado_por bigint,
    fecha_evento timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auditoria_eventos_accion_check CHECK (((accion)::text = ANY ((ARRAY['CREAR'::character varying, 'ACTUALIZAR'::character varying, 'CAMBIAR_ESTADO'::character varying, 'CANCELAR'::character varying, 'LOGIN'::character varying, 'RESET_PASSWORD'::character varying, 'PAGO'::character varying, 'ABONO'::character varying])::text[])))
);


--
-- Name: auditoria_eventos_id_auditoria_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auditoria_eventos_id_auditoria_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria_eventos_id_auditoria_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auditoria_eventos_id_auditoria_seq OWNED BY public.auditoria_eventos.id_auditoria;


--
-- Name: categorias_servicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias_servicio (
    id_categoria_servicio bigint NOT NULL,
    nombre character varying(80) NOT NULL,
    descripcion text,
    estado character varying(20) DEFAULT 'ACTIVA'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    CONSTRAINT categorias_servicio_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVA'::character varying, 'INACTIVA'::character varying])::text[])))
);


--
-- Name: categorias_servicio_id_categoria_servicio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categorias_servicio_id_categoria_servicio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categorias_servicio_id_categoria_servicio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categorias_servicio_id_categoria_servicio_seq OWNED BY public.categorias_servicio.id_categoria_servicio;


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id_cliente bigint NOT NULL,
    codigo_cliente character varying(30),
    nombre_completo character varying(150) NOT NULL,
    nombre_empresa character varying(150),
    telefono character varying(30),
    telefono_secundario character varying(30),
    correo character varying(150),
    nit character varying(30),
    dpi character varying(30),
    direccion_principal text,
    tipo_cliente character varying(20) DEFAULT 'HABITUAL'::character varying NOT NULL,
    estado character varying(20) DEFAULT 'ACTIVO'::character varying NOT NULL,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    CONSTRAINT clientes_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVO'::character varying, 'INACTIVO'::character varying])::text[]))),
    CONSTRAINT clientes_tipo_cliente_check CHECK (((tipo_cliente)::text = ANY ((ARRAY['HABITUAL'::character varying, 'NO_HABITUAL'::character varying])::text[])))
);


--
-- Name: clientes_id_cliente_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clientes_id_cliente_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clientes_id_cliente_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clientes_id_cliente_seq OWNED BY public.clientes.id_cliente;


--
-- Name: cotizaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizaciones (
    id_cotizacion bigint NOT NULL,
    numero_cotizacion character varying(30) NOT NULL,
    id_cliente bigint NOT NULL,
    id_propiedad bigint,
    fecha_cotizacion date DEFAULT CURRENT_DATE NOT NULL,
    vigencia_hasta date,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    descuento numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    estado character varying(20) DEFAULT 'BORRADOR'::character varying NOT NULL,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    cancelado_por bigint,
    cancelado_en timestamp with time zone,
    CONSTRAINT cotizaciones_descuento_check CHECK ((descuento >= (0)::numeric)),
    CONSTRAINT cotizaciones_estado_check CHECK (((estado)::text = ANY ((ARRAY['BORRADOR'::character varying, 'ENVIADA'::character varying, 'APROBADA'::character varying, 'RECHAZADA'::character varying, 'VENCIDA'::character varying, 'CONVERTIDA'::character varying])::text[]))),
    CONSTRAINT cotizaciones_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT cotizaciones_total_check CHECK ((total >= (0)::numeric))
);


--
-- Name: cotizaciones_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizaciones_detalle (
    id_cotizacion_detalle bigint NOT NULL,
    id_cotizacion bigint NOT NULL,
    id_servicio bigint,
    descripcion text NOT NULL,
    cantidad numeric(12,2) DEFAULT 1 NOT NULL,
    precio_unitario numeric(12,2) DEFAULT 0 NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    descripcion_precio text,
    created_by bigint,
    updated_by bigint,
    CONSTRAINT cotizaciones_detalle_cantidad_check CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT cotizaciones_detalle_precio_unitario_check CHECK ((precio_unitario >= (0)::numeric)),
    CONSTRAINT cotizaciones_detalle_subtotal_check CHECK ((subtotal >= (0)::numeric))
);


--
-- Name: cotizaciones_detalle_id_cotizacion_detalle_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cotizaciones_detalle_id_cotizacion_detalle_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cotizaciones_detalle_id_cotizacion_detalle_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cotizaciones_detalle_id_cotizacion_detalle_seq OWNED BY public.cotizaciones_detalle.id_cotizacion_detalle;


--
-- Name: cotizaciones_id_cotizacion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cotizaciones_id_cotizacion_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cotizaciones_id_cotizacion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cotizaciones_id_cotizacion_seq OWNED BY public.cotizaciones.id_cotizacion;


--
-- Name: creditos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creditos (
    id_credito bigint NOT NULL,
    id_cliente bigint NOT NULL,
    id_orden_trabajo bigint NOT NULL,
    monto_total numeric(12,2) NOT NULL,
    monto_pagado numeric(12,2) DEFAULT 0 NOT NULL,
    saldo_pendiente numeric(12,2) NOT NULL,
    dias_credito integer DEFAULT 0 NOT NULL,
    fecha_inicio_credito date DEFAULT CURRENT_DATE NOT NULL,
    fecha_vencimiento date NOT NULL,
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    cancelado_por bigint,
    cancelado_en timestamp with time zone,
    CONSTRAINT creditos_dias_credito_check CHECK ((dias_credito >= 0)),
    CONSTRAINT creditos_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'PARCIAL'::character varying, 'PAGADO'::character varying, 'VENCIDO'::character varying, 'CANCELADO'::character varying])::text[]))),
    CONSTRAINT creditos_monto_pagado_check CHECK ((monto_pagado >= (0)::numeric)),
    CONSTRAINT creditos_monto_total_check CHECK ((monto_total >= (0)::numeric)),
    CONSTRAINT creditos_saldo_pendiente_check CHECK ((saldo_pendiente >= (0)::numeric))
);


--
-- Name: creditos_id_credito_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.creditos_id_credito_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creditos_id_credito_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.creditos_id_credito_seq OWNED BY public.creditos.id_credito;


--
-- Name: cuadrillas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cuadrillas (
    id_cuadrilla bigint NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    estado character varying(20) DEFAULT 'ACTIVA'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    CONSTRAINT cuadrillas_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVA'::character varying, 'INACTIVA'::character varying])::text[])))
);


--
-- Name: cuadrillas_id_cuadrilla_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cuadrillas_id_cuadrilla_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cuadrillas_id_cuadrilla_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cuadrillas_id_cuadrilla_seq OWNED BY public.cuadrillas.id_cuadrilla;


--
-- Name: empleados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empleados (
    id_empleado bigint NOT NULL,
    id_cuadrilla bigint,
    nombre_completo character varying(150) NOT NULL,
    telefono character varying(30),
    correo character varying(150),
    especialidad character varying(100),
    puesto character varying(80),
    estado character varying(20) DEFAULT 'ACTIVO'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    CONSTRAINT empleados_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVO'::character varying, 'INACTIVO'::character varying])::text[])))
);


--
-- Name: empleados_id_empleado_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empleados_id_empleado_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empleados_id_empleado_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empleados_id_empleado_seq OWNED BY public.empleados.id_empleado;


--
-- Name: evidencias_orden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidencias_orden (
    id_evidencia bigint NOT NULL,
    id_orden_trabajo bigint NOT NULL,
    tipo_evidencia character varying(20) NOT NULL,
    archivo_url text NOT NULL,
    nombre_archivo character varying(255),
    tipo_archivo character varying(50),
    tamano_archivo bigint,
    descripcion text,
    orden_visual integer DEFAULT 1 NOT NULL,
    subido_por bigint,
    fecha_evidencia timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    estado character varying(20) DEFAULT 'ACTIVA'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by bigint,
    CONSTRAINT evidencias_orden_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVA'::character varying, 'INACTIVA'::character varying])::text[]))),
    CONSTRAINT evidencias_orden_tipo_evidencia_check CHECK (((tipo_evidencia)::text = ANY ((ARRAY['ANTES'::character varying, 'DESPUES'::character varying, 'GENERAL'::character varying])::text[])))
);


--
-- Name: evidencias_orden_id_evidencia_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evidencias_orden_id_evidencia_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evidencias_orden_id_evidencia_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evidencias_orden_id_evidencia_seq OWNED BY public.evidencias_orden.id_evidencia;


--
-- Name: insumos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insumos (
    id_insumo bigint NOT NULL,
    nombre character varying(120) NOT NULL,
    descripcion text,
    unidad_medida character varying(30) NOT NULL,
    stock_actual numeric(12,2) DEFAULT 0 NOT NULL,
    stock_minimo numeric(12,2) DEFAULT 0 NOT NULL,
    costo_referencia numeric(12,2) DEFAULT 0 NOT NULL,
    estado character varying(20) DEFAULT 'ACTIVO'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    CONSTRAINT insumos_costo_referencia_check CHECK ((costo_referencia >= (0)::numeric)),
    CONSTRAINT insumos_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVO'::character varying, 'INACTIVO'::character varying])::text[]))),
    CONSTRAINT insumos_stock_actual_check CHECK ((stock_actual >= (0)::numeric)),
    CONSTRAINT insumos_stock_minimo_check CHECK ((stock_minimo >= (0)::numeric))
);


--
-- Name: insumos_id_insumo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.insumos_id_insumo_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: insumos_id_insumo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.insumos_id_insumo_seq OWNED BY public.insumos.id_insumo;


--
-- Name: movimientos_insumo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_insumo (
    id_movimiento_insumo bigint NOT NULL,
    id_insumo bigint NOT NULL,
    tipo_movimiento character varying(20) NOT NULL,
    cantidad numeric(12,2) NOT NULL,
    referencia character varying(120),
    observaciones text,
    fecha_movimiento timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    CONSTRAINT movimientos_insumo_cantidad_check CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT movimientos_insumo_tipo_movimiento_check CHECK (((tipo_movimiento)::text = ANY ((ARRAY['ENTRADA'::character varying, 'SALIDA'::character varying, 'AJUSTE'::character varying])::text[])))
);


--
-- Name: movimientos_insumo_id_movimiento_insumo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.movimientos_insumo_id_movimiento_insumo_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: movimientos_insumo_id_movimiento_insumo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.movimientos_insumo_id_movimiento_insumo_seq OWNED BY public.movimientos_insumo.id_movimiento_insumo;


--
-- Name: ordenes_empleados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordenes_empleados (
    id_orden_empleado bigint NOT NULL,
    id_orden_trabajo bigint NOT NULL,
    id_empleado bigint NOT NULL,
    rol_en_servicio character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ordenes_empleados_id_orden_empleado_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ordenes_empleados_id_orden_empleado_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ordenes_empleados_id_orden_empleado_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ordenes_empleados_id_orden_empleado_seq OWNED BY public.ordenes_empleados.id_orden_empleado;


--
-- Name: ordenes_insumos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordenes_insumos (
    id_orden_insumo bigint NOT NULL,
    id_orden_trabajo bigint NOT NULL,
    id_insumo bigint NOT NULL,
    cantidad_usada numeric(12,2) NOT NULL,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    CONSTRAINT ordenes_insumos_cantidad_usada_check CHECK ((cantidad_usada > (0)::numeric))
);


--
-- Name: ordenes_insumos_id_orden_insumo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ordenes_insumos_id_orden_insumo_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ordenes_insumos_id_orden_insumo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ordenes_insumos_id_orden_insumo_seq OWNED BY public.ordenes_insumos.id_orden_insumo;


--
-- Name: ordenes_trabajo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordenes_trabajo (
    id_orden_trabajo bigint NOT NULL,
    numero_orden character varying(30) NOT NULL,
    id_cliente bigint NOT NULL,
    id_propiedad bigint NOT NULL,
    id_cuadrilla bigint,
    fecha_servicio date NOT NULL,
    tipo_visita character varying(20) DEFAULT 'PROGRAMADA'::character varying NOT NULL,
    origen character varying(20) DEFAULT 'MANUAL'::character varying NOT NULL,
    hora_inicio_programada time without time zone,
    hora_inicio_real time without time zone,
    hora_fin_real time without time zone,
    duracion_real_min integer,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    descuento numeric(12,2) DEFAULT 0 NOT NULL,
    total_orden numeric(12,2) DEFAULT 0 NOT NULL,
    costo_estimado numeric(12,2),
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    motivo_cancelacion text,
    observaciones_previas text,
    observaciones_finales text,
    confirmado_por_cliente boolean DEFAULT false NOT NULL,
    nombre_recibe character varying(120),
    firma_cliente_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    cancelado_por bigint,
    cancelado_en timestamp with time zone,
    CONSTRAINT ordenes_trabajo_costo_estimado_check CHECK ((costo_estimado >= (0)::numeric)),
    CONSTRAINT ordenes_trabajo_descuento_check CHECK ((descuento >= (0)::numeric)),
    CONSTRAINT ordenes_trabajo_duracion_real_min_check CHECK ((duracion_real_min >= 0)),
    CONSTRAINT ordenes_trabajo_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'PROGRAMADA'::character varying, 'EN_PROCESO'::character varying, 'COMPLETADA'::character varying, 'REPROGRAMADA'::character varying, 'CANCELADA'::character varying])::text[]))),
    CONSTRAINT ordenes_trabajo_origen_check CHECK (((origen)::text = ANY ((ARRAY['MANUAL'::character varying, 'PROGRAMACION'::character varying, 'COTIZACION'::character varying])::text[]))),
    CONSTRAINT ordenes_trabajo_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT ordenes_trabajo_tipo_visita_check CHECK (((tipo_visita)::text = ANY ((ARRAY['PROGRAMADA'::character varying, 'EXTRA'::character varying, 'URGENTE'::character varying])::text[]))),
    CONSTRAINT ordenes_trabajo_total_orden_check CHECK ((total_orden >= (0)::numeric))
);


--
-- Name: ordenes_trabajo_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ordenes_trabajo_detalle (
    id_orden_detalle bigint NOT NULL,
    id_orden_trabajo bigint NOT NULL,
    id_servicio bigint NOT NULL,
    id_programacion bigint,
    descripcion_servicio text,
    cantidad numeric(12,2) DEFAULT 1 NOT NULL,
    precio_unitario numeric(12,2) DEFAULT 0 NOT NULL,
    descripcion_precio text,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    duracion_estimada_min integer,
    duracion_real_min integer,
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    cancelado_por bigint,
    cancelado_en timestamp with time zone,
    motivo_cancelacion text,
    CONSTRAINT ordenes_trabajo_detalle_cantidad_check CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT ordenes_trabajo_detalle_duracion_estimada_min_check CHECK ((duracion_estimada_min >= 0)),
    CONSTRAINT ordenes_trabajo_detalle_duracion_real_min_check CHECK ((duracion_real_min >= 0)),
    CONSTRAINT ordenes_trabajo_detalle_estado_check CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'EN_PROCESO'::character varying, 'COMPLETADO'::character varying, 'CANCELADO'::character varying])::text[]))),
    CONSTRAINT ordenes_trabajo_detalle_precio_unitario_check CHECK ((precio_unitario >= (0)::numeric)),
    CONSTRAINT ordenes_trabajo_detalle_subtotal_check CHECK ((subtotal >= (0)::numeric))
);


--
-- Name: ordenes_trabajo_detalle_id_orden_detalle_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ordenes_trabajo_detalle_id_orden_detalle_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ordenes_trabajo_detalle_id_orden_detalle_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ordenes_trabajo_detalle_id_orden_detalle_seq OWNED BY public.ordenes_trabajo_detalle.id_orden_detalle;


--
-- Name: ordenes_trabajo_id_orden_trabajo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ordenes_trabajo_id_orden_trabajo_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ordenes_trabajo_id_orden_trabajo_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ordenes_trabajo_id_orden_trabajo_seq OWNED BY public.ordenes_trabajo.id_orden_trabajo;


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    id_pago bigint NOT NULL,
    id_cliente bigint NOT NULL,
    id_orden_trabajo bigint,
    fecha_pago date DEFAULT CURRENT_DATE NOT NULL,
    metodo_pago character varying(20) NOT NULL,
    monto numeric(12,2) NOT NULL,
    referencia_pago character varying(120),
    observaciones text,
    registrado_por bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by bigint,
    estado character varying(20) DEFAULT 'ACTIVO'::character varying NOT NULL,
    anulado_por bigint,
    anulada_en timestamp with time zone,
    motivo_anulacion text,
    CONSTRAINT pagos_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVO'::character varying, 'INACTIVO'::character varying, 'ANULADO'::character varying])::text[]))),
    CONSTRAINT pagos_metodo_pago_check CHECK (((metodo_pago)::text = ANY ((ARRAY['EFECTIVO'::character varying, 'TRANSFERENCIA'::character varying, 'DEPOSITO'::character varying, 'TARJETA'::character varying, 'OTRO'::character varying])::text[]))),
    CONSTRAINT pagos_monto_check CHECK ((monto > (0)::numeric))
);


--
-- Name: pagos_credito; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos_credito (
    id_pago_credito bigint NOT NULL,
    id_pago bigint NOT NULL,
    id_credito bigint NOT NULL,
    monto_aplicado numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    CONSTRAINT pagos_credito_monto_aplicado_check CHECK ((monto_aplicado > (0)::numeric))
);


--
-- Name: pagos_credito_id_pago_credito_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagos_credito_id_pago_credito_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagos_credito_id_pago_credito_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagos_credito_id_pago_credito_seq OWNED BY public.pagos_credito.id_pago_credito;


--
-- Name: pagos_id_pago_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagos_id_pago_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagos_id_pago_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagos_id_pago_seq OWNED BY public.pagos.id_pago;


--
-- Name: programaciones_servicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programaciones_servicio (
    id_programacion bigint NOT NULL,
    id_cliente bigint NOT NULL,
    id_propiedad bigint NOT NULL,
    id_servicio bigint NOT NULL,
    id_cuadrilla bigint,
    frecuencia character varying(20) NOT NULL,
    fecha_inicio date NOT NULL,
    hora_programada time without time zone,
    proxima_fecha date NOT NULL,
    duracion_estimada_min integer NOT NULL,
    precio_acordado numeric(12,2) DEFAULT 0 NOT NULL,
    descripcion_precio text,
    prioridad character varying(20) DEFAULT 'MEDIA'::character varying NOT NULL,
    estado character varying(20) DEFAULT 'ACTIVA'::character varying NOT NULL,
    motivo_cancelacion text,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    cancelado_por bigint,
    cancelado_en timestamp with time zone,
    CONSTRAINT programaciones_servicio_duracion_estimada_min_check CHECK ((duracion_estimada_min > 0)),
    CONSTRAINT programaciones_servicio_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVA'::character varying, 'PAUSADA'::character varying, 'FINALIZADA'::character varying, 'CANCELADA'::character varying])::text[]))),
    CONSTRAINT programaciones_servicio_frecuencia_check CHECK (((frecuencia)::text = ANY ((ARRAY['UNICA'::character varying, 'SEMANAL'::character varying, 'QUINCENAL'::character varying, 'MENSUAL'::character varying])::text[]))),
    CONSTRAINT programaciones_servicio_precio_acordado_check CHECK ((precio_acordado >= (0)::numeric)),
    CONSTRAINT programaciones_servicio_prioridad_check CHECK (((prioridad)::text = ANY ((ARRAY['BAJA'::character varying, 'MEDIA'::character varying, 'ALTA'::character varying, 'URGENTE'::character varying])::text[])))
);


--
-- Name: programaciones_servicio_id_programacion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.programaciones_servicio_id_programacion_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: programaciones_servicio_id_programacion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.programaciones_servicio_id_programacion_seq OWNED BY public.programaciones_servicio.id_programacion;


--
-- Name: propiedades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propiedades (
    id_propiedad bigint NOT NULL,
    id_cliente bigint NOT NULL,
    nombre_propiedad character varying(120) NOT NULL,
    tipo_propiedad character varying(30) NOT NULL,
    direccion text NOT NULL,
    referencia text,
    ubicacion_maps text,
    latitud numeric(10,8),
    longitud numeric(11,8),
    link_maps text,
    tamano_aproximado_m2 numeric(12,2),
    notas_acceso text,
    contacto_recibe character varying(120),
    telefono_contacto_recibe character varying(30),
    estado character varying(20) DEFAULT 'ACTIVA'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    CONSTRAINT propiedades_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVA'::character varying, 'INACTIVA'::character varying])::text[]))),
    CONSTRAINT propiedades_tipo_propiedad_check CHECK (((tipo_propiedad)::text = ANY ((ARRAY['CASA'::character varying, 'RESIDENCIAL'::character varying, 'TERRENO'::character varying, 'COMERCIO'::character varying, 'BODEGA'::character varying, 'OFICINA'::character varying, 'OTRA'::character varying])::text[])))
);


--
-- Name: propiedades_id_propiedad_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.propiedades_id_propiedad_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: propiedades_id_propiedad_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.propiedades_id_propiedad_seq OWNED BY public.propiedades.id_propiedad;


--
-- Name: servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicios (
    id_servicio bigint NOT NULL,
    id_categoria_servicio bigint NOT NULL,
    nombre character varying(120) NOT NULL,
    descripcion text,
    duracion_estimada_min integer DEFAULT 60 NOT NULL,
    precio_base numeric(12,2),
    requiere_materiales boolean DEFAULT false NOT NULL,
    permite_recurrencia boolean DEFAULT true NOT NULL,
    estado character varying(20) DEFAULT 'ACTIVO'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    CONSTRAINT servicios_duracion_estimada_min_check CHECK ((duracion_estimada_min > 0)),
    CONSTRAINT servicios_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVO'::character varying, 'INACTIVO'::character varying])::text[]))),
    CONSTRAINT servicios_precio_base_check CHECK ((precio_base >= (0)::numeric))
);


--
-- Name: servicios_id_servicio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.servicios_id_servicio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: servicios_id_servicio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.servicios_id_servicio_seq OWNED BY public.servicios.id_servicio;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id_usuario bigint NOT NULL,
    nombre character varying(120) NOT NULL,
    correo character varying(150),
    telefono character varying(30),
    username character varying(60) NOT NULL,
    password_hash text NOT NULL,
    rol character varying(30) NOT NULL,
    estado character varying(20) DEFAULT 'ACTIVO'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by bigint,
    updated_by bigint,
    CONSTRAINT usuarios_estado_check CHECK (((estado)::text = ANY ((ARRAY['ACTIVO'::character varying, 'INACTIVO'::character varying])::text[]))),
    CONSTRAINT usuarios_rol_check CHECK (((rol)::text = ANY ((ARRAY['ADMIN'::character varying, 'SUPERVISOR'::character varying, 'OPERADOR'::character varying, 'COBRADOR'::character varying])::text[])))
);


--
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_usuario_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_usuario_seq OWNED BY public.usuarios.id_usuario;


--
-- Name: alertas id_alerta; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas ALTER COLUMN id_alerta SET DEFAULT nextval('public.alertas_id_alerta_seq'::regclass);


--
-- Name: auditoria_eventos id_auditoria; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_eventos ALTER COLUMN id_auditoria SET DEFAULT nextval('public.auditoria_eventos_id_auditoria_seq'::regclass);


--
-- Name: categorias_servicio id_categoria_servicio; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_servicio ALTER COLUMN id_categoria_servicio SET DEFAULT nextval('public.categorias_servicio_id_categoria_servicio_seq'::regclass);


--
-- Name: clientes id_cliente; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes ALTER COLUMN id_cliente SET DEFAULT nextval('public.clientes_id_cliente_seq'::regclass);


--
-- Name: cotizaciones id_cotizacion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones ALTER COLUMN id_cotizacion SET DEFAULT nextval('public.cotizaciones_id_cotizacion_seq'::regclass);


--
-- Name: cotizaciones_detalle id_cotizacion_detalle; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_detalle ALTER COLUMN id_cotizacion_detalle SET DEFAULT nextval('public.cotizaciones_detalle_id_cotizacion_detalle_seq'::regclass);


--
-- Name: creditos id_credito; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos ALTER COLUMN id_credito SET DEFAULT nextval('public.creditos_id_credito_seq'::regclass);


--
-- Name: cuadrillas id_cuadrilla; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuadrillas ALTER COLUMN id_cuadrilla SET DEFAULT nextval('public.cuadrillas_id_cuadrilla_seq'::regclass);


--
-- Name: empleados id_empleado; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados ALTER COLUMN id_empleado SET DEFAULT nextval('public.empleados_id_empleado_seq'::regclass);


--
-- Name: evidencias_orden id_evidencia; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencias_orden ALTER COLUMN id_evidencia SET DEFAULT nextval('public.evidencias_orden_id_evidencia_seq'::regclass);


--
-- Name: insumos id_insumo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumos ALTER COLUMN id_insumo SET DEFAULT nextval('public.insumos_id_insumo_seq'::regclass);


--
-- Name: movimientos_insumo id_movimiento_insumo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_insumo ALTER COLUMN id_movimiento_insumo SET DEFAULT nextval('public.movimientos_insumo_id_movimiento_insumo_seq'::regclass);


--
-- Name: ordenes_empleados id_orden_empleado; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_empleados ALTER COLUMN id_orden_empleado SET DEFAULT nextval('public.ordenes_empleados_id_orden_empleado_seq'::regclass);


--
-- Name: ordenes_insumos id_orden_insumo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_insumos ALTER COLUMN id_orden_insumo SET DEFAULT nextval('public.ordenes_insumos_id_orden_insumo_seq'::regclass);


--
-- Name: ordenes_trabajo id_orden_trabajo; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo ALTER COLUMN id_orden_trabajo SET DEFAULT nextval('public.ordenes_trabajo_id_orden_trabajo_seq'::regclass);


--
-- Name: ordenes_trabajo_detalle id_orden_detalle; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo_detalle ALTER COLUMN id_orden_detalle SET DEFAULT nextval('public.ordenes_trabajo_detalle_id_orden_detalle_seq'::regclass);


--
-- Name: pagos id_pago; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos ALTER COLUMN id_pago SET DEFAULT nextval('public.pagos_id_pago_seq'::regclass);


--
-- Name: pagos_credito id_pago_credito; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_credito ALTER COLUMN id_pago_credito SET DEFAULT nextval('public.pagos_credito_id_pago_credito_seq'::regclass);


--
-- Name: programaciones_servicio id_programacion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_servicio ALTER COLUMN id_programacion SET DEFAULT nextval('public.programaciones_servicio_id_programacion_seq'::regclass);


--
-- Name: propiedades id_propiedad; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedades ALTER COLUMN id_propiedad SET DEFAULT nextval('public.propiedades_id_propiedad_seq'::regclass);


--
-- Name: servicios id_servicio; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios ALTER COLUMN id_servicio SET DEFAULT nextval('public.servicios_id_servicio_seq'::regclass);


--
-- Name: usuarios id_usuario; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id_usuario SET DEFAULT nextval('public.usuarios_id_usuario_seq'::regclass);


--
-- Name: alertas alertas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas
    ADD CONSTRAINT alertas_pkey PRIMARY KEY (id_alerta);


--
-- Name: auditoria_eventos auditoria_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_eventos
    ADD CONSTRAINT auditoria_eventos_pkey PRIMARY KEY (id_auditoria);


--
-- Name: categorias_servicio categorias_servicio_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_servicio
    ADD CONSTRAINT categorias_servicio_nombre_key UNIQUE (nombre);


--
-- Name: categorias_servicio categorias_servicio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_servicio
    ADD CONSTRAINT categorias_servicio_pkey PRIMARY KEY (id_categoria_servicio);


--
-- Name: clientes clientes_codigo_cliente_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_codigo_cliente_key UNIQUE (codigo_cliente);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id_cliente);


--
-- Name: cotizaciones_detalle cotizaciones_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_detalle
    ADD CONSTRAINT cotizaciones_detalle_pkey PRIMARY KEY (id_cotizacion_detalle);


--
-- Name: cotizaciones cotizaciones_numero_cotizacion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_numero_cotizacion_key UNIQUE (numero_cotizacion);


--
-- Name: cotizaciones cotizaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_pkey PRIMARY KEY (id_cotizacion);


--
-- Name: creditos creditos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos
    ADD CONSTRAINT creditos_pkey PRIMARY KEY (id_credito);


--
-- Name: cuadrillas cuadrillas_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuadrillas
    ADD CONSTRAINT cuadrillas_nombre_key UNIQUE (nombre);


--
-- Name: cuadrillas cuadrillas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuadrillas
    ADD CONSTRAINT cuadrillas_pkey PRIMARY KEY (id_cuadrilla);


--
-- Name: empleados empleados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_pkey PRIMARY KEY (id_empleado);


--
-- Name: evidencias_orden evidencias_orden_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencias_orden
    ADD CONSTRAINT evidencias_orden_pkey PRIMARY KEY (id_evidencia);


--
-- Name: insumos insumos_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumos
    ADD CONSTRAINT insumos_nombre_key UNIQUE (nombre);


--
-- Name: insumos insumos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumos
    ADD CONSTRAINT insumos_pkey PRIMARY KEY (id_insumo);


--
-- Name: movimientos_insumo movimientos_insumo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_insumo
    ADD CONSTRAINT movimientos_insumo_pkey PRIMARY KEY (id_movimiento_insumo);


--
-- Name: ordenes_empleados ordenes_empleados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_empleados
    ADD CONSTRAINT ordenes_empleados_pkey PRIMARY KEY (id_orden_empleado);


--
-- Name: ordenes_insumos ordenes_insumos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_insumos
    ADD CONSTRAINT ordenes_insumos_pkey PRIMARY KEY (id_orden_insumo);


--
-- Name: ordenes_trabajo_detalle ordenes_trabajo_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo_detalle
    ADD CONSTRAINT ordenes_trabajo_detalle_pkey PRIMARY KEY (id_orden_detalle);


--
-- Name: ordenes_trabajo ordenes_trabajo_numero_orden_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo
    ADD CONSTRAINT ordenes_trabajo_numero_orden_key UNIQUE (numero_orden);


--
-- Name: ordenes_trabajo ordenes_trabajo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo
    ADD CONSTRAINT ordenes_trabajo_pkey PRIMARY KEY (id_orden_trabajo);


--
-- Name: pagos_credito pagos_credito_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_credito
    ADD CONSTRAINT pagos_credito_pkey PRIMARY KEY (id_pago_credito);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id_pago);


--
-- Name: programaciones_servicio programaciones_servicio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_servicio
    ADD CONSTRAINT programaciones_servicio_pkey PRIMARY KEY (id_programacion);


--
-- Name: propiedades propiedades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedades
    ADD CONSTRAINT propiedades_pkey PRIMARY KEY (id_propiedad);


--
-- Name: servicios servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_pkey PRIMARY KEY (id_servicio);


--
-- Name: ordenes_empleados uq_orden_empleado; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_empleados
    ADD CONSTRAINT uq_orden_empleado UNIQUE (id_orden_trabajo, id_empleado);


--
-- Name: servicios uq_servicio_categoria_nombre; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT uq_servicio_categoria_nombre UNIQUE (id_categoria_servicio, nombre);


--
-- Name: usuarios usuarios_correo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_correo_key UNIQUE (correo);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id_usuario);


--
-- Name: usuarios usuarios_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_username_key UNIQUE (username);


--
-- Name: idx_alertas_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alertas_fecha ON public.alertas USING btree (fecha_alerta);


--
-- Name: idx_alertas_leida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alertas_leida ON public.alertas USING btree (leida);


--
-- Name: idx_auditoria_accion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_accion ON public.auditoria_eventos USING btree (accion);


--
-- Name: idx_auditoria_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_fecha ON public.auditoria_eventos USING btree (fecha_evento);


--
-- Name: idx_auditoria_registro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_registro ON public.auditoria_eventos USING btree (id_registro);


--
-- Name: idx_auditoria_tabla; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_tabla ON public.auditoria_eventos USING btree (tabla_afectada);


--
-- Name: idx_auditoria_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_usuario ON public.auditoria_eventos USING btree (realizado_por);


--
-- Name: idx_creditos_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creditos_cliente ON public.creditos USING btree (id_cliente);


--
-- Name: idx_creditos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creditos_estado ON public.creditos USING btree (estado);


--
-- Name: idx_creditos_vencimiento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creditos_vencimiento ON public.creditos USING btree (fecha_vencimiento);


--
-- Name: idx_evidencias_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidencias_orden ON public.evidencias_orden USING btree (id_orden_trabajo);


--
-- Name: idx_evidencias_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidencias_tipo ON public.evidencias_orden USING btree (tipo_evidencia);


--
-- Name: idx_ordenes_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_cliente ON public.ordenes_trabajo USING btree (id_cliente);


--
-- Name: idx_ordenes_detalle_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_detalle_orden ON public.ordenes_trabajo_detalle USING btree (id_orden_trabajo);


--
-- Name: idx_ordenes_detalle_programacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_detalle_programacion ON public.ordenes_trabajo_detalle USING btree (id_programacion);


--
-- Name: idx_ordenes_detalle_servicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_detalle_servicio ON public.ordenes_trabajo_detalle USING btree (id_servicio);


--
-- Name: idx_ordenes_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_estado ON public.ordenes_trabajo USING btree (estado);


--
-- Name: idx_ordenes_fecha_servicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_fecha_servicio ON public.ordenes_trabajo USING btree (fecha_servicio);


--
-- Name: idx_ordenes_propiedad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ordenes_propiedad ON public.ordenes_trabajo USING btree (id_propiedad);


--
-- Name: idx_pagos_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_cliente ON public.pagos USING btree (id_cliente);


--
-- Name: idx_pagos_orden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_orden ON public.pagos USING btree (id_orden_trabajo);


--
-- Name: idx_programaciones_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_cliente ON public.programaciones_servicio USING btree (id_cliente);


--
-- Name: idx_programaciones_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_estado ON public.programaciones_servicio USING btree (estado);


--
-- Name: idx_programaciones_propiedad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_propiedad ON public.programaciones_servicio USING btree (id_propiedad);


--
-- Name: idx_programaciones_proxima_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_proxima_fecha ON public.programaciones_servicio USING btree (proxima_fecha);


--
-- Name: idx_programaciones_servicio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_servicio ON public.programaciones_servicio USING btree (id_servicio);


--
-- Name: idx_propiedades_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_propiedades_cliente ON public.propiedades USING btree (id_cliente);


--
-- Name: idx_propiedades_lat_lng; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_propiedades_lat_lng ON public.propiedades USING btree (latitud, longitud);


--
-- Name: idx_servicios_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicios_categoria ON public.servicios USING btree (id_categoria_servicio);


--
-- Name: alertas alertas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas
    ADD CONSTRAINT alertas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: auditoria_eventos auditoria_eventos_realizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_eventos
    ADD CONSTRAINT auditoria_eventos_realizado_por_fkey FOREIGN KEY (realizado_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: categorias_servicio categorias_servicio_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_servicio
    ADD CONSTRAINT categorias_servicio_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: categorias_servicio categorias_servicio_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias_servicio
    ADD CONSTRAINT categorias_servicio_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: clientes clientes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: clientes clientes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: cotizaciones cotizaciones_cancelado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: cotizaciones cotizaciones_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: cotizaciones_detalle cotizaciones_detalle_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_detalle
    ADD CONSTRAINT cotizaciones_detalle_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: cotizaciones_detalle cotizaciones_detalle_id_cotizacion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_detalle
    ADD CONSTRAINT cotizaciones_detalle_id_cotizacion_fkey FOREIGN KEY (id_cotizacion) REFERENCES public.cotizaciones(id_cotizacion) ON DELETE CASCADE;


--
-- Name: cotizaciones_detalle cotizaciones_detalle_id_servicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_detalle
    ADD CONSTRAINT cotizaciones_detalle_id_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicios(id_servicio);


--
-- Name: cotizaciones_detalle cotizaciones_detalle_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_detalle
    ADD CONSTRAINT cotizaciones_detalle_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: cotizaciones cotizaciones_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente);


--
-- Name: cotizaciones cotizaciones_id_propiedad_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_id_propiedad_fkey FOREIGN KEY (id_propiedad) REFERENCES public.propiedades(id_propiedad);


--
-- Name: cotizaciones cotizaciones_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: creditos creditos_cancelado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos
    ADD CONSTRAINT creditos_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: creditos creditos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos
    ADD CONSTRAINT creditos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: creditos creditos_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos
    ADD CONSTRAINT creditos_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente);


--
-- Name: creditos creditos_id_orden_trabajo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos
    ADD CONSTRAINT creditos_id_orden_trabajo_fkey FOREIGN KEY (id_orden_trabajo) REFERENCES public.ordenes_trabajo(id_orden_trabajo);


--
-- Name: creditos creditos_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creditos
    ADD CONSTRAINT creditos_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: cuadrillas cuadrillas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuadrillas
    ADD CONSTRAINT cuadrillas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: cuadrillas cuadrillas_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cuadrillas
    ADD CONSTRAINT cuadrillas_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: empleados empleados_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: empleados empleados_id_cuadrilla_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_id_cuadrilla_fkey FOREIGN KEY (id_cuadrilla) REFERENCES public.cuadrillas(id_cuadrilla);


--
-- Name: empleados empleados_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT empleados_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: evidencias_orden evidencias_orden_id_orden_trabajo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencias_orden
    ADD CONSTRAINT evidencias_orden_id_orden_trabajo_fkey FOREIGN KEY (id_orden_trabajo) REFERENCES public.ordenes_trabajo(id_orden_trabajo) ON DELETE CASCADE;


--
-- Name: evidencias_orden evidencias_orden_subido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencias_orden
    ADD CONSTRAINT evidencias_orden_subido_por_fkey FOREIGN KEY (subido_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: evidencias_orden evidencias_orden_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidencias_orden
    ADD CONSTRAINT evidencias_orden_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: insumos insumos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumos
    ADD CONSTRAINT insumos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: insumos insumos_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insumos
    ADD CONSTRAINT insumos_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: movimientos_insumo movimientos_insumo_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_insumo
    ADD CONSTRAINT movimientos_insumo_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: movimientos_insumo movimientos_insumo_id_insumo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_insumo
    ADD CONSTRAINT movimientos_insumo_id_insumo_fkey FOREIGN KEY (id_insumo) REFERENCES public.insumos(id_insumo);


--
-- Name: ordenes_empleados ordenes_empleados_id_empleado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_empleados
    ADD CONSTRAINT ordenes_empleados_id_empleado_fkey FOREIGN KEY (id_empleado) REFERENCES public.empleados(id_empleado);


--
-- Name: ordenes_empleados ordenes_empleados_id_orden_trabajo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_empleados
    ADD CONSTRAINT ordenes_empleados_id_orden_trabajo_fkey FOREIGN KEY (id_orden_trabajo) REFERENCES public.ordenes_trabajo(id_orden_trabajo) ON DELETE CASCADE;


--
-- Name: ordenes_insumos ordenes_insumos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_insumos
    ADD CONSTRAINT ordenes_insumos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: ordenes_insumos ordenes_insumos_id_insumo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_insumos
    ADD CONSTRAINT ordenes_insumos_id_insumo_fkey FOREIGN KEY (id_insumo) REFERENCES public.insumos(id_insumo);


--
-- Name: ordenes_insumos ordenes_insumos_id_orden_trabajo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_insumos
    ADD CONSTRAINT ordenes_insumos_id_orden_trabajo_fkey FOREIGN KEY (id_orden_trabajo) REFERENCES public.ordenes_trabajo(id_orden_trabajo) ON DELETE CASCADE;


--
-- Name: ordenes_trabajo ordenes_trabajo_cancelado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo
    ADD CONSTRAINT ordenes_trabajo_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo
    ADD CONSTRAINT ordenes_trabajo_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: ordenes_trabajo_detalle ordenes_trabajo_detalle_cancelado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo_detalle
    ADD CONSTRAINT ordenes_trabajo_detalle_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: ordenes_trabajo_detalle ordenes_trabajo_detalle_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo_detalle
    ADD CONSTRAINT ordenes_trabajo_detalle_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: ordenes_trabajo_detalle ordenes_trabajo_detalle_id_orden_trabajo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo_detalle
    ADD CONSTRAINT ordenes_trabajo_detalle_id_orden_trabajo_fkey FOREIGN KEY (id_orden_trabajo) REFERENCES public.ordenes_trabajo(id_orden_trabajo) ON DELETE CASCADE;


--
-- Name: ordenes_trabajo_detalle ordenes_trabajo_detalle_id_programacion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo_detalle
    ADD CONSTRAINT ordenes_trabajo_detalle_id_programacion_fkey FOREIGN KEY (id_programacion) REFERENCES public.programaciones_servicio(id_programacion);


--
-- Name: ordenes_trabajo_detalle ordenes_trabajo_detalle_id_servicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo_detalle
    ADD CONSTRAINT ordenes_trabajo_detalle_id_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicios(id_servicio);


--
-- Name: ordenes_trabajo_detalle ordenes_trabajo_detalle_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo_detalle
    ADD CONSTRAINT ordenes_trabajo_detalle_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo
    ADD CONSTRAINT ordenes_trabajo_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente);


--
-- Name: ordenes_trabajo ordenes_trabajo_id_cuadrilla_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo
    ADD CONSTRAINT ordenes_trabajo_id_cuadrilla_fkey FOREIGN KEY (id_cuadrilla) REFERENCES public.cuadrillas(id_cuadrilla);


--
-- Name: ordenes_trabajo ordenes_trabajo_id_propiedad_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo
    ADD CONSTRAINT ordenes_trabajo_id_propiedad_fkey FOREIGN KEY (id_propiedad) REFERENCES public.propiedades(id_propiedad);


--
-- Name: ordenes_trabajo ordenes_trabajo_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ordenes_trabajo
    ADD CONSTRAINT ordenes_trabajo_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: pagos pagos_anulado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_anulado_por_fkey FOREIGN KEY (anulado_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: pagos_credito pagos_credito_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_credito
    ADD CONSTRAINT pagos_credito_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: pagos_credito pagos_credito_id_credito_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_credito
    ADD CONSTRAINT pagos_credito_id_credito_fkey FOREIGN KEY (id_credito) REFERENCES public.creditos(id_credito) ON DELETE CASCADE;


--
-- Name: pagos_credito pagos_credito_id_pago_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_credito
    ADD CONSTRAINT pagos_credito_id_pago_fkey FOREIGN KEY (id_pago) REFERENCES public.pagos(id_pago) ON DELETE CASCADE;


--
-- Name: pagos pagos_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente);


--
-- Name: pagos pagos_id_orden_trabajo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_id_orden_trabajo_fkey FOREIGN KEY (id_orden_trabajo) REFERENCES public.ordenes_trabajo(id_orden_trabajo);


--
-- Name: pagos pagos_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: pagos pagos_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: programaciones_servicio programaciones_servicio_cancelado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_servicio
    ADD CONSTRAINT programaciones_servicio_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: programaciones_servicio programaciones_servicio_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_servicio
    ADD CONSTRAINT programaciones_servicio_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: programaciones_servicio programaciones_servicio_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_servicio
    ADD CONSTRAINT programaciones_servicio_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente);


--
-- Name: programaciones_servicio programaciones_servicio_id_cuadrilla_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_servicio
    ADD CONSTRAINT programaciones_servicio_id_cuadrilla_fkey FOREIGN KEY (id_cuadrilla) REFERENCES public.cuadrillas(id_cuadrilla);


--
-- Name: programaciones_servicio programaciones_servicio_id_propiedad_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_servicio
    ADD CONSTRAINT programaciones_servicio_id_propiedad_fkey FOREIGN KEY (id_propiedad) REFERENCES public.propiedades(id_propiedad);


--
-- Name: programaciones_servicio programaciones_servicio_id_servicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_servicio
    ADD CONSTRAINT programaciones_servicio_id_servicio_fkey FOREIGN KEY (id_servicio) REFERENCES public.servicios(id_servicio);


--
-- Name: programaciones_servicio programaciones_servicio_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_servicio
    ADD CONSTRAINT programaciones_servicio_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: propiedades propiedades_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedades
    ADD CONSTRAINT propiedades_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: propiedades propiedades_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedades
    ADD CONSTRAINT propiedades_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente);


--
-- Name: propiedades propiedades_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedades
    ADD CONSTRAINT propiedades_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: servicios servicios_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: servicios servicios_id_categoria_servicio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_id_categoria_servicio_fkey FOREIGN KEY (id_categoria_servicio) REFERENCES public.categorias_servicio(id_categoria_servicio);


--
-- Name: servicios servicios_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: usuarios usuarios_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
-- Name: usuarios usuarios_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL;


--
--

