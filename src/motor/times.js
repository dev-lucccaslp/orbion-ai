// Times de um projeto: cada um tem nome, cor e descrição (time.json) e os seus
// agentes (agentes/*.md), em <projeto>/.orbion/times/<id>/.

const fs = require('node:fs');
const path = require('node:path');
const ag = require('./agentes');

const raizTimes = (projeto) => path.join(projeto, '.orbion', 'times');
const pastaTime = (projeto, id) => path.join(raizTimes(projeto), path.basename(id));
const idValido = (id) => /^[a-z0-9][a-z0-9-]{0,40}$/.test(id);

const CORES = ['#bd93f9', '#8be9fd', '#50fa7b', '#ffb86c', '#ff79c6', '#f1fa8c', '#60a5fa', '#f87171'];

/** Projetos da versão anterior tinham um time só, em .orbion/agentes: vira o "Time principal". */
function migrar(projeto) {
  const antigo = path.join(projeto, '.orbion', 'agentes');
  if (!fs.existsSync(antigo) || fs.existsSync(raizTimes(projeto))) return;
  const destino = pastaTime(projeto, 'principal');
  fs.mkdirSync(destino, { recursive: true });
  fs.renameSync(antigo, path.join(destino, 'agentes'));
  salvarInfo(projeto, 'principal', { nome: 'Time principal', cor: CORES[0], icone: 'organization', descricao: '' });
}

function lerInfo(projeto, id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pastaTime(projeto, id), 'time.json'), 'utf8'));
  } catch {
    return {};
  }
}

function salvarInfo(projeto, id, campos) {
  if (!idValido(id)) throw new Error('Time inválido.');
  const atual = lerInfo(projeto, id);
  const novo = {
    criadoEm: Date.now(),
    ...atual,
    nome: String(campos.nome ?? atual.nome ?? id).trim() || id,
    cor: campos.cor ?? atual.cor ?? CORES[0],
    icone: campos.icone ?? atual.icone ?? 'organization',
    descricao: String(campos.descricao ?? atual.descricao ?? '').trim(),
  };
  fs.mkdirSync(pastaTime(projeto, id), { recursive: true });
  fs.writeFileSync(path.join(pastaTime(projeto, id), 'time.json'), JSON.stringify(novo, null, 2));
  return novo;
}

function listar(projeto) {
  migrar(projeto);
  if (!fs.existsSync(raizTimes(projeto))) return [];
  return fs.readdirSync(raizTimes(projeto), { withFileTypes: true })
    .filter((d) => d.isDirectory() && idValido(d.name))
    .map((d) => {
      const info = lerInfo(projeto, d.name);
      return { id: d.name, nome: info.nome || d.name, cor: info.cor || CORES[0], icone: info.icone || 'organization', descricao: info.descricao || '', criadoEm: info.criadoEm || 0, agentes: ag.carregarAgentes(projeto, d.name) };
    })
    .sort((a, b) => a.criadoEm - b.criadoEm || a.nome.localeCompare(b.nome));
}

function idLivre(projeto, nome) {
  const base = ag.idDoNome(nome);
  let id = base;
  for (let i = 2; fs.existsSync(pastaTime(projeto, id)); i++) id = `${base}-${i}`;
  return id;
}

/**
 * Cria um time. origem: 'padrao' (Receptor, PO, Designer, Dev, Tester), 'vazio' (só o Receptor),
 * uma lista de modelos, ou { projeto, time } para copiar um time que já existe (deste ou de outro projeto).
 */
function criar(projeto, { nome, cor, descricao, origem = 'padrao' }) {
  const id = idLivre(projeto, nome || 'time');
  const usados = listar(projeto).map((t) => t.cor);
  salvarInfo(projeto, id, { nome: nome || 'Novo time', cor: cor || CORES.find((c) => !usados.includes(c)) || CORES[0], descricao });
  if (origem && typeof origem === 'object' && !Array.isArray(origem)) {
    const de = path.join(pastaTime(origem.projeto, origem.time), 'agentes');
    fs.cpSync(de, ag.pastaAgentes(projeto, id), { recursive: true });
  } else {
    ag.prepararTime(projeto, id, Array.isArray(origem) ? origem : origem === 'vazio' ? ['receptor'] : ag.TIME_PADRAO);
  }
  return id;
}

module.exports = { listar, criar, lerInfo, salvarInfo, pastaTime, migrar, idValido };
