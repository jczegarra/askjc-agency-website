# RALOT Financial — sitio + citas (Cloudflare Workers + D1)

- `index.html` — sitio público (calculadora, documentos, formulario de cita)
- `admin/` — panel para ver y gestionar las citas (requiere contraseña)
- `src/worker.js` — API: guarda citas en la base de datos D1 `ralot-db`
- `migrations/` — esquema de la base de datos

## Datos que se guardan
Solo la solicitud de cita: nombre, teléfono, email, servicio, fecha, horario,
modalidad, idioma y comentarios. **Nunca** SSN/ITIN, cuentas bancarias ni
documentos (la API rechaza textos con forma de SSN). Los documentos fiscales
se entregan en persona o por un portal seguro para preparadores.

## Deploy (una sola vez)
1. Cloudflare → **Workers & Pages → Create → Import a repository** →
   `jczegarra/askjc-agency-website`, rama `main`.
2. **Root directory:** `ralot` · Build command: *(vacío)* · Deploy command: `npx wrangler deploy`.
3. Tras el primer deploy: **Settings → Variables and Secrets → Add → Secret**
   `ADMIN_TOKEN` = una contraseña larga (mín. 12 caracteres). Es la clave del panel `/admin/`.
4. Recomendado: proteger `/admin/*` también con **Cloudflare Zero Trust → Access** (gratis hasta 50 usuarios).

Cada push a `main` vuelve a desplegar automáticamente.

## Desarrollo local
```
npm install
npx wrangler d1 migrations apply ralot-db --local
echo 'ADMIN_TOKEN=una-clave-local-larga' > .dev.vars
npx wrangler dev
```
