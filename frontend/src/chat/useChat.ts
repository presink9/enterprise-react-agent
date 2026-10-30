import { useCallback, useEffect, useRef, useState } from 'react'
import { seedConversations } from './demo'
import { createMockService } from './mockService'
import { applyEvent, finishMessage, restoreWorkspace, STORAGE_KEY, updateMessage } from './state'
import type { ChatService, Message, Scenario, Workspace } from './types'

const service = createMockService()
export function useChat(chatService: ChatService = service) {
    const [state, setState] = useState<Workspace>(() => {
        let raw: string | null = null
        try {
            raw = localStorage.getItem(STORAGE_KEY)
        } catch {
            /* Browser storage may be disabled. */
        }
        return restoreWorkspace(raw, seedConversations())
    })
    const [storageError, setStorageError] = useState(false)
    const stateRef = useRef(state)
    const controllers = useRef(new Map<string, AbortController>())
    const commit = useCallback((update: (s: Workspace) => Workspace) => {
        stateRef.current = update(stateRef.current)
        setState(stateRef.current)
    }, [])
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
            setStorageError(false)
        } catch {
            setStorageError(true)
        }
    }, [state])
    useEffect(
        () => () => {
            controllers.current.forEach((c) => c.abort())
            controllers.current.clear()
        },
        [],
    )

    const send = useCallback(
        async (text: string, scenario: Scenario, retryId?: string) => {
            const threadId = stateRef.current.activeId
            const conversation = stateRef.current.conversations.find((c) => c.id === threadId)!
            if (!text.trim() || text.length > 20000 || controllers.current.has(threadId)) return
            const now = Date.now()
            const answerId = crypto.randomUUID()
            const base: Message = {
                id: answerId,
                role: 'assistant',
                text: '',
                scenario,
                status: 'running',
                stage: 'understanding',
                tools: [],
                sourceIds: [],
                startedAt: now,
            }
            const controller = new AbortController()
            controllers.current.set(threadId, controller)
            commit((s) => ({
                ...s,
                conversations: s.conversations.map((c) =>
                    c.id !== threadId
                        ? c
                        : {
                              ...c,
                              title: c.messages.length ? c.title : text.trim().slice(0, 24),
                              updatedAt: now,
                              messages: retryId
                                  ? c.messages.map((m) => (m.id === retryId ? base : m))
                                  : [
                                        ...c.messages,
                                        {
                                            ...base,
                                            id: crypto.randomUUID(),
                                            role: 'user',
                                            text: text.trim(),
                                            status: 'complete',
                                            stage: 'done',
                                            finishedAt: now,
                                        },
                                        base,
                                    ],
                          },
                ),
            }))
            try {
                for await (const event of chatService.stream({
                    threadId,
                    message: text,
                    scenario,
                    signal: controller.signal,
                })) {
                    if (controller.signal.aborted) break
                    commit((s) => updateMessage(s, threadId, answerId, (m) => applyEvent(m, event)))
                }
            } catch (error) {
                if (!controller.signal.aborted)
                    commit((s) =>
                        updateMessage(s, threadId, answerId, (m) =>
                            finishMessage(
                                {
                                    ...m,
                                    text:
                                        error instanceof Error
                                            ? '演示任务未能完成，请重试。'
                                            : '发生未知错误，请重试。',
                                },
                                'error',
                            ),
                        ),
                    )
            } finally {
                // A reset may already have started another request with the same seed thread ID.
                if (controllers.current.get(threadId) === controller)
                    controllers.current.delete(threadId)
                commit((s) =>
                    updateMessage(s, threadId, answerId, (m) =>
                        m.status === 'running'
                            ? finishMessage(m, controller.signal.aborted ? 'cancelled' : 'error')
                            : m,
                    ),
                )
            }
            return conversation.id
        },
        [chatService, commit],
    )

    function stop(threadId = stateRef.current.activeId) {
        controllers.current.get(threadId)?.abort()
        commit((s) => ({
            ...s,
            conversations: s.conversations.map((c) =>
                c.id === threadId
                    ? {
                          ...c,
                          messages: c.messages.map((m) =>
                              m.status === 'running' ? finishMessage(m, 'cancelled') : m,
                          ),
                      }
                    : c,
            ),
        }))
    }
    function newChat() {
        const id = `demo-${crypto.randomUUID()}`
        commit((s) => ({
            activeId: id,
            conversations: [
                { id, title: '新会话', messages: [], updatedAt: Date.now() },
                ...s.conversations,
            ],
        }))
    }
    function reset() {
        controllers.current.forEach((c) => c.abort())
        controllers.current.clear()
        const conversations = seedConversations()
        commit(() => ({ conversations, activeId: conversations[0].id }))
    }
    function retry(messageId: string, scenario: Scenario) {
        const c = stateRef.current.conversations.find((c) => c.id === stateRef.current.activeId)!
        const index = c.messages.findIndex((m) => m.id === messageId)
        const target = c.messages[index]
        if (!target || !['error', 'cancelled'].includes(target.status)) return
        const question = c.messages
            .slice(0, index)
            .reverse()
            .find((m) => m.role === 'user')
        if (question) void send(question.text, scenario, messageId)
    }
    return {
        state,
        storageError,
        send,
        stop,
        newChat,
        reset,
        retry,
        select: (id: string) =>
            commit((s) => (s.conversations.some((c) => c.id === id) ? { ...s, activeId: id } : s)),
    }
}
