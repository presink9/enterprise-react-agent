import { Check, ChevronDown, ChevronRight, Clock3, FileText, Layers, Search, X } from 'lucide-react'
import type { Message } from '../chat/types'
import { sources } from '../chat/demo'
import styles from '../Workspace.module.css'

export function Evidence({
    message,
    selectedSource,
    selectSource,
    now,
}: {
    message?: Message
    selectedSource: string | null
    selectSource: (id: string) => void
    now: number
}) {
    const matched = sources.filter((s) => message?.sourceIds.includes(s.id))
    const running = message?.status === 'running'
    const elapsed = message
        ? Math.max(0, ((message.finishedAt ?? now) - message.startedAt) / 1000).toFixed(1)
        : '0.0'
    const labels = {
        understanding: '理解问题',
        retrieving: '检索资料',
        answering: '整理回答',
        done: '处理完成',
    }
    return (
        <div className={styles.evidenceContent}>
            <div className={styles.evidenceHeading}>
                <h2>参考资料</h2>
                <span>{matched.length} 份</span>
            </div>
            <p className={styles.evidenceIntro}>回答的依据，就在这里。</p>
            <div className={styles.sourceList}>
                {matched.map((source, index) => (
                    <section className={styles.source} key={source.id}>
                        <button
                            className={styles.sourceToggle}
                            aria-expanded={selectedSource === source.id}
                            onClick={() => selectSource(source.id)}
                        >
                            <FileText size={18} />
                            <span>
                                <strong>{source.title}</strong>
                                <small>{source.section}</small>
                            </span>
                            {selectedSource === source.id ? (
                                <ChevronDown size={15} />
                            ) : (
                                <ChevronRight size={15} />
                            )}
                        </button>
                        <div className={styles.sourceMeta}>
                            <span>示例资料</span>
                            <span>{source.pages}</span>
                        </div>
                        {selectedSource === source.id && (
                            <div className={styles.sourceExcerpt}>
                                <p>{source.excerpt}</p>
                                <span>示例更新日期 · {source.updated}</span>
                            </div>
                        )}
                        <div className={styles.sourceIndex}>引用 {index + 1}</div>
                    </section>
                ))}
                {!matched.length && (
                    <div className={styles.emptySources}>
                        <FileText size={25} />
                        <p>{running ? '正在查找示例资料' : '暂无引用资料'}</p>
                        <span>
                            {running ? '检索完成后在此查看依据' : '有依据的回答会在这里列出引用'}
                        </span>
                    </div>
                )}
            </div>
            <div className={styles.processHeader}>
                <h2>处理过程</h2>
                <span>模拟执行</span>
            </div>
            {message ? (
                <>
                    <div className={styles.elapsed}>
                        <Clock3 size={14} />
                        <span>{running ? '已用时' : '总耗时'}</span>
                        <strong>{elapsed} 秒</strong>
                    </div>
                    <ol className={styles.timeline}>
                        <li>
                            <span
                                className={`${styles.stepIcon} ${running && message.stage === 'understanding' ? styles.stepActive : ''}`}
                            >
                                {running && message.stage === 'understanding' ? (
                                    <Search size={13} />
                                ) : (
                                    <Check size={13} />
                                )}
                            </span>
                            <div>
                                <strong>理解问题</strong>
                                <p>识别问题中的资料需求</p>
                            </div>
                        </li>
                        {message.tools.map((tool, index) => (
                            <li key={tool.id}>
                                <span
                                    className={`${styles.stepIcon} ${tool.status === 'running' ? styles.stepActive : ''}`}
                                >
                                    {tool.status === 'success' ? (
                                        <Check size={13} />
                                    ) : tool.status === 'running' ? (
                                        <Search size={13} />
                                    ) : (
                                        <X size={13} />
                                    )}
                                </span>
                                <div>
                                    <strong>
                                        检索资料
                                        {message.tools.length > 1 ? ` · 第 ${index + 1} 轮` : ''}
                                    </strong>
                                    <p>
                                        {tool.status === 'success'
                                            ? '知识库检索完成'
                                            : tool.status === 'running'
                                              ? '正在查找相关内容'
                                              : '本轮检索已停止'}
                                    </p>
                                </div>
                            </li>
                        ))}
                        <li>
                            <span
                                className={`${styles.stepIcon} ${running && message.stage === 'answering' ? styles.stepActive : ''}`}
                            >
                                {message.status === 'complete' ? (
                                    <Check size={13} />
                                ) : (
                                    <Layers size={13} />
                                )}
                            </span>
                            <div>
                                <strong>
                                    {message.status === 'error'
                                        ? '处理超时'
                                        : message.status === 'cancelled'
                                          ? '已停止生成'
                                          : '整理回答'}
                                </strong>
                                <p>
                                    {message.status === 'complete'
                                        ? '结合资料给出完整回答'
                                        : running
                                          ? labels[message.stage]
                                          : '可在聊天区重新尝试'}
                                </p>
                            </div>
                        </li>
                    </ol>
                </>
            ) : (
                <p className={styles.noProcess}>提出问题后，在此查看处理阶段。</p>
            )}
            <p className={styles.evidenceFootnote}>
                资料与执行过程均为本地演示，
                <br />
                不代表真实检索结果。
            </p>
        </div>
    )
}
