import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
    ArrowDown,
    ArrowUp,
    Check,
    ChevronRight,
    Copy,
    FileText,
    Lightbulb,
    LoaderCircle,
    RotateCcw,
    Square,
    TriangleAlert,
} from 'lucide-react'
import { scenarios, suggestions } from '../chat/demo'
import type { Conversation, Message, Scenario } from '../chat/types'
import { Brand } from './Brand'
import styles from '../Workspace.module.css'

interface Props {
    conversation: Conversation
    scenario: Scenario
    setScenario: (s: Scenario) => void
    send: (text: string, scenario: Scenario) => void
    stop: () => void
    retry: (id: string, scenario: Scenario) => void
    inspect: (message: Message, sourceId?: string) => void
    now: number
}
export function ChatPanel({
    conversation,
    scenario,
    setScenario,
    send,
    stop,
    retry,
    inspect,
    now,
}: Props) {
    const [drafts, setDrafts] = useState<Record<string, string>>({})
    const draft = drafts[conversation.id] ?? ''
    const [copied, setCopied] = useState<string | null>(null)
    const [copyError, setCopyError] = useState(false)
    const scroll = useRef<HTMLDivElement>(null)
    const input = useRef<HTMLTextAreaElement>(null)
    const composing = useRef(false)
    const running = conversation.messages.some((m) => m.status === 'running')
    useEffect(() => {
        scroll.current?.scrollTo({ top: 0 })
    }, [conversation.id])
    useEffect(() => {
        if (running) scroll.current?.scrollTo({ top: scroll.current.scrollHeight })
    }, [conversation.messages.length, running])
    useEffect(() => {
        if (copied) {
            const timer = setTimeout(() => setCopied(null), 1800)
            return () => clearTimeout(timer)
        }
    }, [copied])
    function submit(text = draft) {
        if (!text.trim() || running) return
        send(text, scenario)
        setDrafts((d) => ({ ...d, [conversation.id]: '' }))
        input.current?.focus()
    }
    async function copy(message: Message) {
        try {
            await navigator.clipboard.writeText(message.text)
            setCopied(message.id)
            setCopyError(false)
        } catch {
            setCopyError(true)
        }
    }
    return (
        <section className={styles.chatPanel} aria-label="聊天工作区">
            <div ref={scroll} className={styles.messageScroll}>
                {conversation.messages.length === 0 ? (
                    <div className={styles.welcome}>
                        <Brand />
                        <span className={styles.smallLabel}>企业财税知识助手</span>
                        <h2>
                            把问题交给我，
                            <br />
                            从资料里找答案。
                        </h2>
                        <p>从一份材料清单开始，体验有引用依据的问答。</p>
                        <div className={styles.starterList}>
                            {suggestions.map((text) => (
                                <button key={text} onClick={() => submit(text)}>
                                    {text}
                                    <ChevronRight size={16} />
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className={styles.messages}>
                        <div className={styles.conversationDate}>
                            <span />
                            本地演示会话
                            <span />
                        </div>
                        {conversation.messages.map((message) =>
                            message.role === 'user' ? (
                                <div key={message.id} className={styles.userMessage}>
                                    <span className={styles.userLabel}>你</span>
                                    <p>{message.text}</p>
                                </div>
                            ) : (
                                <article
                                    key={message.id}
                                    className={styles.answer}
                                    aria-label="助手回答"
                                >
                                    <div className={styles.answerHeading}>
                                        <Brand small />
                                        <strong>企业财税助手</strong>
                                        <span>演示回答</span>
                                    </div>
                                    {message.status === 'running' ? (
                                        <div className={styles.progress} role="status">
                                            <LoaderCircle size={17} className={styles.spinner} />
                                            <div>
                                                <strong>
                                                    {message.stage === 'retrieving'
                                                        ? `正在检索资料${message.tools.length > 1 ? ` · 第 ${message.tools.length} 轮` : ''}`
                                                        : message.stage === 'answering'
                                                          ? '正在整理回答'
                                                          : '正在理解问题'}
                                                </strong>
                                                <span>
                                                    模拟处理中 ·{' '}
                                                    {Math.max(
                                                        0,
                                                        (now - message.startedAt) / 1000,
                                                    ).toFixed(1)}{' '}
                                                    秒
                                                </span>
                                            </div>
                                            <button onClick={() => inspect(message)}>
                                                查看过程
                                                <ChevronRight size={14} />
                                            </button>
                                        </div>
                                    ) : null}
                                    {message.status === 'complete' && (
                                        <button
                                            className={styles.retrievalSummary}
                                            onClick={() => inspect(message)}
                                        >
                                            <Check size={14} />
                                            <span>
                                                {message.sourceIds.length
                                                    ? `已参考 ${message.sourceIds.length} 份示例资料`
                                                    : '检索完成，未找到匹配资料'}
                                            </span>
                                            <ChevronRight size={14} />
                                            <span>
                                                {(
                                                    (message.finishedAt! - message.startedAt) /
                                                    1000
                                                ).toFixed(1)}{' '}
                                                秒
                                            </span>
                                        </button>
                                    )}
                                    {message.status === 'error' ||
                                    message.status === 'cancelled' ? (
                                        <div className={styles.errorState} role="status">
                                            <TriangleAlert size={18} />
                                            <div>
                                                <strong>
                                                    {message.status === 'error'
                                                        ? '这次回答未能完成'
                                                        : '已停止生成'}
                                                </strong>
                                                <p>
                                                    {message.text ||
                                                        '已保留你的问题，可以重新尝试。'}
                                                </p>
                                                <button onClick={() => retry(message.id, scenario)}>
                                                    <RotateCcw size={14} />
                                                    重新尝试
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        message.text && (
                                            <div className={styles.markdown}>
                                                <Markdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        a: ({ href, children }) =>
                                                            href?.startsWith('#source-') ? (
                                                                <button
                                                                    className={styles.citation}
                                                                    onClick={() =>
                                                                        inspect(
                                                                            message,
                                                                            href.slice(8),
                                                                        )
                                                                    }
                                                                >
                                                                    {children}
                                                                    <ArrowUp size={11} />
                                                                </button>
                                                            ) : (
                                                                <a
                                                                    href={href}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                >
                                                                    {children}
                                                                </a>
                                                            ),
                                                        table: ({ children }) => (
                                                            <div className={styles.tableScroll}>
                                                                <table>{children}</table>
                                                            </div>
                                                        ),
                                                    }}
                                                >
                                                    {message.text}
                                                </Markdown>
                                            </div>
                                        )
                                    )}
                                    {message.status === 'complete' && (
                                        <div className={styles.answerActions}>
                                            <button onClick={() => void copy(message)}>
                                                {copied === message.id ? (
                                                    <Check size={15} />
                                                ) : (
                                                    <Copy size={15} />
                                                )}
                                                {copied === message.id ? '已复制' : '复制回答'}
                                            </button>
                                            <button onClick={() => inspect(message)}>
                                                <FileText size={15} />
                                                查看依据
                                            </button>
                                        </div>
                                    )}
                                </article>
                            ),
                        )}
                        {copyError && (
                            <p role="status" className={styles.copyError}>
                                浏览器不允许复制，请选中回答文字手动复制。
                            </p>
                        )}
                    </div>
                )}
            </div>
            <div className={styles.composerWrap}>
                <div className={styles.scenarioBar}>
                    <label>
                        <Lightbulb size={14} />
                        演示场景
                        <select
                            aria-label="演示场景"
                            value={scenario}
                            onChange={(e) => setScenario(e.target.value as Scenario)}
                        >
                            {scenarios.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button
                        className={styles.iconButton}
                        title="滚动到最新消息"
                        aria-label="滚动到最新消息"
                        onClick={() =>
                            scroll.current?.scrollTo({
                                top: scroll.current.scrollHeight,
                                behavior: 'smooth',
                            })
                        }
                    >
                        <ArrowDown size={16} />
                    </button>
                </div>
                <form
                    className={styles.composer}
                    onSubmit={(e) => {
                        e.preventDefault()
                        submit()
                    }}
                >
                    <label className="sr-only" htmlFor="question">
                        输入你的问题
                    </label>
                    <textarea
                        ref={input}
                        id="question"
                        placeholder="输入你的问题，让资料给出线索…"
                        value={draft}
                        maxLength={20000}
                        rows={2}
                        onChange={(e) =>
                            setDrafts((d) => ({ ...d, [conversation.id]: e.target.value }))
                        }
                        onCompositionStart={() => {
                            composing.current = true
                        }}
                        onCompositionEnd={() => {
                            composing.current = false
                        }}
                        onKeyDown={(e) => {
                            if (
                                e.key === 'Enter' &&
                                !e.shiftKey &&
                                !composing.current &&
                                !e.nativeEvent.isComposing &&
                                e.nativeEvent.keyCode !== 229
                            ) {
                                e.preventDefault()
                                submit()
                            }
                        }}
                    />
                    <div className={styles.composerBottom}>
                        <span>
                            <span className={styles.contextDot} />
                            示例知识库
                            <span className={styles.enterHint}>
                                Enter 发送 · Shift + Enter 换行
                            </span>
                        </span>
                        {running ? (
                            <button
                                className={styles.sendButton}
                                type="button"
                                onClick={stop}
                                aria-label="停止生成"
                            >
                                <Square size={17} />
                            </button>
                        ) : (
                            <button
                                className={styles.sendButton}
                                type="submit"
                                disabled={!draft.trim()}
                                aria-label="发送问题"
                            >
                                <ArrowUp size={20} />
                            </button>
                        )}
                    </div>
                </form>
                <p className={styles.composerNote}>
                    内容由当前演示场景生成，不调用真实模型或知识库。
                </p>
            </div>
        </section>
    )
}
