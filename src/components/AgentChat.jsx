import { useEffect, useRef, useState } from 'react'
import { Bot, Check, Loader2, Send, Sparkles, X } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import * as agentApi from '../db/agent.js'

const ENTITY_LABELS = {
  opportunity: 'opportunity',
  resource: 'resource',
  allocation: 'allocation',
}

function ProposalCard({ proposal, applying, onApply, onDismiss }) {
  const label = ENTITY_LABELS[proposal.entity] || 'record'
  const title = proposal.action === 'create'
    ? `Create ${label}: ${proposal.recordName || 'new record'}`
    : `${proposal.action === 'delete' ? 'Delete' : 'Update'} ${label}: ${proposal.recordName || 'selected record'}`

  return (
    <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3 text-slate-800 dark:border-night-600 dark:bg-night-800 dark:text-slate-100">
      <p className="text-sm font-semibold">{title}</p>
      {proposal.action === 'delete' ? (
        <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
          {proposal.entity === 'opportunity' || proposal.entity === 'resource'
            ? 'Dependent allocations will also be removed.'
            : 'This allocation will be removed.'}
        </p>
      ) : (
        <dl className="mt-2 space-y-1">
          {Object.entries(proposal.fields || {}).slice(0, 5).map(([field, value]) => (
            <div key={field} className="flex gap-2 text-xs">
              <dt className="shrink-0 text-slate-500 dark:text-slate-400">{field.replaceAll('_', ' ')}:</dt>
              <dd className="min-w-0 break-words font-medium">{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={onApply} disabled={applying}>
          {applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {applying ? 'Applying…' : 'Apply change'}
        </button>
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-xs"
          onClick={onDismiss}
          disabled={applying}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export default function AgentChat() {
  const {
    createOpty, updateOpty, deleteOpty,
    createResource, updateResource, deleteResource,
    createAllocation, updateAllocation, deleteAllocation,
  } = useApp()
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState(null)
  const [messages, setMessages] = useState([
    { id: 'welcome', role: 'assistant', content: 'Hi. What would you like to know?' },
  ])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [applyingId, setApplyingId] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => {
    agentApi.getAgentStatus()
      .then(({ configured: isConfigured }) => setConfigured(isConfigured))
      .catch(() => setConfigured(false))
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [open, messages, sending])

  const send = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || sending || !configured) return
    const conversation = [...messages, { id: crypto.randomUUID(), role: 'user', content }]
    setMessages(conversation)
    setDraft('')
    setError('')
    setSending(true)
    try {
      const history = conversation
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .slice(-10)
        .map(({ role, content: text }) => ({ role, content: text }))
      while (history.length > 1 && history.reduce((total, message) => total + message.content.length, 0) > 7000) {
        history.shift()
      }
      const result = await agentApi.sendAgentMessages(history)
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.reply || 'I could not form a response. Please try again.',
        proposal: result.proposal || null,
      }])
    } catch (requestError) {
      setError(requestError.message || 'The assistant request failed.')
    } finally {
      setSending(false)
    }
  }

  const applyProposal = async (message) => {
    const proposal = message.proposal
    if (!proposal || applyingId) return
    const actions = {
      opportunity: { create: createOpty, update: updateOpty, delete: deleteOpty },
      resource: { create: createResource, update: updateResource, delete: deleteResource },
      allocation: { create: createAllocation, update: updateAllocation, delete: deleteAllocation },
    }
    const action = actions[proposal.entity]?.[proposal.action]
    if (!action) return

    setApplyingId(proposal.id)
    const succeeded = proposal.action === 'create'
      ? await action(proposal.fields)
      : await action(proposal.recordId, ...(proposal.action === 'update' ? [proposal.fields] : []))
    if (succeeded) {
      setMessages((current) => [
        ...current.map((item) => item.id === message.id ? { ...item, proposal: null } : item),
        { id: crypto.randomUUID(), role: 'assistant', content: 'Done. The dashboard data has been updated.' },
      ])
    }
    setApplyingId(null)
  }

  const dismissProposal = (messageId) => {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, proposal: null } : message))
  }

  return (
    <>
      {open && (
        <section
          id="allocate-agent-panel"
          role="dialog"
          aria-label="Allocate Assistant"
          className="animate-in fixed bottom-24 right-4 z-40 flex h-[min(72vh,38rem)] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-night-600 dark:bg-night-900 sm:right-6"
        >
          <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-night-700">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white dark:bg-accent-600">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Allocate Assistant</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {configured === false ? 'Connection unavailable' : 'Dashboard agent'}
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost ml-auto h-9 w-9 p-0"
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[88%] rounded-xl px-3 py-2.5 text-sm ${message.role === 'user'
                  ? 'bg-brand-600 text-white dark:bg-accent-600'
                  : 'bg-slate-100 text-slate-800 dark:bg-night-800 dark:text-slate-100'}`}>
                  {message.role === 'assistant' && <Bot size={15} className="mb-1 text-brand-600 dark:text-accent-300" />}
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  {message.proposal && (
                    <ProposalCard
                      proposal={message.proposal}
                      applying={applyingId === message.proposal.id}
                      onApply={() => applyProposal(message)}
                      onDismiss={() => dismissProposal(message.id)}
                    />
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Working…
              </div>
            )}
            {configured === false && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                The assistant connection is not configured. Contact your administrator.
              </p>
            )}
            {error && <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
            <div ref={endRef} />
          </div>

          <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-night-700">
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={1500}
              disabled={!configured || sending}
              placeholder="Ask a question or request a change"
              aria-label="Message the assistant"
              className="input min-w-0 flex-1"
            />
            <button
              type="submit"
              className="btn-primary h-10 w-10 shrink-0 p-0"
              aria-label="Send message"
              title="Send message"
              disabled={!draft.trim() || sending || !configured}
            >
              <Send size={17} />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        aria-label={open ? 'Close Allocate Assistant' : 'Open Allocate Assistant'}
        aria-expanded={open}
        aria-controls="allocate-agent-panel"
        title="Allocate Assistant"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-900/25 transition-transform hover:scale-105 hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/30 dark:bg-accent-600 dark:shadow-black/40 dark:hover:bg-accent-500 sm:bottom-6 sm:right-6"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </>
  )
}