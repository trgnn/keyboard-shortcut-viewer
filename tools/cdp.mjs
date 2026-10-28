// Drives the invisible test browser (tools/test-browser.sh) through the Chrome DevTools
// Protocol. Everything happens inside that browser: no window, no focus, no screen capture.
//   node tools/cdp.mjs open <url>                 load <url> in the test tab
//   node tools/cdp.mjs eval <js | file.js>        run in the page (as a user gesture), print the result
//   node tools/cdp.mjs click <css selector>       a real mouse click on an element (user activation)
//   node tools/cdp.mjs shot <out.png> [W] [H]     screenshot of the page (default 1440×900)
//   node tools/cdp.mjs targets                    list pages
// Page scripts await promises; their result is printed as JSON (strings as is).
// The page is granted clipboard read/write, so copy can be tested and read back.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PORT = 9334;
const [command, ...args] = process.argv.slice(2);

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`).catch(() => null);
  if (!res) throw new Error('Test browser not running: tools/test-browser.sh start');
  return res.json();
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('Could not connect to the test browser'));
  });
  let id = 0;
  const waiting = new Map();
  const listeners = [];
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const listener of listeners) listener(msg);
    }
  };
  return {
    send: (method, params = {}) => new Promise((resolve, reject) => {
      waiting.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    }),
    once: (method) => new Promise((resolve) => {
      listeners.push(function listener(msg) {
        if (msg.method !== method) return;
        listeners.splice(listeners.indexOf(listener), 1);
        resolve(msg.params);
      });
    }),
    close: () => ws.close(),
  };
}

// The test tab: the first page (one is created if needed)
async function page() {
  let target = (await targets()).find((t) => t.type === 'page');
  if (!target) {
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
    target = (await targets()).find((t) => t.type === 'page');
  }
  return connect(target.webSocketDebuggerUrl);
}

// clipboard access for the page's origin, without a prompt. Grants only last while the
// connection that made them is open, so every command grants again and keeps it open.
let browser;
async function grantClipboard(session) {
  const { result } = await session.send('Runtime.evaluate', { expression: 'location.origin', returnByValue: true });
  if (!/^https?:/.test(result.value)) return;
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  browser = await connect(webSocketDebuggerUrl);
  await browser.send('Browser.grantPermissions', {
    origin: result.value, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  });
}

function code(arg) {
  return arg && existsSync(arg) && arg.endsWith('.js') ? readFileSync(arg, 'utf8') : arg;
}

async function evaluate(session, expression) {
  const { result, exceptionDetails } = await session.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}

function print(value) {
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

const session = command === 'targets' ? null : await page();

try {
  if (command === 'targets') {
    for (const t of await targets()) console.log(`${t.type}\t${t.url}`);
  } else if (command === 'open') {
    await session.send('Page.enable');
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }); // headless: the page counts as focused
    const loaded = session.once('Page.loadEventFired');
    await session.send('Page.navigate', { url: args[0] });
    await loaded;
    await grantClipboard(session);
    console.log('Loaded', args[0]);
  } else if (command === 'eval') {
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await grantClipboard(session);
    print(await evaluate(session, code(args[0])));
  } else if (command === 'click') {
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await grantClipboard(session);
    const box = await evaluate(session, `(() => { const r = document.querySelector(${JSON.stringify(args[0])})?.getBoundingClientRect();
      return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!box) throw new Error('No element matches ' + args[0]);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await session.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    }
    console.log('Clicked', args[0]);
  } else if (command === 'shot') {
    const [out, width = 1440, height = 900] = args;
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: false,
    });
    await new Promise((r) => setTimeout(r, 600)); // let the page lay out at that size
    const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(out);
  } else {
    console.log('usage: cdp.mjs open <url> | eval <js> | click <selector> | shot <out.png> [W] [H] | targets');
  }
} finally {
  session?.close();
  browser?.close();
}
