-- Solicitudes de cita de RALOT Financial.
-- NO guardar aquí SSN/ITIN, cuentas bancarias ni documentos fiscales.
CREATE TABLE IF NOT EXISTS citas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  creado      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  nombre      TEXT    NOT NULL,
  telefono    TEXT    NOT NULL,
  email       TEXT,
  servicio    TEXT    NOT NULL,
  fecha       TEXT    NOT NULL,
  horario     TEXT,
  modalidad   TEXT,
  idioma      TEXT,
  comentarios TEXT,
  estado      TEXT    NOT NULL DEFAULT 'pendiente'
              CHECK (estado IN ('pendiente','confirmada','completada','cancelada'))
);
CREATE INDEX IF NOT EXISTS idx_citas_creado ON citas (creado DESC);
CREATE INDEX IF NOT EXISTS idx_citas_estado ON citas (estado);
