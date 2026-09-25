// ---------------------------------------------------------------------------
// Azure infrastructure for the "AI Opportunity and Staff Availability" BFF.
//
// Provisions, in one resource group:
//   - Storage account + blob container (source of truth for the workbook)
//   - Linux App Service Plan + Web App (Node 20) running the Express BFF
//   - System-assigned managed identity on the Web App, granted
//     "Storage Blob Data Contributor" on the storage account (no secrets)
//   - An Event Grid system topic on the storage account + a webhook
//     subscription that pings the app when a new workbook blob is created
//
// Deploy (see infra/deploy.md for the full walkthrough):
//   az group create -n <rg> -l uksouth
//   az deployment group create -g <rg> -f infra/main.bicep \
//     -p appName=<globally-unique> eventGridSecret=<random-secret>
// ---------------------------------------------------------------------------

@description('Globally-unique base name; used for the web app + storage account.')
param appName string

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Blob container that holds the workbook.')
param container string = 'data'

@description('Blob name of the workbook.')
param blobName string = 'Community Sheet.xlsx'

@description('Shared secret the Event Grid webhook must present (?secret=...).')
@secure()
param eventGridSecret string

@description('App Service Plan SKU. B1 is the smallest that keeps the app always-on.')
param planSku string = 'B1'

var storageName = toLower(replace('${appName}sa', '-', ''))
var planName = '${appName}-plan'
var webhookUrl = 'https://${appName}.azurewebsites.net/api/hooks/blob-changed?secret=${eventGridSecret}'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource dataContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: container
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: { name: planSku }
  kind: 'linux'
  properties: { reserved: true }
}

resource web 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: true
      appCommandLine: 'node server/index.js'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
        { name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE', value: 'true' }
        { name: 'BLOB_ACCOUNT_URL', value: 'https://${storageName}.blob.${environment().suffixes.storage}' }
        { name: 'BLOB_CONTAINER', value: container }
        { name: 'BLOB_NAME', value: blobName }
        { name: 'USERS_FILE', value: '/home/data/users.json' }
        { name: 'WORKDIR', value: '/home/data' }
        { name: 'EVENTGRID_SECRET', value: eventGridSecret }
      ]
    }
  }
}

// Grant the web app's managed identity read/write on the storage account.
var blobContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe' // Storage Blob Data Contributor
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, web.id, blobContributorRoleId)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobContributorRoleId)
    principalId: web.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Event Grid: storage system topic + webhook subscription for BlobCreated.
resource systemTopic 'Microsoft.EventGrid/systemTopics@2023-12-15-preview' = {
  name: '${appName}-egtopic'
  location: location
  properties: {
    source: storage.id
    topicType: 'Microsoft.Storage.StorageAccounts'
  }
}

resource subscription 'Microsoft.EventGrid/systemTopics/eventSubscriptions@2023-12-15-preview' = {
  parent: systemTopic
  name: '${appName}-blobcreated'
  properties: {
    destination: {
      endpointType: 'WebHook'
      properties: {
        endpointUrl: webhookUrl
        maxEventsPerBatch: 1
      }
    }
    filter: {
      includedEventTypes: [ 'Microsoft.Storage.BlobCreated' ]
      subjectBeginsWith: '/blobServices/default/containers/${container}/blobs/${blobName}'
    }
  }
  dependsOn: [ web ]
}

output webAppUrl string = 'https://${appName}.azurewebsites.net'
output storageAccount string = storageName
