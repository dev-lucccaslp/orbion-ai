// Configurações de cada projeto (.orbion/config.json) e o acesso aos arquivos e ao git dele.

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const PADRAO = {
  aprovarPlano: true,
  maxVoltas: 3,
  tempoMaxMin: 0, // 0 = sem limite: o agente trabalha até terminar
  maxTarefas: 6,
  pedidosAnteriores: 3,
  paralelo: true,
  memoria: true,
  mapearFluxos: true, // ao abrir o projeto pela primeira vez, a IA monta os fluxos dele
};

const arquivoConfig = (projeto) => path.join(projeto, '.orbion', 'config.json');

function lerConfig(projeto) {
  try {
    const salvo = JSON.parse(fs.readFileSync(arquivoConfig(projeto), 'utf8'));
    // O 30 era o padrão antigo, gravado junto com outras opções: só vale se a pessoa escolheu.
    if (salvo.tempoMaxMin === 30 && !salvo.tempoEscolhido) salvo.tempoMaxMin = 0;
    return { ...PADRAO, ...salvo };
  } catch {
    return { ...PADRAO };
  }
}

function salvarConfig(projeto, parcial) {
  const lim = (v, min, max, padrao) => Math.max(min, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : padrao));
  const atual = lerConfig(projeto);
  const novo = {
    ...atual,
    ...parcial,
    maxVoltas: lim(parcial.maxVoltas ?? atual.maxVoltas, 0, 10, PADRAO.maxVoltas),
    tempoMaxMin: lim(parcial.tempoMaxMin ?? atual.tempoMaxMin, 0, 600, PADRAO.tempoMaxMin),
    tempoEscolhido: parcial.tempoMaxMin != null ? true : atual.tempoEscolhido,
    maxTarefas: lim(parcial.maxTarefas ?? atual.maxTarefas, 1, 20, PADRAO.maxTarefas),
    pedidosAnteriores: lim(parcial.pedidosAnteriores ?? atual.pedidosAnteriores, 0, 10, PADRAO.pedidosAnteriores),
    aprovarPlano: parcial.aprovarPlano ?? atual.aprovarPlano,
    paralelo: parcial.paralelo ?? atual.paralelo,
    memoria: parcial.memoria ?? atual.memoria,
    mapearFluxos: parcial.mapearFluxos ?? atual.mapearFluxos,
  };
  fs.mkdirSync(path.dirname(arquivoConfig(projeto)), { recursive: true });
  fs.writeFileSync(arquivoConfig(projeto), JSON.stringify(novo, null, 2));
  return novo;
}

/* ---------- memória do projeto ---------- */

// O que os agentes aprendem sobre o projeto (convenções, comandos, armadilhas) fica num
// arquivo que todos leem nos próximos pedidos. A pessoa pode editar ou apagar linhas.
const arquivoMemoria = (projeto) => path.join(projeto, '.orbion', 'memoria.md');
const CABECALHO_MEMORIA = '# Memória do projeto\n\nO que o time aprendeu sobre este projeto. Os agentes leem isto antes de cada tarefa. Edite ou apague o que não valer mais.\n';

function lerMemoria(projeto, limite = 6000) {
  try {
    const texto = fs.readFileSync(arquivoMemoria(projeto), 'utf8').replace(CABECALHO_MEMORIA, '').trim();
    return texto.length > limite ? texto.slice(-limite) : texto;
  } catch {
    return '';
  }
}

function anotarMemoria(projeto, autor, itens) {
  const arquivo = arquivoMemoria(projeto);
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  if (!fs.existsSync(arquivo)) fs.writeFileSync(arquivo, CABECALHO_MEMORIA);
  const existentes = fs.readFileSync(arquivo, 'utf8');
  const dia = new Date().toLocaleDateString('pt-BR');
  const novos = [...new Set(itens.map((i) => String(i).replace(/\s+/g, ' ').trim()))].filter((i) => i && !existentes.includes(i));
  if (novos.length) fs.appendFileSync(arquivo, `${novos.map((i) => `\n- ${i} _(${autor}, ${dia})_`).join('')}\n`);
}

/** Cria a memória vazia se ainda não existir e devolve o caminho relativo, para abrir no editor. */
function garantirMemoria(projeto) {
  const arquivo = arquivoMemoria(projeto);
  if (!fs.existsSync(arquivo)) {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, CABECALHO_MEMORIA);
  }
  return '.orbion/memoria.md';
}

/* ---------- arquivos ---------- */

const OCULTOS = new Set(['.git']);
const PESADOS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.venv', 'venv', '__pycache__', 'target', 'bin', 'obj']);

/** Caminho absoluto dentro do projeto; recusa qualquer coisa que saia dele. */
function dentro(projeto, rel = '') {
  const alvo = path.resolve(projeto, rel);
  const r = path.relative(projeto, alvo);
  if (r.startsWith('..') || path.isAbsolute(r)) throw new Error('Esse caminho está fora do projeto.');
  return alvo;
}

const paraRel = (projeto, abs) => path.relative(projeto, abs).split(path.sep).join('/');

function listarPasta(projeto, rel = '') {
  const pasta = dentro(projeto, rel);
  return fs.readdirSync(pasta, { withFileTypes: true })
    .filter((d) => !OCULTOS.has(d.name))
    .map((d) => ({ nome: d.name, rel: paraRel(projeto, path.join(pasta, d.name)), pasta: d.isDirectory() }))
    .sort((a, b) => (b.pasta - a.pasta) || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

const LIMITE = 5 * 1024 * 1024;

function lerArquivo(projeto, rel) {
  const alvo = dentro(projeto, rel);
  const info = fs.statSync(alvo);
  if (info.size > LIMITE) return { grande: true, tamanho: info.size };
  const buf = fs.readFileSync(alvo);
  if (buf.subarray(0, 8000).includes(0)) return { binario: true, tamanho: info.size };
  return { texto: buf.toString('utf8'), tamanho: info.size };
}

function salvarArquivo(projeto, rel, texto) {
  const alvo = dentro(projeto, rel);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, texto);
}

function criar(projeto, rel, pasta) {
  const alvo = dentro(projeto, rel);
  if (fs.existsSync(alvo)) throw new Error('Já existe um arquivo ou pasta com esse nome.');
  if (pasta) fs.mkdirSync(alvo, { recursive: true });
  else {
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, '');
  }
}

function renomear(projeto, de, para) {
  const a = dentro(projeto, de);
  const b = dentro(projeto, para);
  if (fs.existsSync(b)) throw new Error('Já existe um arquivo ou pasta com esse nome.');
  fs.renameSync(a, b);
}

/** Lista de arquivos para a busca rápida (Ctrl+P), sem as pastas pesadas. */
function todosArquivos(projeto, limite = 20000) {
  const saida = [];
  const pilha = [''];
  while (pilha.length && saida.length < limite) {
    const rel = pilha.pop();
    let itens = [];
    try { itens = fs.readdirSync(path.join(projeto, rel), { withFileTypes: true }); } catch { continue; }
    for (const d of itens) {
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) {
        if (!PESADOS.has(d.name) && r !== '.orbion/execucoes') pilha.push(r);
      } else saida.push(r);
    }
  }
  return saida.sort();
}

/* ---------- git ---------- */

function git(projeto, args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: projeto, windowsHide: true, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' }, (erro, stdout) => {
      resolve(erro ? null : stdout);
    });
  });
}

// O git devolve o caminho longo; nomes curtos do Windows (LUCAS~1) e maiúsculas não podem atrapalhar a comparação.
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };

async function statusGit(projetoOriginal) {
  const projeto = real(projetoOriginal);
  const raiz = await git(projeto, ['rev-parse', '--show-toplevel']);
  if (raiz == null) return null;
  const ramo = ((await git(projeto, ['branch', '--show-current'])) || '').trim();
  const saida = (await git(projeto, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'])) || '';
  const base = real(raiz.trim());
  const arquivos = {}; // uma letra por arquivo, para o explorador e a barra de status
  const preparados = {}; // o que vai no próximo commit (o índice)
  const alterados = {}; // o que mudou e ainda não foi preparado
  const CONFLITO = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);
  const partes = saida.split('\0');
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    if (!p) continue;
    const x = p[0];
    const y = p[1];
    const caminho = p.slice(3);
    if (x === 'R' || x === 'C') i++; // o próximo item é o nome antigo
    const abs = path.resolve(base, caminho);
    const rel = paraRel(projeto, abs);
    if (rel.startsWith('..')) continue;
    const letra = x === '?' ? 'U' : x === 'A' || y === 'A' ? 'A' : x === 'D' || y === 'D' ? 'D' : x === 'R' ? 'R' : 'M';
    arquivos[rel] = letra;
    if (CONFLITO.has(x + y)) {
      alterados[rel] = '!';
      continue;
    }
    if (x === '?') alterados[rel] = 'U';
    else {
      if (x !== ' ') preparados[rel] = x === 'C' ? 'A' : x;
      if (y !== ' ') alterados[rel] = y;
    }
  }
  // Quanto falta puxar (atras) e enviar (frente), e se a branch já está no servidor.
  const upstream = ((await git(projeto, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])) || '').trim() || null;
  let atras = 0;
  let frente = 0;
  if (upstream) {
    const [a, f] = ((await git(projeto, ['rev-list', '--left-right', '--count', '@{u}...HEAD'])) || '0\t0').trim().split(/\s+/).map(Number);
    atras = a || 0;
    frente = f || 0;
  }
  const remoto = ((await git(projeto, ['remote', 'get-url', 'origin'])) || '').trim() || null;
  const temCommits = (await git(projeto, ['rev-parse', '--verify', '--quiet', 'HEAD'])) != null;
  return { ramo, arquivos, preparados, alterados, upstream, atras, frente, remoto, temCommits };
}

async function originalGit(projetoOriginal, rel) {
  const projeto = real(projetoOriginal);
  const raiz = await git(projeto, ['rev-parse', '--show-toplevel']);
  if (raiz == null) return '';
  const relRaiz = path.relative(real(raiz.trim()), dentro(projeto, rel)).split(path.sep).join('/');
  return (await git(projeto, ['show', `HEAD:${relRaiz}`])) ?? '';
}

module.exports = {
  lerConfig, salvarConfig, PADRAO, lerMemoria, anotarMemoria, garantirMemoria, dentro, paraRel, listarPasta, lerArquivo, salvarArquivo, criar, renomear, todosArquivos, statusGit, originalGit,
};
