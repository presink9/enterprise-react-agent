export type Scenario = 'normal' | 'multi' | 'empty' | 'timeout'

// These are the backend's SSE payloads, not token deltas or internal reasoning.
export type ChatEvent =
    | { event: 'session'; data: { thread_id: string } }
    | { event: 'intent'; data: { intent: 'general_chat' | 'rag_search' } }
    | { event: 'tool_start'; data: { name: string; run_id: string } }
    | { event: 'tool_end'; data: { name: string; run_id: string; status: 'success' | 'error' } }
    | { event: 'message'; data: { text: string } }
    | { event: 'error'; data: { code: 'timeout' | 'agent_error'; message: string } }
    | { event: 'end'; data: '[DONE]' }

export type RunStatus = 'running' | 'complete' | 'error' | 'cancelled'
export interface ToolRun {
    id: string
    name: string
    status: 'running' | 'success' | 'error' | 'cancelled'
}
export interface Message {
    id: string
    role: 'user' | 'assistant'
    text: string
    scenario: Scenario
    status: RunStatus
    stage: 'understanding' | 'retrieving' | 'answering' | 'done'
    tools: ToolRun[]
    sourceIds: string[]
    startedAt: number
    finishedAt?: number
}
export interface Conversation {
    id: string
    title: string
    updatedAt: number
    messages: Message[]
}
export interface Workspace {
    conversations: Conversation[]
    activeId: string
}
export interface Source {
    id: string
    title: string
    section: string
    excerpt: string
    pages: string
    updated: string
}
export interface ChatRequest {
    threadId: string
    message: string
    scenario: Scenario
    signal: AbortSignal
}
export interface ChatService {
    stream(request: ChatRequest): AsyncIterable<ChatEvent>
}
