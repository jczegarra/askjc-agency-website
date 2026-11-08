// RALOT Financial — Cloudflare Worker
// Sirve el sitio estático (assets) y una API pequeña para las citas guardadas en D1.
//
//   POST   /api/citas                 público: crea una solicitud de cita
//   GET    /api/admin/citas           admin:   lista citas (?estado=pendiente)
//   PATCH  /api/admin/citas/:id       admin:   cambia el estado
//   DELETE /api/admin/citas/:id       admin:   borra una cita
//
// Admin: header "Authorization: Bearer <ADMIN_TOKEN>". ADMIN_TOKEN es un secreto
// configurado en Cloudflare (Settings → Variables and Secrets), nunca en el código.

const ESTADOS = ["pendiente", "confirmada", "completada", "cancelada"];
const LIMITES = { nombre: 120, telefono: 30, email: 160, servicio: 120, fecha: 10, horario: 40, modalidad: 40, idioma: 20, comentarios: 1000 };
// Números con forma de SSN/ITIN (123-45-6789, 123 45 6789, 123456789).
const SSN = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/;

const SEC_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...SEC_HEADERS } });

async function isAdmin(request, env) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 12) return false;
  const auth = request.headers.get("Authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(env.ADMIN_TOKEN)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function clean(v, max) {
  if (v === undefined || v === null) return "";
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

async function crearCita(request, env) {
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) return json({ error: "content-type" }, 415);
  const raw = await request.text();
  if (raw.length > 8000) return json({ error: "too_large" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }

  // Honeypot anti-spam: los bots llenan este campo oculto.
  if (body._gotcha) return json({ ok: true });

  const c = {};
  for (const k of Object.keys(LIMITES)) c[k] = clean(body[k], LIMITES[k]);

  const digits = c.telefono.replace(/\D/g, "");
  if (!c.nombre || digits.length < 10 || !c.servicio || !/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) {
    return json({ error: "missing_fields" }, 400);
  }
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return json({ error: "invalid_email" }, 400);
  // Nunca guardar números que parezcan SSN/ITIN.
  if (SSN.test(c.comentarios) || SSN.test(c.nombre)) return json({ error: "ssn_detected" }, 422);

  const r = await env.DB.prepare(
    `INSERT INTO citas (nombre, telefono, email, servicio, fecha, horario, modalidad, idioma, comentarios)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  ).bind(c.nombre, c.telefono, c.email || null, c.servicio, c.fecha, c.horario, c.modalidad, c.idioma, c.comentarios || null).run();

  return json({ ok: true, id: r.meta.last_row_id }, 201);
}

async function admin(request, env, path) {
  if (!(await isAdmin(request, env))) return json({ error: "unauthorized" }, 401);

  if (path === "/api/admin/citas" && request.method === "GET") {
    const estado = new URL(request.url).searchParams.get("estado");
    const stmt = ESTADOS.includes(estado)
      ? env.DB.prepare("SELECT * FROM citas WHERE estado = ?1 ORDER BY creado DESC LIMIT 500").bind(estado)
      : env.DB.prepare("SELECT * FROM citas ORDER BY creado DESC LIMIT 500");
    const { results } = await stmt.all();
    return json({ citas: results });
  }

  const m = path.match(/^\/api\/admin\/citas\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    if (request.method === "PATCH") {
      let body; try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
      if (!ESTADOS.includes(body.estado)) return json({ error: "invalid_estado" }, 400);
      const r = await env.DB.prepare("UPDATE citas SET estado = ?1 WHERE id = ?2").bind(body.estado, id).run();
      return r.meta.changes ? json({ ok: true }) : json({ error: "not_found" }, 404);
    }
    if (request.method === "DELETE") {
      const r = await env.DB.prepare("DELETE FROM citas WHERE id = ?1").bind(id).run();
      return r.meta.changes ? json({ ok: true }) : json({ error: "not_found" }, 404);
    }
  }
  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path.startsWith("/api/")) {
      try {
        if (path === "/api/citas" && request.method === "POST") return await crearCita(request, env);
        if (path.startsWith("/api/admin/")) return await admin(request, env, path);
        return json({ error: "not_found" }, 404);
      } catch (err) {
        console.error("api_error", err && err.message); // sin datos del cliente en los logs
        return json({ error: "server_error" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
