import { useState } from 'react'
import { ArrowUpRight, MessageSquare, Plus, RotateCcw, Search } from 'lucide-react'
import type { Conversation } from '../chat/types'
import { Brand } from './Brand'
import styles from '../Workspace.module.css'

interface Props {
    conversations: Conversation[]
    activeId: string
    select: (id: string) => void
    newChat: () => void
    reset: () => void
}
export function Sidebar({ conversations, activeId, select, newChat, reset }: Props) {
    const [query, setQuery] = useState('')
    const [confirmReset, setConfirmReset] = useState(false)
    const visible = conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    return (
        <nav className={styles.sidebarContent} aria-label="会话导航">
            <div className={styles.brand}>
                <Brand />
                <div>
                    企业财税助手<span>知识有据，工作有序</span>
                </div>
            </div>
            <button className={styles.newChat} onClick={newChat}>
                <Plus size={17} />
                新建会话<kbd>＋</kbd>
            </button>
            <label className={styles.search}>
                <Search size={16} />
                <input
                    aria-label="搜索会话"
                    placeholder="搜索会话"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </label>
            <div className={styles.historyHeading}>最近会话</div>
            <div className={styles.history}>
                {visible.map((c) => (
                    <button
                        key={c.id}
                        className={`${styles.historyItem} ${c.id === activeId ? styles.historyActive : ''}`}
                        aria-current={c.id === activeId ? 'page' : undefined}
                        onClick={() => select(c.id)}
                    >
                        <MessageSquare size={16} />
                        <span>
                            {c.title}
                            <small>
                                {c.messages.some((m) => m.status === 'running')
                                    ? '正在处理…'
                                    : `${c.messages.filter((m) => m.role === 'user').length} 个问题 · ${c.id.startsWith('demo-') ? '本地会话' : '演示'}`}
                            </small>
                        </span>
                    </button>
                ))}
                {!visible.length && <p className={styles.emptySearch}>没有匹配的会话</p>}
            </div>
            <div className={styles.sidebarBottom}>
                <div className={styles.demoNote}>
                    <span className={styles.smallLabel}>关于这个工作台</span>
                    <p>
                        用问题连接资料，
                        <br />
                        让答案有据可查。
                    </p>
                    <span>当前展示虚构资料与模拟回答。</span>
                </div>
                {confirmReset ? (
                    <div className={styles.resetConfirm}>
                        <p>清除本地会话并恢复示例？</p>
                        <div>
                            <button
                                onClick={() => {
                                    reset()
                                    setQuery('')
                                    setConfirmReset(false)
                                }}
                            >
                                确认重置
                            </button>
                            <button onClick={() => setConfirmReset(false)}>取消</button>
                        </div>
                    </div>
                ) : (
                    <button className={styles.resetButton} onClick={() => setConfirmReset(true)}>
                        <RotateCcw size={15} />
                        重置演示
                        <ArrowUpRight size={14} />
                    </button>
                )}
                <div className={styles.localProfile}>
                    <span>访</span>
                    <div>
                        访客工作空间<small>仅存储在当前浏览器</small>
                    </div>
                    <span className={styles.localDot} />
                </div>
            </div>
        </nav>
    )
}
