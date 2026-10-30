import { useEffect, useState } from 'react'
import { BookOpen, ChevronRight, Menu, PanelRight } from 'lucide-react'
import { useChat } from './chat/useChat'
import type { Message, Scenario } from './chat/types'
import { Sidebar } from './components/Sidebar'
import { Evidence } from './components/Evidence'
import { ChatPanel } from './components/ChatPanel'
import { Drawer } from './components/Drawer'
import styles from './Workspace.module.css'

export function App() {
    const chat = useChat()
    const [scenario, setScenario] = useState<Scenario>('normal')
    const [drawer, setDrawer] = useState<'nav' | 'evidence' | null>(null)
    const [selected, setSelected] = useState<{
        thread: string
        message: string
        source: string | null
    } | null>(null)
    const [now, setNow] = useState(Date.now())
    const conversation = chat.state.conversations.find((c) => c.id === chat.state.activeId)!
    const running = chat.state.conversations.some((c) =>
        c.messages.some((m) => m.status === 'running'),
    )
    useEffect(() => {
        if (running) {
            const timer = setInterval(() => setNow(Date.now()), 100)
            return () => clearInterval(timer)
        }
    }, [running])
    const activeSelection = selected?.thread === conversation.id ? selected : null
    const message =
        conversation.messages.find((m) => m.id === activeSelection?.message) ??
        conversation.messages.filter((m) => m.role === 'assistant').at(-1)
    const selectedSource = activeSelection?.source ?? null
    function inspect(m: Message, source?: string) {
        setSelected({
            thread: conversation.id,
            message: m.id,
            source: source ?? m.sourceIds[0] ?? null,
        })
        if (window.matchMedia('(max-width: 1199px)').matches) setDrawer('evidence')
    }
    function selectSource(id: string) {
        if (message)
            setSelected({
                thread: conversation.id,
                message: message.id,
                source: selectedSource === id ? '' : id,
            })
    }
    const sidebar = (
        <Sidebar
            conversations={chat.state.conversations}
            activeId={conversation.id}
            select={(id) => {
                chat.select(id)
                setDrawer(null)
            }}
            newChat={() => {
                chat.newChat()
                setSelected(null)
                setDrawer(null)
            }}
            reset={() => {
                chat.reset()
                setSelected(null)
                setDrawer(null)
            }}
        />
    )
    const evidence = (
        <Evidence
            message={message}
            selectedSource={selectedSource}
            selectSource={selectSource}
            now={now}
        />
    )
    return (
        <div className={styles.app}>
            <aside className={styles.sidebar}>{sidebar}</aside>
            <div className={styles.main}>
                <header className={styles.topbar}>
                    <div>
                        <button
                            className={`${styles.iconButton} ${styles.mobileMenu}`}
                            aria-label="打开会话导航"
                            onClick={() => setDrawer('nav')}
                        >
                            <Menu size={19} />
                        </button>
                        <span className={styles.workspaceName}>工作空间</span>
                        <ChevronRight className={styles.breadcrumbArrow} size={13} />
                        <span>智能问答</span>
                    </div>
                    <span className={styles.demoBadge}>
                        <span />
                        演示模式 · 未连接后端
                    </span>
                </header>
                <main className={styles.sheet}>
                    <header className={styles.workspaceHeader}>
                        <div>
                            <div className={styles.pageLabel}>
                                <BookOpen size={14} />
                                知识工作台
                            </div>
                            <h1>
                                {conversation.title === '新会话'
                                    ? '开始新的对话'
                                    : conversation.title}
                            </h1>
                        </div>
                        <button
                            className={styles.outlineButton}
                            aria-label="资料与过程"
                            onClick={() => {
                                setSelected(null)
                                setDrawer('evidence')
                            }}
                        >
                            <PanelRight size={16} />
                            <span>资料与过程</span>
                        </button>
                    </header>
                    {chat.storageError && (
                        <p role="status" className={styles.storageWarning}>
                            浏览器存储不可用，本次会话只在当前页面保留。
                        </p>
                    )}
                    <div className={styles.workspaceBody}>
                        <ChatPanel
                            conversation={conversation}
                            scenario={scenario}
                            setScenario={setScenario}
                            send={(text, s) => {
                                setSelected(null)
                                void chat.send(text, s)
                            }}
                            stop={() => chat.stop()}
                            retry={(id, s) => {
                                setSelected(null)
                                chat.retry(id, s)
                            }}
                            inspect={inspect}
                            now={now}
                        />
                        <aside className={styles.evidence} aria-label="资料与处理过程">
                            {evidence}
                        </aside>
                    </div>
                </main>
            </div>
            {drawer && (
                <Drawer
                    title={drawer === 'nav' ? '会话导航' : '资料与处理过程'}
                    close={() => setDrawer(null)}
                >
                    {drawer === 'nav' ? sidebar : evidence}
                </Drawer>
            )}
        </div>
    )
}
