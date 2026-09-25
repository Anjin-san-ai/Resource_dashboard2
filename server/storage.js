// ---------------------------------------------------------------------------
// Workbook storage abstraction.
//
// Two modes, chosen automatically at startup:
//
//   local  (default) — the workbook is a file on disk (SHEET_FILE, or the
//                       project's "Community Sheet.xlsx"). This is exactly how
//                       the app has always worked; nothing changes for local
//                       development and no Azure packages are required.
//
//   blob             — the workbook lives in Azure Blob Storage (the source of
//                       truth for the cloud deployment). Selected when
//                       BLOB_ACCOUNT_URL or AZURE_STORAGE_CONNECTION_STRING is
//                       set. The blob is downloaded to a local *working copy*
//                       so the rest of the server keeps reading/writing a
//                       normal file synchronously; blob sync happens only at
//                       the edges (startup download, post-save upload, and the
//                       Event Grid webhook / safety poll → syncDownIfChanged).
//
// The @azure/* SDKs are imported dynamically and are OPTIONAL: if they aren't
// installed (e.g. on this machine, where the OneDrive-synced node_modules make
// a clean install awkward), blob mode logs a warning and falls back to local.
// ---------------------------------------------------------------------------

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { readWorkbookBuffer, validateWorkbook } from './workbook.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const LOCAL_FILE = process.env.SHEET_FILE || path.join(__dirname, '..', 'Community Sheet.xlsx')

const ACCOUNT_URL = process.env.BLOB_ACCOUNT_URL || ''
const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING || ''
const CONTAINER = process.env.BLOB_CONTAINER || 'data'
const BLOB_NAME = process.env.BLOB_NAME || 'Community Sheet.xlsx'
const WORKDIR = process.env.WORKDIR || os.tmpdir()

let mode = 'local' // 'local' | 'blob'
let containerClient = null
let workingFile = LOCAL_FILE
let lastVersion = '' // blob etag (blob mode) or file mtime (local mode)

function localMtime(file) {
  try {
    return String(fs.statSync(file).mtimeMs)
  } catch {
    return 'missing'
  }
}

// Resolve the container client, trying connection string first, then AAD /
// managed identity via DefaultAzureCredential. Throws if the SDK is missing.
async function makeContainerClient() {
  const { BlobServiceClient } = await import('@azure/storage-blob')
  let service
  if (CONN) {
    service = BlobServiceClient.fromConnectionString(CONN)
  } else {
    const { DefaultAzureCredential } = await import('@azure/identity')
    service = new BlobServiceClient(ACCOUNT_URL, new DefaultAzureCredential())
  }
  const client = service.getContainerClient(CONTAINER)
  await client.createIfNotExists()
  return client
}

// Call once at startup. Determines the mode and, in blob mode, downloads the
// current workbook into the local working copy. Never throws — any failure
// falls back to local mode so the server always starts.
export async function initStorage() {
  if (!ACCOUNT_URL && !CONN) {
    mode = 'local'
    workingFile = LOCAL_FILE
    lastVersion = localMtime(workingFile)
    return { mode, target: workingFile }
  }
  try {
    containerClient = await makeContainerClient()
    workingFile = path.join(WORKDIR, path.basename(BLOB_NAME))
    mode = 'blob'
    const changed = await syncDownIfChanged({ force: true })
    return { mode, target: `${ACCOUNT_URL || '(conn-string)'} :: ${CONTAINER}/${BLOB_NAME}`, workingFile, downloaded: changed }
  } catch (err) {
    console.error(`[storage] Blob init failed (${err.message}); falling back to local file mode.`)
    mode = 'local'
    containerClient = null
    workingFile = LOCAL_FILE
    lastVersion = localMtime(workingFile)
    return { mode, target: workingFile, error: err.message }
  }
}

export function storageMode() {
  return mode
}

export function workingFilePath() {
  return workingFile
}

// Detect (and in blob mode, pull down) a newer workbook. Returns true when the
// working copy changed, so the caller can reparse and broadcast. Cheap in
// local mode (a stat); in blob mode it HEADs the blob and only downloads when
// the ETag moved. A downloaded blob is validated before it replaces the
// working copy — a malformed upload is rejected and the previous data stays.
export async function syncDownIfChanged({ force = false } = {}) {
  if (mode !== 'blob') {
    const v = localMtime(workingFile)
    const changed = force || v !== lastVersion
    lastVersion = v
    return changed
  }
  const blob = containerClient.getBlockBlobClient(BLOB_NAME)
  let props
  try {
    props = await blob.getProperties()
  } catch {
    return false // blob doesn't exist yet — keep whatever working copy we have
  }
  const version = `${props.etag}`
  if (!force && version === lastVersion) return false

  const buf = await blob.downloadToBuffer()
  const { ok, errors } = validateWorkbook(readWorkbookBuffer(buf))
  if (!ok) {
    console.error(`[storage] Rejected blob "${BLOB_NAME}" — invalid workbook: ${errors.join('; ')}`)
    return false
  }
  fs.mkdirSync(path.dirname(workingFile), { recursive: true })
  fs.writeFileSync(workingFile, buf)
  lastVersion = version
  return true
}

// Upload the current working copy back to the blob (blob mode only), taking a
// timestamped backup of the previous blob first. No-op in local mode.
export async function syncUp() {
  if (mode !== 'blob') return
  const blob = containerClient.getBlockBlobClient(BLOB_NAME)
  try {
    const prior = await blob.downloadToBuffer()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await containerClient
      .getBlockBlobClient(`backups/${stamp}-${BLOB_NAME}`)
      .uploadData(prior)
  } catch {
    /* no prior blob to back up — first write */
  }
  const buf = fs.readFileSync(workingFile)
  await blob.uploadData(buf, {
    blobHTTPHeaders: {
      blobContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
  // Our own upload becomes the new baseline so the safety poll doesn't treat
  // it as an external change and reload needlessly.
  try {
    lastVersion = `${(await blob.getProperties()).etag}`
  } catch {
    /* ignore */
  }
}
