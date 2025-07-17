-- Clientes OK
CREATE TABLE cliente (
    id uuid NOT NULL DEFAULT gen_random_uuid(), --
    cliente VARCHAR(100) NOT NULL,--
    nombre VARCHAR(100) NOT NULL,--
    apellido VARCHAR(100) NOT NULL,--
    dni_cuit VARCHAR(30), --
    whatsapp VARCHAR(30), --
    correo_electronico VARCHAR(100),--
    direccion VARCHAR(255), --
    localidad VARCHAR(100), --
    informacion_adicional_usuario TEXT --
);

-- Técnicos A VER 
CREATE TABLE tecnicos (
    id SERIAL PRIMARY KEY, --
    nombre VARCHAR(100) NOT NULL, --
    apellido VARCHAR(100) NOT NULL,
    email TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ DEFAULT now()
);

-- Impresoras ok
CREATE TABLE impresoras (
    id SERIAL PRIMARY KEY,
    modelo VARCHAR(100) NOT NULL, --
    maquina VARCHAR(100) NOT NULL, --
    numero_de_serie VARCHAR(100) NOT NULL, --
    tamano_de_boquilla VARCHAR(50) --
);

-- Tickets
CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE RESTRICT,
    tecnico_id INTEGER REFERENCES tecnicos(id) ON DELETE SET NULL,
    impresora_id INTEGER REFERENCES impresoras(id) ON DELETE SET NULL,
    marca_temporal TIMESTAMP DEFAULT NOW(), --
    notas_del_cliente TEXT, --
    notas_del_tecnico TEXT, --
    fecha_de_reparacion DATE, --
    estado VARCHAR(50), --
    dias_en_taller INTEGER, --
    maquina_reparada BOOLEAN DEFAULT FALSE, --
    devolver_maquina BOOLEAN DEFAULT FALSE --
    imagen text,
);

-- Presupuestos
CREATE TABLE presupuestos (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
    componentes TEXT[], -- 
    precio_componente NUMERIC[],
    enviar_presupuesto BOOLEAN DEFAULT FALSE, --
    presupuesto TEXT, --
    link_presupuesto TEXT, --
    presupuesto_aprobado BOOLEAN DEFAULT FALSE, --
    garantia_activa BOOLEAN DEFAULT FALSE, --
    notas_administracion TEXT, --
    monto NUMERIC --
);

-- Delivery
CREATE TABLE delivery (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
    cotizar_delivery BOOLEAN DEFAULT FALSE, --
    informacion_adicional_delivery TEXT, --
    medio_de_entrega VARCHAR(100), --
    fecha_de_entrega DATE,
    forma_de_pago VARCHAR(100), --
    pagado BOOLEAN DEFAULT FALSE
);

-- Permisos de usuario (por técnico)
CREATE TABLE usuarios_permisos (
    id SERIAL PRIMARY KEY,
    tecnico_id INTEGER REFERENCES tecnicos(id) ON DELETE CASCADE,
    rol TEXT NOT NULL DEFAULT 'tecnico',
    dashboard BOOLEAN NOT NULL DEFAULT true,
    tickets BOOLEAN NOT NULL DEFAULT false,
    usuarios BOOLEAN NOT NULL DEFAULT false,
    estadisticas BOOLEAN NOT NULL DEFAULT false,
    creado_en TIMESTAMPTZ DEFAULT now()
);
