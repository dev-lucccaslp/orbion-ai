const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const api = require('../src/carrinho');

test('Navegador sem module expõe a mesma API e regras do CommonJS', () => {
  const context = vm.createContext({});
  vm.runInContext('window = globalThis', context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/carrinho.js'), 'utf8'), context);
  const browser = context.Carrinho;
  assert.deepEqual(Object.keys(browser).sort(), Object.keys(api).sort());
  const primeiro = browser.limparCarrinho();
  const segundo = browser.limparCarrinho();
  assert.ok(Array.isArray(primeiro));
  assert.equal(primeiro.length, 0);
  assert.notStrictEqual(primeiro, segundo);
  primeiro.push({ nome: 'A' });
  assert.ok(Array.isArray(segundo));
  assert.equal(segundo.length, 0);
  assert.equal(browser.limparCarrinho().length, 0);
  assert.equal(browser.FRETE_PADRAO, api.FRETE_PADRAO);
  assert.deepEqual(Array.from(browser.CUPONS_VALIDOS), api.CUPONS_VALIDOS);
  const itens = [{ preco: 49.9, quantidade: 2 }, { preco: 29.9, quantidade: 1 }, { preco: 5, quantidade: 3 }];
  for (const items of [[], itens]) {
    assert.equal(browser.subtotal(items), api.subtotal(items));
    assert.equal(browser.quantidadeDeItens(items), api.quantidadeDeItens(items));
    for (const code of ['', '   ', 'DEZ', ' dez ', 'FRETEGRATIS', ' fretegratis ']) {
      assert.equal(browser.total(items, undefined, code), api.total(items, undefined, code));
    }
    assert.throws(() => browser.total(items, undefined, ' xyz '), { message: 'Cupom inválido: xyz' });
  }
});

const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
test('CA1–19: página real via file://, cupons, clique, Enter, foco e console', {
  skip: !fs.existsSync(chrome) && 'Configure CHROME_PATH para executar a validação real', timeout: 45000,
}, async t => {
  const keepAlive = setInterval(() => {}, 1000);
  t.after(() => clearInterval(keepAlive));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'carrinho-tester-'));
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;
  t.after(async () => {
    if (ws) ws.close();
    child.kill();
    // Chrome pode manter arquivos abertos por alguns instantes; só removemos nosso perfil temporário.
    await new Promise(resolve => setTimeout(resolve, 400));
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  });
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('Chrome não iniciou CDP')), 15000);
    child.on('error', reject);
    child.stderr.on('data', data => {
      log += data;
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onclose = event => { for (const p of pending.values()) p.reject(new Error('CDP desconectado: ' + event.code)); };
  const errors = [];
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown' || (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')) errors.push(msg);
    if (pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
    }
  };
  function call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const n = ++id; pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params, sessionId }));
    });
  }
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => call(method, params, sessionId);
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await cdp('Page.navigate', { url: pathToFileURL(path.join(__dirname, '../public/index.html')).href });
  for (let n = 0; n < 100; n++) {
    if (await evaluate('!!document.getElementById("valor-total")?.textContent')) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const money = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  async function state() {
    return evaluate(`(() => { const e = id => document.getElementById(id); return {
      subtotal:e('valor-subtotal').textContent, total:e('valor-total').textContent,
      frete:e('valor-frete').textContent, desconto:e('valor-desconto').textContent,
      descontoOculto:getComputedStyle(e('linha-desconto')).display === 'none',
      erro:e('cupom-erro').hidden ? '' : e('cupom-erro').textContent,
      status:e('cupom-status').hidden ? '' : e('cupom-status').textContent,
      rotulo:e('rotulo-desconto').textContent, campo:e('cupom-campo').value
    }; })()`);
  }
  async function apply(code, enter = false) {
    await evaluate(`document.getElementById('cupom-campo').value = ${JSON.stringify(code)}`);
    if (enter) {
      await evaluate("document.getElementById('cupom-campo').focus()");
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    } else await evaluate("document.getElementById('cupom-botao').click()");
    return state();
  }
  function check(s, total, frete, desconto = false, error = '') {
    assert.equal(s.subtotal, money(144.7)); assert.equal(s.total, money(total));
    assert.equal(s.frete, money(frete)); assert.equal(s.descontoOculto, !desconto);
    assert.equal(s.erro, error); assert.ok(!s.erro || !s.status);
    if (desconto) { assert.equal(s.desconto, '−' + money(14.47)); assert.equal(s.rotulo, 'Desconto (DEZ)'); }
  }
  const initial = await state();
  check(initial, 159.7, 15); assert.equal(initial.campo, ''); assert.equal(initial.status, '');
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#itens-lista li'), li => Array.from(li.children, e => e.textContent))"), [
    ['Camiseta', money(49.9) + ' × 2', money(99.8)], ['Caneca', money(29.9) + ' × 1', money(29.9)], ['Adesivo', money(5) + ' × 3', money(15)],
  ]);
  await evaluate("document.getElementById('cupom-campo').value='DEZ'; document.getElementById('cupom-campo').dispatchEvent(new Event('input', {bubbles:true}))");
  check(await state(), 159.7, 15);
  for (const code of ['DEZ', 'dez', '  Dez  ']) check(await apply(code), 145.23, 15, true);
  await apply(''); check(await apply('DEZ', true), 145.23, 15, true);
  for (const code of ['FRETEGRATIS', 'fretegratis', ' FreteGratis ']) check(await apply(code), 144.7, 0);
  for (const code of ['XYZ', '  xyz ', 'DEZ FRETEGRATIS', 'x'.repeat(2000)]) {
    await apply('DEZ'); check(await apply(code), 159.7, 15, false, 'Cupom inválido: ' + code.trim());
    check(await apply('DEZ'), 145.23, 15, true);
  }
  for (const code of ['', '   ', '\t']) {
    await apply('DEZ'); check(await apply(code), 159.7, 15);
    await apply('XYZ'); check(await apply(code), 159.7, 15);
  }
  for (const theme of ['light', 'dark']) {
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    for (const element of ['cupom-campo', 'cupom-botao']) {
      await evaluate("document.getElementById('cupom-campo').focus()");
      if (element === 'cupom-botao') {
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      }
      assert.equal(await evaluate('document.activeElement.id'), element);
      const outline = await evaluate(`(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth]; })()`);
      assert.deepEqual(outline, ['solid', '2px']);
    }
  }
  assert.deepEqual(errors, []);
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /<script src="\.\.\/src\/carrinho\.js"><\/script>/);
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  assert.doesNotMatch(scripts, /\bDEZ\b|\bFRETEGRATIS\b|\b15\b|10\s*%/);
  const pkg = require('../package.json');
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
  assert.equal(Object.keys(pkg.devDependencies || {}).length, 0);
});
