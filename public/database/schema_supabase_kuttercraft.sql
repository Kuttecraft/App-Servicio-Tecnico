-- 1. Clientes
CREATE TABLE cliente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente VARCHAR(100) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    dni_cuit VARCHAR(60),
    whatsapp VARCHAR(60),
    correo_electronico VARCHAR(100),
    direccion VARCHAR(255),
    localidad VARCHAR(100),
    informacion_adicional_usuario TEXT
);

-- 2. Técnicos
CREATE TABLE tecnicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- 3. Impresoras
CREATE TABLE impresoras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modelo VARCHAR(100) NOT NULL,
    maquina VARCHAR(100) NOT NULL,
    numero_de_serie VARCHAR(100) NOT NULL,
    tamano_de_boquilla VARCHAR(80)
);

-- 4. Tickets (ajusta el nombre si quieres: "tickets_mian" o "tickets_main")
CREATE TABLE tickets_mian (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
    tecnico_id UUID REFERENCES tecnicos(id) ON DELETE SET NULL,
    impresora_id UUID REFERENCES impresoras(id) ON DELETE SET NULL,
    marca_temporal TIMESTAMP DEFAULT NOW(),
    ticket BIGINT, 
    notas_del_cliente TEXT,
    notas_del_tecnico TEXT,
    fecha_de_reparacion TEXT,
    estado VARCHAR(50),
    dias_en_taller INTEGER,
    maquina_reparada BOOLEAN DEFAULT FALSE,
    devolver_maquina BOOLEAN DEFAULT FALSE,
    imagen TEXT
);

-- 5. Presupuestos
CREATE TABLE presupuestos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets_mian(id) ON DELETE CASCADE,
    componentes TEXT[],
    precio_componente NUMERIC[],
    enviar_presupuesto BOOLEAN DEFAULT FALSE,
    presupuesto TEXT,
    link_presupuesto TEXT,
    presupuesto_aprobado BOOLEAN DEFAULT FALSE,
    garantia_activa BOOLEAN DEFAULT FALSE,
    notas_administracion TEXT,
    monto NUMERIC
);

-- 6. Delivery
CREATE TABLE delivery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets_mian(id) ON DELETE CASCADE,
    cotizar_delivery BOOLEAN DEFAULT FALSE,
    informacion_adicional_delivery TEXT,
    medio_de_entrega VARCHAR(100),
    fecha_de_entrega DATE,
    forma_de_pago VARCHAR(100),
    pagado BOOLEAN DEFAULT FALSE
);

-- 7. Permisos de usuario (por técnico)
CREATE TABLE usuarios_permisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tecnico_id UUID NOT NULL REFERENCES tecnicos(id) ON DELETE CASCADE,
    rol TEXT NOT NULL DEFAULT 'tecnico',
    dashboard BOOLEAN NOT NULL DEFAULT true,
    tickets BOOLEAN NOT NULL DEFAULT false,
    usuarios BOOLEAN NOT NULL DEFAULT false,
    estadisticas BOOLEAN NOT NULL DEFAULT false,
    creado_en TIMESTAMPTZ DEFAULT now()
);

/*
-- 1. Clientes
CREATE TABLE cliente (
    id BIGSERIAL PRIMARY KEY,
    cliente VARCHAR(100) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    dni_cuit VARCHAR(60),
    whatsapp VARCHAR(60),
    correo_electronico VARCHAR(100),
    direccion VARCHAR(255),
    localidad VARCHAR(100),
    informacion_adicional_usuario TEXT
);

-- 2. Técnicos
CREATE TABLE tecnicos (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- 3. Impresoras
CREATE TABLE impresoras (
    id BIGSERIAL PRIMARY KEY,
    modelo VARCHAR(100) NOT NULL,
    maquina VARCHAR(100) NOT NULL,
    numero_de_serie VARCHAR(100) NOT NULL,
    tamano_de_boquilla VARCHAR(80)
);

-- 4. Tickets
CREATE TABLE tickets_mian (
    id BIGSERIAL PRIMARY KEY,
    cliente_id BIGINT NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
    tecnico_id BIGINT REFERENCES tecnicos(id) ON DELETE SET NULL,
    impresora_id BIGINT REFERENCES impresoras(id) ON DELETE SET NULL,
    marca_temporal TEXT,
    ticket BIGINT, 
    notas_del_cliente TEXT,
    notas_del_tecnico TEXT,
    fecha_de_reparacion TEXT,
    estado TEXT,
    dias_en_taller TEXT,
    maquina_reparada TEXT,
    devolver_maquina TEXT,
    imagen TEXT
);

-- 5. Presupuestos
CREATE TABLE presupuestos (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES tickets_mian(id) ON DELETE CASCADE,
    componentes TEXT[],
    precio_componente NUMERIC[],
    enviar_presupuesto BOOLEAN DEFAULT FALSE,
    presupuesto TEXT,
    link_presupuesto TEXT,
    presupuesto_aprobado BOOLEAN DEFAULT FALSE,
    garantia_activa BOOLEAN DEFAULT FALSE,
    notas_administracion TEXT,
    monto NUMERIC
);

-- 6. Delivery
CREATE TABLE delivery (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES tickets_mian(id) ON DELETE CASCADE,
    cotizar_delivery BOOLEAN DEFAULT FALSE,
    informacion_adicional_delivery TEXT,
    medio_de_entrega VARCHAR(100),
    fecha_de_entrega DATE,
    forma_de_pago VARCHAR(100),
    pagado BOOLEAN DEFAULT FALSE
);
*/
/* Esta es aparte 
-- 7. Permisos de usuario (por técnico)
CREATE TABLE usuarios_permisos (
    id BIGSERIAL PRIMARY KEY,
    tecnico_id BIGINT NOT NULL REFERENCES tecnicos(id) ON DELETE CASCADE,
    rol TEXT NOT NULL DEFAULT 'tecnico',
    dashboard BOOLEAN NOT NULL DEFAULT true,
    tickets BOOLEAN NOT NULL DEFAULT false,
    usuarios BOOLEAN NOT NULL DEFAULT false,
    estadisticas BOOLEAN NOT NULL DEFAULT false,
    creado_en TIMESTAMPTZ DEFAULT now()
);

/*

ALTER TABLE cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE impresoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets_mian ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_permisos ENABLE ROW LEVEL SECURITY;
*/

-- Para limpiar las bases de supa rápido 
DROP TABLE IF EXISTS 
    -- usuarios_permisos, no es necesraio ya que no intercatua de forma directa 
    delivery,
    presupuestos,
    tickets_mian,
    impresoras,
    tecnicos,
    cliente
CASCADE;
