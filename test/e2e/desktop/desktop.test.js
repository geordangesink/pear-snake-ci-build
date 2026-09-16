const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const launchApp = require('./launch')

const executablePath = process.env.SNAKE_E2E_BIN
const results = path.join(__dirname, 'results')
const networkTimeout = 90_000

test(
  'packaged app: create, steer, join another instance, and leave',
  { timeout: 300_000 },
  async () => {
    assert.ok(executablePath, 'Set SNAKE_E2E_BIN to the packaged Snake executable')
    fs.mkdirSync(results, { recursive: true })
    const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'snake-e2e-'))
    const instances = []

    async function launch(name) {
      const directory = path.join(storage, name)
      fs.mkdirSync(directory)
      const env = { ...process.env, PEAR_DEV_SERVER_URL: '' }
      delete env.ELECTRON_RUN_AS_NODE
      if (process.env.SNAKE_E2E_APPIMAGE) {
        env.APPIMAGE = process.env.SNAKE_E2E_APPIMAGE
        env.APPDIR = path.dirname(executablePath)
        env.LD_LIBRARY_PATH = `${env.APPDIR}/usr/lib:${env.LD_LIBRARY_PATH || ''}`
      }
      const app = await launchApp(
        executablePath,
        [
          '--no-updates',
          '--storage',
          directory,
          ...(process.platform === 'linux' ? ['--no-sandbox'] : [])
        ],
        env,
        path.join(results, `${name}.log`)
      )
      const instance = { app, name, errors: [] }
      instances.push(instance)
      const { log, page } = app
      instance.page = page
      await page.setViewportSize({ width: 900, height: 760 })
      page.on('console', (message) => log(`renderer ${message.type()}: ${message.text()}`))
      page.on('pageerror', (error) => {
        instance.errors.push(error.message)
        log(`pageerror: ${error.stack}`)
      })
      await app.context.tracing.start({ screenshots: true, snapshots: true })
      await page.locator('#create-game').waitFor({ state: 'visible' })
      await page.locator('#splash').waitFor({ state: 'detached' })
      assert.equal(await page.locator('#setup').isVisible(), true)
      return page
    }

    try {
      const host = await launch('host')
      const input = host.locator('#join-game-topic')
      assert.equal(await input.evaluate((element) => element.checkValidity()), false)
      await input.fill('invalid-topic')
      await host.locator('#join-game').click()
      assert.equal(await host.locator('#setup').isVisible(), true)
      assert.equal(await host.locator('#game').isVisible(), false)

      await host.locator('#create-game').click()
      await host.locator('#game').waitFor({ state: 'visible', timeout: networkTimeout })
      const topic = (await host.locator('#game-topic').textContent()).trim()
      assert.match(topic, /^[a-f0-9]{64}$/)
      await host.locator('pear-snake canvas').waitFor({ state: 'visible' })
      assert.match(await host.locator('#score-line').textContent(), /^Score \d+$/)
      const head = await host
        .locator('pear-snake')
        .evaluate((game) => ({ ...game.player.snake[0] }))
      await host.keyboard.press('ArrowRight')
      await host.waitForFunction((previous) => {
        const game = document.querySelector('pear-snake')
        return game.player.direction.x === 1 && game.player.snake[0].x !== previous.x
      }, head)
      await host.screenshot({ path: path.join(results, 'host-playing.png') })

      const guest = await launch('guest')
      await guest.locator('#join-game-topic').fill(` ${topic.slice(0, 32)} ${topic.slice(32)} `)
      assert.equal(await guest.locator('#join-game-topic').inputValue(), topic)
      await guest.locator('#join-game').click()
      await guest.locator('#game').waitFor({ state: 'visible', timeout: networkTimeout })
      assert.equal((await guest.locator('#game-topic').textContent()).trim(), topic)
      await Promise.all(
        [host, guest].map((page) =>
          page.waitForFunction(
            () => document.querySelector('#peers-count').textContent === '1',
            null,
            { timeout: networkTimeout }
          )
        )
      )
      await guest.screenshot({ path: path.join(results, 'guest-connected.png') })

      await guest.locator('#leave-game').click()
      assert.equal(await guest.locator('#setup').isVisible(), true)
      assert.equal(await guest.locator('#game').isVisible(), false)
      await host.waitForFunction(
        () => document.querySelector('#peers-count').textContent === '0'
      )
      await host.locator('#leave-game').click()
      assert.equal(await host.locator('#setup').isVisible(), true)
      assert.equal((await host.locator('#game-topic').textContent()).trim(), '')
      for (const instance of instances)
        assert.deepEqual(instance.errors, [], `${instance.name} renderer errors`)
    } finally {
      for (const { app, page, name } of instances.reverse()) {
        await page
          ?.screenshot({ path: path.join(results, `${name}-final.png`) })
          .catch(() => {})
        await app.context.tracing
          .stop({ path: path.join(results, `${name}-trace.zip`) })
          .catch(() => {})
        await app.close()
      }
      fs.rmSync(storage, { recursive: true, force: true })
    }
  }
)
