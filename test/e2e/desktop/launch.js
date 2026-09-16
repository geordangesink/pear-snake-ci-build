const fs = require('node:fs')
const { spawn } = require('node:child_process')
const { chromium } = require('playwright')

module.exports = async function launch(executable, args, env, logPath) {
  const log = (message) => fs.appendFileSync(logPath, `${message}\n`)
  const child = spawn(executable, ['--inspect-brk=0', '--remote-debugging-port=0', ...args], {
    env
  })
  const inspector = Promise.withResolvers()
  const devtools = Promise.withResolvers()
  inspector.promise.catch(() => {})
  devtools.promise.catch(() => {})
  let stderr = ''
  child.stdout.on('data', (data) => log(`stdout: ${data}`))
  child.stderr.on('data', (data) => {
    log(`stderr: ${data}`)
    stderr = (stderr + data).slice(-16_384)
    const node = stderr.match(/Debugger listening on (ws:\/\/\S+)/)
    const chrome = stderr.match(/DevTools listening on (ws:\/\/\S+)/)
    if (node) inspector.resolve(node[1])
    if (chrome) devtools.resolve(chrome[1])
  })
  child.once('error', (error) => {
    inspector.reject(error)
    devtools.reject(error)
  })
  child.once('exit', (code, signal) => {
    const error = new Error(`Snake exited: ${signal || code}`)
    inspector.reject(error)
    devtools.reject(error)
    log(error.message)
  })

  try {
    return await timed(
      (async () => {
        await prepareArguments(await inspector.promise)
        const browser = await chromium.connectOverCDP(await devtools.promise)
        const context = browser.contexts()[0]
        const page = context.pages()[0] || (await context.waitForEvent('page'))
        return {
          page,
          context,
          log,
          async close() {
            await browser.close().catch(() => {})
            if (child.exitCode !== null || child.signalCode !== null) return
            const exited = new Promise((resolve) => child.once('exit', resolve))
            child.kill('SIGTERM')
            await timed(exited, 5000).catch(() => child.kill('SIGKILL'))
          }
        }
      })(),
      30_000
    )
  } catch (error) {
    child.kill('SIGKILL')
    throw error
  }
}

async function prepareArguments(url) {
  const socket = new WebSocket(url)
  const pending = new Map()
  const paused = Promise.withResolvers()
  let sequence = 0
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Debugger.paused') paused.resolve()
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })
  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    await send('Debugger.enable')
    await send('Runtime.runIfWaitingForDebugger')
    await paused.promise
    // Snake rejects unknown CLI flags; remove only our debugger flags before its entry point.
    const result = await send('Runtime.evaluate', {
      expression:
        'process.argv = process.argv.filter(arg => !/^--(?:inspect-brk|remote-debugging-port)=/.test(arg))'
    })
    if (result.exceptionDetails) throw new Error('Could not prepare Snake CLI arguments')
    await send('Debugger.resume')
  } finally {
    socket.close()
  }

  function send(method, params = {}) {
    const id = ++sequence
    const request = Promise.withResolvers()
    pending.set(id, request)
    socket.send(JSON.stringify({ id, method, params }))
    return request.promise
  }
}

async function timed(promise, milliseconds) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out after ${milliseconds} ms`)),
          milliseconds
        )
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
