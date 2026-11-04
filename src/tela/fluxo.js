// Os fluxos do projeto, no estilo do n8n: por onde cada funcionalidade passa (tela → rota → tratamento →
// banco → volta). O Receptor desenha o fluxo no plano, os agentes completam com os arquivos de verdade
// e, ao vivo, o bloco em que alguém está mexendo acende. Depois, clicar num bloco mostra os detalhes
// e deixa pedir uma mudança só naquele pedaço. Ao abrir um projeto pela primeira vez, uma IA lê o
// projeto e monta o mapa dele sozinha.

const FLX = {
  projeto: null,          // de qual projeto são os dados abaixo
  dados: null,            // { fluxos, mapeadoEm, resumo } de .orbion/fluxos.json
  mapeando: null,         // caminho do projeto sendo mapeado agora
  agora: '',              // o que a IA do mapa está fazendo
  erro: '',
  tentou: new Set(),      // projetos que já tentaram o mapa sozinho nesta sessão
  abertos: new Set(),     // pedidos cujo fluxo já abriu sozinho
  recentes: new Map(),    // id do fluxo → { estado, eventos } do último pedido que mexeu nele
  pos: new Map(),         // id do fluxo → posições arrastadas que ainda não foram gravadas
  arrastando: false,
};

const TIPOS_FLUXO = {
  tela: { nome: 'Tela', icone: 'browser', cor: '#4f8cff' },
  componente: { nome: 'Componente', icone: 'layout', cor: '#7aa2ff' },
  rota: { nome: 'Rota', icone: 'radio-tower', cor: '#f59e0b' },
  servico: { nome: 'Tratamento', icone: 'symbol-method', cor: '#a78bfa' },
  banco: { nome: 'Banco', icone: 'database', cor: '#22c55e' },
  fila: { nome: 'Fila', icone: 'list-tree', cor: '#14b8a6' },
  ia: { nome: 'IA', icone: 'sparkle', cor: '#ec4899' },
  externo: { nome: 'Sistema de fora', icone: 'cloud', cor: '#94a3b8' },
  evento: { nome: 'Gatilho', icone: 'zap', cor: '#f97316' },
  arquivo: { nome: 'Arquivo', icone: 'file-code', cor: '#64748b' },
};
const tipoDe = (b) => TIPOS_FLUXO[b.tipo] || TIPOS_FLUXO.servico;
const LARG = 232;
const ALT = 72;
const VAO_X = 96;
const VAO_Y = 44;
const VAO_FAIXA = 92;
const COLUNAS_POR_FAIXA = 4;
const ESTADO_BLOCO = {
  trabalhando: ['loading', 'Trabalhando agora'],
  feito: ['pass-filled', 'Feito no último pedido'],
  falhou: ['error', 'Deu problema no último pedido'],
  previsto: ['circle-large-outline', 'Previsto no plano, ainda não feito'],
  existe: ['check', 'Já existe no projeto'],
};
const limparRel = (c) => String(c || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/:\d+$/, '').toLowerCase();

/* ---------- dados ---------- */

async function carregarFluxos(forcar = false) {
  if (!S.projeto) return null;
  const caminho = S.projeto.caminho;
  if (!forcar && FLX.projeto === caminho && FLX.dados) return FLX.dados;
  try {
    const d = await chamar('fluxos:ler', caminho);
    if (S.projeto?.caminho === caminho) Object.assign(FLX, { projeto: caminho, dados: d });
  } catch {}
  return FLX.dados;
}

/** Ao abrir um projeto: carrega os fluxos e, se ele nunca foi mapeado, a IA monta o mapa sozinha. */
async function iniciarFluxosDoProjeto() {
  Object.assign(FLX, { projeto: null, dados: null, erro: '' });
  FLX.recentes.clear();
  FLX.pos.clear();
  const d = await carregarFluxos(true);
  if (!d || !S.projeto) return;
  const caminho = S.projeto.caminho;
  if (!d.mapeadoEm && !d.fluxos.length && S.projeto.config?.mapearFluxos !== false && !FLX.tentou.has(caminho) && !FLX.mapeando) {
    mapearFluxos(true);
  }
  atualizarFluxosNaTela();
}

async function mapearFluxos(sozinho = false) {
  if (!S.projeto || FLX.mapeando) return;
  const caminho = S.projeto.caminho;
  FLX.tentou.add(caminho);
  Object.assign(FLX, { mapeando: caminho, agora: 'Lendo o projeto…', erro: '' });
  atualizarFluxosNaTela();
  try {
    const d = await chamar('fluxos:mapear', caminho);
    if (S.projeto?.caminho === caminho) Object.assign(FLX, { projeto: caminho, dados: d });
    if (!sozinho || abaAtiva()?.tipo === 'fluxo') aviso(`Mapa do projeto pronto: ${d.fluxos.length} fluxo(s).`, 'ok');
  } catch (e) {
    const msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    FLX.erro = /cancelad|parad/i.test(msg) ? '' : msg;
    if (!sozinho && FLX.erro) aviso(`Não deu para mapear: ${FLX.erro}`);
  } finally {
    Object.assign(FLX, { mapeando: null, agora: '' });
    atualizarFluxosNaTela();
  }
}

function pararMapa() {
  chamar('fluxos:parar').catch(() => {});
}

function eventoMapa(ev) {
  const e = ev.ev || {};
  if (e.tipo === 'acao' || e.tipo === 'texto') {
    FLX.agora = String(e.texto || '').split('\n')[0].slice(0, 140);
    for (const el of document.querySelectorAll('.fluxo-mapa-agora')) el.textContent = FLX.agora;
  } else if (e.tipo === 'uso' && e.motor === 'claude') {
    S.uso.claude = e.info;
    desenharStatus();
  }
}

/** Os fluxos que dá para ver: os dos pedidos rodando agora e os guardados no projeto. */
function fontesDeFluxo() {
  const vivos = vivosDoProjeto()
    .filter((v) => v.estado && v.rodando && (v.estado.fluxo?.blocos?.length || v.estado.status === 'planejando'))
    .map((v) => ({ chave: `vivo:${v.id}`, fluxo: v.estado.fluxo || null, estado: v.estado, eventos: v.eventos, vivo: true }));
  const ocupados = new Set(vivos.map((x) => x.fluxo?.id).filter(Boolean));
  const salvos = (FLX.projeto === S.projeto?.caminho ? FLX.dados?.fluxos || [] : []).map((f) => {
    const r = FLX.recentes.get(f.id);
    return { chave: `f:${f.id}`, fluxo: f, estado: r?.estado || null, eventos: r?.eventos || [], vivo: false, ocupado: ocupados.has(f.id) };
  });
  const guardados = new Set(salvos.map((x) => x.fluxo.id));
  // O último pedido que desenhou um fluxo mas não chegou a gravar (parou antes de alguém terminar).
  const soltos = [...FLX.recentes.values()]
    .filter((r) => r.estado.fluxo && !guardados.has(r.estado.fluxo.id) && !ocupados.has(r.estado.fluxo.id))
    .map((r) => ({ chave: `pedido:${r.estado.id}`, fluxo: r.estado.fluxo, estado: r.estado, eventos: r.eventos, vivo: false }));
  return [...vivos, ...soltos, ...salvos];
}

function rotuloDaFonte(fo) {
  if (fo.vivo) return `● Agora: ${fo.fluxo?.nome || 'desenhando o fluxo…'}`;
  if (fo.chave.startsWith('pedido:')) return `${fo.fluxo.nome} (último pedido)`;
  return `${fo.fluxo.nome}${fo.ocupado ? ' · o time está mexendo' : ''}`;
}

/** Em que pé está cada bloco: quem está mexendo agora, o que ficou pronto, o que ainda é só plano. */
function estadosDosBlocos(fonte) {
  const st = new Map();
  const f = fonte.fluxo;
  const e = fonte.estado;
  const m = e ? metricas(fonte.eventos || []) : new Map();
  const base = new Set(e?.fluxo?.blocosBase || []);
  for (const b of f.blocos) {
    const tarefas = e ? e.tarefas.filter((t) => (t.blocos || []).includes(b.id)) : [];
    const meus = new Set(b.arquivos.map(limparRel));
    // Quem está rodando e mexeu num arquivo deste bloco também conta, mesmo sem o bloco no plano.
    const mexendo = e && fonte.vivo
      ? e.tarefas.filter((t) => t.status === 'rodando' && (tarefas.includes(t) || [...(m.get(t.id)?.arquivos || [])].some((a) => meus.has(limparRel(a)))))
      : [];
    let estado = 'existe';
    if (e && tarefas.length) {
      estado = tarefas.some((t) => ['falhou', 'bloqueada'].includes(t.status)) ? 'falhou'
        : tarefas.every((t) => t.status === 'concluida') ? 'feito' : 'previsto';
    } else if (e && !base.has(b.id) && (e.fluxo?.blocos || []).some((x) => x.id === b.id)) {
      // No plano, mas sem tarefa: é previsto enquanto o pedido corre; se ele terminou bem, já existe.
      estado = fonte.vivo || e.status !== 'concluida' ? 'previsto' : 'existe';
    }
    if (mexendo.length) estado = 'trabalhando';
    let agora = '';
    for (const t of mexendo) {
      const x = m.get(t.id);
      const toca = [...(x?.arquivos || [])].some((a) => meus.has(limparRel(a)));
      if (x?.ultima && (toca || !b.arquivos.length || !mexendo.some((o) => o !== t))) agora = x.ultima;
    }
    const time = e?.time || S.timeAtual;
    const trabalhando = mexendo.map((t) => agentePorId(t.agente, time)).filter(Boolean);
    // Pedido de mudança num bloco: enquanto o Receptor planeja, é esse bloco que fica aceso.
    if (fonte.vivo && e.status === 'planejando' && f.alvo === b.id) {
      estado = 'trabalhando';
      agora = 'Planejando a mudança';
      trabalhando.push(...agentesDe(time).filter((a) => a.ativo && a.papel === 'receptor'));
    }
    st.set(b.id, {
      estado,
      agora,
      tarefas,
      trabalhando,
      feitoPor: [...new Set([...(b.agentes || []), ...tarefas.filter((t) => t.status === 'concluida').map((t) => t.agente)])],
    });
  }
  return st;
}

/* ---------- arrumação automática: camadas da esquerda para a direita ---------- */

function arrumar(fluxo) {
  const ids = fluxo.blocos.map((b) => b.id);
  const entram = new Map(ids.map((i) => [i, []]));
  for (const l of fluxo.ligacoes) entram.get(l.para)?.push(l.de);
  const nivel = new Map();
  const visitando = new Set();
  const calcular = (id) => {
    if (nivel.has(id)) return nivel.get(id);
    if (visitando.has(id)) return -1; // ligação de volta (ciclo): não empurra a camada
    visitando.add(id);
    let n = 0;
    for (const p of entram.get(id) || []) {
      const np = calcular(p);
      if (np >= 0) n = Math.max(n, np + 1);
    }
    visitando.delete(id);
    nivel.set(id, n);
    return n;
  };
  ids.forEach(calcular);
  const colunas = [];
  for (const id of ids) (colunas[nivel.get(id)] ||= []).push(id);
  // Cada coluna se ordena pela média da posição de quem chega nela, para cruzar menos linhas.
  const indice = new Map();
  colunas.forEach((c) => c?.forEach((id, i) => indice.set(id, i)));
  for (let passada = 0; passada < 2; passada++) {
    for (let c = 1; c < colunas.length; c++) {
      if (!colunas[c]) continue;
      const media = (id) => {
        const ps = (entram.get(id) || []).filter((p) => nivel.get(p) < c).map((p) => indice.get(p));
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : indice.get(id);
      };
      colunas[c].sort((a, b) => media(a) - media(b));
      colunas[c].forEach((id, i) => indice.set(id, i));
    }
  }
  // Fluxo comprido quebra em faixas de poucas colunas (como texto), para caber na tela sem ficar minúsculo.
  const pos = {};
  let topo = 0;
  for (let inicio = 0; inicio < colunas.length; inicio += COLUNAS_POR_FAIXA) {
    const faixa = colunas.slice(inicio, inicio + COLUNAS_POR_FAIXA);
    const maior = Math.max(1, ...faixa.map((c) => c?.length || 0));
    const altura = maior * ALT + (maior - 1) * VAO_Y;
    faixa.forEach((c, x) => {
      if (!c) return;
      const alt = c.length * ALT + (c.length - 1) * VAO_Y;
      c.forEach((id, i) => { pos[id] = { x: x * (LARG + VAO_X), y: Math.round(topo + (altura - alt) / 2 + i * (ALT + VAO_Y)) }; });
    });
    topo += altura + VAO_FAIXA;
  }
  return pos;
}

const posicoesDe = (f) => ({ ...arrumar(f), ...(f.posicoes || {}), ...(FLX.pos.get(f.id) || {}) });

/* ---------- a aba ---------- */

/** Abre a aba dos fluxos (num fluxo, se vier a chave: "vivo:<pedido>" ou "f:<id do fluxo>"). */
function abrirFluxo(chave = null, bloco = null) {
  if (!S.projeto) return;
  const aba = S.abas.find((a) => a.id === 'fluxos');
  if (aba) {
    if (chave && chave !== aba.chave) Object.assign(aba, { chave, bloco });
    else if (bloco) aba.bloco = bloco;
    if (S.ativa === aba.id) return pintarFluxo(aba);
    return ativarAba(aba.id);
  }
  abrirAba({ id: 'fluxos', tipo: 'fluxo', titulo: 'Fluxos', chave, bloco, vistas: {}, texto: '' });
}

function fonteDaAba(aba) {
  const fontes = fontesDeFluxo();
  let f = fontes.find((x) => x.chave === aba.chave);
  if (!f && aba.fluxoId) f = fontes.find((x) => x.fluxo?.id === aba.fluxoId);
  if (!f) f = fontes.find((x) => x.fluxo?.blocos?.length) || fontes[0] || null;
  if (f && f.chave !== aba.chave) {
    // O pedido terminou: a vista (zoom e posição) continua no fluxo guardado.
    if (aba.chave && aba.vistas[aba.chave] && !aba.vistas[f.chave] && f.fluxo?.id === aba.fluxoId) aba.vistas[f.chave] = aba.vistas[aba.chave];
    aba.chave = f.chave;
  }
  if (f?.fluxo) aba.fluxoId = f.fluxo.id;
  return f;
}

const vistaDe = (aba) => (aba.vistas[aba.chave] ||= { x: 40, y: 200, z: 1 });

function aplicarVista(aba) {
  if (!aba.mundo) return;
  const v = vistaDe(aba);
  aba.mundo.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  aba.tela.style.backgroundSize = `${22 * v.z}px ${22 * v.z}px`;
  aba.tela.style.backgroundPosition = `${v.x}px ${v.y}px`;
  if (aba.zoom) aba.zoom.textContent = `${Math.round(v.z * 100)}%`;
}

function zoomEm(aba, cx, cy, fator) {
  const v = vistaDe(aba);
  const z = Math.min(2, Math.max(0.25, v.z * fator));
  v.x = cx - ((cx - v.x) * z) / v.z;
  v.y = cy - ((cy - v.y) * z) / v.z;
  v.z = z;
  aplicarVista(aba);
}

function zoomNoMeio(aba, fator) {
  zoomEm(aba, aba.tela.clientWidth / 2, aba.tela.clientHeight / 2, fator);
}

/** Enquadra o fluxo inteiro na tela. */
function encaixar(aba) {
  const f = aba.fonte?.fluxo;
  if (!aba.tela || !f?.blocos.length) return;
  const W = aba.tela.clientWidth;
  const H = aba.tela.clientHeight;
  if (!W || !H) return requestAnimationFrame(() => aba.tela && encaixar(aba));
  const ps = f.blocos.map((b) => aba.pos[b.id]).filter(Boolean);
  const x0 = Math.min(...ps.map((p) => p.x));
  const y0 = Math.min(...ps.map((p) => p.y)) - 14;
  const x1 = Math.max(...ps.map((p) => p.x + LARG));
  const y1 = Math.max(...ps.map((p) => p.y + ALT));
  const z = Math.max(0.3, Math.min(1.1, (W - 90) / (x1 - x0), (H - 90) / (y1 - y0)));
  aba.vistas[aba.chave] = { z, x: (W - (x1 - x0) * z) / 2 - x0 * z, y: (H - (y1 - y0) * z) / 2 - y0 * z };
  aplicarVista(aba);
}

/** Volta os blocos para a arrumação automática (e grava, para valer da próxima vez). */
function rearrumar(aba) {
  const f = aba.fonte?.fluxo;
  if (!f) return;
  const auto = arrumar(f);
  FLX.pos.set(f.id, auto);
  if (!aba.fonte.vivo) chamar('fluxos:posicoes', S.projeto.caminho, f.id, auto).then((d) => { if (FLX.projeto === S.projeto?.caminho) FLX.dados = d; }).catch(() => {});
  pintarFluxo(aba);
  encaixar(aba);
}

/* ---------- desenho ---------- */

function caminhoDaLigacao(a, b) {
  const x0 = a.x + LARG;
  const y0 = a.y + ALT / 2;
  const x3 = b.x;
  const y3 = b.y + ALT / 2;
  if (x3 >= x0 + 24) {
    const dx = Math.max(50, (x3 - x0) / 2);
    return { d: `M${x0},${y0} C${x0 + dx},${y0} ${x3 - dx},${y3} ${x3},${y3}`, meio: [(x0 + x3) / 2, (y0 + y3) / 2] };
  }
  // Volta para a esquerda (a faixa de baixo, ou um ciclo): desce pelo vão entre os blocos, anda e entra.
  const entre = b.y > a.y + ALT + 10 ? (a.y + ALT + b.y) / 2
    : a.y > b.y + ALT + 10 ? (b.y + ALT + a.y) / 2
      : Math.max(a.y, b.y) + ALT + 40;
  return {
    d: `M${x0},${y0} C${x0 + 56},${y0} ${x0 + 56},${entre} ${x0},${entre} L${x3},${entre} C${x3 - 56},${entre} ${x3 - 56},${y3} ${x3},${y3}`,
    meio: [(x0 + x3) / 2, entre],
  };
}

function pintarLinhas(aba) {
  const f = aba.fonte?.fluxo;
  if (!aba.svg || !f) return;
  const id = aba.idSeta;
  aba.svg.replaceChildren(svg('defs', {},
    svg('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'fluxo-seta' })),
    svg('marker', { id: `${id}-ativa`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'fluxo-seta ativa' })),
    svg('marker', { id: `${id}-destaque`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'fluxo-seta destaque' }))));
  for (const r of aba.mundo.querySelectorAll('.fluxo-rotulo')) r.remove();
  for (const l of f.ligacoes) {
    const a = aba.pos[l.de];
    const b = aba.pos[l.para];
    if (!a || !b) continue;
    const { d, meio } = caminhoDaLigacao(a, b);
    const ativa = ['trabalhando'].includes(aba.st.get(l.de)?.estado) || ['trabalhando'].includes(aba.st.get(l.para)?.estado);
    const destaque = aba.bloco && (l.de === aba.bloco || l.para === aba.bloco);
    const tipo = destaque ? 'destaque' : ativa ? 'ativa' : '';
    aba.svg.append(svg('path', { d, class: `fluxo-linha ${tipo}`, 'marker-end': `url(#${tipo ? `${id}-${tipo}` : id})` }));
    if (l.rotulo) {
      aba.mundo.append(h('div', { class: `fluxo-rotulo${destaque ? ' destaque' : ''}`, estilo: { left: `${meio[0]}px`, top: `${meio[1]}px` }, title: l.rotulo }, l.rotulo));
    }
  }
}

function subtituloDoBloco(b, s) {
  if (s.agora) return s.agora;
  if (b.arquivos.length) return `${nomeDe(b.arquivos[0])}${b.arquivos.length > 1 ? ` +${b.arquivos.length - 1}` : ''}`;
  return tipoDe(b).nome;
}

function blocoDoFluxo(aba, b) {
  const s = aba.st.get(b.id);
  const tipo = tipoDe(b);
  const p = aba.pos[b.id];
  const [icone, dica] = ESTADO_BLOCO[s.estado];
  const el = h('div', {
    class: `fluxo-bloco st-${s.estado}${aba.bloco === b.id ? ' selecionado' : ''}`,
    cor: tipo.cor,
    'data-id': b.id,
    estilo: { left: `${p.x}px`, top: `${p.y}px` },
  },
  s.trabalhando.length ? h('div', { class: 'fluxo-quem' }, s.trabalhando.map((a) => h('span', { class: 'fluxo-agente', cor: a.cor }, a.nome))) : null,
  h('span', { class: 'fluxo-porta entrada' }),
  h('div', { class: 'fluxo-icone', title: tipo.nome }, ic(tipo.icone)),
  h('div', { class: 'fluxo-textos' },
    h('div', { class: 'fluxo-titulo', title: b.titulo }, b.titulo),
    h('div', { class: 'fluxo-sub', title: b.detalhe || '' }, subtituloDoBloco(b, s))),
  s.estado === 'existe' ? null : h('span', { class: 'fluxo-selo', title: dica }, ic(icone, s.estado === 'trabalhando' ? 'codicon-modifier-spin' : '')),
  h('span', { class: 'fluxo-porta saida' }));
  el.addEventListener('mousedown', (e) => arrastarBloco(aba, b.id, el, e));
  return el;
}

function vazioDoFluxo(fonte) {
  if (FLX.mapeando === S.projeto?.caminho && !fonte?.vivo) {
    return h('div', { class: 'fluxo-vazio' },
      ic('loading', 'codicon-modifier-spin grande'),
      h('h3', {}, 'Montando o mapa do projeto'),
      h('p', {}, 'A IA está lendo o projeto e desenhando os fluxos principais: telas, rotas, tratamento dos dados e banco.'),
      h('p', { class: 'fluxo-mapa-agora mono pequeno' }, FLX.agora),
      h('button', { class: 'bt', onclick: pararMapa }, ic('debug-stop'), 'Parar'));
  }
  if (fonte?.vivo) {
    return h('div', { class: 'fluxo-vazio' },
      ic('loading', 'codicon-modifier-spin grande'),
      h('h3', {}, 'O Receptor está desenhando o fluxo'),
      h('p', {}, `Do pedido: ${fonte.estado.pedido.split('\n')[0].slice(0, 120)}`),
      h('p', { class: 'pequeno' }, 'Assim que o plano sair, os blocos aparecem aqui e acendem conforme o time trabalha.'));
  }
  return h('div', { class: 'fluxo-vazio' },
    ic('type-hierarchy-sub', 'grande'),
    h('h3', {}, 'Nenhum fluxo ainda'),
    h('p', {}, 'Peça algo ao time e o Receptor desenha o fluxo do pedido aqui, ao vivo. Ou deixe uma IA ler o projeto e montar o mapa dele.'),
    FLX.erro ? h('p', { class: 'fluxo-erro' }, ic('error'), FLX.erro) : null,
    h('button', { class: 'bt bt-principal', onclick: () => mapearFluxos() }, ic('sparkle'), 'Mapear o projeto'));
}

function legendaDoFluxo(f) {
  const usados = [...new Set(f.blocos.map((b) => b.tipo))].filter((t) => TIPOS_FLUXO[t]);
  return h('div', { class: 'fluxo-legenda' }, usados.map((t) => h('span', { cor: TIPOS_FLUXO[t].cor }, h('i'), TIPOS_FLUXO[t].nome)));
}

function statusDoFluxo(aba) {
  if (!aba.status) return;
  const fo = aba.fonte;
  const filhos = [];
  let classe = 'fluxo-status';
  if (fo?.vivo) {
    classe += ' vivo';
    const n = fo.fluxo?.blocos.filter((b) => aba.st?.get(b.id)?.estado === 'trabalhando').length || 0;
    filhos.push(ic('loading', 'codicon-modifier-spin'), `${ST_EXECUCAO[fo.estado.status] || fo.estado.status}${n ? ` · ${n} bloco(s) em andamento` : ''}`);
  } else if (FLX.mapeando === S.projeto?.caminho) {
    filhos.push(ic('loading', 'codicon-modifier-spin'), 'Mapeando o projeto: ', h('span', { class: 'fluxo-mapa-agora' }, FLX.agora));
  } else if (fo?.fluxo) {
    const quando = fo.fluxo.atualizadoEm ? new Date(fo.fluxo.atualizadoEm).toLocaleString(localeAtual(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    filhos.push(`${fo.fluxo.blocos.length} blocos${fo.fluxo.origem === 'mapa' ? ' · do mapa do projeto' : fo.fluxo.origem === 'pedido' ? ' · de pedidos do time' : ''}${quando ? ` · ${quando}` : ''}`);
  }
  aba.status.className = classe;
  aba.status.replaceChildren(...filhos);
  if (aba.btMapa) {
    aba.btMapa.title = FLX.mapeando ? 'Parar o mapa' : 'Mapear o projeto de novo (a IA relê o projeto)';
    aba.btMapa.replaceChildren(ic(FLX.mapeando ? 'debug-stop' : 'sparkle'));
  }
}

function atualizarEscolha(aba) {
  if (!aba.escolha) return;
  const fontes = fontesDeFluxo();
  aba.escolha.replaceChildren(...(fontes.length
    ? fontes.map((fo) => h('option', { value: fo.chave, selected: fo.chave === aba.chave }, rotuloDaFonte(fo)))
    : [h('option', { value: '' }, 'Nenhum fluxo')]));
  aba.escolha.disabled = !fontes.length;
}

/** Redesenha o fluxo da aba (blocos, ligações e a gaveta), mantendo o zoom e a posição. */
function pintarFluxo(aba) {
  if (!aba?.mundo) return;
  if (FLX.arrastando) {
    FLX.atrasado = true;
    return;
  }
  const fonte = fonteDaAba(aba);
  aba.fonte = fonte;
  atualizarEscolha(aba);
  aba.tela.querySelector('.fluxo-vazio')?.remove();
  aba.tela.querySelector('.fluxo-legenda')?.remove();
  aba.mundo.replaceChildren();
  const f = fonte?.fluxo;
  if (!f?.blocos?.length) {
    aba.st = new Map();
    aba.tela.append(vazioDoFluxo(fonte));
    statusDoFluxo(aba);
    desenharGaveta(aba);
    return;
  }
  if (aba.bloco && !f.blocos.some((b) => b.id === aba.bloco)) aba.bloco = null;
  aba.st = estadosDosBlocos(fonte);
  aba.pos = posicoesDe(f);
  aba.svg = svg('svg', { class: 'fluxo-linhas', width: 1, height: 1 });
  aba.mundo.append(aba.svg);
  pintarLinhas(aba);
  for (const b of f.blocos) aba.mundo.append(blocoDoFluxo(aba, b));
  aba.tela.append(legendaDoFluxo(f));
  if (!aba.vistas[aba.chave] || aba.encaixarAoVoltar) {
    aba.encaixarAoVoltar = false;
    vistaDe(aba);
    encaixar(aba);
  } else aplicarVista(aba);
  statusDoFluxo(aba);
  desenharGaveta(aba);
}

/* ---------- mexer: arrastar, mover a tela, zoom ---------- */

function arrastarBloco(aba, id, el, e) {
  if (e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
  aba.tela.focus({ preventScroll: true });
  const z = vistaDe(aba).z;
  const ini = { x: e.clientX, y: e.clientY, px: aba.pos[id].x, py: aba.pos[id].y };
  let moveu = false;
  FLX.arrastando = true; // enquanto segura o bloco, o ao vivo espera para redesenhar
  const mover = (ev) => {
    const dx = (ev.clientX - ini.x) / z;
    const dy = (ev.clientY - ini.y) / z;
    if (!moveu && Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) < 4) return;
    moveu = true;
    el.classList.add('arrastando');
    aba.pos[id] = { x: Math.round(ini.px + dx), y: Math.round(ini.py + dy) };
    el.style.left = `${aba.pos[id].x}px`;
    el.style.top = `${aba.pos[id].y}px`;
    pintarLinhas(aba);
  };
  const soltar = () => {
    window.removeEventListener('mousemove', mover);
    FLX.arrastando = false;
    el.classList.remove('arrastando');
    if (FLX.atrasado) {
      FLX.atrasado = false;
      pintarFluxo(aba);
    }
    if (!moveu) return selecionarBloco(aba, id);
    const f = aba.fonte.fluxo;
    FLX.pos.set(f.id, { ...(FLX.pos.get(f.id) || {}), [id]: aba.pos[id] });
    chamar('fluxos:posicoes', S.projeto.caminho, f.id, { [id]: aba.pos[id] })
      .then((d) => { if (FLX.projeto === S.projeto?.caminho) FLX.dados = d; })
      .catch(() => {});
  };
  window.addEventListener('mousemove', mover);
  window.addEventListener('mouseup', soltar, { once: true });
}

function ligarTela(aba) {
  const t = aba.tela;
  t.addEventListener('mousedown', (e) => {
    if ((e.button !== 0 && e.button !== 1) || e.target.closest('.fluxo-bloco, .fluxo-vazio button')) return;
    e.preventDefault();
    t.focus({ preventScroll: true });
    const v = vistaDe(aba);
    const ini = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y };
    let moveu = false;
    t.classList.add('arrastando');
    const mover = (ev) => {
      if (Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) > 3) moveu = true;
      v.x = ini.vx + ev.clientX - ini.x;
      v.y = ini.vy + ev.clientY - ini.y;
      aplicarVista(aba);
    };
    const soltar = () => {
      window.removeEventListener('mousemove', mover);
      t.classList.remove('arrastando');
      if (!moveu && aba.bloco) selecionarBloco(aba, null);
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar, { once: true });
  });
  t.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = t.getBoundingClientRect();
    // Roda do mouse (ou pinça no touchpad) dá zoom; arrastar dois dedos no touchpad move a tela.
    if (e.ctrlKey || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40)) zoomEm(aba, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    else {
      const v = vistaDe(aba);
      v.x -= e.deltaX;
      v.y -= e.deltaY;
      aplicarVista(aba);
    }
  }, { passive: false });
  t.addEventListener('dblclick', (e) => { if (!e.target.closest('.fluxo-bloco')) encaixar(aba); });
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') selecionarBloco(aba, null);
    else if (e.key === '+' || e.key === '=') zoomNoMeio(aba, 1.2);
    else if (e.key === '-') zoomNoMeio(aba, 1 / 1.2);
    else if (e.key === '0') encaixar(aba);
  });
}

function selecionarBloco(aba, id) {
  if (aba.bloco !== id) {
    aba.texto = '';
    aba.destino = undefined;
  }
  aba.bloco = id;
  for (const el of aba.mundo.querySelectorAll('.fluxo-bloco')) el.classList.toggle('selecionado', el.dataset.id === id);
  pintarLinhas(aba);
  desenharGaveta(aba);
  if (id) requestAnimationFrame(() => mostrarBloco(aba, id));
}

/** Se o bloco ficou fora da tela (ou atrás da gaveta), move a tela até ele aparecer. */
function mostrarBloco(aba, id) {
  const p = aba.pos?.[id];
  if (!p || !aba.tela) return;
  const v = vistaDe(aba);
  const W = aba.tela.clientWidth;
  const H = aba.tela.clientHeight;
  const m = 30;
  const x = v.x + p.x * v.z;
  const y = v.y + p.y * v.z;
  const w = LARG * v.z;
  const a = ALT * v.z;
  if (x + w > W - m) v.x -= x + w - (W - m);
  else if (x < m) v.x += m - x;
  if (y + a > H - m) v.y -= y + a - (H - m);
  else if (y < m + 14) v.y += m + 14 - y;
  aplicarVista(aba);
}

/* ---------- a gaveta: detalhes do bloco e pedir mudança ---------- */

function destinoPadrao(b, s, time) {
  const agentes = agentesDe(time).filter((a) => a.ativo && a.papel !== 'receptor');
  const quem = s.feitoPor.filter((id) => agentes.some((a) => a.id === id));
  return quem.length === 1 ? quem[0] : '';
}

function telaDoBloco(b) {
  if (b.previa) return b.previa;
  if (b.tipo !== 'tela' && b.tipo !== 'componente') return '';
  return b.arquivos.find((a) => /\.html?$/i.test(a)) || '';
}

function desenharGaveta(aba) {
  const g = aba.gaveta;
  if (!g) return;
  const fonte = aba.fonte;
  const f = fonte?.fluxo;
  const b = f?.blocos.find((x) => x.id === aba.bloco);
  if (!b) {
    g.hidden = true;
    g.replaceChildren();
    delete g.dataset.bloco;
    return;
  }
  // Não atropela quem está escrevendo o pedido de mudança.
  if (g.dataset.bloco === b.id && g.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return;
  const rolagem = g.dataset.bloco === b.id ? g.scrollTop : 0;
  requestAnimationFrame(() => { g.scrollTop = rolagem; });
  g.dataset.bloco = b.id;
  g.hidden = false;
  const s = aba.st.get(b.id);
  const tipo = tipoDe(b);
  const time = fonte.estado?.time || S.timeAtual || S.projeto.times[0]?.id;
  const titulo = (id) => f.blocos.find((x) => x.id === id)?.titulo || id;
  const irPara = (id) => () => selecionarBloco(aba, id);
  const entram = f.ligacoes.filter((l) => l.para === b.id);
  const saem = f.ligacoes.filter((l) => l.de === b.id);
  const [icone, dica] = ESTADO_BLOCO[s.estado];
  const tela = telaDoBloco(b);
  const ocupado = fonte.vivo || fonte.ocupado;

  const secaoG = (nome, ...filhos) => h('section', { class: 'gaveta-secao' }, h('h4', {}, nome), ...filhos);
  const ligacao = (l, id, seta) => h('div', { class: 'gaveta-item', title: 'Ir para o bloco', onclick: irPara(id) },
    ic(seta), h('span', { class: 'item-nome' }, titulo(id)), l.rotulo ? h('span', { class: 'item-dica' }, l.rotulo) : null);

  let mudar;
  if (ocupado) {
    mudar = h('p', { class: 'mudo pequeno' }, ic('info'), ' O time está trabalhando neste fluxo agora. Quando terminar, tu pode pedir mudanças em qualquer bloco por aqui.');
  } else {
    const agentes = agentesDe(time).filter((a) => a.ativo && a.papel !== 'receptor');
    const padrao = aba.destino ?? destinoPadrao(b, s, time);
    const destino = h('select', { title: 'Quem faz a mudança' },
      [...agentes.map((a) => [a.id, a.nome]), ['', 'Receptor decide']].map(([v, r]) => h('option', { value: v, selected: v === padrao }, r)));
    destino.addEventListener('change', () => { aba.destino = destino.value; });
    const campo = h('textarea', { rows: 3, valor: aba.texto || '', placeholder: `O que mudar em "${b.titulo}"? (Enter manda · Ctrl+Enter quebra a linha)` });
    campo.addEventListener('input', () => { aba.texto = campo.value; });
    campo.addEventListener('keydown', (e) => teclaDeChat(e, () => pedirMudancaNoBloco(aba, b, destino.value)));
    aba.campo = campo;
    mudar = h('div', { class: 'gaveta-mudar' },
      campo,
      h('div', { class: 'gaveta-acoes' },
        h('label', { class: 'previa-destino' }, 'Para', destino),
        h('span', { class: 'espaco' }),
        h('button', { class: 'bt bt-principal', onclick: () => pedirMudancaNoBloco(aba, b, destino.value) }, ic('send'), 'Pedir mudança')),
      h('p', { class: 'mudo pequeno' }, 'Vai como um pedido novo, com o fluxo inteiro de contexto. Tu acompanha o bloco acender aqui.'));
  }

  g.replaceChildren(...[
    h('div', { class: 'gaveta-topo' },
      h('div', { class: 'fluxo-icone', cor: tipo.cor }, ic(tipo.icone)),
      h('div', { class: 'gaveta-nome' }, h('h3', {}, b.titulo), h('div', { class: 'gaveta-tipo' }, `${tipo.nome} · ${f.nome}`)),
      h('button', { class: 'bt-icone', title: 'Fechar (Esc)', onclick: () => selecionarBloco(aba, null) }, ic('close'))),
    h('div', { class: `gaveta-estado st-${s.estado}` }, ic(icone, s.estado === 'trabalhando' ? 'codicon-modifier-spin' : ''),
      s.estado === 'trabalhando' && s.trabalhando.length ? `${s.trabalhando.map((a) => a.nome).join(', ')} trabalhando agora` : dica),
    s.agora ? h('div', { class: 'gaveta-agora mono' }, s.agora) : null,
    b.detalhe ? markdown(b.detalhe) : h('p', { class: 'mudo' }, 'Sem descrição.'),
    tela ? h('button', { class: 'bt', onclick: () => abrirPrevia(tela, { agente: s.feitoPor[0] || '', time, fio: fonte.estado?.fio || null }) }, ic('preview'), 'Ver a tela') : null,
    secaoG(`Arquivos (${b.arquivos.length})`, b.arquivos.length
      ? h('div', { class: 'gaveta-lista' }, b.arquivos.map((a) => h('div', { class: 'gaveta-item', title: a, onclick: () => abrirArquivo(a) },
        iconeDe(nomeDe(a)), h('span', { class: 'item-nome' }, nomeDe(a)), h('span', { class: 'item-dica' }, pastaDe(a)))))
      : h('p', { class: 'mudo pequeno' }, 'Ainda não tem arquivo: o bloco está só no plano.')),
    entram.length || saem.length ? secaoG('Ligações', h('div', { class: 'gaveta-lista' },
      entram.map((l) => ligacao(l, l.de, 'arrow-left')),
      saem.map((l) => ligacao(l, l.para, 'arrow-right')))) : null,
    s.tarefas.length ? secaoG('No pedido', h('div', { class: 'gaveta-lista' }, s.tarefas.map((t) => {
      const a = agentePorId(t.agente, time);
      return h('div', { class: 'gaveta-item', title: 'Ver na Orquestra', onclick: () => mostrarExecucao(fonte.estado.id).then(() => abrirDireita('orquestra')) },
        h('span', { class: 'ponto-agente', cor: a?.cor || 'var(--mudo)' }),
        h('span', { class: 'item-nome' }, t.titulo),
        h('span', { class: 'item-dica' }, `${a?.nome || t.agente} · ${ST_TAREFA[t.status] || t.status}`));
    }))) : null,
    secaoG('Mudar este bloco', mudar),
  ].filter(Boolean));
}

async function pedirMudancaNoBloco(aba, b, destino) {
  const texto = (aba.texto || '').trim();
  if (!texto) {
    aviso('Escreva o que mudar neste bloco.', 'info');
    return aba.campo?.focus();
  }
  const f = aba.fonte.fluxo;
  const titulo = (id) => f.blocos.find((x) => x.id === id)?.titulo || id;
  const antes = f.ligacoes.filter((l) => l.para === b.id).map((l) => titulo(l.de));
  const depois = f.ligacoes.filter((l) => l.de === b.id).map((l) => titulo(l.para));
  const pedido = [
    `Mudança no fluxo "${f.nome}", no bloco "${b.titulo}" (${tipoDe(b).nome.toLowerCase()}, id ${b.id}).`,
    b.detalhe ? `Hoje ele: ${b.detalhe}` : '',
    b.arquivos.length ? `Arquivos dele: ${b.arquivos.join(', ')}` : '',
    antes.length || depois.length ? `No fluxo: ${antes.join(', ') || '(começo)'} → ${b.titulo} → ${depois.join(', ') || '(fim)'}` : '',
    '',
    `O que mudar: ${texto}`,
  ].filter((l, i, todas) => l || (i > 0 && todas[i - 1])).join('\n');
  const time = aba.fonte.estado?.time || S.timeAtual || S.projeto.times[0]?.id;
  let estado;
  try {
    estado = await api('execucao:iniciar', S.projeto.caminho, time, pedido, {
      agente: destino || null, fio: null, somenteLeitura: false, anexos: [], fluxoBase: f.id, blocoBase: b.id,
    });
  } catch {
    return;
  }
  aba.texto = '';
  aba.destino = undefined;
  FLX.abertos.add(estado.id);
  const nome = agentePorId(destino, time)?.nome || 'o Receptor';
  aviso(`Pedido de mudança mandado para ${nome}. O bloco acende aqui enquanto o time trabalha.`, 'ok');
  await seguirPedido(estado);
  abrirDireita('orquestra');
  const vista = aba.vistas[aba.chave];
  aba.chave = `vivo:${estado.id}`;
  if (vista) aba.vistas[aba.chave] = { ...vista };
  if (S.ativa === aba.id) pintarFluxo(aba);
  else ativarAba(aba.id);
}

PAGINAS.fluxo = {
  icone: () => ic('type-hierarchy-sub'),
  desenhar(aba, host) {
    aba.idSeta ||= `fluxo-seta-${Math.random().toString(36).slice(2, 8)}`;
    aba.tela = h('div', { class: 'fluxo-tela', tabindex: 0 });
    aba.mundo = h('div', { class: 'fluxo-mundo' });
    aba.tela.append(aba.mundo);
    aba.gaveta = h('aside', { class: 'fluxo-gaveta', hidden: true });
    aba.escolha = h('select', { class: 'fluxo-escolha', title: 'Qual fluxo ver' });
    aba.escolha.addEventListener('change', () => { aba.chave = aba.escolha.value; aba.bloco = null; pintarFluxo(aba); desenharLateralSeFluxos(); });
    aba.status = h('span', { class: 'fluxo-status' });
    aba.zoom = h('span', { class: 'fluxo-zoom', title: 'Zoom' });
    const bt = (icone, dica, fn) => h('button', { class: 'bt-icone', title: dica, onclick: fn }, ic(icone));
    aba.btMapa = bt('sparkle', '', () => (FLX.mapeando ? pararMapa() : mapearFluxos()));
    host.append(h('div', { class: 'pagina-fluxo' },
      h('div', { class: 'fluxo-barra' },
        ic('type-hierarchy-sub'),
        aba.escolha,
        aba.status,
        h('span', { class: 'espaco' }),
        bt('zoom-out', 'Afastar (-)', () => zoomNoMeio(aba, 1 / 1.2)),
        aba.zoom,
        bt('zoom-in', 'Aproximar (+)', () => zoomNoMeio(aba, 1.2)),
        bt('screen-full', 'Enquadrar tudo (0 ou duplo clique)', () => encaixar(aba)),
        bt('layout', 'Arrumar os blocos de novo', () => rearrumar(aba)),
        aba.btMapa),
      h('div', { class: 'fluxo-corpo' }, aba.tela, aba.gaveta)));
    ligarTela(aba);
    if (FLX.projeto !== S.projeto?.caminho || !FLX.dados) {
      carregarFluxos().then(() => { if (S.ativa === aba.id && aba.mundo) pintarFluxo(aba); });
    }
    pintarFluxo(aba);
  },
  sair(aba) {
    aba.tela = aba.mundo = aba.gaveta = aba.svg = aba.escolha = aba.status = aba.zoom = aba.campo = aba.btMapa = null;
  },
};

/* ---------- barra lateral ---------- */

function desenharLateralSeFluxos() {
  if (S.vista === 'fluxos' && !$('#lateral').hidden) desenharLateral();
}

VISTAS.fluxos = {
  titulo: 'Fluxos',
  acoes: () => (S.projeto ? [
    FLX.mapeando ? ['debug-stop', 'Parar o mapa', pararMapa] : ['sparkle', 'Mapear o projeto de novo (a IA relê o projeto)', () => mapearFluxos()],
    ['type-hierarchy-sub', 'Abrir a tela dos fluxos', () => abrirFluxo()],
  ] : []),
  desenhar() {
    if (!S.projeto) return semProjeto();
    if (FLX.projeto !== S.projeto.caminho) {
      carregarFluxos().then(desenharLateralSeFluxos);
      return h('div', { class: 'lateral-vazia' }, h('p', { class: 'mudo' }, 'Carregando…'));
    }
    const fontes = fontesDeFluxo();
    const aba = S.abas.find((a) => a.id === 'fluxos');
    const ativa = S.ativa === 'fluxos' ? aba?.chave : null;
    const linha = (fo) => {
      const n = fo.fluxo?.blocos.length || 0;
      return h('div', {
        class: `item-arvore item-fluxo${ativa === fo.chave ? ' selecionado' : ''}`,
        title: fo.fluxo?.nome || fo.estado?.pedido || '',
        onclick: () => abrirFluxo(fo.chave),
      },
      fo.vivo ? ic('loading', 'codicon-modifier-spin icone-item') : ic(fo.fluxo.origem === 'mapa' ? 'type-hierarchy-sub' : 'git-merge', 'icone-item'),
      h('span', { class: 'item-nome' }, fo.vivo && !fo.fluxo ? 'Desenhando o fluxo…' : fo.fluxo.nome),
      h('span', { class: 'item-dica' }, fo.vivo ? ST_EXECUCAO[fo.estado.status] || '' : fo.ocupado ? 'o time está mexendo' : `${n} blocos`));
    };
    const agora = fontes.filter((fo) => fo.vivo);
    const salvos = fontes.filter((fo) => !fo.vivo);
    const mapa = FLX.mapeando === S.projeto.caminho
      ? h('div', { class: 'fluxo-lateral-mapa' },
        h('div', {}, ic('loading', 'codicon-modifier-spin'), ' Montando o mapa do projeto…'),
        h('div', { class: 'fluxo-mapa-agora mono pequeno mudo' }, FLX.agora))
      : null;
    return [
      mapa,
      agora.length ? secao('fluxos-agora', 'Agora', h('div', { class: 'secao-corpo' }, agora.map(linha)), { contador: agora.length }) : null,
      secao('fluxos-projeto', 'Do projeto', h('div', { class: 'secao-corpo' },
        salvos.length ? salvos.map(linha) : h('div', { class: 'lateral-vazia' },
          h('p', { class: 'mudo' }, FLX.mapeando ? 'Os fluxos aparecem aqui quando o mapa ficar pronto.' : 'Nenhum fluxo ainda. Peça algo ao time, ou deixe a IA mapear o projeto.'),
          FLX.erro ? h('p', { class: 'fluxo-erro pequeno' }, FLX.erro) : null,
          FLX.mapeando ? null : h('button', { class: 'bt bt-principal largo', onclick: () => mapearFluxos() }, ic('sparkle'), 'Mapear o projeto'))),
      { contador: salvos.length || null, cresce: true }),
      FLX.dados?.resumo ? secao('fluxos-sobre', 'Sobre o projeto', h('div', { class: 'secao-corpo fluxo-resumo' }, FLX.dados.resumo)) : null,
    ];
  },
};

/* ---------- ao vivo ---------- */

const atualizarFluxosNaTela = debounce(() => {
  const a = abaAtiva();
  if (a?.tipo === 'fluxo') pintarFluxo(a);
  desenharLateralSeFluxos();
  seloDosFluxos();
}, 200);

function seloDosFluxos() {
  const selo = $('#selo-fluxos');
  if (!selo) return;
  const vivo = S.projeto && (FLX.mapeando === S.projeto.caminho || vivosDoProjeto().some((v) => v.rodando && v.estado?.fluxo?.blocos?.length));
  selo.hidden = !vivo;
  selo.textContent = ''; // vazio vira um ponto
}

/** Recebe os eventos dos pedidos: abre o fluxo quando o plano chega e acende os blocos enquanto o time mexe. */
function eventoParaFluxo(ev) {
  if (!S.projeto || (ev.projeto && ev.projeto !== S.projeto.caminho)) return;
  if (ev.tipo === 'estado') {
    const e = ev.estado;
    if (e?.fluxo?.blocos?.length && e.tipo !== 'verificacao' && !FLX.abertos.has(e.id) && ATIVOS.includes(e.status)) {
      FLX.abertos.add(e.id);
      setTimeout(() => {
        const aba = S.abas.find((a) => a.id === 'fluxos');
        if (aba) aba.encaixarAoVoltar = !aba.vistas[`vivo:${e.id}`];
        abrirFluxo(`vivo:${e.id}`);
      }, 0);
    }
  } else if (ev.tipo === 'fim') {
    const e = ev.estado;
    if (e?.fluxo?.blocos?.length) FLX.recentes.set(e.fluxo.id, { estado: e, eventos: S.vivos.get(ev.execucao)?.eventos || [] });
    carregarFluxos(true).then(atualizarFluxosNaTela);
    return;
  } else if (ev.tipo === 'log') {
    if (!(ev.linha?.tipo === 'acao' && /^(Criando|Editando|Lendo) /.test(ev.linha.texto || ''))) return;
  } else return;
  atualizarFluxosNaTela();
}
