# Guía de Configuración y Arquitectura: Cloudflare Pages y GitHub Actions

Este documento detalla exhaustivamente cómo está configurada la integración de **GitHub** y **Cloudflare Pages** en este proyecto, las variables y secretos necesarios, el flujo de CI/CD (Integración y Despliegue Continuo) y cómo interactúa con el backend en Railway.

---

## 1. Arquitectura General del Sistema

El editor colaborativo LaTeX funciona como una arquitectura distribuida desacoplada:

```
                  ┌──────────────────────────────────────────────┐
                  │              Usuario en Navegador            │
                  └──────────────┬───────────────────────────────┘
                                 │
                 ┌───────────────┴──────────────┐
                 │ HTTPS (Static Assets)        │ WSS & REST API
                 ▼                              ▼
  ┌─────────────────────────────┐  ┌─────────────────────────────┐
  │       Cloudflare Pages      │  │        Railway Cloud        │
  │     (Frontend SPA React)    │  │ (API REST + Collab WSS + DB)│
  │  Proyecto: `latex-editor`   │  │ `latex-api-...up.railway...`│
  └─────────────────────────────┘  └─────────────────────────────┘
                 ▲                              ▲
                 │ Despliegue automático         │
                 │ (git push a `main`)          │
  ┌──────────────┴──────────────────────────────┴──────────────┐
  │                       GitHub Actions                       │
  │           - `ci.yml`: Quality Gates & Tests                │
  │           - `deploy-pages.yml`: Build & Deploy Frontend    │
  └────────────────────────────────────────────────────────────┘
```

- **Frontend (SPA en React 19 + Vite + TypeScript):** Hospedado globalmente en **Cloudflare Pages** sobre la red Edge de Cloudflare.
- **Backend (API REST + Collab WebSockets + Base de datos PostgreSQL + Redis + Workers TeX Live):** Hospedado en **Railway**.
- **CI/CD Automatizado:** Orquestado a través de **GitHub Actions**.

---

## 2. Configuración en GitHub

En GitHub se configuran dos aspectos fundamentales: los **Flujos de Trabajo (Workflows)** y los **Secretos del Repositorio**.

### 2.1 Workflows de GitHub Actions

#### A. Calidad y Tests Automatizados (`.github/workflows/ci.yml`)
Se activa en cada `push` o `pull_request` a cualquier rama. Garantiza que ningún código roto o inseguro llegue a producción:
1. **Entorno:** Ubuntu Latest con Node.js 24/26 y `pnpm 11.25.0`.
2. **Servicios de prueba (`infra:up`):** Levanta contenedores efímeros con Docker Compose (PostgreSQL, MinIO S3 y Redis).
3. **Quality Gates:**
   - `pnpm build`: Compilación de todos los paquetes (`contracts`, `editor`, `latex`, `db`, `auth`, `storage`, etc.).
   - `pnpm format:check` & `pnpm lint`: Validación estricta de estilo ESLint.
   - `pnpm typecheck`: Chequeo de tipos TypeScript (`tsc --noEmit`) con 0 errores permitidos.
   - `pnpm test` & `pnpm test:integration`: Ejecución de pruebas unitarias y de integración de API.
   - `python scripts/plan_lint.py`: Validación de integridad de los sprints y contratos del proyecto.
   - `pnpm test:e2e`: Pruebas de navegación End-to-End con Playwright (Chromium, Firefox).

#### B. Despliegue a Cloudflare Pages (`.github/workflows/deploy-pages.yml`)
Se activa automáticamente cuando se hace `push` a la rama `main` afectando el frontend (`apps/web/**` o `packages/**`), o manualmente vía `workflow_dispatch`.

```yaml
name: Deploy Frontend to Cloudflare Pages

on:
  push:
    branches:
      - main
    paths:
      - "apps/web/**"
      - "packages/**"
      - ".github/workflows/deploy-pages.yml"
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .node-version

      - name: Install pnpm
        run: npm install -g pnpm@11.25.0

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build frontend
        env:
          VITE_API_URL: https://latex-api-production-dd00.up.railway.app/api/v1
          VITE_WS_URL: wss://latex-api-production-dd00.up.railway.app
          VITE_APP_NAME: LaTeX Workspace
        run: |
          pnpm --filter "./packages/*" build
          pnpm --filter @latex-collab/web build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: latex-editor
          directory: apps/web/dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

### 2.2 Secretos Requeridos en GitHub (Repository Secrets)

Para que el despliegue funcione, en GitHub debes ir a:
**Settings > Secrets and variables > Actions > New repository secret** y configurar:

| Secreto | Descripción | Origen / Dónde obtenerlo |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Token de API de Cloudflare con permisos para editar Cloudflare Pages. | Cloudflare Dashboard > My Profile > API Tokens > Create Token > Plantilla "Cloudflare Pages". |
| `CLOUDFLARE_ACCOUNT_ID` | Identificador único de tu cuenta de Cloudflare. | Cloudflare Dashboard > Cualquier dominio o Pages > Barra lateral derecha ("Account ID"). |
| `GITHUB_TOKEN` | Token automático provisto por GitHub Actions para crear el despliegue. | *Automático* (no necesitas crearlo manualmente). |

---

## 3. Configuración en Cloudflare

En Cloudflare se utiliza el producto **Cloudflare Pages**, diseñado para servir aplicaciones frontend estáticas y Single Page Applications (SPA) con máxima velocidad y seguridad perimetral.

### 3.1 Creación del Proyecto en Cloudflare Pages
1. Entrar a [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Compute (Workers & Pages)** > **Pages**.
2. Crear un proyecto llamado exactamente:
   ```
   latex-editor
   ```
3. El proyecto se conecta de forma directa mediante la GitHub Action (`cloudflare/pages-action@v1`), por lo que no es necesario conectar el repositorio como un build nativo de Cloudflare si prefieres que GitHub Actions controle la compilación con `pnpm`.

### 3.2 Dominio y Enrutamiento SPA
- **URL por defecto:** `https://latex-editor.pages.dev`
- **Dominio personalizado (opcional):** Si añades un dominio propio (ej. `editor.tudominio.com`), Cloudflare gestiona automáticamente el certificado SSL/TLS y el proxy DNS.
- **Enrutamiento SPA (Single Page Application):**
  - Cloudflare Pages detecta automáticamente aplicaciones tipo Vite/React. Cualquier ruta profunda (ej. `/dashboard`, `/project/123-uuid`, `/settings/profile`, `/login`) sirve el `index.html` para que el `BrowserRouter` de React gestione la vista sin arrojar un error HTTP 404.

### 3.3 Cabeceras de Seguridad y Caché
Cloudflare proporciona por defecto:
- **Protección Anti-DDoS:** Mitigación automática de ataques de denegación de servicio.
- **HTTP/3 y QUIC:** Conexiones ultrarrápidas para la entrega de los assets JavaScript y CSS minificados.
- **Inmutabilidad de Assets:** Los archivos en `apps/web/dist/assets/*` llevan hashes en el nombre (`index-Bhg7QPV0.js`, etc.), por lo que Cloudflare los almacena en su CDN Edge con caché prolongada, actualizándolos al instante cuando hay un nuevo despliegue.

---

## 4. Cómo Funciona el Ciclo Completo Paso a Paso

1. **Desarrollo y Commit:**
   - Un desarrollador hace cambios en el frontend (`apps/web`) y los envía a la rama `main`:
     ```bash
     git push origin main
     ```

2. **Ejecución del Pipeline en GitHub Actions:**
   - GitHub detecta cambios en las rutas monitoreadas e inicia el trabajo `deploy`.
   - Se instalan las dependencias de monorepo con `pnpm` y se compilan los paquetes base (`@latex-collab/contracts`, `@latex-collab/editor`, etc.).
   - Vite compila la aplicación web inyectando las variables de entorno de producción:
     - `VITE_API_URL`: Apunta a la API segura en Railway (`https://.../api/v1`).
     - `VITE_WS_URL`: Apunta al servidor WebSocket de colaboración (`wss://...`).
   - El resultado empaquetado queda listo en la carpeta `apps/web/dist`.

3. **Subida y Publicación en Cloudflare:**
   - La acción `cloudflare/pages-action@v1` utiliza el `CLOUDFLARE_API_TOKEN` y el `CLOUDFLARE_ACCOUNT_ID`.
   - Empaqueta los archivos estáticos de `apps/web/dist` y los distribuye a los centros de datos de Cloudflare en todo el mundo.
   - Se publica una nueva versión visible en segundos en `https://latex-editor.pages.dev`.

4. **Conexión con el Backend en Railway (CORS & Cookies):**
   - Cuando el usuario entra a `https://latex-editor.pages.dev`, el navegador descarga el bundle React.
   - La aplicación web realiza peticiones `fetch` con `credentials: "include"` hacia Railway.
   - El backend en Railway valida el origen `https://latex-editor.pages.dev` en sus políticas de CORS y admite las cookies seguras de sesión HTTP-only (`SameSite=Lax`, `Secure`).
   - Para la edición en vivo, el cliente abre un WebSocket seguro hacia `wss://latex-api-...up.railway.app` usando tickets de un solo uso para sincronizar cambios Yjs en tiempo real.

---

## 5. Resumen de Comprobación Rápida (Troubleshooting)

| Problema | Causa Posible | Solución |
|---|---|---|
| **Fallo en GitHub Action:** `Authentication error (Code: 10000)` | `CLOUDFLARE_API_TOKEN` es incorrecto o no tiene permisos de Pages. | Vuelve a generar el token en Cloudflare con permisos `Account.Cloudflare Pages: Edit`. |
| **Fallo en GitHub Action:** `Project not found` | El nombre `projectName` no coincide con el creado en Cloudflare. | Verifica que en Cloudflare Pages el proyecto se llame `latex-editor`. |
| **Error CORS en el navegador (`Blocked by CORS policy`)** | La variable `CORS_ORIGIN` en Railway no incluye la URL de Cloudflare. | En el dashboard de Railway (servicio API), configura `CORS_ORIGIN=https://latex-editor.pages.dev`. |
| **Error 401 en la API tras recargar página** | Las cookies de sesión no se están enviando o `Secure` falla por no usar HTTPS. | Asegúrate de navegar siempre bajo `https://` y que las cookies tengan `SameSite=Lax`. |
