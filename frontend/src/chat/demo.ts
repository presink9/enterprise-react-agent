import type { Conversation, Scenario, Source } from './types'

// All content here is a fictional, local UX fixture, not financial or legal guidance.
export const sources: Source[] = [
    {
        id: 'expense',
        title: '差旅报销办理指引',
        section: '第二章 · 申请材料',
        pages: '第 4 页',
        updated: '2026-10-20',
        excerpt:
            '提交报销申请时，建议将出差审批记录、行程说明、费用明细与对应凭证一起整理。金额与日期应能相互核对。缺少资料时，先列明待补充项，再提交经办人确认。',
    },
    {
        id: 'invoice',
        title: '票据整理与核对清单',
        section: '第一章 · 基础核对',
        pages: '第 2 页',
        updated: '2026-10-18',
        excerpt:
            '按交通、住宿及其他支出分类整理凭证，核对申请信息与票面信息。无法确定的费用项目应单独备注，交由财务人员核实。此清单仅为界面演示内容。',
    },
    {
        id: 'archive',
        title: '费用归档操作手册',
        section: '第三章 · 文件归档',
        pages: '第 6 页',
        updated: '2026-10-15',
        excerpt:
            '以出差事项建立资料目录，将申请表、审批记录和凭证按同一顺序归档。文件名注明事项与日期，方便后续查找。',
    },
]

export const scenarios: { id: Scenario; label: string; description: string }[] = [
    { id: 'normal', label: '正常回答', description: '一次检索后生成回答' },
    { id: 'multi', label: '多轮检索', description: '补充检索后汇总资料' },
    { id: 'empty', label: '无检索结果', description: '没有匹配资料时的反馈' },
    { id: 'timeout', label: '处理超时', description: '超时提示与重试入口' },
]
export const suggestions = [
    '出差报销需要准备哪些材料？',
    '如何整理和核对报销凭证？',
    '帮我生成一份资料归档清单',
]
export const normalAnswer = `可以先按 **申请记录、费用凭证、补充说明** 三类整理。下面是一份差旅报销材料清单，方便你逐项核对。

### 需要准备的材料

| 材料 | 核对重点 |
| :--- | :--- |
| 出差申请与审批记录 | 出差人、事由、时间是否一致 |
| 交通与住宿凭证 | 日期、行程与费用明细是否对应 |
| 报销申请表 | 费用分类、金额及附件是否完整 |
| 其他补充说明 | 缺失资料、特殊费用单独备注 |

申请材料可以参考 [差旅报销办理指引](#source-expense)，票据的整理顺序可参考 [票据整理与核对清单](#source-invoice)。

### 建议的办理顺序

1. 按本次出差事项收集审批记录与费用凭证。
2. 对照清单核对日期、金额和附件，标记待补充项目。
3. 将整理后的材料交由财务经办人确认。

以上是虚构资料的演示回答，实际办理请以所在企业的制度及财务确认结果为准。`

export const answers: Record<Scenario, string> = {
    normal: normalAnswer,
    multi: `已完成两轮模拟检索，补充了归档步骤。以下是示例清单：

1. **收集材料**：整理申请表、审批记录、行程和费用凭证。[申请材料](#source-expense)
2. **逐项核对**：按交通、住宿等类别核对信息，不确定的项目单独备注。[核对清单](#source-invoice)
3. **统一归档**：以出差事项建立文件夹，按申请表、审批记录、凭证的顺序保存。[归档手册](#source-archive)

这些是用于展示界面交互的虚构资料，不代表真实企业制度。`,
    empty: '本次模拟检索没有找到匹配资料。\n\n你可以补充具体业务场景、材料名称或更明确的关键词，再发起检索。当前没有可引用的依据，因此不生成业务结论。',
    timeout: '',
}
export function sourceIdsFor(scenario: Scenario): string[] {
    return scenario === 'normal'
        ? ['expense', 'invoice']
        : scenario === 'multi'
          ? sources.map((s) => s.id)
          : []
}

export function seedConversations(): Conversation[] {
    const now = Date.now()
    return [
        {
            id: 'demo-welcome',
            title: '差旅报销材料清单',
            updatedAt: now,
            messages: [
                {
                    id: 'welcome-question',
                    role: 'user',
                    text: suggestions[0],
                    scenario: 'normal',
                    status: 'complete',
                    stage: 'done',
                    tools: [],
                    sourceIds: [],
                    startedAt: now - 6200,
                    finishedAt: now - 6200,
                },
                {
                    id: 'welcome-answer',
                    role: 'assistant',
                    text: normalAnswer,
                    scenario: 'normal',
                    status: 'complete',
                    stage: 'done',
                    tools: [
                        {
                            id: 'demo-initial-tool',
                            name: 'search_knowledge_base',
                            status: 'success',
                        },
                    ],
                    sourceIds: ['expense', 'invoice'],
                    startedAt: now - 6200,
                    finishedAt: now,
                },
            ],
        },
        {
            id: 'demo-archive',
            title: '费用资料的归档顺序',
            updatedAt: now - 86400000,
            messages: [
                {
                    id: 'archive-question',
                    role: 'user',
                    text: suggestions[2],
                    scenario: 'multi',
                    status: 'complete',
                    stage: 'done',
                    tools: [],
                    sourceIds: [],
                    startedAt: now - 86410000,
                },
                {
                    id: 'archive-answer',
                    role: 'assistant',
                    text: answers.multi,
                    scenario: 'multi',
                    status: 'complete',
                    stage: 'done',
                    tools: [
                        { id: 'archive-tool-1', name: 'search_knowledge_base', status: 'success' },
                        { id: 'archive-tool-2', name: 'search_knowledge_base', status: 'success' },
                    ],
                    sourceIds: sourceIdsFor('multi'),
                    startedAt: now - 86410000,
                    finishedAt: now - 86400000,
                },
            ],
        },
    ]
}
