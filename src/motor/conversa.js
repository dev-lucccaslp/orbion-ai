// Conversa sobre o projeto: uma IA que lê o projeto (sem alterar nada) e conversa com a
// pessoa, com várias mensagens. Pode usar uma skill como modo (grill-me, planejar-projeto...).
// No Claude Code a continuidade vem da própria sessão do CLI (--resume); nas APIs,
// o Orbion manda o histórico a cada mensagem.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { rodarApi } = require('./api');
const { lerSkill } = require('./skills');
const projetoCfg = require('./projeto');
const anexosMod = require('./anexos');

const pasta = (projeto) => path.join(projeto, '.orbion', 'conversas');
const arquivoDe = (projeto, id) => path.join(pasta(projeto), `${path.basename(id)}.json`);

function listar(projeto) {
  if (!fs.existsSync(pasta(projeto))) return [];
  return fs.readdirSync(pasta(projeto)).filter((f) => f.endsWith('.json')).map((f) => {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(pasta(projeto), f), 'utf8'));
      return { id: c.id, titulo: c.titulo, modo: c.modo, motor: c.motor, criadaEm: c.criadaEm, atualizadaEm: c.atualizadaEm || c.criadaEm, mensagens: c.mensagens.length };
    } catch {
      return null;
    }
  }).filter(Boolean).sort((a, b) => b.atualizadaEm - a.atualizadaEm);
}

function ler(projeto, id) {
  return JSON.parse(fs.readFileSync(arquivoDe(projeto, id), 'utf8'));
}

function salvar(projeto, c) {
  fs.mkdirSync(pasta(projeto), { recursive: true });
  c.atualizadaEm = Date.now();
  fs.writeFileSync(arquivoDe(projeto, c.id), JSON.stringify(c, null, 2));
}

function criar(projeto, { modo = '', motor = 'claude', modelo = '' }) {
  const c = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, titulo: 'Nova conversa', modo, motor, modelo, sessao: null, criadaEm: Date.now(), mensagens: [] };
  salvar(projeto, c);
  return c;
}

function sistema(projeto, modo) {
  const partes = [
    `Você está numa conversa com a pessoa dentro do Orbion.ai, sobre o projeto da pasta ${projeto}.`,
    '- Responda em português do Brasil, direto ao ponto. Use Markdown.',
    '- Você pode ler os arquivos do projeto para responder, mas não altera nada: quem altera é o time de agentes, quando a pessoa mandar um pedido.',
    '- Quando a conversa chegar numa decisão ou num plano, termine com um resumo curto que possa virar um pedido para o time.',
  ];
  const memoria = projetoCfg.lerConfig(projeto).memoria ? projetoCfg.lerMemoria(projeto) : '';
  if (memoria) partes.push(`# Memória do projeto\n${memoria}`);
  if (modo) {
    const s = lerSkill(modo, projeto);
    if (s) partes.push(`# Modo desta conversa: ${s.nome}\n${s.corpo}`);
  }
  return partes.join('\n');
}

/** Roda a mensagem no Claude Code, com a sessão do próprio CLI e o texto chegando aos pedaços. */
function falarClaude({ projeto, c, texto, comando, sinal, emitir }) {
  return new Promise((resolve) => {
    const nova = !c.sessao;
    if (nova) c.sessao = randomUUID();
    const args = [
      '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--permission-mode', 'dontAsk', '--tools', 'Read,Glob,Grep', '--allowedTools', 'Read,Glob,Grep', '--disallowedTools', 'mcp__*',
      '--strict-mcp-config', '--setting-sources', 'project,local', '--append-system-prompt', sistema(projeto, c.modo),
      ...(c.modelo ? ['--model', c.modelo] : []),
      ...(nova ? ['--session-id', c.sessao] : ['--resume', c.sessao]),
    ];
    const p = spawn(comando, args, { cwd: projeto, windowsHide: true });
    let resto = '';
    let final = '';
    let erro = null;
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      resto += d;
      const linhas = resto.split('\n');
      resto = linhas.pop();
      for (const l of linhas) {
        let e;
        try { e = JSON.parse(l); } catch { continue; }
        if (e.type === 'stream_event' && e.event?.delta?.type === 'text_delta') emitir({ tipo: 'delta', texto: e.event.delta.text });
        else if (e.type === 'stream_event' && e.event?.type === 'message_start') emitir({ tipo: 'nova-parte' });
        else if (e.type === 'assistant') {
          for (const b of e.message?.content || []) {
            if (b.type === 'tool_use') emitir({ tipo: 'acao', texto: `${{ Read: 'Lendo', Glob: 'Procurando', Grep: 'Buscando' }[b.name] || b.name} ${b.input?.file_path || b.input?.pattern || ''}`.trim() });
          }
        } else if (e.type === 'rate_limit_event') emitir({ tipo: 'uso', motor: 'claude', info: e.rate_limit_info });
        else if (e.type === 'result') {
          final = e.result || '';
          if (e.is_error) erro = e.result || 'erro';
        }
      }
    });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr = (stderr + d).slice(-2000); });
    p.on('error', (e) => { erro = e.code === 'ENOENT' ? `Não achei o comando "${comando}".` : e.message; });
    const parar = () => { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }); else p.kill(); };
    sinal?.addEventListener('abort', parar, { once: true });
    p.on('close', () => {
      sinal?.removeEventListener('abort', parar);
      if (sinal?.aborted) return resolve({ texto: final, erro: 'Cancelado.' });
      resolve({ texto: final, erro: erro || (!final ? stderr.trim().split('\n').pop() || 'O Claude não respondeu.' : null) });
    });
    p.stdin.on('error', () => {});
    p.stdin.end(texto);
  });
}

/** Manda uma mensagem e devolve a conversa atualizada. */
async function enviar({ projeto, id, texto, anexos = [], comandos, sinal, aoEvento = () => {} }) {
  const c = ler(projeto, id);
  const guardados = anexosMod.guardar(projeto, anexos);
  if (!c.mensagens.length) c.titulo = (texto || guardados[0]?.nome || 'Imagem').split('\n')[0].slice(0, 70);
  c.mensagens.push({ papel: 'pessoa', texto, hora: Date.now(), ...(guardados.length ? { anexos: guardados } : {}) });
  salvar(projeto, c);
  const emitir = (e) => aoEvento({ ...e, conversa: id });
  let r;
  if (c.motor.startsWith('api:')) {
    // Nas mensagens antigas vai só o nome das imagens; a imagem em si, só na mensagem nova.
    const historico = c.mensagens.slice(0, -1).map((m) => ({ role: m.papel === 'pessoa' ? 'user' : 'assistant', content: [m.texto, ...(m.anexos || []).map((a) => `[imagem: ${a.nome}]`)].filter(Boolean).join('\n') }));
    const x = await rodarApi({
      provedor: c.motor.slice(4), modelo: c.modelo, cwd: projeto, prompt: texto || 'Veja a imagem.', sistema: sistema(projeto, c.modo), historico, sinal,
      imagens: anexosMod.caminhos(projeto, guardados),
      aoEvento: (e) => {
        if (e.tipo === 'texto') emitir({ tipo: 'delta', texto: e.texto });
        else if (e.tipo === 'acao' || e.tipo === 'uso') emitir(e);
      },
    });
    r = { texto: x.texto, erro: x.erro };
  } else {
    // O Claude abre as imagens pelo caminho, com a ferramenta Read.
    r = await falarClaude({ projeto, c, texto: [texto, anexosMod.paraPrompt(projeto, guardados)].filter(Boolean).join('\n\n'), comando: comandos.claude, sinal, emitir });
  }
  c.mensagens.push({ papel: 'ia', texto: r.texto || '', erro: r.erro || null, hora: Date.now() });
  salvar(projeto, c);
  return c;
}

function excluir(projeto, id) {
  fs.rmSync(arquivoDe(projeto, id), { force: true });
}

module.exports = { listar, ler, criar, enviar, salvar, excluir };
