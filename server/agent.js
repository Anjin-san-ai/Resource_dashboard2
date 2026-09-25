import { randomUUID } from 'node:crypto'
import { AzureChatOpenAI, ChatOpenAI } from '@langchain/openai'
import { createAgent, tool } from 'langchain'
import { z } from 'zod'

const SYSTEM_PROMPT = `You are Allocate Assistant, the resource planning assistant for this dashboard.
Use the dashboard summary and search tools for facts; never invent records or values.
When a user asks to change data, find the exact record first. If a target is ambiguous, ask a clarifying question instead of proposing a change.
You can prepare one proposed change with propose_dashboard_change. That tool never saves data. Clearly tell the user to review and apply the proposal; never claim a change is complete until they confirm it in the interface.
Deleting an opportunity or resource also deletes its allocations. Mention that consequence before asking the user to apply a deletion.
Keep answers concise and use dates, hours, and currency as shown in the dashboard.`

const fieldSets = {
  opportunity: {
    create: new Set([
      'kind', 'name', 'client', 'budget', 'status', 'start_date', 'end_date', 'soStatus', 'soNumber',
      'location', 'vertical', 'practice', 'country', 'city', 'rateCard', 'quantity', 'winzone',
      'projectId', 'roleDescription', 'hiringManagerId', 'requirementMonth',
    ]),
    pipelineUpdate: new Set([
      'name', 'client', 'budget', 'status', 'start_date', 'end_date', 'vertical', 'practice', 'country', 'city',
    ]),
    soUpdate: new Set(['description', 'soNumber', 'location', 'staffAssigned']),
  },
  resource: {
    create: new Set(['name', 'email', 'role', 'max_hours', 'supervisor', 'currentProject', 'accountName', 'comments']),
    update: new Set([
      'name', 'email', 'role', 'max_hours', 'supervisor', 'currentProject', 'projectName', 'accountName',
      'parentCustomer', 'status', 'pctAllocated', 'comments',
    ]),
  },
  allocation: {
    create: new Set(['opty_id', 'resource_id', 'hours_allocated', 'role_on_project', 'start_date', 'end_date']),
    update: new Set(['opty_id', 'resource_id', 'hours_allocated', 'role_on_project', 'start_date', 'end_date']),
  },
}

const changeValue = z.union([z.string(), z.number(), z.boolean()])

function getRecords(state, entity) {
  if (entity === 'opportunity') return state.optys || []
  if (entity === 'resource') return state.resources || []
  return state.allocations || []
}

function projectRecord(state, entity, row) {
  if (entity === 'opportunity') {
    return {
      id: row.id,
      name: row.name,
      client: row.client,
      status: row.status,
      kind: row.kind,
      budget: row.budget,
      start_date: row.start_date,
      end_date: row.end_date,
      quantity: row.quantity,
      staffAssigned: row.staffAssigned,
      roleDescription: row.roleDescription || row.description,
    }
  }
  if (entity === 'resource') {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      max_hours: row.max_hours,
      allocationStatus: row.allocationStatus,
    }
  }
  const opty = (state.optys || []).find((item) => item.id === row.opty_id)
  const resource = (state.resources || []).find((item) => item.id === row.resource_id)
  return {
    id: row.id,
    opportunity: opty?.name || row.projectName,
    resource: resource?.name || row.empName,
    hours_allocated: row.hours_allocated,
    role_on_project: row.role_on_project,
    start_date: row.start_date,
    end_date: row.end_date,
  }
}

function createTools(getState) {
  const dashboardSummary = tool(
    async () => {
      const { optys = [], resources = [], allocations = [] } = getState()
      const byStatus = (rows) => rows.reduce((counts, row) => {
        const status = row.status || 'Unspecified'
        counts[status] = (counts[status] || 0) + 1
        return counts
      }, {})
      const allocatedHours = allocations.reduce((total, row) => total + (Number(row.hours_allocated) || 0), 0)
      const availableHours = resources.reduce((total, row) => total + (Number(row.max_hours) || 0), 0)
      return JSON.stringify({
        opportunities: optys.length,
        resources: resources.length,
        allocations: allocations.length,
        opportunitiesByStatus: byStatus(optys),
        resourcesByStatus: byStatus(resources),
        allocatedHours,
        availableHours,
        utilizationPercent: availableHours ? Math.round((allocatedHours / availableHours) * 100) : 0,
      })
    },
    {
      name: 'get_dashboard_summary',
      description: 'Get current record counts, status counts, and high-level allocated versus available hours.',
      schema: z.object({}),
    },
  )

  const searchRecords = tool(
    async ({ entity, query }) => {
      const state = getState()
      const term = query.trim().toLowerCase()
      const rows = getRecords(state, entity)
      const matches = rows
        .map((row) => projectRecord(state, entity, row))
        .filter((row) => JSON.stringify(row).toLowerCase().includes(term))
      return JSON.stringify({ entity, count: matches.length, truncated: matches.length > 8, records: matches.slice(0, 8) })
    },
    {
      name: 'search_dashboard_records',
      description: 'Search current opportunities, resources, or allocations by name, client, status, ID, or other shown fields. Returns up to 8 matching records.',
      schema: z.object({
        entity: z.enum(['opportunity', 'resource', 'allocation']),
        query: z.string().min(1).max(100),
      }),
    },
  )

  const proposeChange = tool(
    async ({ action, entity, id, fields }) => {
      const state = getState()
      const existing = id ? getRecords(state, entity).find((row) => row.id === id) : null
      if (action !== 'create' && !existing) throw new Error('That record was not found. Search again and ask the user to identify the exact record.')
      if (entity === 'opportunity' && existing?.kind === 'Delivery') {
        throw new Error('Delivery opportunities are read-only.')
      }
      if (entity === 'opportunity' && action === 'delete' && existing?.kind !== 'Pipeline') {
        throw new Error('Only pipeline opportunities can be deleted.')
      }
      if (action === 'create' && id) throw new Error('A new record must not include an ID.')

      const allowedFields = entity === 'opportunity' && action === 'update'
        ? existing?.kind === 'SO' ? fieldSets.opportunity.soUpdate : fieldSets.opportunity.pipelineUpdate
        : fieldSets[entity][action === 'create' ? 'create' : 'update']
      const requestedFields = action === 'delete' ? {} : fields
      const unsupported = Object.keys(requestedFields).filter((key) => !allowedFields.has(key))
      if (unsupported.length) {
        throw new Error(`Unsupported ${entity} field(s): ${unsupported.join(', ')}.`)
      }
      if (action !== 'delete' && Object.keys(requestedFields).length === 0) {
        throw new Error('Provide at least one field to change.')
      }

      if (action === 'create' && entity === 'opportunity' && fields.kind && fields.kind !== 'SO' && fields.kind !== 'Pipeline') {
        throw new Error('New opportunities must be Pipeline or SO records.')
      }
      if (action === 'create' && entity === 'opportunity' && !String(fields.name || '').trim()) {
        throw new Error('An opportunity name is required.')
      }
      if (action === 'create' && entity === 'resource' && !String(fields.name || '').trim()) {
        throw new Error('A resource name is required.')
      }
      if (entity === 'allocation' && action !== 'delete') {
        const opportunityId = fields.opty_id || existing?.opty_id
        const resourceId = fields.resource_id || existing?.resource_id
        if (opportunityId && !state.optys.some((row) => row.id === opportunityId)) throw new Error('The selected opportunity does not exist.')
        const resource = state.resources.find((row) => row.id === resourceId)
        if (!resource) throw new Error('The selected resource does not exist.')
        if (!opportunityId) throw new Error('Select an opportunity for the allocation.')
        const hours = fields.hours_allocated !== undefined
          ? Number(fields.hours_allocated)
          : Number(existing?.hours_allocated)
        if (!Number.isFinite(hours) || hours <= 0) throw new Error('Allocated hours must be greater than zero.')
        const alreadyAllocated = state.allocations
          .filter((row) => row.resource_id === resourceId && row.id !== existing?.id)
          .reduce((total, row) => total + (Number(row.hours_allocated) || 0), 0)
        const remaining = (Number(resource.max_hours) || 0) - alreadyAllocated
        if (hours > remaining) throw new Error(`Only ${Math.max(0, remaining)} hours remain for ${resource.name}.`)
      }

      const proposal = {
        id: randomUUID(),
        action,
        entity,
        recordId: existing?.id || null,
        recordName: existing?.name || (entity === 'allocation'
          ? `${state.resources.find((row) => row.id === existing?.resource_id)?.name || 'Resource'} → ${state.optys.find((row) => row.id === existing?.opty_id)?.name || 'Opportunity'}`
          : fields.name || ''),
        fields: requestedFields,
      }
      return JSON.stringify({ requiresConfirmation: true, proposal })
    },
    {
      name: 'propose_dashboard_change',
      description: 'Prepare one dashboard create, update, or delete proposal for explicit user review. This tool never writes data. Search first and use the exact record ID for update/delete.',
      schema: z.object({
        action: z.enum(['create', 'update', 'delete']),
        entity: z.enum(['opportunity', 'resource', 'allocation']),
        id: z.string().optional(),
        fields: z.record(z.string(), changeValue).default({}),
      }),
    },
  )

  return [dashboardSummary, searchRecords, proposeChange]
}

export function isDashboardAgentConfigured() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT || process.env.AZURE_OPENAI_API_INSTANCE_NAME
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME
  return Boolean(
    process.env.AZURE_OPENAI_API_KEY
      && endpoint
      && deployment,
  )
}

export function createDashboardAgent(getState) {
  let agent
  const tools = createTools(getState)

  return {
    isConfigured: isDashboardAgentConfigured,
    async respond(messages) {
      if (!isDashboardAgentConfigured()) throw new Error('Dashboard assistant is not configured.')
      if (!agent) {
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT
        const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME
          || process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME
        const model = endpoint
          ? new ChatOpenAI({
            model: deployment,
            temperature: 0,
            maxRetries: 1,
            apiKey: process.env.AZURE_OPENAI_API_KEY,
            configuration: { baseURL: `${endpoint.replace(/\/+$/, '')}/` },
          })
          : new AzureChatOpenAI({
            model: process.env.AZURE_OPENAI_MODEL || deployment,
            temperature: 0,
            maxRetries: 1,
            azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
            azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
            azureOpenAIApiDeploymentName: deployment,
            azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION || process.env.OPENAI_API_VERSION || '2024-10-21',
          })
        agent = createAgent({ model, tools, systemPrompt: SYSTEM_PROMPT })
      }

      const result = await agent.invoke({ messages })
      const finalMessage = result.messages.at(-1)
      const content = finalMessage?.content
      const reply = Array.isArray(content)
        ? content.map((part) => typeof part === 'string' ? part : part.text || '').join('')
        : String(content || '')
      let proposal = null
      for (const message of [...result.messages].reverse()) {
        if (typeof message.content !== 'string') continue
        try {
          const toolResult = JSON.parse(message.content)
          if (toolResult.requiresConfirmation && toolResult.proposal) {
            proposal = toolResult.proposal
            break
          }
        } catch {
          /* Not a proposal tool result. */
        }
      }
      return { reply, proposal }
    },
  }
}