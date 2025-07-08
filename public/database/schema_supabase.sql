-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.TestImpresoras (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket bigint,
  estado text,
  cliente text,
  modelo text,
  fechaFormulario timestamp with time zone,
  notaTecnico text,
  notaAdmin text,
  comentarios text,
  tecnico text,
  cubreGarantia text,
  notaInterna text,
  linkPresupuesto text,
  monto bigint,
  costoDelivery text,
  infoDelivery text,
  dniCuit bigint,
  whatsapp text,
  correo text,
  cobrado boolean,
  timestampPresupuesto timestamp with time zone,
  timestampListo timestamp with time zone,
  imagen text,
  CONSTRAINT TestImpresoras_pkey PRIMARY KEY (id)
);
CREATE TABLE public.usuarios_perfil (
  id bigint NOT NULL DEFAULT nextval('usuarios_perfil_id_seq'::regclass),
  email text NOT NULL UNIQUE,
  nombre text,
  rol text NOT NULL DEFAULT 'tecnico'::text,
  dashboard boolean NOT NULL DEFAULT true,
  tickets boolean NOT NULL DEFAULT false,
  usuarios boolean NOT NULL DEFAULT false,
  estadisticas boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT usuarios_perfil_pkey PRIMARY KEY (id)
);