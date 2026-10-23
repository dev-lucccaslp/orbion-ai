// Roda um agente chamando o CLI oficial (claude ou codex) que já está logado
// nesta máquina, e traduz o que ele vai fazendo para eventos simples.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { rodarApi } = require('./api');
const tokens = require('./tokens');

const SISTEMA_API = (cwd) => `Você é um agente do Orbion.ai trabalhando no projeto da pasta ${cwd}. Use as ferramentas para ler o projeto e, quando tiver permissão, editar arquivos e rodar comandos. Caminhos são relativos à pasta do projeto. Responda em português.`;

const LEITURA = ['Read', 'Glob', 'Grep'];
const EDICAO = ['Edit', 'Write'];
const COMANDOS = process.platform === 'win32' ? ['PowerShell', 'Bash'] : ['Bash'];

/** Ferramentas do Claude: a lista escrita no agente ou, sem ela, a que sai das permissões. */
function ferramentasClaude({ ferramentas, editaArquivos, rodaComandos }) {
  const permitidas = ferramentas
    ? ferramentas.split(',').map((f) => f.trim()).filter(Boolean)
    : [...LEITURA, ...(editaArquivos ? EDICAO : []), ...(rodaComandos ? COMANDOS : [])];
  // --tools só aceita o nome; regras como Bash(npm *) valem para --allowedTools.
  const nomes = [...new Set(permitidas.map((f) => f.replace(/\(.*\)$/, '')))];
  return { nomes: nomes.join(','), permitidas: permitidas.join(',') };
}

/** Separa "--a 1 --b 'dois três'" em argumentos, respeitando aspas. */
function separarArgs(texto) {
  return [...String(texto || '').matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

function argsClaude({ modelo, esquema, editaArquivos, rodaComandos, ferramentas, esforco, argsExtras, dirsExtras }) {
  const f = ferramentasClaude({ ferramentas, editaArquivos, rodaComandos });
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--json-schema', JSON.stringify(esquema),
    // Ninguém está no terminal para aprovar: o que está na lista roda, o resto é negado.
    '--permission-mode', 'dontAsk',
    '--tools', f.nomes, '--allowedTools', f.permitidas,
    // Sem conectores, plugins e hooks do usuário: o agente enxerga só o projeto.
    // (MCP de plugin ainda conecta, então as ferramentas dele são negadas.)
    '--disallowedTools', 'mcp__*',
    '--strict-mcp-config', '--setting-sources', 'project,local',
  ];
  if (modelo) args.push('--model', modelo);
  if (esforco) args.push('--effort', esforco);
  args.push(...separarArgs(argsExtras));
  // --add-dir aceita vários valores, então fica por último.
  if (dirsExtras.length) args.push('--add-dir', ...dirsExtras);
  return args;
}

function argsCodex({ cwd, modelo, editaArquivos, rodaComandos, esforco, argsExtras, arquivoEsquema, arquivoSaida, imagens = [] }) {
  const args = [
    'exec', '--json', '--skip-git-repo-check', '--ephemeral', '-C', cwd,
    '-s', editaArquivos || rodaComandos ? 'workspace-write' : 'read-only',
    '--output-schema', arquivoEsquema, '-o', arquivoSaida,
  ];
  if (modelo) args.push('-m', modelo);
  for (const img of imagens) args.push('-i', img);
  if (esforco) args.push('-c', `model_reasoning_effort="${['xhigh', 'max'].includes(esforco) ? 'high' : esforco}"`);
  args.push(...separarArgs(argsExtras));
  args.push('-'); // o prompt vai pela entrada padrão
  return args;
}

function relativo(cwd, arquivo) {
  if (!arquivo) return '';
  const r = path.relative(cwd, arquivo);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : arquivo;
}

function descreverFerramenta(cwd, nome, entrada = {}) {
  const arq = relativo(cwd, entrada.file_path || entrada.path);
  switch (nome) {
    case 'Read': return `Lendo ${arq}`;
    case 'Write': return `Criando ${arq}`;
    case 'Edit': return `Editando ${arq}`;
    case 'Glob': return `Procurando ${entrada.pattern}`;
    case 'Grep': return `Buscando "${entrada.pattern}"`;
    case 'Bash':
    case 'PowerShell': return `$ ${entrada.command}`;
    default: return nome;
  }
}

function textoDe(conteudo) {
  if (typeof conteudo === 'string') return conteudo;
  if (Array.isArray(conteudo)) return conteudo.map((c) => c.text || '').join('');
  return '';
}

// Erros do Codex às vezes vêm como JSON dentro da string.
function mensagemDeErro(bruto) {
  try {
    const j = JSON.parse(bruto);
    return j.error?.message || j.message || bruto;
  } catch {
    return bruto;
  }
}

function lerJson(texto) {
  if (!texto) return null;
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    const j = JSON.parse(limpo);
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

function traduzirClaude(ev, estado, emitir, cwd) {
  switch (ev.type) {
    case 'system':
      if (ev.subtype === 'init') {
        // apiKeySource "none" = login do claude.ai: roda no plano da pessoa e não se paga por token.
        estado.plano = ev.apiKeySource === 'none';
        emitir({ tipo: 'inicio', texto: `Claude (${ev.model})${estado.plano ? ' · no teu plano' : ' · pela chave de API'}` });
      }
      break;
    case 'assistant':
      // Cada resposta do modelo traz o uso dela: a soma (sem repetir a mesma mensagem) é o "ao vivo".
      if (ev.message?.id && ev.message.usage) {
        estado.usoMensagens.set(ev.message.id, tokens.deClaude(ev.message.usage));
        emitir({ tipo: 'tokens', info: tokens.somar(...estado.usoMensagens.values()) });
      }
      for (const bloco of ev.message?.content || []) {
        if (bloco.type === 'text' && bloco.text.trim()) emitir({ tipo: 'texto', texto: bloco.text.trim() });
        else if (bloco.type === 'tool_use') {
          if (bloco.name === 'StructuredOutput') estado.saida = bloco.input;
          else emitir({ tipo: 'acao', texto: descreverFerramenta(cwd, bloco.name, bloco.input) });
        }
      }
      break;
    case 'user':
      for (const bloco of ev.message?.content || []) {
        if (bloco.type === 'tool_result' && bloco.is_error) emitir({ tipo: 'aviso', texto: textoDe(bloco.content).slice(0, 400) });
      }
      break;
    case 'rate_limit_event':
      emitir({ tipo: 'uso', motor: 'claude', info: ev.rate_limit_info });
      break;
    case 'result':
      if (ev.usage) estado.tokens = tokens.deClaude(ev.usage); // o total da chamada, que vale mais que a soma ao vivo
      // O Claude Code sempre estima o preço em dólar; só é gasto de verdade quando roda com chave de API.
      estado.custo = estado.plano ? null : ev.total_cost_usd ?? null;
      if (!estado.saida && ev.structured_output) estado.saida = ev.structured_output;
      estado.textoFinal = ev.result || '';
      if (ev.is_error) estado.erro = ev.result || ev.subtype || 'erro';
      break;
  }
}

function traduzirCodex(ev, estado, emitir) {
  const item = ev.item || {};
  switch (ev.type) {
    case 'thread.started':
      emitir({ tipo: 'inicio', texto: 'Codex' });
      break;
    case 'item.started':
      if (item.type === 'command_execution') emitir({ tipo: 'acao', texto: `$ ${item.command}` });
      break;
    case 'item.completed':
      if (item.type === 'agent_message') {
        const j = lerJson(item.text);
        if (j) estado.saida = j;
        else if (item.text?.trim()) emitir({ tipo: 'texto', texto: item.text.trim() });
      } else if (item.type === 'file_change') {
        const verbo = { add: 'Criando', delete: 'Apagando' };
        for (const m of item.changes || []) emitir({ tipo: 'acao', texto: `${verbo[m.kind] || 'Editando'} ${m.path}` });
      } else if (item.type === 'command_execution' && item.exit_code) {
        emitir({ tipo: 'aviso', texto: `O comando saiu com código ${item.exit_code}` });
      } else if (item.type === 'error') {
        emitir({ tipo: 'aviso', texto: mensagemDeErro(item.message) });
      }
      break;
    case 'turn.completed':
      estado.tokens = tokens.somar(estado.tokens, tokens.deCodex(ev.usage));
      emitir({ tipo: 'tokens', info: estado.tokens });
      emitir({ tipo: 'uso', motor: 'codex', info: ev.usage });
      break;
    case 'turn.failed':
      estado.erro = mensagemDeErro(ev.error?.message || 'falhou');
      break;
    case 'error':
      estado.erro = mensagemDeErro(ev.message);
      break;
  }
}

function matarArvore(filho) {
  if (filho.exitCode !== null || filho.killed) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(filho.pid), '/T', '/F'], { windowsHide: true });
  else filho.kill('SIGTERM');
}

/**
 * Roda um agente até ele terminar. Nunca rejeita: falhas voltam em `erro`.
 * @returns {Promise<{saida: object|null, erro: string|null, cancelado: boolean, custo: number|null}>}
 */
function rodarAgente({
  motor, comando, cwd, prompt, esquema, pasta, modelo,
  editaArquivos = false, rodaComandos = false, ferramentas = '', esforco = '', argsExtras = '', dirsExtras = [],
  tempoMaxMs = 0, sinal, aoEvento = () => {}, imagens = [],
}) {
  if (motor.startsWith('api:')) {
    // Modelo por token: o laço de ferramentas é do próprio Orbion.
    return rodarApi({
      provedor: motor.slice(4), modelo, cwd, prompt, esquema, pasta, editaArquivos, rodaComandos, tempoMaxMs, sinal, aoEvento,
      sistema: SISTEMA_API(cwd), leituraExtra: dirsExtras, imagens,
    }).then((r) => ({ saida: r.saida, erro: r.erro, cancelado: r.cancelado, custo: null, tokens: r.tokens || null }));
  }
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'prompt.md'), prompt);

  let args;
  const arquivoSaida = path.join(pasta, 'resposta.json');
  if (motor === 'codex') {
    const arquivoEsquema = path.join(pasta, 'esquema.json');
    fs.writeFileSync(arquivoEsquema, JSON.stringify(esquema));
    args = argsCodex({ cwd, modelo, editaArquivos, rodaComandos, esforco, argsExtras, arquivoEsquema, arquivoSaida, imagens });
  } else {
    args = argsClaude({ modelo, esquema, editaArquivos, rodaComandos, ferramentas, esforco, argsExtras, dirsExtras });
  }
  fs.writeFileSync(path.join(pasta, 'comando.txt'), [comando, ...args.map((a) => (a.length > 300 ? `${a.slice(0, 300)}…` : a))].join('\n'));

  const estado = { saida: null, erro: null, textoFinal: '', custo: null, tokens: null, usoMensagens: new Map() };
  const traduzir = motor === 'codex' ? traduzirCodex : traduzirClaude;
  const emitir = (e) => aoEvento({ ...e, hora: Date.now() });

  return new Promise((resolve) => {
    let cancelado = false;
    let estourou = false;
    let resto = '';
    let stderr = '';

    const filho = spawn(comando, args, { cwd, windowsHide: true, env: process.env });

    const tratarLinha = (linha) => {
      if (!linha.trim()) return;
      let ev;
      try {
        ev = JSON.parse(linha);
      } catch {
        return; // linha que não é evento (aviso solto do CLI)
      }
      traduzir(ev, estado, emitir, cwd);
    };

    filho.stdout.setEncoding('utf8');
    filho.stdout.on('data', (pedaco) => {
      resto += pedaco;
      const linhas = resto.split('\n');
      resto = linhas.pop();
      linhas.forEach(tratarLinha);
    });
    filho.stderr.setEncoding('utf8');
    filho.stderr.on('data', (pedaco) => { stderr = (stderr + pedaco).slice(-4000); });
    filho.stdin.on('error', () => {}); // o processo pode morrer antes de ler o prompt
    filho.stdin.end(prompt);

    const parar = () => { cancelado = true; matarArvore(filho); };
    if (sinal) {
      if (sinal.aborted) parar();
      else sinal.addEventListener('abort', parar, { once: true });
    }
    const timer = tempoMaxMs > 0 ? setTimeout(() => { estourou = true; matarArvore(filho); }, tempoMaxMs) : null;

    let erroSpawn = null;
    filho.on('error', (e) => {
      erroSpawn = e.code === 'ENOENT'
        ? `Não achei o comando "${comando}". Confira o caminho nas configurações.`
        : e.message;
    });

    filho.on('close', (codigo) => {
      clearTimeout(timer);
      sinal?.removeEventListener('abort', parar);
      tratarLinha(resto);

      let saida = estado.saida;
      if (!saida && motor === 'codex' && fs.existsSync(arquivoSaida)) saida = lerJson(fs.readFileSync(arquivoSaida, 'utf8'));
      if (!saida) saida = lerJson(estado.textoFinal);
      if (saida) fs.writeFileSync(arquivoSaida, JSON.stringify(saida, null, 2));

      let erro = null;
      if (cancelado) erro = 'Cancelado.';
      else if (estourou) erro = `Passou do tempo máximo de ${Math.round(tempoMaxMs / 60000)} min.`;
      else if (erroSpawn) erro = erroSpawn;
      else if (!saida) {
        erro = estado.erro || stderr.trim().split('\n').slice(-3).join(' ') || `O ${motor} saiu com código ${codigo} sem devolver resposta.`;
      }
      const usados = estado.tokens || (estado.usoMensagens.size ? tokens.somar(...estado.usoMensagens.values()) : null);
      resolve({ saida: erro ? null : saida, erro, cancelado, custo: estado.custo, tokens: usados });
    });
  });
}

module.exports = { rodarAgente, ferramentasClaude, separarArgs };
