// Os fluxos do projeto: por onde cada funcionalidade passa (tela → rota → tratamento → banco → volta),
// em blocos e ligações, no estilo do n8n. Ficam em <projeto>/.orbion/fluxos.json e nascem de dois jeitos:
// o mapa que uma IA monta ao abrir o projeto, e o plano de cada pedido, que os agentes vão completando
// com os arquivos de verdade enquanto trabalham.

const fs = require('node:fs');
const path = require('node:path');

const TIPOS_DE_BLOCO = ['tela', 'componente', 'rota', 'servico', 'banco', 'fila', 'ia', 'externo', 'evento', 'arquivo'];

const BLOCO = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'tipo', 'titulo', 'detalhe', 'arquivos'],
  properties: {
    id: { type: 'string', description: 'Curto e estável, em minúsculas com hífen (ex.: tela-login, post-api-login, tabela-usuarios).' },
    tipo: {
      type: 'string',
      enum: TIPOS_DE_BLOCO,
      description: 'tela: o que a pessoa vê; componente: pedaço de tela; rota: endpoint, API ou webhook; servico: regra, validação ou tratamento dos dados; banco: tabela, função ou consulta; fila: fila ou tarefa agendada; ia: chamada a um modelo ou agente de IA; externo: sistema de fora (pagamento, WhatsApp, e-mail, ERP); evento: gatilho (clique, horário, mensagem que chega); arquivo: configuração ou script.',
    },
    titulo: { type: 'string', description: 'Nome curto, como aparece no bloco (ex.: POST /api/login).' },
    detalhe: { type: 'string', description: 'O que o bloco faz, em uma ou duas frases.' },
    arquivos: { type: 'array', items: { type: 'string' }, description: 'Arquivos do projeto onde ele está, relativos à pasta do projeto. [] se ainda não existe.' },
  },
};

const LIGACAO = {
  type: 'object',
  additionalProperties: false,
  required: ['de', 'para', 'rotulo'],
  properties: {
    de: { type: 'string', description: 'id do bloco de onde sai' },
    para: { type: 'string', description: 'id do bloco aonde chega' },
    rotulo: { type: 'string', description: 'O que passa de um para o outro, em poucas palavras (ex.: e-mail e senha). "" se não precisar.' },
  },
};

/** O fluxo de uma funcionalidade, como o Receptor desenha no plano. */
const FLUXO = {
  type: 'object',
  additionalProperties: false,
  required: ['nome', 'blocos', 'ligacoes'],
  properties: {
    nome: { type: 'string', description: 'Nome da funcionalidade (ex.: Login). "" quando não há fluxo.' },
    blocos: { type: 'array', items: BLOCO },
    ligacoes: { type: 'array', items: LIGACAO },
  },
};

/** O que cada agente devolve no passe: os blocos que fez ou mudou. */
const FLUXO_DO_PASSE = {
  type: 'object',
  additionalProperties: false,
  required: ['blocos', 'ligacoes'],
  properties: {
    blocos: { type: 'array', items: BLOCO, description: 'Os blocos que você fez ou mudou, com os arquivos reais. Use os mesmos ids do plano quando for o mesmo bloco. [] se não mexeu no fluxo.' },
    ligacoes: { type: 'array', items: LIGACAO, description: 'Ligações novas entre blocos. [] se nenhuma.' },
  },
};

/** O mapa do projeto inteiro, que a IA monta ao abrir o projeto. */
const MAPA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo', 'fluxos'],
  properties: {
    resumo: { type: 'string', description: 'Como o projeto está organizado, em duas ou três frases.' },
    fluxos: { type: 'array', items: FLUXO },
  },
};

const arquivoDe = (projeto) => path.join(projeto, '.orbion', 'fluxos.json');

/** "Login do cliente" → "login-do-cliente" (sem acento, só letras, números e hífen). */
function slug(texto) {
  const semAcento = [...String(texto || '').normalize('NFD')].filter((c) => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f).join('');
  return semAcento.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

const limparCaminho = (c) => String(c || '').split(String.fromCharCode(92)).join('/').replace(/^\.?\//, '').replace(/:\d+$/, '').trim();

/** Arruma o que veio da IA: ids únicos, tipos válidos, ligações só entre blocos que existem. */
function normalizar(bruto = {}, extra = {}) {
  const blocos = [];
  const ids = new Set();
  for (const b of bruto.blocos || []) {
    const id = slug(b.id || b.titulo);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    blocos.push({
      id,
      tipo: TIPOS_DE_BLOCO.includes(b.tipo) ? b.tipo : 'servico',
      titulo: String(b.titulo || id).trim().slice(0, 80),
      detalhe: String(b.detalhe || '').trim(),
      arquivos: [...new Set((b.arquivos || []).map(limparCaminho).filter(Boolean))],
    });
  }
  const vistas = new Set();
  const ligacoes = [];
  for (const l of bruto.ligacoes || []) {
    const de = slug(l.de);
    const para = slug(l.para);
    const chave = `${de}>${para}`;
    if (!ids.has(de) || !ids.has(para) || de === para || vistas.has(chave)) continue;
    vistas.add(chave);
    ligacoes.push({ de, para, rotulo: String(l.rotulo || '').trim().slice(0, 60) });
  }
  const nome = String(bruto.nome || extra.nome || '').trim();
  return { id: extra.id || slug(nome) || 'fluxo', nome: nome || 'Fluxo', blocos, ligacoes, ...extra };
}

/** Junta o que é novo num fluxo que já existe: o bloco de mesmo id ganha o texto novo e soma os arquivos. */
function mesclar(base, novo) {
  if (!base) return novo;
  if (!novo) return base;
  const blocos = base.blocos.map((b) => ({ ...b, arquivos: [...b.arquivos] }));
  for (const n of novo.blocos || []) {
    const b = blocos.find((x) => x.id === n.id);
    if (!b) { blocos.push({ ...n, arquivos: [...n.arquivos] }); continue; }
    if (n.titulo) b.titulo = n.titulo;
    if (n.detalhe) b.detalhe = n.detalhe;
    if (n.tipo) b.tipo = n.tipo;
    if (n.previa) b.previa = n.previa;
    if (n.agentes?.length) b.agentes = [...new Set([...(b.agentes || []), ...n.agentes])];
    b.arquivos = [...new Set([...b.arquivos, ...n.arquivos])];
  }
  const ligacoes = [...base.ligacoes];
  for (const l of novo.ligacoes || []) {
    const existe = ligacoes.find((x) => x.de === l.de && x.para === l.para);
    if (existe) { if (l.rotulo) existe.rotulo = l.rotulo; } else ligacoes.push({ ...l });
  }
  return { ...base, nome: base.nome || novo.nome, blocos, ligacoes };
}

function ler(projeto) {
  try {
    const dados = JSON.parse(fs.readFileSync(arquivoDe(projeto), 'utf8'));
    return { fluxos: [], mapeadoEm: null, resumo: '', ...dados };
  } catch {
    return { fluxos: [], mapeadoEm: null, resumo: '' };
  }
}

function gravarTudo(projeto, dados) {
  fs.mkdirSync(path.dirname(arquivoDe(projeto)), { recursive: true });
  fs.writeFileSync(arquivoDe(projeto), JSON.stringify(dados, null, 2));
  return dados;
}

/** Guarda (ou atualiza) um fluxo pelo id, sem perder onde a pessoa arrumou os blocos. */
function gravar(projeto, fluxo) {
  const dados = ler(projeto);
  const i = dados.fluxos.findIndex((f) => f.id === fluxo.id);
  const antigo = i >= 0 ? dados.fluxos[i] : null;
  const novo = {
    ...(antigo ? mesclar(antigo, fluxo) : fluxo),
    posicoes: { ...(antigo?.posicoes || {}), ...(fluxo.posicoes || {}) },
    origem: fluxo.origem || antigo?.origem || 'pedido',
    pedidos: [...new Set([...(antigo?.pedidos || []), ...(fluxo.pedidos || [])])],
    atualizadoEm: Date.now(),
  };
  if (i >= 0) dados.fluxos[i] = novo;
  else dados.fluxos.unshift(novo);
  return gravarTudo(projeto, dados);
}

function gravarPosicoes(projeto, id, posicoes) {
  const dados = ler(projeto);
  const f = dados.fluxos.find((x) => x.id === id);
  if (!f) return dados;
  f.posicoes = { ...(f.posicoes || {}), ...posicoes };
  return gravarTudo(projeto, dados);
}

/** O mapa novo entra junto com o que já existia: fluxo de mesmo id se junta, os dos pedidos ficam. */
function gravarMapa(projeto, mapa) {
  const dados = ler(projeto);
  for (const bruto of mapa.fluxos || []) {
    const f = normalizar(bruto, { origem: 'mapa' });
    if (!f.blocos.length) continue;
    const i = dados.fluxos.findIndex((x) => x.id === f.id);
    if (i >= 0) dados.fluxos[i] = { ...mesclar(dados.fluxos[i], f), atualizadoEm: Date.now() };
    else dados.fluxos.push({ ...f, posicoes: {}, pedidos: [], atualizadoEm: Date.now() });
  }
  dados.resumo = mapa.resumo || dados.resumo;
  dados.mapeadoEm = Date.now();
  return gravarTudo(projeto, dados);
}

/** O fluxo em texto, para os prompts: os blocos (com os da tarefa marcados) e as ligações. */
function paraPrompt(fluxo, meus = []) {
  if (!fluxo?.blocos?.length) return '';
  const nome = (id) => fluxo.blocos.find((b) => b.id === id)?.titulo || id;
  return [
    `Blocos${meus.length ? ' (os desta tarefa marcados com →)' : ''}:`,
    ...fluxo.blocos.map((b) => `${meus.includes(b.id) ? '→' : ' '} ${b.id} [${b.tipo}] ${b.titulo}${b.arquivos.length ? ` (${b.arquivos.join(', ')})` : ''}`),
    fluxo.ligacoes.length ? 'Ligações:' : '',
    ...fluxo.ligacoes.map((l) => `- ${nome(l.de)} → ${nome(l.para)}${l.rotulo ? ` (${l.rotulo})` : ''}`),
  ].filter(Boolean).join('\n');
}

module.exports = {
  TIPOS_DE_BLOCO, BLOCO, LIGACAO, FLUXO, FLUXO_DO_PASSE, MAPA,
  slug, limparCaminho, normalizar, mesclar, ler, gravar, gravarPosicoes, gravarMapa, paraPrompt,
};
