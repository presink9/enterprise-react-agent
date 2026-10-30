import { answers } from './demo'
import type { ChatService } from './types'

function delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new DOMException('Stopped', 'AbortError'))
            return
        }
        const onAbort = () => {
            clearTimeout(timer)
            reject(new DOMException('Stopped', 'AbortError'))
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort)
            resolve()
        }, ms)
        signal.addEventListener('abort', onAbort, { once: true })
    })
}

// No fetch, provider keys or backend dependency. Responses are scripted by scenario.
export function createMockService(stepMs = 900): ChatService {
    return {
        async *stream({ threadId, scenario, signal }) {
            signal.throwIfAborted()
            yield { event: 'session', data: { thread_id: threadId } }
            await delay(stepMs, signal)
            yield { event: 'intent', data: { intent: 'rag_search' } }
            for (let round = 0; round < (scenario === 'multi' ? 2 : 1); round++) {
                const run_id = crypto.randomUUID()
                yield { event: 'tool_start', data: { name: 'search_knowledge_base', run_id } }
                await delay(stepMs * 2, signal)
                yield {
                    event: 'tool_end',
                    data: { name: 'search_knowledge_base', run_id, status: 'success' },
                }
                if (scenario === 'multi') await delay(stepMs, signal)
            }
            await delay(stepMs * 2, signal)
            if (scenario === 'timeout') {
                yield {
                    event: 'error',
                    data: {
                        code: 'timeout',
                        message: '本次演示处理已超时。你可以重试，或切换演示场景后重新提问。',
                    },
                }
            } else {
                yield { event: 'message', data: { text: answers[scenario] } }
            }
            yield { event: 'end', data: '[DONE]' }
        },
    }
}
