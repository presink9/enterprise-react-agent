import { expect, test } from '@playwright/test'

test('renders the sample answer, opens the right citation, and copies text', async ({
    page,
    context,
}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('差旅报销材料清单')
    await page.getByRole('button', { name: '票据整理与核对清单', exact: true }).first().click()
    await expect(
        page.getByText('按交通、住宿及其他支出分类整理凭证', { exact: false }),
    ).toBeVisible()
    await page.getByRole('button', { name: '复制回答' }).click()
    await expect(page.getByRole('button', { name: '已复制' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
        '申请记录、费用凭证、补充说明',
    )
})

test('new conversation, IME-safe composer, stop and successful retry', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '新建会话' }).click()
    const input = page.getByRole('textbox', { name: '输入你的问题' })
    await input.fill('测试中文输入')
    await input.dispatchEvent('compositionstart')
    await input.press('Enter')
    await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0)
    await input.dispatchEvent('compositionend')
    await input.press('Enter')
    await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()
    await page.getByRole('button', { name: '停止生成' }).click()
    await expect(page.getByText('已停止生成', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: '重新尝试' }).click()
    await expect(page.getByRole('button', { name: '复制回答' })).toBeVisible({ timeout: 10000 })
    await expect(
        page.getByRole('region', { name: '聊天工作区' }).getByText('测试中文输入', { exact: true }),
    ).toHaveCount(1)
})

test('mobile drawers, keyboard focus, persistence and zero horizontal overflow', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: '打开会话导航' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('textbox', { name: '搜索会话' }).fill('不存在')
    await expect(page.getByText('没有匹配的会话')).toBeVisible()
    await page.getByRole('button', { name: '新建会话' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('开始新的对话')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('开始新的对话')
    await page.getByRole('button', { name: '资料与过程' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('timeout and empty retrieval are explicit, without browser errors or API requests', async ({
    page,
}) => {
    const errors: string[] = []
    const requests: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('request', (r) => {
        if (r.url().includes('/api/')) requests.push(r.url())
    })
    await page.goto('/')
    await page.getByRole('button', { name: '新建会话' }).click()
    await page.getByLabel('演示场景', { exact: true }).selectOption('timeout')
    await page.getByRole('textbox', { name: '输入你的问题' }).fill('超时演示')
    await page.getByRole('button', { name: '发送问题' }).click()
    await expect(page.getByText('这次回答未能完成')).toBeVisible({ timeout: 10000 })
    await page.getByLabel('演示场景', { exact: true }).selectOption('empty')
    await page.getByRole('button', { name: '重新尝试' }).click()
    await expect(page.getByText('本次模拟检索没有找到匹配资料。', { exact: false })).toBeVisible({
        timeout: 10000,
    })
    await expect(page.getByText('暂无引用资料')).toBeVisible()
    expect(errors).toEqual([])
    expect(requests).toEqual([])
})
