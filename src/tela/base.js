// Estado da tela e ajudantes que todas as partes usam.

const { chamar, aoEvento, enviar: enviarRapido } = window.orq;

const S = {
  config: null,
  modelos: { claude: [], codex: [] },
  temas: { cores: [], icones: [], pastas: [] },
  tema: null, // tema de cores aplicado
  icones: null, // tema de ícones aplicado
  projeto: null, // { caminho, nome, montado, times: [{ id, nome, cor, agentes }], execucoes, config }
  git: null, // { ramo, arquivos: { rel: letra } } ou null sem git
  vista: 'explorador',
  painelAba: 'terminal', // terminal | log
  direitaAba: 'orquestra', // orquestra | voo
  timeAtual: null, // time que recebe o próximo pedido
  arvore: { abertas: new Set(), filhos: new Map(), selecionado: null },
  abas: [],
  ativa: null,
  vendo: null, // pedido em foco na Orquestra (estado): o log de baixo e o Voo seguem ele
  fio: null, // a conversa aberta na Orquestra (id do primeiro pedido dela); null = conversa nova
  fioIds: [], // os pedidos dessa conversa, do mais antigo para o mais novo
  fioCache: new Map(), // pedidos já terminados lidos do disco: id → { estado, eventos }
  eventos: [], // log do pedido mostrado
  vivos: new Map(), // pedidos rodando agora: id → { id, projeto, estado, eventos, rodando }
  filtro: null, // tarefa filtrada no log
  abertas: new Set(), // mensagens com detalhe aberto
  execVer: new Map(), // execução aberta ou fechada por quem clicou (senão: aberta enquanto roda)
  execTudo: new Set(), // execuções em que a pessoa pediu todos os passos
  uso: { claude: null, codex: null },
  skills: null,
  modelosAgente: null,
  cursor: null, // { linha, coluna }
};

const ST_TAREFA = {
  pendente: 'A fazer', na_fila: 'Na fila de escrita', rodando: 'Trabalhando', concluida: 'Pronta', falhou: 'Falhou',
  bloqueada: 'Esperando por ti', cancelada: 'Cancelada',
};
const ST_EXECUCAO = {
  planejando: 'Receptor planejando', aguardando: 'Esperando tua decisão', rodando: 'Time trabalhando',
  concluida: 'Concluído', falhou: 'Parou com falha', cancelada: 'Cancelado', interrompida: 'Interrompido',
};
const ATIVOS = ['planejando', 'aguardando', 'rodando'];
const PAPEL = { receptor: 'Receptor', executor: 'Executor', verificador: 'Verificador' };

const $ = (sel, raiz = document) => raiz.querySelector(sel);

function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'cor') el.style.setProperty('--cor', v);
    else if (k === 'estilo') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'valor') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

const ic = (nome, extra = '') => h('i', { class: `codicon codicon-${nome} ${extra}`.trim() });

function aviso(texto, tipo = 'erro') {
  const el = h('div', { class: `aviso aviso-${tipo}` }, ic(tipo === 'ok' ? 'pass' : tipo === 'info' ? 'info' : 'error'), h('span', {}, texto));
  $('#avisos').append(el);
  setTimeout(() => el.remove(), 6000);
}

async function api(canal, ...args) {
  try {
    return await chamar(canal, ...args);
  } catch (e) {
    aviso(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    throw e;
  }
}

const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const data = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const nomeDe = (rel) => rel.split('/').pop();

/** Teclas dos campos de mensagem, como num chat: Enter envia; Ctrl+Enter (ou Shift+Enter) quebra a linha. */
function teclaDeChat(e, enviar) {
  if (e.key !== 'Enter' || e.isComposing || e.altKey) return false;
  e.preventDefault();
  if (e.ctrlKey || e.shiftKey || e.metaKey) {
    // Num textarea o Ctrl+Enter não escreve nada sozinho: insere a quebra mantendo o Ctrl+Z.
    if (!document.execCommand('insertText', false, '\n')) {
      e.target.setRangeText('\n', e.target.selectionStart, e.target.selectionEnd, 'end');
      e.target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } else enviar();
  return true;
}

/** O nome do modelo com a versão (claude-opus-5-5 → Opus 5.5); o próprio id quando não conhece. */
function nomeModelo(id) {
  return S.infoModelos?.[id]?.nome || id;
}

/** "Opus 5.5 · raciocínio forte"; para os modelos por API, o id (e "grátis" quando for). */
function rotuloModelo(id) {
  const i = S.infoModelos?.[id];
  if (i) return i.detalhe ? `${i.nome} · ${i.detalhe}` : i.nome;
  return /(:free|-free)$/.test(id) ? `${id} · grátis` : id;
}

/** O padrão de cada motor, para mostrar no lugar do modelo vazio. */
function padraoDoMotor(motor) {
  if (motor === 'claude') return 'Padrão do Claude Code (o do teu plano)';
  if (motor === 'codex') return 'Padrão do Codex';
  const p = S.provedores?.find((x) => `api:${x.id}` === motor);
  return p?.modelo ? `Padrão do provedor (${p.modelo})` : 'Padrão do provedor';
}

/** Seletor dos modelos de um motor, com nome e versão. "Outro…" pede um id qualquer. */
function seletorModelo(motor, valor, aoMudar) {
  const lista = S.modelos?.[motor] || [];
  // Um apelido antigo (opus) aparece como o modelo com versão que ele representa (Opus 5.5).
  const marcado = !valor || lista.includes(valor) ? valor || ''
    : (S.infoModelos?.[valor] && lista.find((m) => nomeModelo(m) === nomeModelo(valor))) || valor;
  const opcoes = [['', padraoDoMotor(motor)], ...lista.map((m) => [m, rotuloModelo(m)])];
  if (marcado && !lista.includes(marcado)) opcoes.splice(1, 0, [marcado, rotuloModelo(marcado)]);
  opcoes.push(['__outro', 'Outro (digitar o id)…']);
  const el = h('select', {}, opcoes.map(([v, r]) => h('option', { value: v, selected: marcado === v }, r)));
  el.addEventListener('change', () => {
    if (el.value !== '__outro') return aoMudar(el.value);
    el.value = marcado;
    pedirTexto({ placeholder: `Id do modelo (ex.: ${lista[0] || 'nome-do-modelo'})`, valor: valor || '', aoConfirmar: (v) => aoMudar(String(v).trim()) });
  });
  return el;
}
const pastaDe = (rel) => rel.split('/').slice(0, -1).join('/');

function duracao(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}min ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min`;
}

const timeDe = (id) => S.projeto?.times.find((t) => t.id === id) || null;
const agentesDe = (time) => timeDe(time)?.agentes || [];
/** Agente pelo id, no time do pedido mostrado (ou no time indicado). */
const agentePorId = (id, time = S.vendo?.time) => agentesDe(time).find((a) => a.id === id);
const vivoDe = (id) => S.vivos.get(id);
const vendoVivo = () => !!(S.vendo && S.vivos.get(S.vendo.id)?.rodando);
const vivosDoProjeto = () => [...S.vivos.values()].filter((v) => v.rodando && v.projeto === S.projeto?.caminho);

/** Busca por letras em sequência, como o Ctrl+P do VS Code. Devolve uma nota (maior é melhor) ou -1. */
function nota(texto, busca) {
  if (!busca) return 0;
  const t = texto.toLowerCase();
  const b = busca.toLowerCase().replace(/\s+/g, '');
  let i = 0;
  let pontos = 0;
  let seguidas = 0;
  for (let j = 0; j < t.length && i < b.length; j++) {
    if (t[j] === b[i]) {
      i++;
      seguidas++;
      pontos += 1 + seguidas * 2 + (j === 0 || '/._-'.includes(t[j - 1]) ? 4 : 0);
    } else seguidas = 0;
  }
  if (i < b.length) return -1;
  const nome = t.split('/').pop();
  return pontos + (nome.includes(b) ? 20 : 0) - t.length * 0.01;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function normalizarCaminho(p) {
  const raiz = S.projeto.caminho.replace(/\\/g, '/').toLowerCase();
  let r = String(p).trim().replace(/\\/g, '/');
  if (r.toLowerCase().startsWith(`${raiz}/`)) r = r.slice(raiz.length + 1);
  return r.replace(/^\.\//, '');
}

/** Arquivos que cada agente tocou: nos pedidos rodando agora e no pedido mostrado. rel → [{ id, nome, cor }]. */
function toquesDosAgentes() {
  const mapa = new Map();
  if (!S.projeto) return mapa;
  const marcar = (rel, agente, time) => {
    if (!rel || /^[a-z]:\//i.test(rel) || rel.startsWith('..')) return;
    const a = agentePorId(agente, time);
    if (!a) return;
    const lista = mapa.get(rel) || [];
    if (!lista.some((x) => x.id === a.id && x.cor === a.cor)) lista.push({ id: a.id, nome: a.nome, cor: a.cor });
    mapa.set(rel, lista);
  };
  const fontes = [...vivosDoProjeto().map((v) => ({ estado: v.estado, eventos: v.eventos }))];
  if (S.vendo && !fontes.some((f) => f.estado?.id === S.vendo.id)) fontes.push({ estado: S.vendo, eventos: S.eventos });
  for (const { estado, eventos } of fontes) {
    if (!estado) continue;
    for (const l of eventos) {
      if (l.tipo !== 'acao') continue;
      const m = /^(Criando|Editando) (.+)$/.exec(l.texto || '');
      if (m) marcar(normalizarCaminho(m[2]), l.agente, estado.time);
    }
    for (const t of estado.tarefas || []) for (const a of t.passe?.arquivos || []) marcar(normalizarCaminho(a), t.agente, estado.time);
  }
  return mapa;
}

function pontosAgentes(lista, max = 3) {
  if (!lista?.length) return null;
  return h('span', { class: 'pontos', title: `Mexido por ${lista.map((x) => x.nome).join(', ')}` },
    lista.slice(0, max).map((x) => h('i', { cor: x.cor })));
}
