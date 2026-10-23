// Painel direito: a Orquestra (o pedido como uma conversa com o time) e o Voo (o que
// cada IA está fazendo agora). Também a vista de times na barra lateral e o log ao vivo.

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, props, ...filhos) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'cor') el.style.setProperty('--cor', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return el;
}

/** Ids dos agentes trabalhando agora num pedido (o Receptor conta enquanto planeja). */
function trabalhandoEm(estado) {
  const ids = new Set();
  if (!estado || !S.vivos.get(estado.id)?.rodando) return ids;
  if (estado.status === 'planejando') agentesDe(estado.time).filter((a) => a.papel === 'receptor').forEach((a) => ids.add(a.id));
  for (const t of estado.tarefas) if (t.status === 'rodando') ids.add(t.agente);
  return ids;
}

/** Métricas de cada tarefa tiradas do log: ações, avisos, arquivos e o que está fazendo agora. */
function metricas(eventos) {
  const m = new Map();
  for (const l of eventos) {
    if (!l.tarefa) continue;
    const x = m.get(l.tarefa) || { acoes: 0, avisos: 0, arquivos: new Set(), ultima: null, texto: null };
    if (l.tipo === 'acao') {
      x.acoes++;
      x.ultima = l.texto;
      const a = /^(Criando|Editando) (.+)$/.exec(l.texto || '');
      if (a) x.arquivos.add(normalizarCaminho(a[2]));
    } else if (l.tipo === 'aviso') x.avisos++;
    else if (l.tipo === 'texto') x.texto = l.texto;
    m.set(l.tarefa, x);
  }
  return m;
}

/* ---------- o time em órbita ---------- */

function desenharOrbita(estado, { largura = 300, altura = 150 } = {}) {
  const agentes = agentesDe(estado?.time || S.timeAtual).filter((a) => a.ativo);
  const trabalhando = trabalhandoEm(estado);
  const terminaram = new Set((estado?.tarefas || []).filter((t) => t.status === 'concluida').map((t) => t.agente));
  const cx = largura / 2;
  const cy = altura / 2;
  const rx = largura * 0.43;
  const ry = altura * 0.36;
  const giro = (-14 * Math.PI) / 180;
  const ponto = (a, b, ang) => {
    const x = a * Math.cos(ang);
    const y = b * Math.sin(ang);
    return [cx + x * Math.cos(giro) - y * Math.sin(giro), cy + x * Math.sin(giro) + y * Math.cos(giro)];
  };
  const receptor = agentes.filter((a) => a.papel === 'receptor');
  const outros = agentes.filter((a) => a.papel !== 'receptor');
  const posicoes = [
    ...receptor.map((a, i) => [a, ...ponto(rx * 0.47, ry * 0.42, Math.PI * 0.85 + i)]),
    ...outros.map((a, i) => [a, ...ponto(rx, ry, (i / Math.max(outros.length, 1)) * Math.PI * 2 - Math.PI / 2)]),
  ];
  const time = timeDe(estado?.time || S.timeAtual);
  return svg('svg', { class: 'orbita', viewBox: `0 0 ${largura} ${altura}`, role: 'img', 'aria-label': 'O time em órbita do projeto' },
    svg('ellipse', { class: 'orbita-anel', cx, cy, rx, ry, transform: `rotate(-14 ${cx} ${cy})` }),
    svg('ellipse', { class: 'orbita-anel', cx, cy, rx: rx * 0.47, ry: ry * 0.42, transform: `rotate(-14 ${cx} ${cy})` }),
    posicoes.filter(([a]) => trabalhando.has(a.id)).map(([a, x, y]) => svg('line', { class: 'orbita-raio', x1: x, y1: y, x2: cx, y2: cy, cor: a.cor })),
    svg('circle', { class: 'orbita-planeta', cx, cy, r: 15, cor: time?.cor }),
    svg('text', { class: 'orbita-inicial', x: cx, y: cy + 5, 'text-anchor': 'middle' }, (S.projeto?.nome || '?').slice(0, 1).toUpperCase()),
    posicoes.map(([a, x, y]) => svg('g', {
      class: `orbita-agente${trabalhando.has(a.id) ? ' trabalhando' : ''}${terminaram.has(a.id) ? ' terminou' : ''}`,
      cor: a.cor,
      onclick: () => abrirAgente(time.id, a.id),
    },
    svg('title', {}, `${a.nome} · ${PAPEL[a.papel]} · ${a.motor}`),
    trabalhando.has(a.id) ? svg('circle', { class: 'orbita-halo', cx: x, cy: y, r: 12 }) : null,
    svg('circle', { class: 'orbita-lua', cx: x, cy: y, r: a.papel === 'receptor' ? 5.5 : 7 }),
    svg('text', { class: 'orbita-nome', x, y: y + 18, 'text-anchor': 'middle' }, a.nome))));
}

/* ---------- barra lateral: times ---------- */

VISTAS.times = {
  titulo: 'Times',
  acoes: () => (S.projeto ? [
    ['add', 'Criar time', () => novoTime()],
    ['comment-discussion', 'Novo pedido', () => novoPedido()],
  ] : []),
  desenhar() {
    if (!S.projeto) return semProjeto();
    if (!S.projeto.montado) {
      return h('div', { class: 'lateral-vazia' }, h('p', {}, 'Este projeto ainda não tem um time.'),
        h('button', { class: 'bt bt-principal largo', onclick: abrirMontarTime }, ic('organization'), 'Montar o primeiro time'));
    }
    const ocupados = new Map();
    for (const v of vivosDoProjeto()) for (const id of trabalhandoEm(v.estado)) ocupados.set(`${v.estado.time}/${id}`, true);
    const secoes = S.projeto.times.map((t) => secao(`time:${t.id}`, h('span', { class: 'titulo-time', cor: t.cor }, h('i', { class: 'bolinha' }), t.nome),
      t.agentes.map((a) => h('div', {
        class: `item-arvore item-agente${a.ativo ? '' : ' inativo'}${S.ativa === `agente:${t.id}/${a.id}` ? ' selecionado' : ''}`,
        cor: a.cor,
        title: a.descricao,
        onclick: () => abrirAgente(t.id, a.id),
        oncontextmenu: (e) => abrirMenu(e, [
          ['edit', 'Editar', () => abrirAgente(t.id, a.id)],
          ['eye', 'Ver o prompt montado', () => previaAgente(t.id, a.id)],
          ['copy', 'Duplicar neste time', () => duplicarAgente(t.id, a.id)],
          S.projeto.times.length > 1 && ['arrow-swap', 'Copiar para outro time…', () => copiarAgenteParaOutroTime(t.id, a)],
          ['go-to-file', 'Abrir o arquivo .md', () => abrirArquivo(`.orbion/times/${t.id}/agentes/${a.id}.md`)],
        ]),
      },
      h('span', { class: 'guia' }),
      h('span', { class: `icone-agente${ocupados.has(`${t.id}/${a.id}`) ? ' pulsando' : ''}` }, ic(a.icone)),
      h('span', { class: 'item-nome' }, a.nome),
      a.papel !== 'executor' ? h('span', { class: `tag-papel papel-${a.papel}`, title: PAPEL[a.papel] }, a.papel === 'receptor' ? 'R' : 'V') : null,
      h('span', { class: `chip-motor motor-${a.motor}` }, a.motor))),
      {
        contador: t.agentes.filter((a) => a.ativo).length,
        acoes: [
          ['comment-discussion', 'Pedido para este time', () => novoPedido(t.id)],
          ['add', 'Criar agente neste time', () => novoAgente(t.id)],
          ['settings', 'Editar time', () => abrirTime(t.id)],
        ],
      }));
    const historico = S.projeto.execucoes.map((e) => {
      const vivo = S.vivos.get(e.id)?.rodando;
      const status = vivo ? S.vivos.get(e.id).estado?.status || 'rodando' : ATIVOS.includes(e.status) ? 'interrompida' : e.status;
      return h('div', {
        class: `item-arvore item-historico${S.vendo?.id === e.id ? ' selecionado' : ''}`,
        title: `${e.pedido}\n${e.timeNome} · ${ST_EXECUCAO[status] || status} · ${data(e.criadaEm)}`,
        onclick: () => mostrarExecucao(e.id).then(() => abrirDireita('orquestra')),
      },
      ic(status === 'concluida' ? 'pass' : status === 'falhou' ? 'error' : ATIVOS.includes(status) ? 'loading' : 'circle-slash', `st-${status}${ATIVOS.includes(status) ? ' codicon-modifier-spin' : ''}`),
      h('i', { class: 'bolinha', cor: e.timeCor || 'var(--mudo)' }),
      h('span', { class: 'item-nome' }, e.pedido),
      h('span', { class: 'item-dica' }, data(e.criadaEm)));
    });
    return [
      ...secoes,
      secao('memoria', 'Memória do projeto', h('div', { class: 'lateral-texto' },
        h('p', {}, 'O que os agentes aprendem aqui (convenções, comandos, armadilhas) fica em .orbion/memoria.md e entra nos próximos pedidos.'),
        h('button', { class: 'bt largo', onclick: abrirMemoria }, ic('book'), 'Abrir a memória'))),
      secao('historico', 'Histórico de pedidos', historico.length ? historico : h('p', { class: 'lateral-texto' }, 'Os pedidos que tu fizer aparecem aqui.'), { cresce: true }),
    ];
  },
};

async function abrirMemoria() {
  const rel = await api('memoria:garantir', S.projeto.caminho);
  await carregarPasta('.orbion');
  abrirArquivo(rel);
}

/* ---------- painel direito ---------- */

function abrirDireita(aba) {
  if (aba) S.direitaAba = aba;
  $('#direita').hidden = false;
  $('#divisor-direita').hidden = false;
  desenharDireita();
}

function alternarDireita() {
  const d = $('#direita');
  d.hidden = !d.hidden;
  $('#divisor-direita').hidden = d.hidden;
  api('config:salvar', { layout: { direitaAberta: !d.hidden } }).catch(() => {});
  if (!d.hidden) desenharDireita();
}

function desenharDireita() {
  for (const b of document.querySelectorAll('.direita-aba')) b.classList.toggle('ativa', b.dataset.direita === S.direitaAba);
  const nVivos = vivosDoProjeto().length;
  const selo = $('#selo-voo');
  selo.hidden = !nVivos;
  selo.textContent = nVivos;
  $('#direita-acoes').replaceChildren(...(S.direitaAba === 'orquestra' && S.projeto?.montado ? [
    h('button', { class: `bt-icone${HIST.aberto === 'orquestra' ? ' ativo' : ''}`, title: 'Histórico de conversas', onclick: () => alternarHistorico('orquestra') }, ic('history')),
    h('button', { class: 'bt-icone', title: 'Nova conversa com o time', onclick: () => novoPedido() }, ic('add')),
  ] : []));
  const corpo = $('#direita-corpo');
  if (!S.projeto) return corpo.replaceChildren(h('div', { class: 'direita-vazia' }, desenharOrbitaVazia(), h('p', {}, 'Abra a pasta de um projeto para montar o time.'), h('button', { class: 'bt bt-principal', onclick: escolherProjeto }, ic('folder-opened'), 'Abrir pasta')));
  if (!S.projeto.montado) return corpo.replaceChildren(h('div', { class: 'direita-vazia' }, desenharOrbitaVazia(), h('p', {}, 'Este projeto ainda não tem um time.'), h('button', { class: 'bt bt-principal', onclick: abrirMontarTime }, ic('organization'), 'Montar o primeiro time')));
  if (S.direitaAba === 'voo') return corpo.replaceChildren(desenharVoo());
  if (HIST.aberto === S.direitaAba) return corpo.replaceChildren(desenharHistorico(S.direitaAba));
  if (S.direitaAba === 'conversa') {
    corpo.replaceChildren(desenharConversa());
    return atualizarMensagensConversa();
  }
  if (!corpo.querySelector('#chat-mensagens')) corpo.replaceChildren(desenharChat());
  atualizarChat();
}

/* ---------- Orquestra: o pedido como conversa ---------- */

function desenharChat() {
  const campo = h('textarea', {
    id: 'pedido', rows: 3, spellcheck: 'true',
    placeholder: 'Peça algo ao time…  / comandos · @ agente · Enter envia · Ctrl+Enter quebra a linha',
    oninput: (e) => { S.rascunhoPedido = e.target.value; atualizarSugestoes(); },
    onclick: atualizarSugestoes,
    onkeydown: teclaNoCompositor,
    onblur: () => setTimeout(fecharSugestoes, 150),
  });
  campo.value = S.rascunhoPedido || '';
  return h('div', { class: 'chat' },
    h('div', { class: 'chat-mensagens', id: 'chat-mensagens' }),
    compositorPedido(campo));
}

function compositorPedido(campo) {
  const form = h('form', { class: 'chat-compositor', onsubmit: (e) => { e.preventDefault(); enviarPedido(); } },
    h('div', { class: 'sugestoes-compositor', id: 'sugestoes', hidden: true }),
    caixaAnexos('pedido'),
    campo,
    h('div', { class: 'chat-linha' },
      h('button', { type: 'button', class: 'chip-time', id: 'chip-time', title: 'Qual time (e qual agente) recebe o pedido', onclick: (e) => escolherDestino(e.currentTarget) }),
      h('button', { type: 'button', class: 'chip-validar', id: 'chip-validar', title: 'Só validar: o time lê e consulta, mas ninguém altera nada (/validar)', onclick: () => alternarSoValidar() }, ic('eye'), 'Só validar'),
      botaoAnexar('pedido'),
      h('span', { class: 'dica', id: 'chat-dica' }),
      h('button', { type: 'submit', class: 'bt bt-principal', id: 'bt-enviar', title: 'Enviar (Enter)' }, ic('send'), 'Enviar')));
  ligarAnexos('pedido', campo, form);
  return form;
}

/** Liga ou desliga o "Só validar" (fica ligado até a pessoa desligar, como o modo de plano do Claude Code). */
function alternarSoValidar(ligar = !S.soValidar) {
  S.soValidar = ligar;
  try { localStorage.setItem('orbion:soValidar', ligar ? '1' : ''); } catch {}
  atualizarCompositor();
}

/** Destino do próximo pedido: o time e, se a pessoa escolheu, um agente direto (sem Receptor). */
function destino() {
  const t = timeDe(S.timeAtual) || S.projeto.times[0];
  const a = S.agenteDireto && t?.agentes.find((x) => x.id === S.agenteDireto && x.ativo && x.papel !== 'receptor');
  if (!a) S.agenteDireto = null;
  return { t, a };
}

function atualizarCompositor() {
  const chip = $('#chip-time');
  if (!chip) return;
  const { t, a } = destino();
  S.timeAtual = t?.id;
  chip.replaceChildren(...[
    h('i', { class: 'bolinha', cor: t?.cor }),
    h('span', { class: 'chip-time-nome' }, t?.nome || 'Time'),
    a ? [h('span', { class: 'chip-sep' }, '›'), h('span', { class: 'chip-agente', cor: a.cor }, ic(a.icone), a.nome)] : null,
    ic('chevron-up'),
  ].flat().filter(Boolean));
  const ocupado = vivosDoProjeto().some((v) => v.estado?.time === t?.id);
  $('#chip-validar')?.classList.toggle('ligado', !!S.soValidar);
  $('#chat-dica').textContent = S.soValidar
    ? `Só validar: ${a ? a.nome : 'o time'} lê e consulta, ninguém altera nada.`
    : a
    ? `Direto para ${a.nome}, sem o Receptor.`
    : ocupado ? `${t.nome} já está trabalhando; este pedido roda junto (quem edita espera a vez).` : '';
}

function escolherDestino(ancora) {
  const vivos = vivosDoProjeto();
  const itens = S.projeto.times.map((t) => {
    const ativos = t.agentes.filter((a) => a.ativo && a.papel !== 'receptor');
    const trabalhando = vivos.some((v) => v.estado?.time === t.id);
    return {
      rotulo: t.nome,
      detalhe: trabalhando ? 'trabalhando' : `${ativos.length} agentes`,
      cor: t.cor,
      marcado: t.id === S.timeAtual,
      acao: () => definirDestino(t.id, null),
      filhos: [
        { rotulo: 'Receptor decide', detalhe: 'monta o plano e chama quem precisar', icone: 'inbox', marcado: t.id === S.timeAtual && !S.agenteDireto, acao: () => definirDestino(t.id, null) },
        '-',
        ...ativos.map((a) => ({
          rotulo: a.nome, detalhe: a.modelo ? nomeModelo(a.modelo) : a.motor, icone: a.icone, cor: a.cor,
          marcado: t.id === S.timeAtual && S.agenteDireto === a.id, acao: () => definirDestino(t.id, a.id),
        })),
      ],
    };
  });
  abrirPopover(ancora, [...itens, '-', { rotulo: 'Criar time…', icone: 'add', acao: novoTime }]);
}

function definirDestino(time, agente) {
  S.timeAtual = time;
  S.agenteDireto = agente;
  guardarTimeAtual();
  if (S.vendo) atualizarCompositor();
  else atualizarChat(); // a tela de boas-vindas mostra o time escolhido
  $('#pedido')?.focus();
}

/* ---------- comandos / e menções @ na caixa do pedido ---------- */

const COMANDOS_PEDIDO = [
  { cmd: '/time', desc: 'Escolher o time que recebe o pedido', icone: 'organization', continua: true },
  { cmd: '/agente', desc: 'Mandar direto para um agente, sem o Receptor', icone: 'person', continua: true },
  { cmd: '/validar', desc: 'Só validar: o time lê e consulta, ninguém altera nada', icone: 'eye', fazer: () => alternarSoValidar(true) },
  { cmd: '/executar', desc: 'Desligar o Só validar: o time pode mudar o projeto', icone: 'play', fazer: () => alternarSoValidar(false) },
  { cmd: '/auto', desc: 'Voltar para o Receptor decidir quem trabalha', icone: 'inbox', fazer: () => { S.agenteDireto = null; atualizarCompositor(); } },
  { cmd: '/novo', desc: 'Começar um pedido novo', icone: 'add', fazer: () => novoPedido() },
  { cmd: '/grill', desc: 'Grill-me: a IA te questiona sobre o plano antes de fazer', icone: 'flame', fazer: () => { const t = $('#pedido')?.value.trim(); iniciarConversa('grill-me'); if (t) CV.rascunho = t; } },
  { cmd: '/conversa', desc: 'Conversar sobre o projeto, sem mudar nada', icone: 'comment', fazer: () => iniciarConversa('') },
  { cmd: '/melhorias', desc: 'Pedir sugestões de melhoria do projeto', icone: 'lightbulb', fazer: () => abrirMelhorias(true) },
  { cmd: '/skill', desc: 'Criar uma skill nova', icone: 'sparkle', fazer: () => abrirNovaSkill() },
  { cmd: '/voo', desc: 'Ver o que as IAs estão fazendo', icone: 'pulse', fazer: () => abrirDireita('voo') },
  { cmd: '/memoria', desc: 'Abrir a memória do projeto', icone: 'book', fazer: abrirMemoria },
  { cmd: '/terminal', desc: 'Abrir um terminal', icone: 'terminal', fazer: () => novoTerminal() },
];

const SUG = { itens: [], sel: 0, inicio: 0, fim: 0 };

function agentesParaMencao(termo) {
  return S.projeto.times.flatMap((t) => t.agentes.filter((a) => a.ativo && a.papel !== 'receptor').map((a) => ({ a, t })))
    .filter(({ a, t }) => nota(`${a.nome} ${t.nome}`, termo) >= 0)
    .sort((x, y) => (y.t.id === S.timeAtual) - (x.t.id === S.timeAtual) || nota(y.a.nome, termo) - nota(x.a.nome, termo));
}

/** Olha o que está antes do cursor e decide que sugestões mostrar. */
function atualizarSugestoes() {
  const campo = $('#pedido');
  if (!campo) return;
  const cursor = campo.selectionStart;
  const antes = campo.value.slice(0, cursor);
  const linha = antes.slice(antes.lastIndexOf('\n') + 1);
  const inicioLinha = cursor - linha.length;
  let m;
  let itens = [];
  if ((m = /^\/(time|agente)\s+(.*)$/i.exec(linha))) {
    const termo = m[2];
    SUG.inicio = inicioLinha;
    itens = m[1].toLowerCase() === 'time'
      ? S.projeto.times.filter((t) => nota(t.nome, termo) >= 0).map((t) => ({ rotulo: t.nome, detalhe: `${t.agentes.length} agentes`, cor: t.cor, fazer: () => definirDestino(t.id, null) }))
      : agentesParaMencao(termo).map(({ a, t }) => ({ rotulo: a.nome, detalhe: t.nome, icone: a.icone, cor: a.cor, fazer: () => definirDestino(t.id, a.id) }));
  } else if ((m = /^\/(\S*)$/.exec(linha))) {
    SUG.inicio = inicioLinha;
    itens = COMANDOS_PEDIDO.filter((c) => c.cmd.slice(1).startsWith(m[1].toLowerCase())).map((c) => ({
      rotulo: c.cmd, detalhe: c.desc, icone: c.icone, continua: c.continua, fazer: c.fazer, cmd: c.cmd,
    }));
  } else if ((m = /(^|\s)@(\S*)$/.exec(linha))) {
    SUG.inicio = cursor - m[2].length - 1;
    itens = agentesParaMencao(m[2]).map(({ a, t }) => ({ rotulo: a.nome, detalhe: t.nome, icone: a.icone, cor: a.cor, fazer: () => definirDestino(t.id, a.id) }));
  }
  SUG.fim = cursor;
  SUG.itens = itens.slice(0, 8);
  SUG.sel = Math.min(SUG.sel, Math.max(0, SUG.itens.length - 1));
  desenharSugestoes();
}

function desenharSugestoes() {
  const box = $('#sugestoes');
  if (!box) return;
  box.hidden = !SUG.itens.length;
  box.replaceChildren(...SUG.itens.map((it, i) => h('button', {
    type: 'button',
    class: `sugestao-item${i === SUG.sel ? ' ativo' : ''}`,
    cor: it.cor,
    onmousedown: (e) => { e.preventDefault(); escolherSugestao(i); },
  }, it.icone ? ic(it.icone, it.cor ? 'colorido' : '') : h('i', { class: 'bolinha', cor: it.cor }),
  h('span', { class: 'sugestao-rotulo' }, it.rotulo), h('span', { class: 'sugestao-detalhe' }, it.detalhe))));
}

function fecharSugestoes() {
  SUG.itens = [];
  desenharSugestoes();
}

function escolherSugestao(i) {
  const it = SUG.itens[i];
  const campo = $('#pedido');
  if (!it || !campo) return;
  const v = campo.value;
  if (it.continua) {
    // /time e /agente: escreve o comando e mostra a lista para escolher.
    campo.value = `${v.slice(0, SUG.inicio)}${it.cmd} ${v.slice(SUG.fim)}`;
    const pos = SUG.inicio + it.cmd.length + 1;
    campo.setSelectionRange(pos, pos);
  } else {
    // Some com o comando ou a menção do texto e aplica a escolha.
    const resto = `${v.slice(0, SUG.inicio)}${v.slice(SUG.fim)}`.replace(/^\s+/, '');
    campo.value = resto;
    campo.setSelectionRange(Math.min(SUG.inicio, resto.length), Math.min(SUG.inicio, resto.length));
    it.fazer?.();
  }
  S.rascunhoPedido = campo.value;
  SUG.sel = 0;
  campo.focus();
  atualizarSugestoes();
}

function teclaNoCompositor(e) {
  if (SUG.itens.length) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      SUG.sel = (SUG.sel + (e.key === 'ArrowDown' ? 1 : -1) + SUG.itens.length) % SUG.itens.length;
      return desenharSugestoes();
    }
    if ((e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault();
      return escolherSugestao(SUG.sel);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      return fecharSugestoes();
    }
  }
  teclaDeChat(e, enviarPedido);
}

function guardarTimeAtual() {
  try { localStorage.setItem(`orbion:time:${S.projeto.caminho}`, S.timeAtual); } catch {}
}

/** Começa uma conversa nova com o time (a anterior fica no histórico). */
function novoPedido(time) {
  if (!S.projeto?.montado) return abrirMontarTime();
  if (time) { S.timeAtual = time; guardarTimeAtual(); }
  S.fio = null;
  S.fioIds = [];
  S.vendo = null;
  S.eventos = [];
  S.filtro = null;
  HIST.aberto = null;
  abrirDireita('orquestra');
  desenharLog();
  requestAnimationFrame(() => $('#pedido')?.focus());
}

function escolherPedido() {
  abrirDireita('orquestra');
  alternarHistorico('orquestra', true);
}

/* ---------- histórico no estilo do Claude ---------- */

const HIST = { aberto: null, busca: '', conversas: null }; // aberto: 'orquestra' | 'conversa'

function alternarHistorico(qual, abrir = HIST.aberto !== qual) {
  HIST.aberto = abrir ? qual : null;
  HIST.busca = '';
  HIST.conversas = null;
  desenharDireita();
}

function grupoDaData(t) {
  const d = new Date(t);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((hoje - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias < 7) return 'Últimos 7 dias';
  if (dias < 30) return 'Últimos 30 dias';
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/** As conversas da Orquestra: cada fio com o primeiro pedido como título. */
function conversasDaOrquestra() {
  const fios = new Map();
  for (const e of S.projeto.execucoes) {
    const f = fios.get(e.fio) || { id: e.fio, pedidos: [] };
    f.pedidos.push(e);
    fios.set(e.fio, f);
  }
  return [...fios.values()].map((f) => {
    const ordem = f.pedidos.sort((a, b) => a.criadaEm - b.criadaEm);
    const ultimo = ordem.at(-1);
    const vivo = ordem.some((e) => S.vivos.get(e.id)?.rodando);
    return {
      id: f.id, titulo: ordem[0].pedido.split('\n')[0].slice(0, 120), quando: ultimo.criadaEm, cor: ultimo.timeCor,
      detalhe: [ultimo.timeNome, `${ordem.length} pedido${ordem.length > 1 ? 's' : ''}`, vivo ? 'rodando agora' : ST_EXECUCAO[ultimo.status] || ultimo.status].join(' · '),
      icone: vivo ? 'loading' : ultimo.status === 'concluida' ? 'pass' : ultimo.status === 'falhou' ? 'error' : 'circle-slash',
      classe: vivo ? 'codicon-modifier-spin' : '',
    };
  }).sort((a, b) => b.quando - a.quando);
}

function desenharHistorico(qual) {
  let itens;
  let atual;
  if (qual === 'orquestra') {
    itens = conversasDaOrquestra();
    atual = S.fio;
  } else {
    if (!HIST.conversas) api('conversa:listar', S.projeto.caminho).then((l) => { HIST.conversas = l; if (HIST.aberto === 'conversa') desenharDireita(); });
    itens = (HIST.conversas || []).filter((c) => c.mensagens).map((c) => ({
      id: c.id, titulo: c.titulo, quando: c.atualizadaEm, icone: c.modo === 'grill-me' ? 'flame' : 'comment-discussion',
      detalhe: [c.modo || 'conversa livre', `${c.mensagens} mensage${c.mensagens > 1 ? 'ns' : 'm'}`, rotuloMotor(c.motor, '')].join(' · '),
    }));
    atual = CV.atual?.id;
  }
  const abrir = async (it) => {
    HIST.aberto = null;
    if (qual === 'orquestra') return abrirFio(it.id);
    CV.atual = await api('conversa:ler', S.projeto.caminho, it.id);
    CV.parcial = '';
    desenharDireita();
  };
  const excluir = async (it) => {
    if (!confirm(`Excluir a conversa "${it.titulo}"? Não dá para desfazer.`)) return;
    if (qual === 'orquestra') {
      await api('execucao:excluirFio', S.projeto.caminho, it.id);
      if (S.fio === it.id) novoPedido();
      await recarregarProjeto();
    } else {
      await api('conversa:excluir', S.projeto.caminho, it.id);
      if (CV.atual?.id === it.id) CV.atual = null;
      HIST.conversas = null;
    }
    desenharDireita();
  };
  const busca = h('input', { type: 'search', class: 'hist-busca', placeholder: 'Buscar nas conversas', valor: HIST.busca });
  const lista = h('div', { class: 'hist-lista' });
  const desenharLista = () => {
    const achados = itens.filter((it) => nota(`${it.titulo} ${it.detalhe}`, HIST.busca) >= 0);
    const grupos = new Map();
    for (const it of achados) {
      const g = grupoDaData(it.quando);
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(it);
    }
    lista.replaceChildren(...(achados.length ? [...grupos].map(([g, xs]) => h('section', { class: 'hist-grupo' },
      h('h4', {}, g),
      xs.map((it) => h('div', { class: `hist-item${it.id === atual ? ' atual' : ''}`, cor: it.cor, onclick: () => abrir(it) },
        ic(it.icone, it.classe || ''),
        h('div', { class: 'hist-texto' }, h('span', { class: 'hist-titulo' }, it.titulo), h('span', { class: 'hist-detalhe' }, it.detalhe)),
        h('button', { class: 'bt-icone hist-excluir', title: 'Excluir a conversa', onclick: (e) => { e.stopPropagation(); excluir(it); } }, ic('trash')))))) : [
      h('p', { class: 'hist-vazio' }, HIST.busca ? 'Nada encontrado.' : qual === 'conversa' && !HIST.conversas ? 'Carregando…' : 'Nenhuma conversa ainda.')]));
  };
  busca.addEventListener('input', () => { HIST.busca = busca.value; desenharLista(); });
  busca.addEventListener('keydown', (e) => { if (e.key === 'Escape') alternarHistorico(qual, false); });
  desenharLista();
  requestAnimationFrame(() => busca.focus());
  return h('div', { class: 'hist' },
    h('div', { class: 'hist-topo' },
      h('button', { class: 'bt-icone', title: 'Voltar para a conversa', onclick: () => alternarHistorico(qual, false) }, ic('arrow-left')),
      h('strong', {}, qual === 'orquestra' ? 'Conversas com o time' : 'Conversas sobre o projeto'),
      h('span', { class: 'espaco' }),
      h('button', { class: 'bt', onclick: () => { HIST.aberto = null; if (qual === 'orquestra') novoPedido(); else iniciarConversa(CV.modo || ''); } }, ic('add'), 'Nova conversa')),
    busca,
    lista);
}

function pedirSobre(rel) {
  HIST.aberto = null;
  abrirDireita('orquestra');
  requestAnimationFrame(() => {
    const campo = $('#pedido');
    if (!campo) return;
    campo.value = `${campo.value ? `${campo.value}\n` : ''}Sobre \`${rel}\`: `;
    S.rascunhoPedido = campo.value;
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
  });
}

function atualizarChat() {
  const box = $('#chat-mensagens');
  if (!box) return;
  atualizarCompositor();
  const noFim = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const pedidos = S.fioIds.map(dadosDoPedido).filter(Boolean);
  box.replaceChildren(...(pedidos.length
    ? pedidos.map((d) => h('div', { class: 'pedido-bloco', 'data-pedido': d.estado.id }, mensagensDoPedido(d.estado, d.eventos, d.vivo)))
    : mensagensDoPedido(null)));
  rolarExecucoes();
  const alvo = S.rolarPara && box.querySelector(`[data-pedido="${S.rolarPara}"]`);
  if (alvo && S.rolarPara !== S.fioIds.at(-1)) box.scrollTop = alvo.offsetTop - box.offsetTop - 8;
  else if (noFim || box.dataset.fio !== (S.fio || '') || S.rolarPara) box.scrollTop = box.scrollHeight;
  S.rolarPara = null;
  box.dataset.fio = S.fio || '';
}

/** O estado e o log de um pedido da conversa: ao vivo se ainda roda, senão o que foi lido do disco. */
function dadosDoPedido(id) {
  const v = S.vivos.get(id);
  if (v?.estado) return { estado: v.estado, eventos: v.eventos, vivo: !!v.rodando };
  const c = S.fioCache.get(id);
  return c ? { estado: c.estado, eventos: c.eventos, vivo: false } : null;
}

/** Abre uma conversa da Orquestra inteira, com todos os pedidos dela. */
async function abrirFio(fio, foco = null) {
  const ids = S.projeto.execucoes.filter((e) => e.fio === fio).sort((a, b) => a.criadaEm - b.criadaEm).map((e) => e.id);
  for (const v of vivosDoProjeto()) if ((v.estado?.fio || v.id) === fio && !ids.includes(v.id)) ids.push(v.id);
  await Promise.all(ids.map(async (id) => {
    if (S.vivos.get(id)?.estado || S.fioCache.has(id)) return;
    try {
      const { estado, eventos } = await api('execucao:ler', S.projeto.caminho, id);
      if (ATIVOS.includes(estado.status)) estado.status = 'interrompida';
      S.fioCache.set(id, { estado, eventos });
    } catch {}
  }));
  S.fio = fio;
  S.fioIds = ids.filter((id) => dadosDoPedido(id));
  const d = dadosDoPedido(foco && S.fioIds.includes(foco) ? foco : S.fioIds.at(-1));
  S.vendo = d?.estado || null;
  S.eventos = d?.eventos || [];
  S.rolarPara = foco;
  S.filtro = null;
  S.abertas.clear();
  desenharTudo();
}

function mensagensDoPedido(e = S.vendo, eventos = S.eventos, vivo = vendoVivo()) {
  if (!e) {
    const t = timeDe(S.timeAtual) || S.projeto.times[0];
    return [h('div', { class: 'chat-boas-vindas' },
      desenharOrbita(null, { largura: 260, altura: 130 }),
      h('h3', {}, `O que o ${t?.nome || 'time'} deve fazer?`),
      h('p', {}, 'Escreva o pedido abaixo. O Receptor monta o plano, tu aprova, e os agentes trabalham juntos: quem só lê trabalha em paralelo, e quem edita espera a vez.'),
      h('p', { class: 'pequeno' }, 'Para falar direto com um agente, use @nome (ou /agente). Para trocar de time, /time.'),
      h('div', { class: 'sugestoes' }, [
        'Explique como este projeto está organizado e o que falta testar.',
        'Revise o código e aponte os problemas mais graves.',
        'Crie testes para as funções que ainda não têm.',
      ].map((s) => h('button', { class: 'sugestao', onclick: () => { $('#pedido').value = s; S.rascunhoPedido = s; $('#pedido').focus(); } }, s))))];
  }
  const receptor = agentesDe(e.time).find((a) => a.papel === 'receptor');
  const m = metricas(eventos);
  const saida = [];

  saida.push(h('div', { class: 'msg msg-pessoa' },
    imagensDaMensagem(e.anexos),
    h('div', { class: 'msg-balao' }, e.pedido),
    h('div', { class: 'msg-meta' }, h('i', { class: 'bolinha', cor: e.timeCor }), e.timeNome, ' · ', data(e.criadaEm),
      !vivo ? h('button', { class: 'bt-texto', onclick: () => { $('#pedido').value = e.pedido; S.rascunhoPedido = e.pedido; $('#pedido').focus(); } }, 'repetir') : null)));

  const planejando = e.status === 'planejando' && vivo;
  const direto = e.direto && agentePorId(e.direto);
  if (direto) {
    saida.push(h('div', { class: 'msg-direto', cor: direto.cor }, ic(e.tipo === 'verificacao' ? 'eye' : 'arrow-right'), `Direto para ${direto.nome}, sem o Receptor${e.tipo === 'verificacao' ? ' · só verificação' : ''}`));
  } else saida.push(mensagemAgente(receptor, {
    titulo: e.tipo === 'verificacao' ? 'Plano · só verificação' : e.tipo === 'mudanca' ? 'Plano · mudança' : 'Plano',
    status: planejando ? 'rodando' : 'concluida',
    corpo: [
      planejando && !m.get('receptor') ? h('p', { class: 'msg-agora' }, ic('loading', 'codicon-modifier-spin'), 'Lendo o pedido e o projeto…') : null,
      blocoExecucao(`${e.id}:receptor`, eventos.filter((l) => l.tarefa === 'receptor'), planejando),
      e.tipo === 'verificacao' && e.tarefas.length ? h('p', { class: 'msg-tipo verificacao' }, ic('eye'), 'Só verificação: o time lê e consulta, ninguém altera nada.') : null,
      e.entendimento ? blocoLongo(`${e.id}:entendimento`, e.entendimento) : null,
      e.tarefas.length ? h('ol', { class: 'msg-plano' }, e.tarefas.map((t) => {
        const a = agentePorId(t.agente);
        return h('li', { class: `st-${t.status}`, cor: a?.cor },
          iconeStatus(t.status), h('span', { class: 'chip' }, a?.nome || t.agente), h('span', {}, t.titulo),
          t.depende_de.length ? h('span', { class: 'mudo pequeno' }, `depois de ${t.depende_de.join(', ')}`) : null);
      })) : null,
      e.erro ? h('p', { class: 'erro-texto' }, e.erro) : null,
    ],
  }));

  const ordem = [...e.tarefas].filter((t) => t.status !== 'pendente' || t.passe || t.tentativas)
    .sort((a, b) => (a.inicio || Infinity) - (b.inicio || Infinity));
  for (const t of ordem) {
    const a = agentePorId(t.agente);
    const x = m.get(t.id);
    const resumo = t.passe?.resumo || '';
    saida.push(mensagemAgente(a, {
      titulo: `${t.id} · ${t.titulo}`,
      status: t.status,
      tempo: t.inicio ? duracao((t.status === 'rodando' ? Date.now() : t.fim || Date.now()) - t.inicio) : null,
      inicio: t.status === 'rodando' ? t.inicio : null,
      corpo: [
        t.correcao ? h('p', { class: 'msg-correcao' }, ic('reply'), `Devolvido por ${t.correcao.de} (volta ${t.correcao.volta})`) : null,
        t.status === 'na_fila' ? h('p', { class: 'msg-agora' }, ic('lock'), 'Esperando a vez de escrever (outro agente está editando arquivos).') : null,
        t.status === 'rodando' && !x ? h('p', { class: 'msg-agora' }, ic('loading', 'codicon-modifier-spin'), 'Começando…') : null,
        blocoExecucao(`${e.id}:${t.id}`, eventos.filter((l) => l.tarefa === t.id), t.status === 'rodando'),
        resumo ? blocoLongo(`${e.id}:${t.id}`, resumo) : null,
        t.passe?.arquivos?.length ? h('div', { class: 'arquivos' }, t.passe.arquivos.map((arq) => {
          const rel = normalizarCaminho(arq);
          return h('button', { class: 'arquivo', title: S.git ? 'Ver as mudanças' : 'Abrir', onclick: () => (S.git ? abrirDiff(rel) : abrirArquivo(rel)) }, iconeDe(nomeDe(rel)), rel);
        })) : null,
        t.passe?.recado_para_proximo ? h('div', { class: 'msg-recado' }, h('span', { class: 'msg-rotulo' }, ic('arrow-right'), 'Recado para o próximo'), markdown(t.passe.recado_para_proximo)) : null,
        t.passe?.aprendizados?.length ? h('details', { class: 'msg-memoria' },
          h('summary', {}, ic('book'), `Anotou ${t.passe.aprendizados.length} aprendizado${t.passe.aprendizados.length > 1 ? 's' : ''} na memória`),
          h('ul', {}, t.passe.aprendizados.map((x) => h('li', {}, trechoMd(x))))) : null,
        t.erro ? h('p', { class: 'erro-texto' }, t.erro) : null,
      ],
      acoes: [
        x ? h('button', { class: 'bt-mini', title: 'Abrir o log desta tarefa no painel de baixo', onclick: () => { S.filtro = t.id; abrirPainelEm('log'); desenharLog(); } }, ic('output'), 'Log') : null,
        vivo && ['rodando', 'na_fila'].includes(t.status) ? h('button', { class: 'bt-mini', onclick: () => intervir(e.id, t.id) }, ic('debug-pause'), 'Intervir') : null,
      ],
    }));
  }

  if (vivo && e.status === 'aguardando' && e.pergunta) saida.push(portao(e));

  if (!vivo && ['concluida', 'falhou', 'cancelada', 'interrompida'].includes(e.status)) {
    const feitas = e.tarefas.filter((t) => t.status === 'concluida').length;
    const fim = Math.max(0, ...e.tarefas.map((t) => t.fim || 0));
    saida.push(h('div', { class: `msg-fim st-${e.status}` },
      ic(e.status === 'concluida' ? 'pass-filled' : e.status === 'falhou' ? 'error' : 'circle-slash'),
      h('span', {}, [ST_EXECUCAO[e.status], `${feitas} de ${e.tarefas.length} tarefas`, fim ? duracao(fim - e.criadaEm) : null, e.gastoApi ? `US$ ${e.gastoApi.toFixed(2)} na chave de API` : null].filter(Boolean).join(' · '))));
  }
  return saida;
}

/* ---------- textos longos dos agentes ---------- */

/** Markdown que começa recolhido quando é comprido (a conclusão vem primeiro); um botão abre e fecha. */
function blocoLongo(chave, texto) {
  const comprido = texto.length > 650 || texto.split('\n').length > 12;
  if (!comprido) return h('div', { class: 'msg-texto' }, markdown(texto));
  const aberto = S.abertas.has(chave);
  return h('div', { class: `msg-texto longo${aberto ? ' aberto' : ''}` },
    h('div', { class: 'msg-texto-corpo' }, markdown(texto)),
    h('button', { class: 'msg-ver-tudo', onclick: () => { if (aberto) S.abertas.delete(chave); else S.abertas.add(chave); atualizarChat(); } },
      ic(aberto ? 'chevron-up' : 'chevron-down'), aberto ? 'Recolher' : 'Ver tudo'));
}

/* ---------- a execução de cada agente, dentro da conversa ---------- */

const MOSTRAR_LINHAS = 40;

function iconeDaLinha(l) {
  if (l.tipo === 'aviso') return 'warning';
  if (l.tipo === 'erro') return 'error';
  if (l.tipo === 'texto') return 'comment';
  if (l.tipo === 'inicio') return 'play';
  if (l.tipo === 'sistema') return 'info';
  const t = l.texto || '';
  if (t.startsWith('Lendo')) return 'eye';
  if (t.startsWith('Criando')) return 'new-file';
  if (t.startsWith('Editando')) return 'edit';
  if (/^(Procurando|Buscando|Listando)/.test(t)) return 'search';
  if (t.startsWith('$')) return 'terminal';
  return 'tools';
}

/** O passo a passo de um agente (o que leu, editou, rodou e disse), como no Claude Code.
 *  Fica aberto enquanto ele trabalha e se recolhe quando termina; um clique troca. */
function blocoExecucao(chave, linhas, rodando) {
  const passos = linhas.filter((l) => ['inicio', 'acao', 'texto', 'aviso', 'erro'].includes(l.tipo));
  if (!passos.length) return null;
  const aberto = S.execVer.has(chave) ? S.execVer.get(chave) : rodando;
  const acoes = passos.filter((l) => l.tipo === 'acao');
  const arquivos = new Set(acoes.map((l) => /^(Criando|Editando) (.+)$/.exec(l.texto)?.[2]).filter(Boolean));
  const comandos = acoes.filter((l) => l.texto.startsWith('$')).length;
  const resumo = [acoes.length ? `${acoes.length} aç${acoes.length > 1 ? 'ões' : 'ão'}` : 'nenhuma ação ainda', arquivos.size ? `${arquivos.size} arquivo${arquivos.size > 1 ? 's' : ''}` : null, comandos ? `${comandos} comando${comandos > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ');
  const tudo = S.execTudo.has(chave);
  const mostrar = tudo ? passos : passos.slice(-MOSTRAR_LINHAS);
  const lista = aberto ? h('div', { class: 'exec-lista', 'data-chave': chave },
    passos.length > mostrar.length ? h('button', { class: 'exec-mais', onclick: () => { S.execTudo.add(chave); atualizarChat(); } }, `Mostrar os ${passos.length - mostrar.length} passos anteriores`) : null,
    mostrar.map((l) => h('div', { class: `exec-linha tipo-${l.tipo}` },
      ic(iconeDaLinha(l)),
      h('span', { class: 'exec-texto', title: l.texto }, l.tipo === 'inicio' ? l.texto.replace(/\(([^)]+)\)/, (_, id) => `(${nomeModelo(id)})`) : l.texto),
      h('span', { class: 'exec-hora' }, hora(l.hora))))) : null;
  return h('div', { class: `exec${aberto ? ' aberto' : ''}${rodando ? ' rodando' : ''}` },
    h('button', { class: 'exec-topo', onclick: () => { S.execVer.set(chave, !aberto); atualizarChat(); } },
      ic(aberto ? 'chevron-down' : 'chevron-right'), h('span', {}, 'Execução'), h('span', { class: 'mudo' }, resumo)),
    lista);
}

/** Mantém no fim as listas de quem ainda está trabalhando. */
function rolarExecucoes() {
  for (const el of document.querySelectorAll('.exec.rodando .exec-lista')) el.scrollTop = el.scrollHeight;
}

function iconeStatus(status) {
  const mapa = {
    concluida: 'pass', falhou: 'error', rodando: 'loading', na_fila: 'lock', bloqueada: 'bell-dot', cancelada: 'circle-slash', pendente: 'circle-large-outline',
  };
  return ic(mapa[status] || 'circle-large-outline', `status-${status}${status === 'rodando' ? ' codicon-modifier-spin' : ''}`);
}

function mensagemAgente(a, { titulo, status, tempo, inicio, corpo, acoes = [] }) {
  return h('div', { class: `msg msg-agente st-${status}`, cor: a?.cor || '#8b93a7' },
    h('div', { class: 'msg-avatar', title: a ? `${a.nome} · ${a.motor}${a.modelo ? ` · ${nomeModelo(a.modelo)}` : ''}` : '' }, ic(a?.icone || 'person')),
    h('div', { class: 'msg-conteudo' },
      h('div', { class: 'msg-cabeca' },
        h('strong', {}, a?.nome || 'Agente'),
        a ? h('span', { class: `chip-motor motor-${a.motor}` }, a.modelo ? nomeModelo(a.modelo) : a.motor) : null,
        h('span', { class: 'msg-titulo' }, titulo),
        h('span', { class: 'espaco' }),
        tempo ? h('span', { class: 'msg-tempo', 'data-inicio': inicio || null }, tempo) : null,
        iconeStatus(status)),
      ...corpo.filter(Boolean),
      acoes.some(Boolean) ? h('div', { class: 'msg-acoes' }, acoes.filter(Boolean)) : null));
}

function portao(e) {
  const p = e.pergunta;
  const campo = h('textarea', {
    rows: 2,
    placeholder: {
      aprovar_plano: 'Observação para o time (opcional)', pergunta: 'Tua resposta', falha: 'Orientação para tentar de novo (opcional)', intervencao: 'O que ele deve fazer diferente',
    }[p.tipo],
  });
  const responder = (acao) => api('execucao:responder', e.id, { acao, texto: campo.value.trim() });
  const botoes = {
    aprovar_plano: [['Recusar', 'cancelar'], ['Aprovar e começar', 'aprovar', 'check']],
    pergunta: [['Parar o time', 'cancelar'], ['Responder', 'responder', 'reply', true]],
    falha: [['Parar aqui', 'parar'], ['Tentar de novo', 'tentar', 'debug-restart']],
    intervencao: [['Parar o time', 'cancelar'], ['Pular a tarefa', 'pular'], ['Continuar com isso', 'tentar', 'debug-continue', true]],
  }[p.tipo].map(([rotulo, acao, icone, exigeTexto], i, lista) => h('button', {
    class: `bt${i === lista.length - 1 ? ' bt-principal' : ''}`,
    onclick: () => { if (exigeTexto && !campo.value.trim()) return campo.focus(); responder(acao); },
  }, icone ? ic(icone) : null, rotulo));
  campo.addEventListener('keydown', (ev) => teclaDeChat(ev, () => botoes[botoes.length - 1].click()));
  const caixa = h('div', { class: 'msg-portao' },
    h('h4', {}, ic(p.tipo === 'falha' ? 'warning' : 'bell-dot'), p.tipo === 'aprovar_plano' ? 'Pode começar?' : p.titulo),
    p.tipo !== 'aprovar_plano' ? markdown(p.texto) : h('p', {}, 'Confira o plano acima antes de liberar o time.'),
    p.efeito ? h('p', { class: `msg-efeito${/^Só verificação/.test(p.efeito) ? ' verificacao' : ''}` }, ic(/^Só verificação/.test(p.efeito) ? 'eye' : 'edit'), p.efeito) : null,
    campo,
    h('div', { class: 'msg-acoes direita' }, botoes));
  requestAnimationFrame(() => { if (document.activeElement === document.body) campo.focus(); });
  return caixa;
}

async function intervir(execucao, tarefa) {
  const ok = await api('execucao:intervir', execucao, tarefa);
  if (!ok) aviso('Essa tarefa não está mais rodando.', 'info');
}

/* ---------- Voo: o que cada IA está fazendo agora ---------- */

function desenharVoo() {
  const vivos = vivosDoProjeto();
  const pedidos = vivos.length ? vivos.map((v) => ({ estado: v.estado, eventos: v.eventos, vivo: true })) : S.vendo ? [{ estado: S.vendo, eventos: S.eventos, vivo: false }] : [];
  const janelas = S.uso.claude?.unifiedWindows;
  const pct = (x) => Math.round((x?.utilization || 0) * 100);
  const medidor = (rotulo, valor) => h('div', { class: 'medidor' },
    h('div', { class: 'medidor-topo' }, h('span', {}, rotulo), h('span', {}, `${valor}%`)),
    h('div', { class: `medidor-barra${valor >= 80 ? ' alto' : ''}` }, h('i', { estilo: { width: `${valor}%` } })));

  // Quem está escrevendo e quem espera, somando todos os pedidos do projeto.
  const escrevendo = [];
  const fila = [];
  for (const v of vivos) {
    for (const t of v.estado?.tarefas || []) {
      const a = agentePorId(t.agente, v.estado.time);
      if (!a?.editaArquivos) continue;
      if (t.status === 'rodando') escrevendo.push(a);
      if (t.status === 'na_fila') fila.push(a);
    }
  }

  return h('div', { class: 'voo' },
    h('section', { class: 'voo-bloco voo-uso' },
      h('h4', {}, 'Uso do plano'),
      janelas ? [medidor('Claude · 5 horas', pct(janelas.five_hour)), medidor('Claude · semana', pct(janelas.seven_day))] : h('p', { class: 'mudo pequeno' }, 'Aparece quando um agente do Claude rodar.'),
      S.uso.codex ? h('p', { class: 'mudo pequeno' }, ic('zap'), ` Codex, última chamada: ${((S.uso.codex.input_tokens || 0) + (S.uso.codex.output_tokens || 0)).toLocaleString('pt-BR')} tokens`) : null),
    vivos.length ? h('section', { class: 'voo-bloco voo-trava' },
      h('h4', {}, ic('lock'), 'Escrita nos arquivos'),
      h('p', {}, escrevendo.length ? ['Escrevendo agora: ', escrevendo.map((a) => h('span', { class: 'chip', cor: a.cor }, a.nome))] : 'Ninguém escrevendo agora.'),
      fila.length ? h('p', {}, 'Na fila: ', fila.map((a) => h('span', { class: 'chip', cor: a.cor }, a.nome))) : null) : null,
    pedidos.length ? pedidos.map(cartaoDoPedido) : h('div', { class: 'voo-vazio' }, desenharOrbita(null, { largura: 260, altura: 130 }),
      h('p', { class: 'mudo' }, 'Quando um time estiver trabalhando, cada agente aparece aqui com o que está fazendo, há quanto tempo, quantas ações e quais arquivos.')));
}

function cartaoDoPedido({ estado, eventos, vivo }) {
  const m = metricas(eventos);
  const feitas = estado.tarefas.filter((t) => t.status === 'concluida').length;
  const total = estado.tarefas.length || 1;
  return h('section', { class: 'voo-pedido', cor: estado.timeCor || '#bd93f9' },
    h('header', { class: 'voo-pedido-topo', onclick: () => mostrarExecucao(estado.id).then(() => abrirDireita('orquestra')) },
      h('span', { class: 'chip' }, estado.timeNome),
      h('span', { class: 'voo-pedido-texto', title: estado.pedido }, estado.pedido),
      h('span', { class: `pilula st-${estado.status}` }, ST_EXECUCAO[estado.status] || estado.status)),
    h('div', { class: 'progresso' }, h('i', { estilo: { width: `${Math.round((feitas / total) * 100)}%` } })),
    h('div', { class: 'voo-orbita' }, desenharOrbita(estado, { largura: 280, altura: 120 })),
    h('div', { class: 'cartoes' }, estado.tarefas.map((t) => {
      const a = agentePorId(t.agente, estado.time);
      const x = m.get(t.id);
      const ativo = ['rodando', 'na_fila'].includes(t.status);
      return h('div', { class: `cartao-agente st-${t.status}`, cor: a?.cor || '#8b93a7' },
        h('div', { class: 'cartao-topo' },
          h('span', { class: `msg-avatar pequeno${t.status === 'rodando' ? ' pulsando' : ''}` }, ic(a?.icone || 'person')),
          h('div', { class: 'cartao-quem' }, h('strong', {}, a?.nome || t.agente), h('span', { class: 'mudo' }, `${a?.motor || ''}${a?.modelo ? ` · ${nomeModelo(a.modelo)}` : ''}`)),
          h('span', { class: 'msg-tempo', 'data-inicio': t.status === 'rodando' ? t.inicio : null }, t.inicio ? duracao((t.status === 'rodando' ? Date.now() : t.fim || Date.now()) - t.inicio) : ''),
          iconeStatus(t.status)),
        h('div', { class: 'cartao-tarefa', title: t.titulo }, `${t.id} · ${t.titulo}`),
        t.status === 'rodando' ? h('div', { class: 'cartao-agora mono', title: x?.ultima || '' }, x?.ultima || 'Começando…') : null,
        t.status === 'na_fila' ? h('div', { class: 'cartao-agora' }, 'Esperando a vez de escrever') : null,
        h('div', { class: 'cartao-numeros' },
          h('span', { title: 'Ações (leituras, edições, comandos)' }, ic('symbol-event'), x?.acoes || 0),
          h('span', { title: 'Arquivos criados ou editados' }, ic('file'), x?.arquivos.size || 0),
          x?.avisos ? h('span', { class: 'aviso-num', title: 'Avisos' }, ic('warning'), x.avisos) : null,
          t.voltas ? h('span', { title: 'Voltas de correção' }, ic('debug-restart'), t.voltas) : null,
          t.gastoApi ? h('span', { title: 'Cobrado na chave de API (no plano não tem custo por token)' }, `US$ ${t.gastoApi.toFixed(2)}`) : null),
        h('div', { class: 'cartao-acoes' },
          h('button', { class: 'bt-mini', onclick: () => { mostrarExecucao(estado.id).then(() => { S.filtro = t.id; abrirPainelEm('log'); desenharLog(); }); } }, ic('output'), 'Log'),
          vivo && ativo ? h('button', { class: 'bt-mini', onclick: () => intervir(estado.id, t.id) }, ic('debug-pause'), 'Intervir') : null));
    })),
    vivo ? h('footer', { class: 'voo-pedido-rodape' },
      h('button', { class: 'bt bt-perigo', onclick: () => { if (confirm('Parar este pedido? O que já foi feito nos arquivos fica como está.')) api('execucao:cancelar', estado.id); } }, ic('debug-stop'), 'Parar pedido')) : null);
}

// Relógio: atualiza os tempos sem redesenhar tudo.
setInterval(() => {
  for (const el of document.querySelectorAll('.msg-tempo[data-inicio]')) el.textContent = duracao(Date.now() - Number(el.dataset.inicio));
}, 1000);

/* ---------- log ao vivo (painel de baixo) ---------- */

const passaFiltro = (l) => !S.filtro || l.tarefa === S.filtro;

function linhaLog(l) {
  return h('div', { class: `ev tipo-${l.tipo}`, cor: l.cor || 'var(--mudo)' },
    h('span', { class: 'ev-hora' }, hora(l.hora)),
    h('span', { class: 'ev-quem' }, l.nome),
    h('span', { class: 'ev-texto' }, l.texto));
}

function desenharLog() {
  const box = $('#log');
  const linhas = S.eventos.filter(passaFiltro).slice(-1500);
  box.replaceChildren(...linhas.map(linhaLog));
  if (!linhas.length) box.append(h('div', { class: 'log-vazio' }, S.vendo ? 'Nada registrado ainda.' : 'Quando o time trabalhar, tudo o que cada agente faz aparece aqui.'));
  box.scrollTop = box.scrollHeight;
  desenharAcoesPainel();
}

function anexarLog(l) {
  if (!passaFiltro(l)) return;
  const box = $('#log');
  box.querySelector('.log-vazio')?.remove();
  const noFim = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.append(linhaLog(l));
  if (box.childElementCount > 2000) box.firstElementChild.remove();
  if (noFim) box.scrollTop = box.scrollHeight;
}

/* ---------- pedidos ---------- */

/** Mostra um pedido dentro da conversa dele. */
async function mostrarExecucao(id) {
  const e = S.projeto.execucoes.find((x) => x.id === id) || S.vivos.get(id)?.estado;
  HIST.aberto = null;
  await abrirFio(e?.fio || id, id);
}

async function enviarPedido() {
  const campo = $('#pedido');
  if (!campo || !S.projeto?.montado) return;
  // Comando escrito e não escolhido na lista ("/agente dev faça X"): resolve aqui.
  const m = /^\/(time|agente)\s+(\S+)\s*([\s\S]*)$/i.exec(campo.value.trim());
  if (m) {
    const alvo = m[1].toLowerCase() === 'time'
      ? S.projeto.times.find((t) => nota(t.nome, m[2]) >= 0)
      : agentesParaMencao(m[2])[0];
    if (!alvo) return aviso(`Não achei "${m[2]}".`, 'info');
    if (m[1].toLowerCase() === 'time') definirDestino(alvo.id, null);
    else definirDestino(alvo.t.id, alvo.a.id);
    campo.value = m[3];
  }
  const imagens = anexosParaEnviar('pedido');
  const pedido = campo.value.trim() || (imagens.length ? 'Veja a imagem anexada.' : '');
  if (!pedido) return;
  fecharSugestoes();
  const { t, a } = destino();
  let estado;
  try {
    estado = await api('execucao:iniciar', S.projeto.caminho, t.id, pedido, { agente: a?.id || null, fio: S.fio, somenteLeitura: !!S.soValidar, anexos: imagens });
  } catch {
    return; // as imagens ficam no compositor para tentar de novo
  }
  limparAnexos('pedido');
  const v = garantirVivo({ execucao: estado.id, projeto: S.projeto.caminho });
  v.estado = v.estado || estado;
  S.fio = estado.fio;
  if (!S.fioIds.includes(estado.id)) S.fioIds.push(estado.id);
  S.vendo = v.estado;
  S.eventos = v.eventos;
  S.filtro = null;
  S.abertas.clear();
  campo.value = '';
  S.rascunhoPedido = '';
  await recarregarProjeto();
  desenharTudo();
}

function garantirVivo(ev) {
  let v = S.vivos.get(ev.execucao);
  if (!v) {
    v = { id: ev.execucao, projeto: ev.projeto, eventos: [], rodando: true, estado: null };
    S.vivos.set(ev.execucao, v);
  }
  return v;
}

/** Notificação do sistema com o nome e o ícone do Orbion.ai; o clique traz a janela. */
function notificar(texto) {
  api('app:notificar', 'Orbion.ai', texto).catch(() => {});
}

const redesenharToques = debounce(() => {
  desenharAbas();
  if (S.vista === 'explorador' || S.vista === 'mudancas') desenharLateral();
}, 500);

const redesenharDireita = debounce(() => {
  if (S.direitaAba === 'voo') desenharDireita();
  else atualizarChat();
}, 120);

async function tratarEventoExecucao(ev) {
  if (ev.tipo === 'uso') {
    S.uso[ev.motor] = ev.info;
    if (S.direitaAba === 'voo') redesenharDireita();
    return desenharStatus();
  }
  const v = garantirVivo(ev);
  if (ev.tipo === 'estado') {
    const antes = v.estado?.status;
    v.estado = ev.estado;
    if (S.vendo?.id === ev.estado.id) S.vendo = ev.estado;
    redesenharDireita();
    redesenharToques();
    if (S.vista === 'times') desenharLateral();
    desenharStatus();
    desenharSelos();
    if (antes !== ev.estado.status && ev.estado.status === 'aguardando' && S.projeto?.caminho === ev.projeto) {
      if (!document.hasFocus()) notificar(ev.estado.pergunta?.titulo || 'O time precisa de ti.');
      if (!vendoVivo() || S.vendo?.id !== ev.estado.id) await mostrarExecucao(ev.estado.id);
      abrirDireita('orquestra');
    }
    return;
  }
  if (ev.tipo === 'log') {
    v.eventos.push(ev.linha);
    if (S.vendo?.id === v.id) anexarLog(ev.linha);
    if (['acao', 'sistema', 'texto', 'aviso', 'inicio'].includes(ev.linha.tipo)) redesenharDireita();
    if (ev.linha.tipo === 'acao' && /^(Criando|Editando) /.test(ev.linha.texto)) redesenharToques();
    return;
  }
  if (ev.tipo === 'fim') {
    v.rodando = false;
    v.estado = ev.estado;
    if (S.vendo?.id === ev.estado.id) S.vendo = ev.estado;
    S.fioCache.set(v.id, { estado: ev.estado, eventos: v.eventos }); // continua na conversa depois de terminar
    S.vivos.delete(v.id);
    if (S.projeto?.caminho === ev.projeto) await recarregarProjeto();
    desenharTudo();
    atualizarGit();
    if (!document.hasFocus()) notificar(`${ST_EXECUCAO[ev.estado.status]}: ${ev.estado.pedido.slice(0, 80)}`);
  }
}
