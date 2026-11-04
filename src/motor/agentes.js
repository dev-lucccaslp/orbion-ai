// Agentes de um time: um arquivo .md por agente em <projeto>/.orbion/times/<time>/agentes,
// com um cabeçalho de configuração e, abaixo dele, as instruções do papel.
// Tudo no cabeçalho é editável pela tela ou à mão.

const fs = require('node:fs');
const path = require('node:path');

const MODELOS = path.join(__dirname, '..', 'modelos', 'agentes');
const TIME_PADRAO = ['receptor', 'po', 'designer', 'dev', 'tester'];
const PAPEIS = ['receptor', 'executor', 'verificador'];
const ESFORCOS = ['', 'low', 'medium', 'high', 'xhigh', 'max'];

const pastaAgentes = (projeto, time) => path.join(projeto, '.orbion', 'times', path.basename(time), 'agentes');

function simOuNao(valor, padrao = false) {
  const v = String(valor ?? '').trim();
  if (!v) return padrao;
  return /^(sim|s|true|yes|1)$/i.test(v);
}

function numero(valor, padrao) {
  const n = Number(valor);
  return valor === '' || valor == null || !Number.isFinite(n) ? padrao : n;
}

// claude e codex são os CLIs logados; api:<provedor> é um modelo por token (Gemini, Grok, OpenRouter...).
const motorValido = (m) => (m === 'codex' ? 'codex' : /^api:[a-z0-9-]+$/.test(m || '') ? m : 'claude');

const lista = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

const semBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);

function separarCabecalho(texto) {
  const m = semBom(texto).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { campos: {}, corpo: texto };
  const campos = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const i = linha.indexOf(':');
    if (i > 0) campos[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return { campos, corpo: m[2].trim() };
}

function deCampos(id, campos, corpo) {
  return {
    id,
    nome: campos.nome || id,
    papel: PAPEIS.includes(campos.papel) ? campos.papel : id === 'receptor' ? 'receptor' : 'executor',
    ativo: simOuNao(campos.ativo, true),
    icone: campos.icone || 'person',
    cor: campos.cor || '#8b93a7',
    ordem: numero(campos.ordem, 99),
    motor: motorValido(campos.motor),
    modelo: campos.modelo || '',
    esforco: ESFORCOS.includes(campos.esforco) ? campos.esforco : '',
    editaArquivos: simOuNao(campos.edita_arquivos),
    rodaComandos: simOuNao(campos.roda_comandos),
    ferramentas: campos.ferramentas || '',
    tempoMax: numero(campos.tempo_max, null),
    argsExtras: campos.args_extras || '',
    skills: lista(campos.skills),
    modeloPrompt: campos.modelo_prompt || '',
    descricao: campos.descricao || '',
    instrucoes: corpo,
  };
}

function lerArquivoAgente(arquivo) {
  const { campos, corpo } = separarCabecalho(fs.readFileSync(arquivo, 'utf8'));
  return { ...deCampos(path.basename(arquivo, '.md'), campos, corpo), arquivo };
}

/** Monta o arquivo .md a partir dos campos que a tela edita. */
function montarTexto(a) {
  const sn = (v) => (v ? 'sim' : 'nao');
  const linha = (v) => String(v ?? '').replace(/\s*\r?\n\s*/g, ' ').trim();
  return `---
nome: ${linha(a.nome)}
papel: ${PAPEIS.includes(a.papel) ? a.papel : 'executor'}
ativo: ${sn(a.ativo !== false)}
icone: ${linha(a.icone) || 'person'}
cor: ${linha(a.cor) || '#8b93a7'}
ordem: ${numero(a.ordem, 50)}
motor: ${motorValido(a.motor)}
modelo: ${linha(a.modelo)}
esforco: ${ESFORCOS.includes(a.esforco) ? a.esforco : ''}
edita_arquivos: ${sn(a.editaArquivos)}
roda_comandos: ${sn(a.rodaComandos)}
ferramentas: ${linha(a.ferramentas)}
tempo_max: ${a.tempoMax == null || a.tempoMax === '' ? '' : numero(a.tempoMax, '')}
args_extras: ${linha(a.argsExtras)}
skills: ${(a.skills || []).map(linha).join(', ')}
modelo_prompt: ${linha(a.modeloPrompt)}
descricao: ${linha(a.descricao)}
---
${String(a.instrucoes || '').trim()}
`;
}

function carregarAgentes(projeto, time) {
  const pasta = pastaAgentes(projeto, time);
  if (!fs.existsSync(pasta)) return [];
  return fs.readdirSync(pasta)
    .filter((f) => f.endsWith('.md'))
    .map((f) => lerArquivoAgente(path.join(pasta, f)))
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}

/** Os modelos que a pessoa pode usar para criar agentes. */
function listarModelos() {
  return fs.readdirSync(MODELOS)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const a = lerArquivoAgente(path.join(MODELOS, f));
      return { id: a.id, nome: a.nome, descricao: a.descricao, icone: a.icone, cor: a.cor, papel: a.papel, motor: a.motor, modelo: a.modelo || '', padrao: TIME_PADRAO.includes(a.id) };
    })
    .sort((a, b) => (b.padrao - a.padrao) || a.nome.localeCompare(b.nome));
}

/** Monta o time com os modelos escolhidos (o Receptor sempre entra: é ele quem planeja). */
function prepararTime(projeto, time, ids = TIME_PADRAO) {
  const pasta = pastaAgentes(projeto, time);
  fs.mkdirSync(pasta, { recursive: true });
  for (const id of new Set(['receptor', ...ids])) {
    const origem = path.join(MODELOS, `${path.basename(id)}.md`);
    const destino = path.join(pasta, `${path.basename(id)}.md`);
    if (fs.existsSync(origem) && !fs.existsSync(destino)) fs.copyFileSync(origem, destino);
  }
}

/** Troca o motor e o modelo de um agente do time (o resto do arquivo fica como está). */
function ajustarMotor(projeto, time, id, { motor, modelo = '' }) {
  const arquivo = path.join(pastaAgentes(projeto, time), `${path.basename(id)}.md`);
  if (!fs.existsSync(arquivo)) return;
  const a = lerArquivoAgente(arquivo);
  salvar(projeto, time, a.id, { ...a, motor, modelo });
}

function idValido(id) {
  return /^[a-z0-9][a-z0-9-]{0,40}$/.test(id);
}

function idDoNome(nome) {
  const semAcento = [...String(nome).normalize('NFD')].filter((c) => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f).join('');
  return semAcento.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'agente';
}

function idLivre(projeto, time, nome) {
  const base = idDoNome(nome);
  let id = base;
  for (let i = 2; fs.existsSync(path.join(pastaAgentes(projeto, time), `${id}.md`)); i++) id = `${base}-${i}`;
  return id;
}

function salvar(projeto, time, id, campos) {
  if (!idValido(id)) throw new Error('Agente inválido.');
  fs.mkdirSync(pastaAgentes(projeto, time), { recursive: true });
  fs.writeFileSync(path.join(pastaAgentes(projeto, time), `${id}.md`), montarTexto(campos));
}

/** Cria um agente a partir de um modelo (ou em branco) e devolve o id do arquivo. */
function criar(projeto, time, modeloId, nome) {
  let base;
  if (modeloId && modeloId !== 'branco') {
    base = lerArquivoAgente(path.join(MODELOS, `${path.basename(modeloId)}.md`));
  } else {
    base = deCampos('novo', { nome, cor: '#7dd3fc', ordem: '50', icone: 'person' },
      `Você é o ${nome} deste time.\n\nExplique aqui o papel, o que ele entrega e o que ele não deve fazer.`);
  }
  if (base.papel === 'receptor' && carregarAgentes(projeto, time).some((a) => a.papel === 'receptor')) base.papel = 'executor';
  const id = idLivre(projeto, time, nome || base.nome);
  salvar(projeto, time, id, { ...base, nome: nome || base.nome });
  return id;
}

function duplicar(projeto, time, id) {
  const a = carregarAgentes(projeto, time).find((x) => x.id === id);
  if (!a) throw new Error('Agente não encontrado.');
  const nome = `${a.nome} (cópia)`;
  const novo = idLivre(projeto, time, nome);
  salvar(projeto, time, novo, { ...a, nome, papel: a.papel === 'receptor' ? 'executor' : a.papel });
  return novo;
}

module.exports = {
  ajustarMotor,
  prepararTime, carregarAgentes, listarModelos, salvar, criar, duplicar, montarTexto,
  idValido, idDoNome, separarCabecalho, pastaAgentes, TIME_PADRAO, PAPEIS, ESFORCOS,
};
