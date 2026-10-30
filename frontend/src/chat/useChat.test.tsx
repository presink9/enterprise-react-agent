import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChat } from './useChat'
import { createMockService } from './mockService'
import { restoreWorkspace, STORAGE_KEY } from './state'
import { seedConversations } from './demo'

describe('local chat lifecycle', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.useFakeTimers()
    })
    afterEach(() => {
        cleanup()
        vi.useRealTimers()
    })
    const mount = () => {
        const service = createMockService(10)
        return renderHook(() => useChat(service))
    }

    it('returns a complete answer with sources and two observed tool rounds', async () => {
        const { result } = mount()
        act(() => result.current.newChat())
        act(() => {
            void result.current.send('归档资料', 'multi')
        })
        expect(result.current.state.conversations[0].messages.at(-1)?.status).toBe('running')
        await act(async () => {
            await vi.runAllTimersAsync()
        })
        const answer = result.current.state.conversations[0].messages.at(-1)!
        expect(answer.status).toBe('complete')
        expect(answer.tools.map((t) => t.status)).toEqual(['success', 'success'])
        expect(answer.sourceIds).toHaveLength(3)
        expect(answer.text).toContain('两轮模拟检索')
    })

    it('cancels pending work without accepting late answers', async () => {
        const { result } = mount()
        act(() => result.current.newChat())
        act(() => {
            void result.current.send('问题', 'normal')
        })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(15)
        })
        act(() => result.current.stop())
        await act(async () => {
            await vi.runAllTimersAsync()
        })
        const answer = result.current.state.conversations[0].messages.at(-1)!
        expect(answer.status).toBe('cancelled')
        expect(answer.text).toBe('')
        expect(answer.tools[0].status).toBe('cancelled')
    })

    it('keeps a background answer in its originating conversation', async () => {
        const { result } = mount()
        act(() => result.current.newChat())
        const original = result.current.state.activeId
        act(() => {
            void result.current.send('问题', 'normal')
        })
        act(() => result.current.newChat())
        const current = result.current.state.activeId
        await act(async () => {
            await vi.runAllTimersAsync()
        })
        expect(result.current.state.activeId).toBe(current)
        expect(result.current.state.conversations.find((c) => c.id === current)?.messages).toEqual(
            [],
        )
        expect(
            result.current.state.conversations.find((c) => c.id === original)?.messages.at(-1)
                ?.status,
        ).toBe('complete')
    })

    it('retries a timeout using the selected scenario without duplicating the question', async () => {
        const { result } = mount()
        act(() => result.current.newChat())
        act(() => {
            void result.current.send('问题', 'timeout')
        })
        await act(async () => {
            await vi.runAllTimersAsync()
        })
        const failed = result.current.state.conversations[0].messages.at(-1)!
        expect(failed.status).toBe('error')
        act(() => result.current.retry(failed.id, 'normal'))
        await act(async () => {
            await vi.runAllTimersAsync()
        })
        const messages = result.current.state.conversations[0].messages
        expect(messages.filter((m) => m.role === 'user')).toHaveLength(1)
        expect(messages.at(-1)?.status).toBe('complete')
        expect(messages.at(-1)?.sourceIds).toHaveLength(2)
    })

    it('finishes no-results without inventing citations', async () => {
        const { result } = mount()
        act(() => result.current.newChat())
        act(() => {
            void result.current.send('问题', 'empty')
        })
        await act(async () => {
            await vi.runAllTimersAsync()
        })
        const answer = result.current.state.conversations[0].messages.at(-1)!
        expect(answer.status).toBe('complete')
        expect(answer.sourceIds).toEqual([])
        expect(answer.text).toContain('没有找到匹配资料')
    })

    it('restores persisted conversations and marks interrupted work as stopped', async () => {
        const first = mount()
        act(() => first.result.current.newChat())
        act(() => {
            void first.result.current.send('保留的问题', 'normal')
        })
        const restored = restoreWorkspace(localStorage.getItem(STORAGE_KEY), seedConversations())
        expect(restored.conversations[0].messages.at(-1)?.status).toBe('cancelled')
        expect(restored.conversations[0].messages[0].text).toBe('保留的问题')
    })

    it('discards malformed stored records safely', () => {
        const initial = seedConversations()
        expect(restoreWorkspace('{', initial).conversations).toEqual(initial)
        expect(
            restoreWorkspace(
                JSON.stringify({ activeId: 'bad', conversations: [{ messages: [{}] }] }),
                initial,
            ).conversations,
        ).toEqual(initial)
    })

    it('resets and cancels active tasks without changing restored examples', async () => {
        const { result } = mount()
        act(() => {
            void result.current.send('问题', 'timeout')
        })
        act(() => result.current.reset())
        await act(async () => {
            await vi.runAllTimersAsync()
        })
        expect(result.current.state.conversations).toHaveLength(2)
        expect(result.current.state.conversations[0].messages).toHaveLength(2)
        expect(result.current.state.conversations[0].messages.at(-1)?.status).toBe('complete')
    })
})
