import type { BrowserContext, Cookie, Locator, Page } from 'playwright'
import { SafeError, type Mode } from './safety'

const CHAT_URL = 'https://www.douyin.com/chat'
const EDITOR =
  '.messageEditorimChatEditorContainer [data-slate-editor="true"][contenteditable="true"]'
const SEARCH = 'input[placeholder="搜索"]:visible'

export interface RunConfig {
  mode: Mode
  cookies: Cookie[]
  targets: string[]
  headerSelector?: string
  outgoingSelector?: string
  timeoutMs?: number
}
type Report = (code: string) => void

async function anyVisible(locator: Locator): Promise<boolean> {
  const count = await locator.count()
  for (let i = 0; i < count; i++) {
    if (await locator.nth(i).isVisible()) return true
  }
  return false
}
async function checkAccess(page: Page): Promise<void> {
  // Visible indicators only. Never dump the page, URL, screenshots, cookies or chats.
  if (
    (await anyVisible(
      page.locator('[id*="captcha" i], [class*="captcha" i], iframe[src*="captcha" i]'),
    )) ||
    (await anyVisible(
      page.getByText(/^(安全验证|请完成验证|拖动滑块|访问受限|操作频繁|请稍后再试)$/),
    ))
  ) {
    throw new SafeError('ACCESS_CHALLENGE_STOP_MANUAL_REVIEW')
  }
  if (
    (await anyVisible(page.getByText(/^(扫码登录|验证码登录|登录后即可聊天|请先登录)$/))) ||
    (await anyVisible(page.getByRole('dialog').filter({ hasText: /登录/ })))
  ) {
    throw new SafeError('LOGIN_REQUIRED_REFRESH_COOKIE_PRIVATELY')
  }
  const url = new URL(page.url())
  if (
    url.origin !== 'https://www.douyin.com' ||
    (url.pathname !== '/chat' && url.pathname !== '/chat/')
  ) {
    throw new SafeError('UNEXPECTED_PAGE_STOP')
  }
}
async function waitForUnique(
  page: Page,
  locator: Locator,
  code: string,
  timeout: number,
): Promise<void> {
  const end = Date.now() + timeout
  do {
    await checkAccess(page)
    const count = await locator.count()
    if (count > 1) throw new SafeError(`${code}_AMBIGUOUS`)
    if (count === 1 && (await locator.isVisible())) return
    await page.waitForTimeout(200)
  } while (Date.now() < end)
  throw new SafeError(`${code}_UNAVAILABLE`)
}
async function openConversation(page: Page, target: string, config: RunConfig): Promise<Locator> {
  const timeout = config.timeoutMs ?? 20000
  const search = page.locator(SEARCH)
  await waitForUnique(page, search, 'CHAT_SEARCH', timeout)
  await search.fill('')
  await search.fill(target)
  const result = page.locator('.SearchPanelitembox:visible').filter({
    has: page.getByText(target, { exact: true }),
  })
  await waitForUnique(page, result, 'EXACT_RECIPIENT', timeout)
  // Search updates asynchronously; re-check uniqueness after its debounce settles.
  await page.waitForTimeout(1000)
  await checkAccess(page)
  if ((await result.count()) !== 1) throw new SafeError('EXACT_RECIPIENT_AMBIGUOUS')
  const action = result.getByText(/^(发消息|发私信)$/, { exact: true })
  if ((await action.count()) !== 1) throw new SafeError('RECIPIENT_ACTION_AMBIGUOUS')
  await action.click()
  const editor = page.locator(`${EDITOR}:visible`)
  await waitForUnique(page, editor, 'EDITOR', timeout)
  if (config.headerSelector) {
    const header = page.locator(config.headerSelector)
    await waitForUnique(page, header, 'CHAT_HEADER', timeout)
    if ((await header.innerText()).trim() !== target)
      throw new SafeError('RECIPIENT_HEADER_MISMATCH')
  }
  return editor
}
async function newPage(createContext: () => Promise<BrowserContext>, config: RunConfig) {
  const context = await createContext()
  try {
    context.setDefaultTimeout(config.timeoutMs ?? 20000)
    await context.addCookies(config.cookies)
    const page = await context.newPage()
    await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' })
    return { context, page }
  } catch (error) {
    await context.close()
    throw error
  }
}
function outgoingMatches(page: Page, selector: string, message: string): Locator {
  // The selector must be verified against the current logged-in UI and point to
  // outgoing message TEXT nodes in the active transcript, never a sidebar or editor.
  return page
    .locator(selector)
    .filter({ hasText: new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })
}
async function chooseUnseenMessage(
  page: Page,
  selector: string,
  messages: string[],
): Promise<string> {
  const offset = Math.floor(Math.random() * messages.length)
  for (let i = 0; i < messages.length; i++) {
    const message = messages[(offset + i) % messages.length]
    if ((await outgoingMatches(page, selector, message).count()) === 0) return message
  }
  throw new SafeError('NO_UNIQUE_MESSAGE_AVAILABLE')
}
export async function runSpark(
  createContext: () => Promise<BrowserContext>,
  config: RunConfig,
  messages: string[],
  report: Report = console.log,
): Promise<void> {
  const targets = config.mode === 'send-all' ? config.targets : config.targets.slice(0, 1)
  if (config.mode !== 'diagnose' && (!config.headerSelector || !config.outgoingSelector)) {
    throw new SafeError('VERIFICATION_SELECTORS_REQUIRED_NO_MESSAGE_SENT')
  }
  if (config.mode !== 'diagnose' && (messages.length === 0 || messages.some((s) => !s.trim()))) {
    throw new SafeError('INVALID_MESSAGE_DATA')
  }
  let attempted = false
  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      const { context, page } = await newPage(createContext, config)
      let message = ''
      try {
        const editor = await openConversation(page, target, config)
        report('EXACT_RECIPIENT_AND_EDITOR_VISIBLE')
        if (config.mode === 'diagnose') {
          report(
            config.headerSelector && config.outgoingSelector
              ? 'DIAGNOSE_PASSED_NO_MESSAGE_SENT_LIVE_VERIFICATION_PENDING'
              : 'DIAGNOSE_PASSED_NO_MESSAGE_SENT_VERIFICATION_SELECTORS_REQUIRED',
          )
          return
        }
        const selector = config.outgoingSelector!
        // Require existing outgoing history as a sanity check for a stale selector.
        if ((await page.locator(selector).count()) === 0)
          throw new SafeError('OUTGOING_SELECTOR_UNVERIFIED_NO_MESSAGE_SENT')
        if ((await editor.innerText()).trim()) throw new SafeError('EXISTING_DRAFT_NO_MESSAGE_SENT')
        message = await chooseUnseenMessage(page, selector, messages)
        await checkAccess(page)
        // Recheck recipient immediately before inserting text; do not change an existing draft.
        if ((await page.locator(config.headerSelector!).innerText()).trim() !== target) {
          throw new SafeError('RECIPIENT_HEADER_MISMATCH')
        }
        await editor.fill(message)
        await checkAccess(page)
        if ((await page.locator(config.headerSelector!).innerText()).trim() !== target) {
          throw new SafeError('RECIPIENT_HEADER_MISMATCH')
        }
        attempted = true // Set BEFORE Enter: a thrown keypress can still have sent.
        await editor.press('Enter')
        await waitForUnique(
          page,
          outgoingMatches(page, selector, message),
          'OUTGOING_RECORD',
          config.timeoutMs ?? 20000,
        )
      } finally {
        await context.close()
      }
      // A fresh browser context has no local cache/storage/optimistic UI from the send.
      const readback = await newPage(createContext, config)
      try {
        await openConversation(readback.page, target, config)
        await waitForUnique(
          readback.page,
          outgoingMatches(readback.page, config.outgoingSelector!, message),
          'PERSISTED_OUTGOING_RECORD',
          config.timeoutMs ?? 20000,
        )
        report(`PERSISTED_OUTGOING_RECORD_VERIFIED_RECIPIENT_${i + 1}`)
        attempted = false
      } finally {
        await readback.context.close()
      }
    }
  } catch (error) {
    if (attempted) throw new SafeError('SEND_OUTCOME_UNCERTAIN_STOP_CHECK_CHAT_DO_NOT_RETRY')
    throw error
  }
}
