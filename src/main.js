// Processo principal do Orbion.ai: janela, arquivos do projeto, temas e loja de
// extensões, times e agentes, terminais e os pedidos em andamento.

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, safeStorage, Notification } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { Execucao, Trava, listarExecucoes, lerExecucao, excluirFio, CONFIG_PADRAO } = require('./motor/orquestrador');
const ag = require('./motor/agentes');
const times = require('./motor/times');
const prompts = require('./motor/prompts');
const proj = require('./motor/projeto');
const temas = require('./motor/temas');
const loja = require('./motor/extensoes');
const { listarSkills, acharSkills, lerSkill, salvarSkill } = require('./motor/skills');
const provedores = require('./motor/provedores');
const contas = require('./motor/contas');
const conversas = require('./motor/conversa');
const assistentes = require('./motor/assistentes');
const criacao = require('./motor/criacao');
const gitOps = require('./motor/git');
const anexos = require('./motor/anexos');

const controlesConversa = new Map(); // conversa → AbortController
let controleAssistente = null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'orbion', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let janela = null;
let vigia = null;
const execucoes = new Map(); // id → { exec, projeto, responder }
const travas = new Map(); // projeto → trava de escrita dividida entre os pedidos dele
const terminais = new Map(); // id → processo do terminal
let proximoTerminal = 1;

/* ---------- arquivos da tela (orbion://app) e ícones das extensões (orbion://icone) ---------- */

const RAIZ = path.join(__dirname, '..');
const ID_APP = 'ai.orbion.app';
const ICONE_ICO = path.join(__dirname, 'tela', 'marca', 'orbion.ico');
const ICONE_PNG = path.join(__dirname, 'tela', 'marca', 'orbion-256.png');
const ROTAS = {
  tela: path.join(__dirname, 'tela'),
  monaco: path.join(RAIZ, 'node_modules', 'monaco-editor', 'min'),
  codicons: path.join(RAIZ, 'node_modules', '@vscode', 'codicons', 'dist'),
  xterm: path.join(RAIZ, 'node_modules', '@xterm'),
};
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mjs': 'text/javascript; charset=utf-8', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm', '.htm': 'text/html; charset=utf-8',
};

function dentroDe(base, alvo) {
  const r = path.relative(base, alvo);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

/* ---------- prévia das telas que os agentes constroem ---------- */

// Um servidor só deste PC (127.0.0.1) mostra os arquivos do projeto aberto, atrás de um código aleatório
// no caminho. Pastas e arquivos ocultos (.git, .orbion, .env...) nunca saem.
let previa = null; // { servidor, porta, codigo, projeto }

function servidorDePrevia(projeto) {
  if (previa?.projeto === projeto) return Promise.resolve(previa);
  previa?.servidor.close();
  previa = null;
  const codigo = randomUUID().replace(/-/g, '').slice(0, 16);
  const servidor = http.createServer((req, res) => {
    const naoTem = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não encontrado'); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return naoTem();
    let partes;
    try { partes = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).split('/').slice(1); } catch { return naoTem(); }
    if (partes.shift() !== codigo || partes.some((p) => p.startsWith('.'))) return naoTem();
    let alvo = path.resolve(projeto, ...partes);
    if (!dentroDe(projeto, alvo) || !fs.existsSync(alvo)) return naoTem();
    if (fs.statSync(alvo).isDirectory()) alvo = path.join(alvo, 'index.html');
    if (!fs.existsSync(alvo)) return naoTem();
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(alvo).pipe(res);
  });
  return new Promise((ok, erro) => {
    servidor.once('error', erro);
    servidor.listen(0, '127.0.0.1', () => {
      previa = { servidor, porta: servidor.address().port, codigo, projeto };
      ok(previa);
    });
  });
}

async function enderecoDaPrevia(projeto, alvo) {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(alvo)) return alvo; // um servidor que já roda (npm run dev)
  // O agente às vezes devolve o caminho completo: vale se estiver dentro do projeto.
  const bruto = path.isAbsolute(String(alvo || '')) ? path.relative(projeto, alvo) : String(alvo || '');
  if (bruto.startsWith('..')) throw new Error('A prévia tem que estar dentro da pasta do projeto.');
  const rel = bruto.replace(/\\/g, '/').replace(/^\.?\//, '');
  const s = await servidorDePrevia(projeto);
  return `http://127.0.0.1:${s.porta}/${s.codigo}/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

async function servir(req) {
  const url = new URL(req.url);
  let arquivo = null;
  if (url.host === 'app') {
    const [, rota, ...resto] = decodeURIComponent(url.pathname).split('/');
    const base = ROTAS[rota];
    const alvo = base && path.resolve(base, resto.join('/'));
    if (alvo && dentroDe(base, alvo)) arquivo = alvo;
  } else if (url.host === 'icone') {
    const alvo = decodeURIComponent(url.pathname.slice(1));
    if (temas.iconePermitido(alvo)) arquivo = alvo;
  }
  try {
    if (!arquivo || fs.statSync(arquivo).isDirectory()) throw new Error();
    const dados = await fs.promises.readFile(arquivo);
    return new Response(dados, {
      headers: {
        'content-type': TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
        'cache-control': url.host === 'icone' ? 'max-age=86400' : 'no-cache',
      },
    });
  } catch {
    return new Response('não encontrado', { status: 404 });
  }
}

/* ---------- configurações gerais ---------- */

const arquivoConfig = () => path.join(app.getPath('userData'), 'config.json');

function lerConfig() {
  let salvo = {};
  try {
    salvo = JSON.parse(fs.readFileSync(arquivoConfig(), 'utf8'));
  } catch {}
  const config = {
    comandos: { ...CONFIG_PADRAO.comandos },
    projetos: [],
    tema: 'orbion.dracula',
    temaIcones: null,
    fonte: "'Cascadia Code', Consolas, monospace",
    tamanhoFonte: 14,
    terminal: null,
    assistente: { motor: 'claude', modelo: '' }, // quem roda conversas, melhorias e skills geradas
    layout: { lateral: 280, painel: 260, painelAberto: true, direita: 400, direitaAberta: true },
    ...salvo,
  };
  config.comandos = { ...CONFIG_PADRAO.comandos, ...salvo.comandos };
  config.layout = { lateral: 280, painel: 260, painelAberto: true, direita: 400, direitaAberta: true, ...salvo.layout };
  if (!config.temaIcones) {
    // Se a pessoa tiver o Material Icon Theme no VS Code, começa com ele.
    const material = temas.listar().icones.find((t) => /material-icon-theme/.test(t.id));
    config.temaIcones = material ? material.id : 'orbion.minimo';
  }
  return config;
}

function salvarConfig(config) {
  fs.mkdirSync(path.dirname(arquivoConfig()), { recursive: true });
  fs.writeFileSync(arquivoConfig(), JSON.stringify(config, null, 2));
  return config;
}

function enviar(ev) {
  if (janela && !janela.isDestroyed()) janela.webContents.send('orq:evento', ev);
}

/* ---------- projeto ---------- */

function vigiar(projeto) {
  vigia?.close();
  vigia = null;
  let pendentes = new Set();
  let timer = null;
  try {
    vigia = fs.watch(projeto, { recursive: true }, (_tipo, nome) => {
      if (!nome) return;
      const rel = String(nome).split(path.sep).join('/');
      if (/^(\.git|node_modules)(\/|$)/.test(rel) || rel.startsWith('.orbion/execucoes')) return;
      pendentes.add(rel);
      clearTimeout(timer);
      timer = setTimeout(() => {
        enviar({ tipo: 'fs', projeto, rels: [...pendentes] });
        pendentes = new Set();
      }, 250);
    });
  } catch {}
}

const vivasDe = (projeto) => [...execucoes.values()].filter((x) => !projeto || x.projeto === projeto).map((x) => ({ id: x.exec.estado.id, projeto: x.projeto, estado: x.exec.estado }));

function dadosDoProjeto(projeto) {
  const lista = times.listar(projeto);
  return {
    caminho: projeto,
    nome: path.basename(projeto),
    montado: lista.length > 0,
    times: lista,
    execucoes: listarExecucoes(projeto).slice(0, 60),
    config: proj.lerConfig(projeto),
    vivas: vivasDe(projeto),
  };
}

// Os modelos do Claude Code com a versão. Os apelidos (opus, sonnet...) ainda valem nos
// agentes antigos e sempre apontam para o mais novo da família.
const MODELOS_CLAUDE = [
  ['claude-fable-5-1', 'Fable 5.1', 'o mais capaz'],
  ['claude-opus-5-5', 'Opus 5.5', 'raciocínio forte, código difícil'],
  ['claude-sonnet-5-5', 'Sonnet 5.5', 'equilíbrio entre qualidade e velocidade'],
  ['claude-haiku-5-5', 'Haiku 5.5', 'rápido e barato'],
];
const APELIDOS_CLAUDE = { fable: 'claude-fable-5-1', opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' };

/** As listas de modelos por motor e o nome com versão de cada um ({ listas, info }). */
function modelosDisponiveis() {
  const info = {};
  for (const [id, nome, detalhe] of MODELOS_CLAUDE) info[id] = { nome, detalhe };
  for (const [apelido, id] of Object.entries(APELIDOS_CLAUDE)) info[apelido] = { nome: info[id].nome, detalhe: `apelido: sempre o ${info[id].nome.split(' ')[0]} mais novo` };
  const codex = [];
  try {
    const cache = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.codex', 'models_cache.json'), 'utf8'));
    for (const m of [...(cache.models || [])].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))) {
      if (m.visibility !== 'list') continue;
      codex.push(m.slug);
      info[m.slug] = { nome: m.display_name || m.slug }; // a descrição do Codex vem em inglês; o nome basta
    }
  } catch {}
  const listas = { claude: MODELOS_CLAUDE.map(([id]) => id), codex };
  for (const p of provedores.listar()) listas[`api:${p.id}`] = p.modelos || [];
  return { listas, info };
}

function timeRodando(projeto, time) {
  return [...execucoes.values()].some((x) => x.projeto === projeto && x.exec.time === time);
}

/* ---------- terminais ---------- */

function acharNoPath(nome) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const alvo = path.join(dir, nome);
    if (dir && fs.existsSync(alvo)) return alvo;
  }
  return null;
}

function shells() {
  const lista = [];
  if (process.platform !== 'win32') return [{ id: 'padrao', nome: process.env.SHELL || 'bash', cmd: process.env.SHELL || 'bash', args: ['-l'] }];
  const pwsh = acharNoPath('pwsh.exe');
  if (pwsh) lista.push({ id: 'pwsh', nome: 'PowerShell 7', cmd: pwsh, args: ['-NoLogo'] });
  lista.push({ id: 'powershell', nome: 'PowerShell', cmd: 'powershell.exe', args: ['-NoLogo'] });
  const bash = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'].find((p) => fs.existsSync(p));
  if (bash) lista.push({ id: 'bash', nome: 'Git Bash', cmd: bash, args: ['--login', '-i'] });
  lista.push({ id: 'cmd', nome: 'Prompt de Comando', cmd: 'cmd.exe', args: [] });
  return lista;
}

let pty = null;
function criarTerminal(cwd, shellId, cols, rows) {
  pty ??= require('@lydell/node-pty');
  const opcoes = shells();
  const s = opcoes.find((x) => x.id === shellId) || opcoes[0];
  const id = proximoTerminal++;
  const p = pty.spawn(s.cmd, s.args, {
    name: 'xterm-256color',
    cols: Math.max(20, cols || 80),
    rows: Math.max(5, rows || 24),
    cwd: fs.existsSync(cwd || '') ? cwd : os.homedir(),
    env: { ...process.env, TERM_PROGRAM: 'Orbion.ai', COLORTERM: 'truecolor' },
  });
  // Junta a saída em pedaços de ~16 ms para não afogar a tela com mensagens.
  let buffer = '';
  let timer = null;
  p.onData((dados) => {
    buffer += dados;
    if (!timer) {
      timer = setTimeout(() => {
        enviar({ tipo: 'terminal', id, dados: buffer });
        buffer = '';
        timer = null;
      }, 16);
    }
  });
  p.onExit(({ exitCode }) => {
    terminais.delete(id);
    setTimeout(() => enviar({ tipo: 'terminal-fim', id, codigo: exitCode }), 30);
  });
  terminais.set(id, p);
  return { id, nome: s.nome, shell: s.id };
}

ipcMain.on('terminal:escrever', (_e, id, dados) => terminais.get(id)?.write(dados));
ipcMain.on('terminal:tamanho', (_e, id, cols, rows) => {
  try { terminais.get(id)?.resize(Math.max(20, cols), Math.max(5, rows)); } catch {}
});

/* ---------- canais da tela ---------- */

const acoes = {
  'config:ler': () => ({ ...lerConfig(), vivas: vivasDe() }),
  'config:salvar': (_e, parcial) => {
    const atual = lerConfig();
    const novo = { ...atual, ...parcial, comandos: { ...atual.comandos, ...parcial.comandos }, layout: { ...atual.layout, ...parcial.layout } };
    novo.tamanhoFonte = Math.max(9, Math.min(32, Number(novo.tamanhoFonte) || 14));
    return salvarConfig(novo);
  },
  'modelos:listar': () => modelosDisponiveis(),

  'projeto:escolher': async () => {
    const r = await dialog.showOpenDialog(janela, { title: 'Escolha a pasta do projeto', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const projeto = r.filePaths[0];
    const config = lerConfig();
    salvarConfig({ ...config, projetos: [projeto, ...config.projetos.filter((p) => p !== projeto)] });
    return projeto;
  },
  'projeto:tirar': (_e, projeto) => {
    const config = lerConfig();
    return salvarConfig({ ...config, projetos: config.projetos.filter((p) => p !== projeto) }).projetos;
  },
  'projeto:abrir': (_e, projeto) => {
    if (!fs.existsSync(projeto)) throw new Error('Essa pasta não existe mais.');
    const config = lerConfig();
    if (!config.projetos.includes(projeto)) salvarConfig({ ...config, projetos: [projeto, ...config.projetos] });
    vigiar(projeto);
    return dadosDoProjeto(projeto);
  },
  'projeto:dados': (_e, projeto) => dadosDoProjeto(projeto),
  'projeto:config:salvar': (_e, projeto, parcial) => proj.salvarConfig(projeto, parcial),
  'memoria:garantir': (_e, projeto) => proj.garantirMemoria(projeto),

  'times:listar': (_e, projeto) => times.listar(projeto),
  'time:criar': (_e, projeto, dados) => ({ id: times.criar(projeto, dados), times: times.listar(projeto) }),
  'time:salvar': (_e, projeto, id, campos) => {
    times.salvarInfo(projeto, id, campos);
    return times.listar(projeto);
  },
  'time:excluir': async (_e, projeto, id) => {
    if (!times.idValido(id)) throw new Error('Time inválido.');
    if (timeRodando(projeto, id)) throw new Error('Esse time está trabalhando num pedido agora. Pare o pedido antes.');
    await shell.trashItem(times.pastaTime(projeto, id));
    return times.listar(projeto);
  },
  'times:deOutroProjeto': (_e, outro) => (fs.existsSync(outro) ? times.listar(outro).map(({ id, nome, cor, agentes }) => ({ id, nome, cor, agentes: agentes.length })) : []),

  'agentes:modelos': () => ag.listarModelos(),
  'agente:criar': (_e, projeto, time, modeloId, nome) => {
    const id = ag.criar(projeto, time, modeloId, nome);
    return { id, times: times.listar(projeto) };
  },
  'agente:salvar': (_e, projeto, time, id, campos) => {
    if (campos.papel === 'receptor') {
      // Só um Receptor por time: quem era passa a executor.
      for (const outro of ag.carregarAgentes(projeto, time)) {
        if (outro.id !== id && outro.papel === 'receptor') ag.salvar(projeto, time, outro.id, { ...outro, papel: 'executor' });
      }
    }
    ag.salvar(projeto, time, id, campos);
    return times.listar(projeto);
  },
  'agente:duplicar': (_e, projeto, time, id) => {
    const novo = ag.duplicar(projeto, time, id);
    return { id: novo, times: times.listar(projeto) };
  },
  'agente:copiarPara': (_e, projeto, deTime, id, paraTime) => {
    const a = ag.carregarAgentes(projeto, deTime).find((x) => x.id === id);
    if (!a) throw new Error('Agente não encontrado.');
    const novo = ag.criar(projeto, paraTime, 'branco', a.nome);
    const temReceptor = ag.carregarAgentes(projeto, paraTime).some((x) => x.papel === 'receptor' && x.id !== novo);
    ag.salvar(projeto, paraTime, novo, { ...a, papel: a.papel === 'receptor' && temReceptor ? 'executor' : a.papel });
    return times.listar(projeto);
  },
  'agente:excluir': async (_e, projeto, time, id) => {
    if (!ag.idValido(id)) throw new Error('Agente inválido.');
    const agentes = ag.carregarAgentes(projeto, time);
    const alvo = agentes.find((a) => a.id === id);
    if (alvo?.papel === 'receptor' && !agentes.some((a) => a.id !== id && a.papel === 'receptor')) {
      throw new Error('Esse é o Receptor do time. Escolha outro agente como Receptor antes de tirar este.');
    }
    await shell.trashItem(path.join(ag.pastaAgentes(projeto, time), `${id}.md`));
    return times.listar(projeto);
  },
  'agente:previa': (_e, projeto, time, id) => {
    const agentes = ag.carregarAgentes(projeto, time);
    const agente = agentes.find((a) => a.id === id);
    if (!agente) throw new Error('Agente não encontrado.');
    const config = proj.lerConfig(projeto);
    return prompts.previa({
      agente, agentes, projeto, config, skills: acharSkills(agente.skills, projeto).achadas, memoria: config.memoria ? proj.lerMemoria(projeto) : '',
    });
  },
  'skills:listar': (_e, projeto) => listarSkills(projeto).map(({ nome, descricao, origem, arquivo }) => ({ nome, descricao, origem, arquivo })),
  'skill:ler': (_e, nome, projeto) => lerSkill(nome, projeto),
  'skill:salvar': (_e, dados) => salvarSkill(dados),
  'skill:escrever': async (_e, projeto, dados) => {
    controleAssistente = new AbortController();
    const a = lerConfig().assistente;
    return assistentes.escreverSkill({ projeto, descricao: dados.descricao, motor: dados.motor || a.motor, modelo: dados.modelo ?? a.modelo, comandos: lerConfig().comandos, sinal: controleAssistente.signal, aoEvento: (ev) => enviar({ tipo: 'assistente', ev }) });
  },

  'provedores:presets': () => provedores.PRESETS,
  'provedores:listar': () => ({ lista: provedores.listar(), segura: provedores.criptografiaSegura() }),
  'provedores:salvar': (_e, p) => provedores.salvar(p),
  'provedores:remover': (_e, id) => provedores.remover(id),
  'provedores:modelos': (_e, id) => provedores.buscarModelos(id),
  'contas:situacao': () => contas.situacao(lerConfig().comandos),
  'contas:instalar': () => contas.INSTALAR,

  'conversa:listar': (_e, projeto) => conversas.listar(projeto),
  'conversa:ler': (_e, projeto, id) => conversas.ler(projeto, id),
  'conversa:criar': (_e, projeto, opcoes) => {
    const a = lerConfig().assistente;
    return conversas.criar(projeto, { motor: a.motor, modelo: a.modelo, ...opcoes });
  },
  'conversa:configurar': (_e, projeto, id, campos) => {
    const c = conversas.ler(projeto, id);
    if (campos.motor && campos.motor !== c.motor) c.sessao = null;
    Object.assign(c, campos);
    conversas.salvar(projeto, c);
    return c;
  },
  'conversa:enviar': async (_e, projeto, id, texto, imagens = []) => {
    const controle = new AbortController();
    controlesConversa.set(id, controle);
    try {
      return await conversas.enviar({ projeto, id, texto, anexos: imagens, comandos: lerConfig().comandos, sinal: controle.signal, aoEvento: (ev) => enviar({ tipo: 'conversa', ev }) });
    } finally {
      controlesConversa.delete(id);
    }
  },
  'conversa:parar': (_e, id) => controlesConversa.get(id)?.abort(),
  'anexo:ler': (_e, projeto, rel) => anexos.dataUrl(projeto, rel),
  'conversa:excluir': (_e, projeto, id) => conversas.excluir(projeto, id),
  'execucao:excluirFio': (_e, projeto, fio) => excluirFio(projeto, fio, new Set([...execucoes.keys()])),

  'melhorias:rodar': async (_e, projeto, opcoes = {}) => {
    controleAssistente = new AbortController();
    const a = lerConfig().assistente;
    return assistentes.sugerirMelhorias({ projeto, motor: opcoes.motor || a.motor, modelo: opcoes.modelo ?? a.modelo, foco: opcoes.foco, comandos: lerConfig().comandos, sinal: controleAssistente.signal, aoEvento: (ev) => enviar({ tipo: 'assistente', ev }) });
  },
  'melhorias:ultimas': (_e, projeto) => assistentes.ultimasMelhorias(projeto),
  'assistente:parar': () => controleAssistente?.abort(),

  'projeto:modelos': () => criacao.listarModelos(),
  'projeto:pastaPadrao': () => app.getPath('desktop'),
  'projeto:escolherPai': async () => {
    const r = await dialog.showOpenDialog(janela, { title: 'Onde criar o projeto', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  },
  'projeto:criar': (_e, dados) => {
    const r = criacao.criarProjeto(dados);
    const config = lerConfig();
    salvarConfig({ ...config, projetos: [r.caminho, ...config.projetos.filter((p) => p !== r.caminho)] });
    return r;
  },

  'prompts:listar': (_e, projeto) => prompts.listarModelos(projeto),
  'prompts:garantir': (_e, projeto, nome, base) => prompts.garantirModelo(projeto, nome, base),
  'prompts:restaurar': (_e, projeto, nome) => prompts.restaurarModelo(projeto, nome),

  'fs:listar': (_e, projeto, rel) => proj.listarPasta(projeto, rel),
  'fs:ler': (_e, projeto, rel) => proj.lerArquivo(projeto, rel),
  'fs:salvar': (_e, projeto, rel, texto) => proj.salvarArquivo(projeto, rel, texto),
  'fs:criar': (_e, projeto, rel, pasta) => proj.criar(projeto, rel, pasta),
  'fs:renomear': (_e, projeto, de, para) => proj.renomear(projeto, de, para),
  'fs:lixeira': (_e, projeto, rel) => shell.trashItem(proj.dentro(projeto, rel)),
  'fs:todos': (_e, projeto) => proj.todosArquivos(projeto),
  'fs:revelar': (_e, projeto, rel) => shell.showItemInFolder(proj.dentro(projeto, rel)),
  'fs:abrirExterno': (_e, projeto, rel) => shell.openPath(proj.dentro(projeto, rel)),

  'git:status': (_e, projeto) => proj.statusGit(projeto),
  'git:original': (_e, projeto, rel) => proj.originalGit(projeto, rel),
  'git:indice': (_e, projeto, rel) => gitOps.noIndice(projeto, rel),
  'git:preparar': (_e, projeto, rels) => gitOps.preparar(projeto, rels),
  'git:despreparar': (_e, projeto, rels) => gitOps.despreparar(projeto, rels),
  'git:descartar': (_e, projeto, rels, novos = []) => gitOps.descartar(projeto, rels, { novos, paraLixeira: (p) => shell.trashItem(p) }),
  'git:commit': (_e, projeto, mensagem, opcoes) => gitOps.commit(projeto, mensagem, opcoes),
  'git:ramos': (_e, projeto) => gitOps.ramos(projeto),
  'git:trocarRamo': (_e, projeto, nome) => gitOps.trocarRamo(projeto, nome),
  'git:criarRamo': (_e, projeto, nome) => gitOps.criarRamo(projeto, nome),
  'git:puxar': (_e, projeto) => gitOps.puxar(projeto),
  'git:enviar': (_e, projeto) => gitOps.enviar(projeto),
  'git:sincronizar': (_e, projeto) => gitOps.sincronizar(projeto),
  'git:buscar': (_e, projeto) => gitOps.buscar(projeto),
  'git:iniciar': (_e, projeto) => gitOps.iniciar(projeto),
  'git:publicar': (_e, projeto, opcoes) => gitOps.publicarNoGitHub(projeto, { ...opcoes, gh: contas.acharGh() }),
  'git:mensagem': async (_e, projeto) => {
    const { diff } = await gitOps.diffParaMensagem(projeto);
    if (!diff.trim()) throw new Error('Não há mudanças para descrever.');
    controleAssistente = new AbortController();
    const a = lerConfig().assistente;
    return assistentes.mensagemDeCommit({ projeto, diff, motor: a.motor, modelo: a.modelo, comandos: lerConfig().comandos, sinal: controleAssistente.signal, aoEvento: (ev) => enviar({ tipo: 'assistente', ev }) });
  },

  'temas:listar': () => temas.listar(),
  'temas:cores': (_e, id) => temas.temaCores(id) || temas.temaCores('orbion.dracula'),
  'temas:icones': (_e, id) => temas.temaIcones(id) || temas.temaIcones('orbion.minimo'),
  'extensoes:abrirPasta': () => {
    fs.mkdirSync(loja.pastaExtensoes(), { recursive: true });
    return shell.openPath(loja.pastaExtensoes());
  },
  'loja:buscar': (_e, texto) => loja.buscar(texto),
  'loja:instalar': async (_e, namespace, nome) => ({ ...(await loja.instalar(namespace, nome)), temas: temas.listar() }),
  'loja:instaladas': () => loja.instaladas(),
  'loja:remover': async (_e, pasta) => {
    if (!dentroDe(loja.pastaExtensoes(), path.resolve(pasta)) || path.resolve(pasta) === loja.pastaExtensoes()) throw new Error('Só dá para remover extensões instaladas pelo Orbion.');
    await shell.trashItem(pasta);
    return temas.listar();
  },

  'terminal:shells': () => shells().map(({ id, nome }) => ({ id, nome })),
  'terminal:criar': (_e, cwd, shellId, cols, rows) => criarTerminal(cwd, shellId, cols, rows),
  'terminal:fechar': (_e, id) => {
    const p = terminais.get(id);
    terminais.delete(id);
    try { p?.kill(); } catch {}
  },

  'janela:titulo': (_e, cor, simbolo) => {
    try { janela.setTitleBarOverlay({ color: cor, symbolColor: simbolo, height: 34 }); } catch {}
  },
  'janela:devtools': () => janela.webContents.toggleDevTools(),
  'janela:recarregar': () => janela.webContents.reload(),
  'janela:sair': () => janela.close(),

  // Vários pedidos podem rodar juntos, até no mesmo time: a trava de escrita do projeto evita conflito.
  'execucao:iniciar': (_e, projeto, time, pedido, opcoes = {}) => {
    if (!travas.has(projeto)) travas.set(projeto, new Trava());
    const item = { projeto, responder: null };
    item.exec = new Execucao({
      projeto,
      time,
      pedido,
      agente: opcoes.agente || null,
      fio: opcoes.fio || null,
      somenteLeitura: !!opcoes.somenteLeitura,
      anexos: anexos.guardar(projeto, opcoes.anexos),
      config: { comandos: lerConfig().comandos },
      trava: travas.get(projeto),
      perguntar: () => new Promise((resolve) => { item.responder = resolve; }),
    });
    const id = item.exec.estado.id;
    execucoes.set(id, item);
    item.exec.on('evento', (ev) => enviar({ ...ev, execucao: id, projeto }));
    item.exec.rodar().then((estado) => {
      execucoes.delete(id);
      enviar({ tipo: 'fim', execucao: id, projeto, estado });
    });
    return item.exec.estado;
  },
  'execucao:responder': (_e, id, resposta) => {
    const item = execucoes.get(id);
    const r = item?.responder;
    if (item) item.responder = null;
    r?.(resposta);
  },
  'execucao:cancelar': (_e, id) => execucoes.get(id)?.exec.cancelar(),
  'execucao:intervir': (_e, id, tarefa) => execucoes.get(id)?.exec.intervir(tarefa) || false,
  'execucao:ler': (_e, projeto, id) => lerExecucao(projeto, id),
  'execucao:vivas': (_e, projeto) => vivasDe(projeto),

  'abrir:pasta': (_e, alvo) => shell.openPath(alvo),
  'app:notificar': (_e, titulo, texto) => notificar(titulo, texto),
  'previa:endereco': (_e, projeto, alvo) => enderecoDaPrevia(projeto, alvo),
  'previa:abrirFora': (_e, url) => { if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) shell.openExternal(url); },
  // A foto de um pedaço da janela (a prévia com os pontos marcados), em PNG.
  'previa:capturar': async (_e, r) => {
    const img = await janela.webContents.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) });
    return img.toPNG().toString('base64');
  },
  'abrir:link': (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); },
};

for (const [canal, fn] of Object.entries(acoes)) ipcMain.handle(canal, fn);

function criarJanela() {
  janela = new BrowserWindow({
    width: 1560,
    height: 960,
    minWidth: 1000,
    minHeight: 620,
    backgroundColor: '#21222C',
    title: 'Orbion.ai',
    icon: process.platform === 'win32' ? ICONE_ICO : ICONE_PNG,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#21222C', symbolColor: '#F8F8F2', height: 34 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  janela.loadURL('orbion://app/tela/index.html');

  // Links nunca abrem dentro do app.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('orbion://app/')) e.preventDefault();
  });

  janela.on('close', (e) => {
    if (!execucoes.size) return;
    const r = dialog.showMessageBoxSync(janela, {
      type: 'warning',
      buttons: ['Parar e fechar', 'Continuar aberto'],
      defaultId: 1,
      cancelId: 1,
      message: execucoes.size > 1 ? `Tem ${execucoes.size} pedidos rodando.` : 'Tem um pedido rodando.',
      detail: 'Fechar agora para os agentes no meio do trabalho.',
    });
    if (r === 1) e.preventDefault();
    else for (const x of execucoes.values()) x.exec.cancelar();
  });
}

// No Windows, a barra de tarefas e as notificações usam o id do app, e não o electron.exe.
if (process.platform === 'win32') app.setAppUserModelId(ID_APP);

/** Registra o Orbion.ai no Windows (só neste usuário): o atalho do menu Iniciar, que abre o app e recebe
 *  o clique das notificações, e o nome e o ícone que aparecem no topo de cada notificação. */
function registrarNoWindows() {
  if (process.platform !== 'win32') return;
  const atalho = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Orbion.ai.lnk');
  const quer = {
    target: process.execPath,
    args: app.isPackaged ? '' : `"${RAIZ}"`,
    cwd: RAIZ,
    description: 'Orbion.ai',
    icon: ICONE_ICO,
    iconIndex: 0,
    appUserModelId: ID_APP,
    toastActivatorClsid: app.toastActivatorCLSID, // o clique numa notificação antiga, na central, abre o Orbion
  };
  try {
    // Rodando pelo electron.exe (sem instalador), o Electron cria sozinho um "Electron.lnk" no menu Iniciar
    // a cada notificação. Ele não serve para nada: apaga, mas só se apontar para este mesmo electron.exe.
    const automatico = path.join(path.dirname(atalho), 'Electron.lnk');
    if (!app.isPackaged && fs.existsSync(automatico)) {
      const a = shell.readShortcutLink(automatico);
      if (a.target === process.execPath && (!a.appUserModelId || a.appUserModelId === ID_APP)) fs.rmSync(automatico, { force: true });
    }
    const existe = fs.existsSync(atalho);
    if (existe) {
      const tem = shell.readShortcutLink(atalho);
      if (tem.target === quer.target && tem.args === quer.args && tem.icon === quer.icon && tem.appUserModelId === ID_APP
        && String(tem.toastActivatorClsid).toUpperCase() === String(quer.toastActivatorClsid).toUpperCase()) return;
    }
    shell.writeShortcutLink(atalho, existe ? 'replace' : 'create', quer);
  } catch (e) {
    console.error('Não consegui criar o atalho do Orbion.ai no menu Iniciar:', e.message);
  }
  // O nome e o ícone do topo da notificação. Sem isto o Windows usa o nome do electron.exe ("Electron").
  const chave = `HKCU\\Software\\Classes\\AppUserModelId\\${ID_APP}`;
  for (const [nome, valor] of [['DisplayName', 'Orbion.ai'], ['IconUri', ICONE_PNG]]) {
    execFile('reg', ['add', chave, '/v', nome, '/t', 'REG_SZ', '/d', valor, '/f'], { windowsHide: true }, (erro) => {
      if (erro) console.error(`Não consegui registrar ${nome} do Orbion.ai:`, erro.message);
    });
  }
}

// Guardadas até sumirem: sem a referência, o clique na notificação pode se perder.
const notificacoes = new Set();
function notificar(titulo, texto) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: titulo || 'Orbion.ai', body: texto || '', icon: ICONE_PNG });
  notificacoes.add(n);
  const soltar = () => notificacoes.delete(n);
  n.on('click', () => {
    soltar();
    if (!janela || janela.isDestroyed()) return;
    if (janela.isMinimized()) janela.restore();
    janela.show();
    janela.focus();
  });
  n.on('close', soltar);
  n.show();
}

app.whenReady().then(() => {
  protocol.handle('orbion', servir);
  registrarNoWindows();
  // Tokens das APIs: criptografados pelo Windows (DPAPI), só abrem neste usuário e neste PC.
  const segura = safeStorage.isEncryptionAvailable();
  provedores.configurar({
    pasta: app.getPath('userData'),
    segura,
    cifrar: segura ? (t) => safeStorage.encryptString(t).toString('base64') : undefined,
    decifrar: segura ? (b) => safeStorage.decryptString(Buffer.from(b, 'base64')) : undefined,
  });
  criarJanela();
});
app.on('window-all-closed', () => {
  for (const p of terminais.values()) { try { p.kill(); } catch {} }
  app.quit();
});
