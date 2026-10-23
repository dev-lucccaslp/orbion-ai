// Motor próprio do Orbion.ai para modelos por API (formato da OpenAI): um laço de
// ferramentas (ler, listar, buscar, escrever, substituir, rodar comando) até o modelo
// entregar o resultado. Assim qualquer modelo com token (ou local, como o Ollama)
// trabalha como agente do time, igual ao Claude Code e ao Codex.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const provedores = require('./provedores');
const tokens = require('./tokens');

const PESADOS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.venv', 'venv', '__pycache__', 'target', '.orbion']);
const MAX_PASSOS = 40;
const MAX_SAIDA = 24000;

/** Escrever só dentro do projeto; ler também nas pastas extras (as skills). */
function dentro(cwd, rel = '.', extras = []) {
  const alvo = path.resolve(cwd, String(rel || '.'));
  for (const base of [cwd, ...extras]) {
    const r = path.relative(base, alvo);
    if (!r.startsWith('..') && !path.isAbsolute(r)) return alvo;
  }
  throw new Error('Caminho fora do projeto.');
}

const relDe = (cwd, abs) => path.relative(cwd, abs).split(path.sep).join('/') || '.';
const cortar = (t, n = MAX_SAIDA) => (t.length > n ? `${t.slice(0, n)}\n… (cortado, ${t.length - n} caracteres a mais)` : t);

/* ---------- ferramentas ---------- */

function ferramentas({ editaArquivos, rodaComandos, esquema }) {
  const f = (name, description, properties, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
  const lista = [
    f('listar_pasta', 'Lista os arquivos e pastas de uma pasta do projeto.', { caminho: { type: 'string', description: 'Pasta relativa ao projeto. "." é a raiz.' } }),
    f('ler_arquivo', 'Lê um arquivo de texto do projeto.', { caminho: { type: 'string' } }, ['caminho']),
    f('buscar_texto', 'Procura um texto (ou expressão regular) nos arquivos do projeto e devolve arquivo:linha: trecho.', {
      padrao: { type: 'string' }, caminho: { type: 'string', description: 'Pasta onde procurar. Padrão: a raiz.' },
    }, ['padrao']),
  ];
  if (editaArquivos) {
    lista.push(
      f('escrever_arquivo', 'Cria ou sobrescreve um arquivo com o conteúdo inteiro.', { caminho: { type: 'string' }, conteudo: { type: 'string' } }, ['caminho', 'conteudo']),
      f('substituir_texto', 'Troca um trecho exato (que aparece uma vez só) por outro num arquivo.', {
        caminho: { type: 'string' }, antigo: { type: 'string' }, novo: { type: 'string' },
      }, ['caminho', 'antigo', 'novo']),
    );
  }
  if (rodaComandos) {
    lista.push(f('rodar_comando', `Roda um comando no terminal do projeto (${process.platform === 'win32' ? 'PowerShell' : 'bash'}) e devolve a saída. Nunca rode comandos destrutivos.`, { comando: { type: 'string' } }, ['comando']));
  }
  if (esquema) {
    lista.push({ type: 'function', function: { name: 'entregar', description: 'Entrega o resultado final no formato pedido. Chame uma vez, no fim.', parameters: esquema } });
  }
  return lista;
}

function listarPasta(cwd, rel, extras) {
  const pasta = dentro(cwd, rel, extras);
  return fs.readdirSync(pasta, { withFileTypes: true })
    .filter((d) => !['.git', 'node_modules'].includes(d.name))
    .map((d) => `${d.name}${d.isDirectory() ? '/' : ''}`)
    .sort()
    .join('\n') || '(vazia)';
}

function lerArquivo(cwd, rel, extras) {
  const alvo = dentro(cwd, rel, extras);
  const buf = fs.readFileSync(alvo);
  if (buf.subarray(0, 8000).includes(0)) return '(arquivo binário)';
  return cortar(buf.toString('utf8'), 60000);
}

function buscarTexto(cwd, padrao, rel, extras) {
  let re;
  try { re = new RegExp(padrao, 'i'); } catch { re = new RegExp(padrao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
  const achados = [];
  const pilha = [dentro(cwd, rel, extras)];
  while (pilha.length && achados.length < 200) {
    const atual = pilha.pop();
    let itens = [];
    try { itens = fs.readdirSync(atual, { withFileTypes: true }); } catch { continue; }
    for (const d of itens) {
      const abs = path.join(atual, d.name);
      if (d.isDirectory()) { if (!PESADOS.has(d.name)) pilha.push(abs); continue; }
      let texto;
      try {
        if (fs.statSync(abs).size > 1024 * 1024) continue;
        const buf = fs.readFileSync(abs);
        if (buf.subarray(0, 4000).includes(0)) continue;
        texto = buf.toString('utf8');
      } catch { continue; }
      texto.split(/\r?\n/).forEach((linha, i) => {
        if (achados.length < 200 && re.test(linha)) achados.push(`${relDe(cwd, abs)}:${i + 1}: ${linha.trim().slice(0, 200)}`);
      });
    }
  }
  return achados.join('\n') || 'Nada encontrado.';
}

function rodarComando(cwd, comando, sinal) {
  return new Promise((resolve) => {
    const [cmd, args] = process.platform === 'win32' ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando]] : ['bash', ['-lc', comando]];
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    let saida = '';
    const juntar = (d) => { saida = (saida + d).slice(-MAX_SAIDA * 2); };
    p.stdout.on('data', juntar);
    p.stderr.on('data', juntar);
    const timer = setTimeout(() => p.kill(), 180000);
    const parar = () => p.kill();
    sinal?.addEventListener('abort', parar, { once: true });
    p.on('error', (e) => { clearTimeout(timer); resolve(`Erro ao rodar: ${e.message}`); });
    p.on('close', (codigo) => {
      clearTimeout(timer);
      sinal?.removeEventListener('abort', parar);
      resolve(`(código de saída ${codigo})\n${cortar(saida.trim())}`);
    });
  });
}

async function executarFerramenta(nome, args, { cwd, extras, sinal, emitir }) {
  switch (nome) {
    case 'listar_pasta':
      emitir({ tipo: 'acao', texto: `Listando ${args.caminho || '.'}` });
      return listarPasta(cwd, args.caminho, extras);
    case 'ler_arquivo':
      emitir({ tipo: 'acao', texto: `Lendo ${args.caminho}` });
      return lerArquivo(cwd, args.caminho, extras);
    case 'buscar_texto':
      emitir({ tipo: 'acao', texto: `Buscando "${args.padrao}"` });
      return buscarTexto(cwd, args.padrao, args.caminho, extras);
    case 'escrever_arquivo': {
      const alvo = dentro(cwd, args.caminho);
      emitir({ tipo: 'acao', texto: `${fs.existsSync(alvo) ? 'Editando' : 'Criando'} ${relDe(cwd, alvo)}` });
      fs.mkdirSync(path.dirname(alvo), { recursive: true });
      fs.writeFileSync(alvo, String(args.conteudo ?? ''));
      return 'Arquivo gravado.';
    }
    case 'substituir_texto': {
      const alvo = dentro(cwd, args.caminho);
      const texto = fs.readFileSync(alvo, 'utf8');
      const vezes = texto.split(args.antigo).length - 1;
      if (vezes !== 1) return `Não troquei: o trecho aparece ${vezes} vezes. Mande um trecho maior e único.`;
      emitir({ tipo: 'acao', texto: `Editando ${relDe(cwd, alvo)}` });
      fs.writeFileSync(alvo, texto.replace(args.antigo, () => args.novo));
      return 'Trecho trocado.';
    }
    case 'rodar_comando':
      emitir({ tipo: 'acao', texto: `$ ${args.comando}` });
      return rodarComando(cwd, args.comando, sinal);
    default:
      return `Ferramenta desconhecida: ${nome}`;
  }
}

/* ---------- conversa com a API ---------- */

async function completar(p, corpo, sinal) {
  const r = await fetch(`${p.base}/chat/completions`, {
    method: 'POST', headers: provedores.cabecalhos(p), body: JSON.stringify(corpo), signal: sinal,
  });
  const texto = await r.text();
  if (!r.ok) {
    let msg = texto.slice(0, 400);
    try { const j = JSON.parse(texto); msg = j.error?.message || j.message || msg; } catch {}
    const erro = new Error(`${p.nome} respondeu ${r.status}: ${msg}`);
    erro.status = r.status;
    throw erro;
  }
  return JSON.parse(texto);
}

function lerJson(texto) {
  if (!texto) return null;
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(texto);
  const bruto = (m ? m[1] : texto).trim();
  const ini = bruto.indexOf('{');
  const fim = bruto.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return null;
  try { return JSON.parse(bruto.slice(ini, fim + 1)); } catch { return null; }
}

/**
 * Roda um agente por API até ele entregar (com esquema) ou responder em texto (sem esquema).
 * @returns {Promise<{saida, texto, erro, cancelado, custo, mensagens}>}
 */
function lerImagem(arquivo) {
  const ext = path.extname(arquivo).toLowerCase();
  const tipo = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'image/png';
  return { type: 'image_url', image_url: { url: `data:${tipo};base64,${fs.readFileSync(arquivo).toString('base64')}` } };
}

async function rodarApi({
  provedor, modelo, cwd, prompt, sistema, esquema, editaArquivos = false, rodaComandos = false,
  historico = [], leituraExtra = [], tempoMaxMs = 0, sinal, aoEvento = () => {}, pasta, imagens = [],
}) {
  const emitir = (e) => aoEvento({ ...e, hora: Date.now() });
  let p;
  try {
    p = provedores.resolver(provedor);
  } catch (e) {
    return { saida: null, erro: e.message, cancelado: false, custo: null };
  }
  const modeloUsado = modelo || p.modelo;
  if (!modeloUsado) return { saida: null, erro: `Escolha um modelo de ${p.nome} no agente ou em Contas e modelos.`, cancelado: false, custo: null };
  emitir({ tipo: 'inicio', texto: `${p.nome} (${modeloUsado})` });

  const controle = new AbortController();
  const parar = () => controle.abort();
  sinal?.addEventListener('abort', parar, { once: true });
  const timer = tempoMaxMs > 0 ? setTimeout(parar, tempoMaxMs) : null;
  const tools = ferramentas({ editaArquivos, rodaComandos, esquema });
  const mensagens = [
    { role: 'system', content: [sistema, esquema ? 'Quando terminar, chame a ferramenta "entregar" com o resultado. Não termine sem chamar.' : ''].filter(Boolean).join('\n\n') },
    ...historico,
    // Com imagem, a mensagem vai em partes (texto + imagens), no formato de visão da OpenAI.
    { role: 'user', content: imagens.length ? [{ type: 'text', text: prompt }, ...imagens.map(lerImagem)] : prompt },
  ];
  if (pasta) {
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'prompt.md'), prompt);
    fs.writeFileSync(path.join(pasta, 'comando.txt'), `API ${p.nome}\n${p.base}\nmodelo: ${modeloUsado}\nferramentas: ${tools.map((t) => t.function.name).join(', ')}`);
  }
  const uso = { input_tokens: 0, output_tokens: 0 };
  let usados = tokens.vazio();
  let insistencias = 0;
  try {
    for (let passo = 0; passo < MAX_PASSOS; passo++) {
      const resp = await completar(p, { model: modeloUsado, messages: mensagens, tools, tool_choice: 'auto', temperature: 0.2 }, controle.signal);
      uso.input_tokens += resp.usage?.prompt_tokens || 0;
      uso.output_tokens += resp.usage?.completion_tokens || 0;
      usados = tokens.somar(usados, tokens.deApi(resp.usage));
      emitir({ tipo: 'tokens', info: usados });
      emitir({ tipo: 'uso', motor: 'api', info: { ...uso, provedor: p.nome, modelo: modeloUsado } });
      const msg = resp.choices?.[0]?.message;
      if (!msg) throw new Error(`${p.nome} devolveu uma resposta vazia.`);
      const texto = typeof msg.content === 'string' ? msg.content.trim() : '';
      if (texto) emitir({ tipo: 'texto', texto });
      const chamadas = msg.tool_calls || [];
      mensagens.push({ role: 'assistant', content: msg.content ?? '', ...(chamadas.length ? { tool_calls: chamadas } : {}) });

      if (!chamadas.length) {
        if (!esquema) return fim({ texto, mensagens });
        const j = lerJson(texto);
        if (j) return fim({ saida: j, mensagens });
        if (++insistencias > 2) throw new Error('O modelo não entregou o resultado no formato pedido.');
        mensagens.push({ role: 'user', content: 'Termine chamando a ferramenta "entregar" com o resultado no formato pedido.' });
        continue;
      }
      for (const c of chamadas) {
        let args = {};
        try { args = JSON.parse(c.function?.arguments || '{}'); } catch {}
        if (c.function?.name === 'entregar') return fim({ saida: args, mensagens });
        let resultado;
        try {
          resultado = await executarFerramenta(c.function?.name, args, { cwd, extras: leituraExtra, sinal: controle.signal, emitir });
        } catch (e) {
          resultado = `Erro: ${e.message}`;
        }
        mensagens.push({ role: 'tool', tool_call_id: c.id, content: String(resultado) });
      }
    }
    throw new Error(`Passou de ${MAX_PASSOS} passos sem terminar.`);
  } catch (e) {
    const cancelado = controle.signal.aborted && sinal?.aborted;
    let erro = e.message;
    if (controle.signal.aborted && !cancelado) erro = `Passou do tempo máximo de ${Math.round(tempoMaxMs / 60000)} min.`;
    if (e.status === 400 && /tool/i.test(e.message)) erro = `${e.message}. Esse modelo parece não aceitar ferramentas; escolha outro.`;
    else if (e.status === 400 && imagens.length && /image|vision|multimodal/i.test(e.message)) erro = `${e.message}. Esse modelo parece não aceitar imagens; escolha um com visão.`;
    return { saida: null, erro: cancelado ? 'Cancelado.' : erro, cancelado, custo: null, mensagens, tokens: usados };
  } finally {
    clearTimeout(timer);
    sinal?.removeEventListener('abort', parar);
  }

  function fim({ saida = null, texto = '', mensagens: m }) {
    if (pasta && saida) fs.writeFileSync(path.join(pasta, 'resposta.json'), JSON.stringify(saida, null, 2));
    return { saida, texto, erro: null, cancelado: false, custo: null, mensagens: m, tokens: usados };
  }
}

module.exports = { rodarApi, lerJson };
