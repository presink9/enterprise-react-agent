import { sourceIdsFor } from './demo'
import type { ChatEvent, Conversation, Message, Workspace } from './types'

export function applyEvent(message: Message, event: ChatEvent, now = Date.now()): Message {
    if (message.status !== 'running') return message
    switch (event.event) {
        case 'intent':
            return {
                ...message,
                stage: event.data.intent === 'rag_search' ? 'retrieving' : 'answering',
            }
        case 'tool_start':
            return {
                ...message,
                stage: 'retrieving',
                tools: [
                    ...message.tools,
                    { id: event.data.run_id, name: event.data.name, status: 'running' },
                ],
            }
        case 'tool_end':
            return {
                ...message,
                stage: 'answering',
                tools: message.tools.map((t) =>
                    t.id === event.data.run_id ? { ...t, status: event.data.status } : t,
                ),
            }
        case 'message':
            return { ...message, text: event.data.text, sourceIds: sourceIdsFor(message.scenario) }
        case 'error':
            return finishMessage({ ...message, text: event.data.message }, 'error', now)
        case 'end':
            return finishMessage(message, 'complete', now)
        default:
            return message
    }
}
export function finishMessage(
    message: Message,
    status: 'complete' | 'error' | 'cancelled',
    now = Date.now(),
): Message {
    return {
        ...message,
        status,
        stage: 'done',
        finishedAt: now,
        tools: message.tools.map((t) =>
            t.status === 'running'
                ? { ...t, status: status === 'complete' ? 'success' : 'cancelled' }
                : t,
        ),
    }
}
export function updateMessage(
    state: Workspace,
    threadId: string,
    messageId: string,
    update: (m: Message) => Message,
): Workspace {
    return {
        ...state,
        conversations: state.conversations.map((c) =>
            c.id === threadId
                ? { ...c, messages: c.messages.map((m) => (m.id === messageId ? update(m) : m)) }
                : c,
        ),
    }
}

export const STORAGE_KEY = 'enterprise-agent-demo.v1'
export function restoreWorkspace(raw: string | null, initial: Conversation[]): Workspace {
    const fallback = { conversations: initial, activeId: initial[0].id }
    if (!raw) return fallback
    try {
        const parsed: unknown = JSON.parse(raw)
        if (
            !isRecord(parsed) ||
            !Array.isArray(parsed.conversations) ||
            !parsed.conversations.length ||
            typeof parsed.activeId !== 'string'
        )
            return fallback
        if (!parsed.conversations.every(validConversation)) return fallback
        const conversations = parsed.conversations.map((c) => ({
            ...c,
            messages: c.messages.map((m) =>
                m.status === 'running' ? finishMessage(m, 'cancelled') : m,
            ),
        }))
        return {
            conversations,
            activeId: conversations.some((c) => c.id === parsed.activeId)
                ? parsed.activeId
                : conversations[0].id,
        }
    } catch {
        return fallback
    }
}
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null
}
function validConversation(v: unknown): v is Conversation {
    return (
        isRecord(v) &&
        typeof v.id === 'string' &&
        typeof v.title === 'string' &&
        typeof v.updatedAt === 'number' &&
        Array.isArray(v.messages) &&
        v.messages.every(
            (m) =>
                isRecord(m) &&
                typeof m.id === 'string' &&
                ['user', 'assistant'].includes(String(m.role)) &&
                typeof m.text === 'string' &&
                ['normal', 'multi', 'empty', 'timeout'].includes(String(m.scenario)) &&
                ['running', 'complete', 'error', 'cancelled'].includes(String(m.status)) &&
                ['understanding', 'retrieving', 'answering', 'done'].includes(String(m.stage)) &&
                typeof m.startedAt === 'number' &&
                (m.finishedAt === undefined || typeof m.finishedAt === 'number') &&
                Array.isArray(m.sourceIds) &&
                m.sourceIds.every((id) => typeof id === 'string') &&
                Array.isArray(m.tools) &&
                m.tools.every(
                    (t) =>
                        isRecord(t) &&
                        typeof t.id === 'string' &&
                        typeof t.name === 'string' &&
                        ['running', 'success', 'error', 'cancelled'].includes(String(t.status)),
                ),
        )
    )
}
