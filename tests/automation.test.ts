import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { runSpark, type RunConfig } from '../src/automation'

let browser: Browser
before(async () => {
  const executablePath = process.env.TEST_BROWSER_PATH
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
})
after(async () => {
  await browser?.close()
})

// Entirely synthetic chat. ALL requests are intercepted; no real site or credentials.
function fixture(
  options: {
    page?: 'login' | 'challenge' | 'missing'
    duplicate?: boolean
    persist?: boolean
    wrongHeader?: boolean
    existingDraft?: boolean
  } = {},
) {
  const sends: Array<{ target: string; text: string }> = []
  const reports: string[] = []
  const createContext = async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      assert.equal(url.origin, 'https://www.douyin.com')
      if (url.pathname === '/mock-send') {
        sends.push(route.request().postDataJSON())
        await route.fulfill({ json: { ok: true } })
        return
      }
      assert.equal(url.pathname, '/chat')
      const previous = options.persist === false ? [] : sends
      let html = '<p>Page unavailable</p>'
      if (options.page === 'login') html = '<div role="dialog">扫码登录</div>'
      else if (options.page === 'challenge') html = '<div id="captcha">安全验证</div>'
      else if (!options.page)
        html = `
        <input placeholder="搜索"><section id="results"></section>
        <h1 id="header"></h1><div id="history"></div>
        <div class="messageEditorimChatEditorContainer"><div data-slate-editor="true" contenteditable="true" style="display:none;min-height:20px;width:200px"></div></div>
        <script>
        const previous = ${JSON.stringify(previous)};
        const input = document.querySelector('input');
        const results = document.querySelector('#results');
        const editor = document.querySelector('[contenteditable]');
        let target = '';
        input.addEventListener('input', () => {
          results.replaceChildren();
          if (!input.value) return;
          for(let i = 0; i < ${options.duplicate ? 2 : 1}; i++) {
            const result = document.createElement('div'); result.className = 'SearchPanelitembox';
            const name = document.createElement('span'); name.textContent = input.value;
            const button = document.createElement('button'); button.textContent = '发消息';
            button.onclick = () => {
              target = name.textContent;
              document.querySelector('#header').textContent = ${options.wrongHeader ? "'Wrong person'" : 'target'};
              editor.style.display = 'block';
              editor.textContent = ${options.existingDraft ? "'existing draft'" : "''"};
              document.querySelector('#history').replaceChildren();
              add('old outgoing history');
              previous.filter(m => m.target === target).forEach(m => add(m.text));
            };
            result.append(name, button); results.append(result);
          }
        });
        function add(text) { const el = document.createElement('p'); el.className = 'outgoing-text'; el.textContent = text; document.querySelector('#history').append(el); }
        editor.addEventListener('keydown', async e => {
          if (e.key !== 'Enter') return;
          e.preventDefault(); const text = editor.innerText;
          await fetch('/mock-send', { method:'POST', body: JSON.stringify({target, text}) });
          add(text); editor.textContent = '';
        });
        </script>`
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<meta charset="utf-8">' + html,
      })
    })
    return context
  }
  const config: RunConfig = {
    mode: 'diagnose',
    cookies: [],
    targets: ['First friend', 'Second friend'],
    timeoutMs: 1000,
    headerSelector: '#header',
    outgoingSelector: '#history .outgoing-text',
  }
  return { createContext, config, sends, reports, report: (code: string) => reports.push(code) }
}

test('diagnostics opens only first configured conversation and sends nothing', async () => {
  const f = fixture()
  await runSpark(f.createContext, f.config, [], f.report)
  assert.equal(f.sends.length, 0)
  assert.match(f.reports.at(-1)!, /NO_MESSAGE_SENT/)
})
test('test-one sends exactly one original message to first configured friend and cold-readbacks it', async () => {
  const f = fixture()
  await runSpark(
    f.createContext,
    { ...f.config, mode: 'test-one' },
    ['Synthetic phrase [one].'],
    f.report,
  )
  assert.deepEqual(f.sends, [{ target: 'First friend', text: 'Synthetic phrase [one].' }])
  assert.equal(f.reports.at(-1), 'PERSISTED_OUTGOING_RECORD_VERIFIED_RECIPIENT_1')
})
test('sending without verified selectors stops before opening a browser', async () => {
  const f = fixture()
  await assert.rejects(
    runSpark(f.createContext, { mode: 'test-one', cookies: [], targets: f.config.targets }, ['x']),
    /VERIFICATION_SELECTORS_REQUIRED/,
  )
  assert.equal(f.sends.length, 0)
})
for (const scenario of ['login', 'challenge', 'missing'] as const) {
  test(`${scenario} page fails closed without sending`, async () => {
    const f = fixture({ page: scenario })
    await assert.rejects(
      runSpark(f.createContext, f.config, [], f.report),
      new RegExp(
        {
          login: 'LOGIN_REQUIRED',
          challenge: 'ACCESS_CHALLENGE',
          missing: 'CHAT_SEARCH_UNAVAILABLE',
        }[scenario],
      ),
    )
    assert.equal(f.sends.length, 0)
  })
}
test('ambiguous exact-name matches fail closed', async () => {
  const f = fixture({ duplicate: true })
  await assert.rejects(
    runSpark(f.createContext, { ...f.config, mode: 'test-one' }, ['x'], f.report),
    /EXACT_RECIPIENT_AMBIGUOUS/,
  )
  assert.equal(f.sends.length, 0)
})
test('wrong conversation header fails before typing', async () => {
  const f = fixture({ wrongHeader: true })
  await assert.rejects(
    runSpark(f.createContext, { ...f.config, mode: 'test-one' }, ['x'], f.report),
    /RECIPIENT_HEADER_MISMATCH/,
  )
  assert.equal(f.sends.length, 0)
})
test('optimistic bubble is not success; uncertain readback stops remaining recipients without retry', async () => {
  const f = fixture({ persist: false })
  await assert.rejects(
    runSpark(f.createContext, { ...f.config, mode: 'send-all' }, ['x'], f.report),
    /SEND_OUTCOME_UNCERTAIN/,
  )
  assert.equal(f.sends.length, 1)
  assert.equal(
    f.reports.some((code) => code.startsWith('PERSISTED_OUTGOING_RECORD_VERIFIED')),
    false,
  )
})

test('existing draft is never replaced or sent', async () => {
  const f = fixture({ existingDraft: true })
  await assert.rejects(
    runSpark(f.createContext, { ...f.config, mode: 'test-one' }, ['x'], f.report),
    /EXISTING_DRAFT_NO_MESSAGE_SENT/,
  )
  assert.equal(f.sends.length, 0)
})
test('stale outgoing selector refuses to send', async () => {
  const f = fixture()
  await assert.rejects(
    runSpark(
      f.createContext,
      { ...f.config, mode: 'test-one', outgoingSelector: '.missing' },
      ['x'],
      f.report,
    ),
    /OUTGOING_SELECTOR_UNVERIFIED_NO_MESSAGE_SENT/,
  )
  assert.equal(f.sends.length, 0)
})
