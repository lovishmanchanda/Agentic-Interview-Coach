# Deploying InterviewOS

Three paths; none of them needs Azure except the last. Read "What production needs" first: it applies to all.

| Path | What it is | Cost / effort |
|---|---|---|
| **1. One server with Docker** | Everything (frontend, backend, MongoDB, Piston, HTTPS) on a single Linux VPS from any provider, with the ready-made files in `deploy/vps/` | Cheapest full setup (a ~4 GB VPS), coding included; you run the server |
| **2. Vercel + Render + MongoDB Atlas** | Managed hosting; Piston on a small server of your own | Quickest public demo; least server work |
| **3. Azure** | App Service + Cosmos DB + Key Vault | For teams already on Azure |

## What production needs (read first)

| Piece | Why it matters |
|---|---|
| **One backend instance** | Rate limits, live metrics and ARIA's background indexing live in process memory, and ARIA's search index (Chroma) is a folder on disk. Run exactly one backend instance (scale *up*, not *out*) until these move to shared services. |
| **A persistent disk for the backend** | `CHROMA_PATH` must survive restarts and redeploys, or ARIA forgets every report (the catch-up sweep re-indexes, but only while reports are still in the DB). |
| **WebSockets** | Live interviews run over `wss://…/ws/interview/{id}`. The host must allow WebSockets and long-lived connections. |
| **HTTPS everywhere** | The refresh-token cookie is `Secure` outside local; the frontend must call the API over `https://` and `wss://`. |
| **MongoDB** | Any MongoDB 6+/7 works: MongoDB Atlas, Azure Cosmos DB for MongoDB (vCore), or self-hosted. |
| **Same site for frontend + API (recommended)** | Use `app.yourdomain.com` + `api.yourdomain.com`: the refresh cookie works with `SameSite=lax`. If they're on different sites (e.g. `*.vercel.app` + `*.onrender.com`), set `REFRESH_COOKIE_SAMESITE=none`. |
| **Secrets in the host's secret store** | Never in git or the Docker image. `.dockerignore` already keeps `.env` out of images. |

### Production environment variables (backend)

Set these on the backend host (Azure App Settings / Key Vault references, Render environment, etc.):

| Variable | Value |
|---|---|
| `APP_ENV` | `prod` (turns off `/docs`, requires a real JWT secret, refuses the in-memory DB and the dev user) |
| `JWT_SECRET` | 48+ random characters: `python -c "import secrets;print(secrets.token_urlsafe(48))"` |
| `COSMOS_CONNECTION_STRING` | Your MongoDB connection string (Atlas `mongodb+srv://…` or Cosmos vCore) |
| `COSMOS_DATABASE` | `interview_coach` |
| `CORS_ORIGINS` | `["https://app.yourdomain.com"]` (exact frontend origin, no trailing slash) |
| `REFRESH_COOKIE_SAMESITE` | `lax` (same site) or `none` (different sites) |
| `GROQ_API_KEY` | Groq key (all LLM calls) |
| `HF_TOKEN` | Hugging Face token (ARIA's embeddings; without it ARIA is off) |
| `CHROMA_PATH` | A path on the persistent disk, e.g. `/home/data/chroma` (Azure) or `/var/data/chroma` (Render) |
| `PISTON_URL`, `PISTON_API_KEY` | Your own Piston (see below); coding interviews are hidden without `PISTON_URL` |
| `ADMIN_EMAILS` | `["you@yourdomain.com"]`: who can open `/admin` |
| `FORWARDED_ALLOW_IPS` | `*` when the container is only reachable through the host's proxy (App Service, Render), so rate limits see real client IPs |
| `DAILY_TOKEN_LIMIT_PER_USER` | e.g. `400000`: caps Groq spend per user per day |
| `LOG_LEVEL` | `INFO` |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Optional (Azure monitoring; also add `azure-monitor-opentelemetry` to the image) |

Leave `USE_INMEMORY_DB` unset/false and `LLM_TRACE_CONTENT=false` (it would store candidates' answers in logs). Everything else in `.env.example` has a sensible default.

**Frontend** needs one build-time variable: `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`. It's baked into the JavaScript bundle at build time, so it's public by design; never put a secret in a `NEXT_PUBLIC_` variable.

### Your code runner (Piston)

Coding interviews run candidates' code on [Piston](https://github.com/engineer-man/piston), which **you host yourself**. There is no shared runner, and without one the app works fine: coding interviews are just hidden.
- **Where it can run:** Piston needs a *privileged* Docker container, so it runs on a VM or VPS, not on Render, Vercel or App Service. Path 1 runs it on the same server; for paths 2 and 3, rent a small Linux VM (1–2 GB) and run it there.
- **Runtimes:** install at least Python (graded): `{"language":"python","version":"3.12.0"}` via `POST /api/v2/packages`. Node, Java and GCC are optional (they run ungraded).
- **Never leave it open to the internet:** Piston runs arbitrary code. Either keep it on a private network with the backend (Path 1 does this), or firewall its port to the backend's outbound IPs only and put a small proxy in front that checks `X-API-Key` (set the same value as `PISTON_API_KEY`).

---

## Path 1: one server with Docker (any provider)

Everything runs from `deploy/vps/docker-compose.yml`:
- **Caddy** gets HTTPS certificates automatically and proxies to the frontend and the API.
- **The backend, MongoDB and Piston** sit on a private Docker network.
- **Only ports 80 and 443** are reachable from the internet.

These files haven't been run end to end yet, so do the smoke test at the end before sharing the link.

1. **Get a server.** Ubuntu 24.04, 2 vCPU / 4 GB RAM or more (Piston compiles code; MongoDB wants memory), from any provider: Hetzner, DigitalOcean, AWS Lightsail, Oracle Cloud (Always Free Arm), Linode… Add your SSH key when creating it.
2. **Point two DNS names at it.** At your domain registrar, create **A records** `app.yourdomain.com` and `api.yourdomain.com` → the server's IP. Wait until `ping app.yourdomain.com` shows that IP.
3. **Log in and lock it down:**
   ```bash
   ssh root@<server-ip>
   ```
   ```bash
   apt update && apt -y upgrade && ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
   ```
4. **Install Docker** (official script):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
5. **Get the code:**
   ```bash
   git clone https://github.com/<you>/<repo>.git interviewos && cd interviewos
   ```
6. **Create `.env`** from the example and fill in production values (the compose file sets the database, Piston, CORS and cookie settings itself):
   ```bash
   cp .env.example .env && nano .env
   ```
   Set: `APP_DOMAIN=app.yourdomain.com`, `API_DOMAIN=api.yourdomain.com`, `JWT_SECRET=` (generate one: `openssl rand -base64 48`), `GROQ_API_KEY=`, `HF_TOKEN=`, `ADMIN_EMAILS=["you@yourdomain.com"]`. Then lock the file down:
   ```bash
   chmod 600 .env
   ```
7. **Start everything:**
   ```bash
   docker compose -f deploy/vps/docker-compose.yml --env-file .env up -d --build
   ```
   The first build takes several minutes. Watch with `docker compose -f deploy/vps/docker-compose.yml logs -f`.
8. **Install Python in Piston** (once; runtimes live in a volume and survive restarts):
   ```bash
   docker compose -f deploy/vps/docker-compose.yml exec backend python -c "import httpx; print(httpx.post('http://piston:2000/api/v2/packages', json={'language':'python','version':'3.12.0'}, timeout=900).text)"
   ```
9. **Seed the question bank and companies** (once, and after changing `data/seed/`):
   ```bash
   docker compose -f deploy/vps/docker-compose.yml exec backend python -m scripts.seed
   ```
10. Open `https://app.yourdomain.com` and run the **smoke test** at the end of this page.

**Updating:** `git pull`, then the same `up -d --build` command.
**Backups:** a nightly database dump from cron, copied off the server:
```bash
docker compose -f deploy/vps/docker-compose.yml exec -T mongo mongodump --archive --gzip > backup-$(date +%F).gz
```
**Isolation:** Piston runs on the same machine as your data here. For stronger isolation, run Piston on its own small server and point `PISTON_URL` at it (behind a firewall + API-key proxy).

---

## Path 2: Vercel + Render + MongoDB Atlas (quick demo)

1. **MongoDB Atlas.** Create an M0 cluster and a database user. For a demo, allow `0.0.0.0/0` in Network Access, or Render's static outbound IPs on paid plans. Copy the `mongodb+srv://` connection string.
2. **Backend on Render.**
   - New **Web Service** → connect the GitHub repo.
   - Runtime **Docker**, Dockerfile path `backend/Dockerfile`, Docker build context `.` (repo root). Region near your users (e.g. Singapore for India).
   - **Plan, either:**
     - **Free:** no disk. Sleeps after 15 minutes idle (about 1 minute to wake). ARIA's index is rebuilt from MongoDB after every restart (automatic; she catches up in the background).
     - **Starter + Disk:** mount path `/var/data`, 1 GB, and set `CHROMA_PATH=/var/data/chroma`. Always on, and the index persists.
   - Environment: every variable from the table above, plus:
     - `PORT=8000` (the port the container listens on)
     - `SEED_ON_STARTUP=true` (loads the question bank; no shell needed)
     - `FORWARDED_ALLOW_IPS=*`
     - `REFRESH_COOKIE_SAMESITE=none` (unless you use custom domains on one site)
   - Keep **1 instance**. Health check path: `/api/v1/health`.
3. **Frontend on Vercel.**
   - New Project → import the repo → **Root Directory** `frontend` (framework auto-detected: Next.js).
   - Environment variable: `NEXT_PUBLIC_API_URL=https://<your-render-service>.onrender.com` for Production. Deploy.
4. **Wire them together.** Set the backend's `CORS_ORIGINS=["https://<your-app>.vercel.app"]` (or your custom domain) and redeploy the backend.
5. **Custom domains (recommended):** add `app.yourdomain.com` in Vercel and `api.yourdomain.com` in Render. Then switch `REFRESH_COOKIE_SAMESITE=lax`, update `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` (a new Vercel build), and redeploy.
6. **Code runner (optional):** run Piston on a small Linux server of your own (see "Your code runner" above). Allow its port only from Render's outbound IPs (paid plans list them), put an API-key proxy in front, and set `PISTON_URL` / `PISTON_API_KEY` on the backend.

---

## Path 3: Azure

You need the Azure CLI (`az login`) and a domain you control.

### 1. Resource group and registry
```bash
az group create -n interviewos-rg -l centralindia
```
```bash
az acr create -g interviewos-rg -n interviewosacr --sku Basic
```

### 2. Database
Option 1, **Azure Cosmos DB for MongoDB (vCore)**, in the portal:
1. Create a resource → **Azure Cosmos DB** → **Azure Cosmos DB for MongoDB** → **vCore cluster**.
2. Choose the resource group `interviewos-rg` and the same region. Pick the **Free tier** (or the smallest paid tier) and MongoDB version 7.0. Set an admin user and a strong password.
3. Under **Networking**, allow public access from Azure services (or add the backend's outbound IPs after step 4).
4. Open **Connection strings** and copy it (it contains the password, so treat it as a secret).

Option 2, **MongoDB Atlas** (M0 free or M10): create a cluster and a database user, add the backend's outbound IPs to the IP access list, and copy the `mongodb+srv://` string.

### 3. Build the images in the cloud (no Docker needed locally)
From the repository root:
```bash
az acr build -r interviewosacr -t interviewos-backend:v1 -f backend/Dockerfile .
```
```bash
az acr build -r interviewosacr -t interviewos-frontend:v1 --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com frontend
```

### 4. Backend: App Service (Web App for Containers)
```bash
az appservice plan create -g interviewos-rg -n interviewos-plan --is-linux --sku B2
```
```bash
az webapp create -g interviewos-rg -p interviewos-plan -n interviewos-api -i interviewosacr.azurecr.io/interviewos-backend:v1
```
Give the app its own identity and let it pull from the registry:
```bash
az webapp identity assign -g interviewos-rg -n interviewos-api
```
```bash
az role assignment create --assignee $(az webapp identity show -g interviewos-rg -n interviewos-api --query principalId -o tsv) --role AcrPull --scope $(az acr show -n interviewosacr --query id -o tsv)
```
```bash
az webapp config set -g interviewos-rg -n interviewos-api --web-sockets-enabled true --always-on true --generic-configurations '{"acrUseManagedIdentityCreds": true}'
```
Settings (secrets go through Key Vault in step 5; this sets the non-secret ones):
```bash
az webapp config appsettings set -g interviewos-rg -n interviewos-api --settings WEBSITES_PORT=8000 WEBSITES_ENABLE_APP_SERVICE_STORAGE=true APP_ENV=prod COSMOS_DATABASE=interview_coach CHROMA_PATH=/home/data/chroma FORWARDED_ALLOW_IPS='*' 'CORS_ORIGINS=["https://app.yourdomain.com"]' REFRESH_COOKIE_SAMESITE=lax 'ADMIN_EMAILS=["you@yourdomain.com"]' LOG_LEVEL=INFO
```
`WEBSITES_ENABLE_APP_SERVICE_STORAGE=true` keeps `/home` persistent, so ARIA's index survives restarts. Keep the plan at **1 instance** (don't enable autoscale). Under **Health check**, set the path to `/api/v1/health`.

### 5. Secrets: Key Vault
```bash
az keyvault create -g interviewos-rg -n interviewos-kv --enable-rbac-authorization true
```
Grant the web app read access, and yourself write access:
```bash
az role assignment create --assignee $(az webapp identity show -g interviewos-rg -n interviewos-api --query principalId -o tsv) --role "Key Vault Secrets User" --scope $(az keyvault show -n interviewos-kv --query id -o tsv)
```
```bash
az role assignment create --assignee $(az ad signed-in-user show --query id -o tsv) --role "Key Vault Secrets Officer" --scope $(az keyvault show -n interviewos-kv --query id -o tsv)
```
Add each secret (paste values interactively; keep them out of shell history and screenshots):
```bash
az keyvault secret set --vault-name interviewos-kv -n jwt-secret --value "$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')"
```
Repeat for `groq-api-key`, `hf-token`, `mongo-connection-string`, `piston-url` and `piston-api-key` (for example from the portal's **Secrets → Generate/Import**). Then reference them from the app:
```bash
az webapp config appsettings set -g interviewos-rg -n interviewos-api --settings "JWT_SECRET=@Microsoft.KeyVault(VaultName=interviewos-kv;SecretName=jwt-secret)" "GROQ_API_KEY=@Microsoft.KeyVault(VaultName=interviewos-kv;SecretName=groq-api-key)" "HF_TOKEN=@Microsoft.KeyVault(VaultName=interviewos-kv;SecretName=hf-token)" "COSMOS_CONNECTION_STRING=@Microsoft.KeyVault(VaultName=interviewos-kv;SecretName=mongo-connection-string)" "PISTON_URL=@Microsoft.KeyVault(VaultName=interviewos-kv;SecretName=piston-url)" "PISTON_API_KEY=@Microsoft.KeyVault(VaultName=interviewos-kv;SecretName=piston-api-key)"
```
In the portal's **Environment variables** page each reference should show a green "Key Vault Reference" tick.

### 6. Seed the database (once, and after changing `data/seed/`)
Open **SSH** for the web app in the portal (Development Tools → SSH) and run:
```bash
cd /srv/backend && python -m scripts.seed
```
This loads the question bank and companies (safe to re-run). It never creates the dev user outside local.

### 7. Frontend
Either another Web App for Containers on the same plan:
```bash
az webapp create -g interviewos-rg -p interviewos-plan -n interviewos-web -i interviewosacr.azurecr.io/interviewos-frontend:v1
```
```bash
az webapp config appsettings set -g interviewos-rg -n interviewos-web --settings WEBSITES_PORT=3000
```
(give it the same `AcrPull` identity setup as the backend), **or** Vercel (see Path 2, step 3). Remember that `NEXT_PUBLIC_API_URL` is set when the image is **built** (step 3); changing the API address means rebuilding.

### 8. Domains and HTTPS
For each app: **Custom domains → Add** (`api.yourdomain.com` → interviewos-api, `app.yourdomain.com` → interviewos-web), create the CNAME/TXT records it shows at your DNS provider, then **Add binding → App Service Managed Certificate**. Turn on **HTTPS Only** for both apps.

### 9. Your code runner
Run Piston on your own small Linux VM (see "Your code runner" above), in the same region:
- In its Network Security Group, allow the Piston/proxy port **only from the backend's outbound IPs** (`az webapp show -g interviewos-rg -n interviewos-api --query outboundIpAddresses`), and SSH only from your own IP.
- Put an API-key proxy in front and set the same key as `PISTON_API_KEY`.
- Better still: put the VM and the web app on one VNet (App Service VNet integration) and give Piston no public IP at all.

### 10. Monitoring and budgets (recommended)
- Create an Application Insights resource and set `APPLICATIONINSIGHTS_CONNECTION_STRING`. Add `azure-monitor-opentelemetry` to `backend/requirements.txt` for the deployment image.
- Set a monthly budget alert on the resource group, and a spend limit on your Groq account.
- The in-app `/admin` page shows live errors, latency, tokens and cost per prompt version.

### 11. Continuous deployment (optional)
Add a GitHub Actions workflow that, on pushes to `main` after CI passes, logs in to Azure with OIDC (federated credentials, no stored password), runs the two `az acr build` commands with the commit SHA as the tag, and then runs `az webapp config container set … -i …:<sha>` for each app.

---

## After deploying: smoke test

Run these against production:

- [ ] `https://api.yourdomain.com/api/v1/health` returns 200; `/docs` returns 404 (turned off in prod).
- [ ] The landing page loads over HTTPS, the 3D room renders, and a phone gets the poster or the lighter scene.
- [ ] Create an account, finish onboarding, and land on the empty desk.
- [ ] A 1-question technical practice interview: question, answer, evaluation, report. This proves the WebSocket works through the proxy.
- [ ] A coding problem (if you set up Piston): Run examples, then Submit.
- [ ] ARIA answers about that report with citations (`HF_TOKEN` + persistent Chroma). Restart the backend and ask again: the citations still work (the disk persisted).
- [ ] Sign out and in again in a new tab (refresh cookie works across the two domains).
- [ ] `/admin` opens for your `ADMIN_EMAILS` account only.
- [ ] Response headers on the frontend include `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.

## Before real users (known limits)

- **Scaling beyond one backend instance** needs: rate limits in Redis, ARIA's index in a hosted vector store (or Chroma server), and background indexing on a queue.
- **Access token in `localStorage`:** a successful XSS could read it (it expires in 30 minutes; the refresh token is httpOnly and can't be read). Keeping it in memory only, and relying on the refresh cookie after a reload, removes that.
- **Content-Security-Policy:** only `frame-ancestors` is set today. A full script CSP (with nonces, and allowing `cdn.jsdelivr.net` for the Monaco editor, or self-hosting Monaco) is the next hardening step.
- **Backups:** turn on continuous backup / point-in-time restore on the database, and snapshot the Chroma disk (or accept rebuilding it from reports).
- **Email verification and password reset** aren't built yet.
- **Privacy:** interview answers are personal data. Publish a privacy notice and keep `LLM_TRACE_CONTENT=false`.
