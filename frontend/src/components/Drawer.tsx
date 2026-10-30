import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from '../Workspace.module.css'

export function Drawer({
    title,
    close,
    children,
}: {
    title: string
    close: () => void
    children: ReactNode
}) {
    const ref = useRef<HTMLDialogElement>(null)
    useEffect(() => {
        const dialog = ref.current!
        dialog.showModal()
        return () => dialog.close()
    }, [])
    return (
        <dialog
            ref={ref}
            className={styles.drawer}
            aria-label={title}
            onCancel={close}
            onClick={(e) => {
                if (e.target === e.currentTarget) close()
            }}
        >
            <div className={styles.drawerInner}>
                <div className={styles.drawerTitle}>
                    <strong>{title}</strong>
                    <button className={styles.iconButton} onClick={close} aria-label="关闭面板">
                        <X size={19} />
                    </button>
                </div>
                {children}
            </div>
        </dialog>
    )
}
