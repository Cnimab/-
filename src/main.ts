import 'dotenv/config'
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { runSpark } from './automation'
import {
  resolveBoolean,
  resolveCookies,
  resolveMode,
  resolveTargets,
  SafeError,
  safeErrorCode,
} from './safety'

async function main(): Promise<void> {
  // Refuse verbose Playwright debugging that could expose typed text or selectors.
  if (process.env.DEBUG || process.env.PWDEBUG)
    throw new SafeError('DEBUG_LOGGING_MUST_BE_DISABLED')
  const mode = resolveMode(process.env.RUN_MODE)
  const cookies = resolveCookies(process.env.DOUYIN_COOKIE)
  const targets = resolveTargets(process.env.DOUYIN_TARGET_NAMES)
  const headless = resolveBoolean(process.env.PLAYWRIGHT_HEADLESS, true)
  const autoClose = resolveBoolean(process.env.AUTO_CLOSE, true)
  const headerSelector = process.env.DOUYIN_CHAT_HEADER_SELECTOR?.trim()
  const outgoingSelector = process.env.DOUYIN_OUTGOING_MESSAGE_SELECTOR?.trim()
  let messages: string[] = []
  if (mode !== 'diagnose') {
    try {
      const data: unknown = JSON.parse(await readFile('assets/yiyan.json', 'utf8'))
      if (
        !Array.isArray(data) ||
        data.some((v) => typeof v?.hitokoto !== 'string' || !v.hitokoto.trim())
      ) {
        throw new SafeError('INVALID_MESSAGE_DATA')
      }
      messages = data.map((v) => v.hitokoto)
    } catch {
      throw new SafeError('INVALID_MESSAGE_DATA')
    }
  }
  const executablePath = process.env.PLAYWRIGHT_BROWSER_PATH?.trim()
  const browser = await chromium.launch({ headless, ...(executablePath ? { executablePath } : {}) })
  try {
    await runSpark(
      () => browser.newContext({ serviceWorkers: 'block' }),
      {
        mode,
        cookies,
        targets,
        ...(headerSelector ? { headerSelector } : {}),
        ...(outgoingSelector ? { outgoingSelector } : {}),
      },
      messages,
    )
    if (!autoClose) {
      const readline = createInterface({ input, output })
      try {
        await readline.question('检查完成，按回车关闭浏览器...')
      } finally {
        readline.close()
      }
    }
  } finally {
    await browser.close()
  }
}
main().catch((error: unknown) => {
  console.error(safeErrorCode(error))
  process.exitCode = 1
})
