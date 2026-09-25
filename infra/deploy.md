# Deploying to Azure (single App Service BFF)

The app deploys as **one** Azure Linux App Service that serves both the React
SPA and the `/api`. The workbook lives in **Azure Blob Storage** and is the
source of truth; the app pulls it down, and any new upload is pushed to every
open browser within ~1–2s via an Event Grid webhook → Server-Sent Events.

```
 SharePoint / OneDrive ──(Power Automate)──┐
                                           ├──► Blob container ──(Event Grid)──► POST /api/hooks/blob-changed
 azcopy / Storage Explorer / CI ───────────┘                                         │
                                                                                     ▼
                                              App Service (Express BFF) ── SSE /api/events ──► browsers refetch
```

## 0. Prerequisites
- Azure CLI (`az`) logged in to the target subscription, `az bicep` available.
- A globally-unique app name (used for the Web App hostname and storage account).

## 1. Provision infrastructure

```bash
RG=resource-dashboard-rg
APP=cts-resource-dash            # must be globally unique
SECRET=$(openssl rand -hex 24)   # Event Grid webhook shared secret — save it

az group create -n "$RG" -l uksouth
az deployment group create -g "$RG" -f infra/main.bicep \
  -p appName="$APP" eventGridSecret="$SECRET"
```

This creates the storage account + `data` container, the Linux App Service
(Node 22, `node server/index.js`, always-on), grants the app's managed identity
**Storage Blob Data Contributor** (so no secrets/keys are needed), and wires an
Event Grid subscription for `BlobCreated` on `data/Community Sheet.xlsx` to
`https://<app>.azurewebsites.net/api/hooks/blob-changed?secret=<SECRET>`.

> App settings set by Bicep: `BLOB_ACCOUNT_URL`, `BLOB_CONTAINER=data`,
> `BLOB_NAME=Community Sheet.xlsx`, `USERS_FILE=/home/data/users.json`,
> `WORKDIR=/home/data`, `EVENTGRID_SECRET`. `/home` is App Service durable
> storage, so approved logins (`users.json`) survive restarts.

## 2. Seed the workbook

Upload your workbook once so the app has data on first boot:

```bash
az storage blob upload --account-name ${APP}sa --auth-mode login \
  -c data -n "Community Sheet.xlsx" -f "Community Sheet.xlsx" --overwrite
```

## 3. Deploy the app

**CI/CD (recommended):** `.github/workflows/deploy.yml` builds and deploys on
push to `main`. Configure once:
- Repo variable `AZURE_WEBAPP_NAME` = `$APP`.
- OIDC: create an Entra app + federated credential with **Contributor** on the
  resource group, then set repo secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
  `AZURE_SUBSCRIPTION_ID`.

**Manual (one-off):**
```bash
pnpm install && pnpm build && pnpm prune --prod
zip -r deploy.zip . -x '.git/*' 'node_modules/.cache/*'
az webapp deploy -g "$RG" -n "$APP" --src-path deploy.zip --type zip
```

Browse `https://$APP.azurewebsites.net` and sign in (`admin` / `admin@123` —
**change this immediately** via the Access Requests admin tools).

## 4. Configure the dashboard assistant

The floating assistant uses LangChain with the Azure OpenAI v1 endpoint. Managed
identity is recommended so no model key is stored in the app. For the current
`gpt-6-astra` deployment:

```bash
AI_RG=openaiim
AI_ACCOUNT=54138-molqqca8-swedencentral
AI_ENDPOINT=https://54138-molqqca8-swedencentral.services.ai.azure.com/openai/v1
AI_DEPLOYMENT=gpt-6-astra

az webapp identity assign -g "$RG" -n "$APP"
PRINCIPAL_ID=$(az webapp identity show -g "$RG" -n "$APP" --query principalId -o tsv)
AI_RESOURCE_ID=$(az cognitiveservices account show -g "$AI_RG" -n "$AI_ACCOUNT" --query id -o tsv)
az role assignment create --assignee-object-id "$PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Cognitive Services OpenAI User" --scope "$AI_RESOURCE_ID"
az webapp config appsettings set -g "$RG" -n "$APP" --settings \
  AZURE_OPENAI_ENDPOINT="$AI_ENDPOINT" \
  AZURE_OPENAI_DEPLOYMENT_NAME="$AI_DEPLOYMENT" \
  AZURE_OPENAI_USE_ENTRA_ID=true
```

Restart the App Service after changing settings. The v1 endpoint does not use an
API-version setting, so `OPENAI_API_VERSION` may remain empty. Key-based auth is
also supported with `AZURE_OPENAI_API_KEY`, stored only as an App Service secret.
Rotate any key shared in chat before using it. The assistant appears for signed-in
users, searches live dashboard records, and stages create/update/delete proposals;
the user must review and apply every change.

## 5. Automated Excel ingestion

Both paths land the same blob (`data/Community Sheet.xlsx`); Event Grid then
notifies the app, which validates the workbook (required sheets present + parses
to non-empty data — a bad file is rejected and the previous data stays live),
swaps it in, and pushes a refresh to all browsers.

### A. SharePoint / OneDrive drop → Power Automate
1. Power Automate → **Create a flow** → trigger **When a file is created or
   modified (properties only)** on the target SharePoint/OneDrive library.
2. (Optional) Condition: file name equals `Community Sheet.xlsx`.
3. Action **Get file content**.
4. Action **Azure Blob Storage → Create blob (V2)**: container `data`, blob
   name `Community Sheet.xlsx`, body = the file content. (Connect with the
   storage account key or a managed connection; enable overwrite.)

Now anyone dropping the workbook in that library updates the dashboard
automatically — no one logs into the app to refresh data.

### B. Direct upload (scripts / scheduled feeds)
```bash
azcopy copy "Community Sheet.xlsx" \
  "https://${APP}sa.blob.core.windows.net/data/Community Sheet.xlsx"
# or: az storage blob upload ... --overwrite   (as in step 2)
```

## Notes & caveats
- **Last-writer-wins** between in-app edits and external re-uploads; each blob
  write keeps a timestamped copy under `data/backups/…` for recovery.
- **Single instance** assumed (sessions are in-memory). To scale out, move
  sessions to a shared store / JWT — out of scope for this MVP.
- If Blob isn't configured (no `BLOB_*` env), the server automatically runs in
  local-file mode — which is exactly how it runs in development.
