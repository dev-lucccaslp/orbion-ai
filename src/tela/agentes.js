// Times e agentes: criar times (do zero, de modelos ou copiando outro), editar o time
// e editar tudo de cada agente.

const ICONES_AGENTE = [
  'person', 'inbox', 'checklist', 'paintcan', 'code', 'beaker', 'database', 'circuit-board', 'eye', 'book', 'shield', 'bug',
  'server', 'graph', 'rocket', 'tools', 'compass', 'lightbulb', 'telescope', 'milestone', 'zap', 'wand', 'globe', 'key',
  'symbol-class', 'symbol-color', 'comment-discussion', 'dashboard', 'pulse', 'organization', 'robot', 'hubot', 'sparkle', 'terminal',
];
const CORES_TIME = ['#bd93f9', '#8be9fd', '#50fa7b', '#ffb86c', '#ff79c6', '#f1fa8c', '#60a5fa', '#f87171'];
const ESFORCOS = [['', 'Padrão do CLI'], ['low', 'Baixo'], ['medium', 'Médio'], ['high', 'Alto'], ['xhigh', 'Muito alto'], ['max', 'Máximo (só Claude)']];

async function modelosDeAgente() {
  if (!S.modelosAgente) S.modelosAgente = await api('agentes:modelos');
  return S.modelosAgente;
}

function aplicarTimes(lista) {
  S.projeto.times = lista;
  S.projeto.montado = lista.length > 0;
  if (!timeDe(S.timeAtual)) S.timeAtual = lista[0]?.id || null;
}

/* ---------- criar time ---------- */

function abrirMontarTime() {
  if (!S.projeto) return;
  abrirAba({ id: 'montar', tipo: 'montar', titulo: S.projeto.montado ? 'Novo time' : 'Montar o time' });
}
const novoTime = abrirMontarTime;

/* ---------- o modelo de IA de cada agente: detectado no PC e trocável no card ---------- */

/** O Claude Code e o Codex estão instalados e logados? null enquanto não se sabe. */
function motorPronto(motor) {
  if (motor === 'claude' || motor === 'codex') {
    const c = S.situacaoMotores?.find((x) => x.id === motor);
    return c ? !!(c.instalado && c.logado) : null;
  }
  const p = S.provedores?.find((x) => `api:${x.id}` === motor);
  return p ? !!(p.temChave || p.semChave) : false;
}

function situacaoDoMotor(motor) {
  if (motor === 'claude' || motor === 'codex') {
    const c = S.situacaoMotores?.find((x) => x.id === motor);
    if (!c) return 'vendo…';
    return !c.instalado ? 'não instalado' : !c.logado ? 'sem login' : motor === 'claude' ? 'teu plano' : 'tua conta';
  }
  return motorPronto(motor) ? 'API' : 'sem token';
}

/** O primeiro motor que funciona neste PC: Claude Code, depois Codex, depois um provedor por API. */
function melhorMotorDoPc() {
  if (motorPronto('claude')) return 'claude';
  if (motorPronto('codex')) return 'codex';
  const p = S.provedores?.find((x) => x.temChave || x.semChave);
  return p ? `api:${p.id}` : null;
}

const nomeDoMotor = (motor) => (motor === 'claude' ? 'Claude Code' : motor === 'codex' ? 'Codex' : S.provedores?.find((x) => `api:${x.id}` === motor)?.nome || motor.replace(/^api:/, ''));

/** O que o agente vai usar: o que a pessoa escolheu, senão o do modelo, trocado sozinho se não existir neste PC. */
function escolhaDoAgente(aba, m) {
  if (aba.motores[m.id]) return aba.motores[m.id];
  if (motorPronto(m.motor) === false) {
    const melhor = melhorMotorDoPc();
    if (melhor && melhor !== m.motor) return { motor: melhor, modelo: '', auto: `${nomeDoMotor(m.motor)} ${situacaoDoMotor(m.motor)} neste PC` };
  }
  return { motor: m.motor, modelo: m.modelo || '' };
}

/** Os motores e modelos para escolher, como no seletor da Conversa. */
function itensDeModelo(aoEscolher, atual = {}) {
  const lista = (motor, ids, padrao) => ['', ...ids].map((id) => ({
    rotulo: id ? nomeModelo(id) : padrao, detalhe: id ? S.infoModelos?.[id]?.detalhe || (/(:free|-free)$/.test(id) ? 'grátis' : '') : '',
    icone: /(:free|-free)$/.test(id) ? 'gift' : 'circle-small-filled',
    marcado: atual.motor === motor && (atual.modelo || '') === id,
    acao: () => aoEscolher({ motor, modelo: id }),
  }));
  return [
    { rotulo: 'Claude Code', detalhe: situacaoDoMotor('claude'), icone: 'hubot', marcado: atual.motor === 'claude', filhos: lista('claude', S.modelos?.claude || [], 'Padrão do Claude Code') },
    { rotulo: 'Codex', detalhe: situacaoDoMotor('codex'), icone: 'terminal', marcado: atual.motor === 'codex', filhos: lista('codex', S.modelos?.codex || [], 'Padrão do Codex') },
    ...(S.provedores || []).map((p) => ({
      rotulo: p.nome, detalhe: situacaoDoMotor(`api:${p.id}`), icone: 'key', marcado: atual.motor === `api:${p.id}`,
      filhos: lista(`api:${p.id}`, (p.modelos?.length ? p.modelos.slice(0, 40) : [p.modelo]).filter(Boolean), p.modelo ? `Padrão (${p.modelo})` : 'Padrão do provedor'),
    })),
    '-',
    { rotulo: 'Contas e modelos…', icone: 'account', acao: abrirContas },
  ];
}

/** Descobre uma vez o que existe neste PC (CLIs logados e provedores por API). */
async function conhecerMotoresDoPc() {
  if (S.situacaoMotores && S.provedores) return false;
  await Promise.all([
    S.situacaoMotores ? null : api('contas:situacao').then((s) => { S.situacaoMotores = s; }).catch(() => { S.situacaoMotores = []; }),
    S.provedores ? null : carregarProvedores().catch(() => {}),
  ]);
  return true;
}

PAGINAS.montar = {
  icone: () => ic('organization', 'icone-orquestra'),
  async desenhar(aba, host) {
    const vez = (aba.vez = (aba.vez || 0) + 1);
    const modelos = await modelosDeAgente();
    if (vez !== aba.vez || !host.isConnected) return; // outro desenho começou enquanto este esperava
    const primeiro = !S.projeto.montado;
    aba.marcados ??= new Set(modelos.filter((m) => m.padrao).map((m) => m.id));
    aba.motores ??= {}; // agente → { motor, modelo } que a pessoa escolheu no card
    // Na primeira vez, vê o que existe neste PC e redesenha com o modelo certo em cada card.
    if (!S.situacaoMotores || !S.provedores) conhecerMotoresDoPc().then((mudou) => { if (mudou && S.ativa === aba.id) redesenharPagina(aba); });
    aba.cor ??= CORES_TIME.find((c) => !S.projeto.times.some((t) => t.cor === c)) || CORES_TIME[0];
    const nome = h('input', { valor: aba.nome ?? (primeiro ? traduzir('Time principal') : `${traduzir('Time')} ${S.projeto.times.length + 1}`), maxlength: 40 }); // campo não passa pela tradução da página
    nome.addEventListener('input', () => { aba.nome = nome.value; });
    const descricao = h('input', { valor: aba.descricao || '', placeholder: 'Ex.: cuida do front-end; ou: só revisão e testes' });
    descricao.addEventListener('input', () => { aba.descricao = descricao.value; });
    const cores = h('div', { class: 'grade-cores' }, CORES_TIME.map((c) => h('button', {
      type: 'button', class: `bt-cor${aba.cor === c ? ' marcado' : ''}`, cor: c, title: c,
      onclick: (e) => { aba.cor = c; e.currentTarget.parentElement.querySelectorAll('.bt-cor').forEach((b) => b.classList.toggle('marcado', b === e.currentTarget)); },
    })));

    const chipModelo = (m) => {
      const e = escolhaDoAgente(aba, m);
      const pronto = motorPronto(e.motor);
      return h('button', {
        type: 'button',
        class: `chip-modelo${pronto === false ? ' indisponivel' : ''}`,
        title: [e.auto ? `Trocado sozinho: ${e.auto}.` : '', pronto === false ? `${nomeDoMotor(e.motor)}: ${situacaoDoMotor(e.motor)}.` : '', 'Clique para trocar o modelo de IA.'].filter(Boolean).join(' '),
        onclick: (ev) => {
          ev.preventDefault(); // o card é um label: o clique não pode marcar/desmarcar o agente
          ev.stopPropagation();
          abrirPopover(ev.currentTarget, itensDeModelo((escolha) => { aba.motores[m.id] = escolha; redesenharPagina(aba); }, e));
        },
      },
      h('i', { class: `ponto-motor${pronto ? ' ok' : pronto === false ? ' falta' : ''}` }),
      h('span', {}, nomeDoMotor(e.motor)),
      h('span', { class: 'chip-modelo-qual' }, e.modelo ? nomeModelo(e.modelo) : 'padrão'),
      e.auto ? h('span', { class: 'chip-auto' }, 'auto') : null,
      ic('chevron-down'));
    };

    const cartao = (m) => {
      const caixa = h('input', { type: 'checkbox', checked: aba.marcados.has(m.id), disabled: m.id === 'receptor' });
      caixa.addEventListener('change', () => { if (caixa.checked) aba.marcados.add(m.id); else aba.marcados.delete(m.id); trocarOrbita(); });
      return h('label', { class: `cartao-modelo${m.id === 'receptor' ? ' fixo' : ''}`, cor: m.cor },
        caixa,
        h('span', { class: 'cartao-icone' }, ic(m.icone)),
        h('span', { class: 'cartao-texto' },
          h('strong', {}, m.nome, m.papel !== 'executor' ? h('span', { class: `tag-papel papel-${m.papel}` }, PAPEL[m.papel]) : null),
          h('span', {}, m.descricao),
          chipModelo(m)));
    };

    const criar = async (origem) => {
      // O modelo de cada agente (o escolhido no card, ou o trocado sozinho porque o padrão não existe neste PC).
      const motores = Array.isArray(origem) || origem === 'vazio'
        ? Object.fromEntries(modelos.filter((m) => m.id === 'receptor' || (Array.isArray(origem) && origem.includes(m.id)))
          .map((m) => [m.id, escolhaDoAgente(aba, m)]).filter(([, e]) => e.motor)
          .map(([id, e]) => [id, { motor: e.motor, modelo: e.modelo || '' }]))
        : {};
      const r = await api('time:criar', S.projeto.caminho, { nome: nome.value.trim() || 'Novo time', cor: aba.cor, descricao: descricao.value.trim(), origem, motores });
      aplicarTimes(r.times);
      S.timeAtual = r.id;
      guardarTimeAtual();
      await carregarPasta('');
      fecharAba('montar', true);
      S.vista = 'times';
      desenharTudo();
      abrirDireita('orquestra');
      aviso(`${timeDe(r.id).nome} criado com ${timeDe(r.id).agentes.length} agente(s).`, 'ok');
    };

    const orbitaDoTime = () => desenharOrbita(null, {
      largura: 320, altura: 240,
      agentes: modelos.filter((m) => m.id === 'receptor' || aba.marcados.has(m.id)).map((m) => ({ id: m.id, nome: m.nome, papel: m.papel, cor: m.cor, motor: m.motor })),
    });
    let orbita = orbitaDoTime();
    const trocarOrbita = () => { const nova = orbitaDoTime(); orbita.replaceWith(nova); orbita = nova; };
    const anel = (n, texto) => h('li', {}, h('span', { class: 'anel-numero' }, n), texto);

    host.append(h('div', { class: 'pagina pagina-estreita' },
      h('div', { class: 'boas-vindas-topo' }, orbita, h('div', { class: 'boas-vindas-texto' },
        h('h1', {}, primeiro ? 'Monte o time deste projeto' : 'Novo time'),
        h('p', { class: 'mudo' }, 'Um projeto pode ter quantos times tu quiser (por exemplo: Front, API, QA), e times diferentes podem trabalhar ao mesmo tempo. Escolha com quais agentes este começa; depois dá para mudar tudo.'),
        h('ol', { class: 'legenda-aneis' },
          anel('1', 'O Receptor recebe o pedido e monta o plano'),
          anel('2', 'Os executores fazem'),
          anel('3', 'Os verificadores conferem e devolvem se precisar')))),
      h('section', { class: 'grupo' },
        h('div', { class: 'grade-campos' },
          campo('Nome do time', null, nome),
          campo('Descrição', 'Opcional. Ajuda a lembrar para que serve.', descricao),
          h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, 'Cor'), cores))),
      h('section', { class: 'grupo' },
        h('div', { class: 'grupo-topo' },
          h('h2', {}, 'Agentes'),
          h('span', { class: 'espaco' }),
          h('button', {
            type: 'button', class: 'bt bt-mini', title: 'Usar o mesmo modelo de IA em todos os agentes',
            onclick: (ev) => abrirPopover(ev.currentTarget, itensDeModelo((escolha) => { for (const m of modelos) aba.motores[m.id] = escolha; redesenharPagina(aba); })),
          }, ic('sparkle'), 'Mesmo modelo para todos')),
        h('p', { class: 'campo-dica' }, resumoDosMotores()),
        h('div', { class: 'grade-modelos' }, modelos.map(cartao)),
        h('div', { class: 'linha-botoes' },
          h('button', { class: 'bt', onclick: () => criar('vazio') }, 'Só com o Receptor'),
          h('button', { class: 'bt bt-principal', onclick: () => criar([...aba.marcados]) }, ic('organization'), 'Criar o time'))),
      S.projeto.times.length || S.config.projetos.length > 1 ? h('section', { class: 'grupo' },
        h('h2', {}, 'Ou copie um time que já existe'),
        h('div', { class: 'lista-prompts' },
          S.projeto.times.map((t) => h('div', { class: 'linha-prompt' },
            h('i', { class: 'bolinha', cor: t.cor }), h('strong', {}, t.nome), h('span', { class: 'mudo' }, `${t.agentes.length} agentes, deste projeto`),
            h('span', { class: 'espaco' }),
            h('button', { class: 'bt', onclick: () => criar({ projeto: S.projeto.caminho, time: t.id }) }, ic('copy'), 'Copiar'))),
          S.config.projetos.length > 1 ? h('div', { class: 'linha-prompt' }, ic('folder'), h('span', {}, 'De outro projeto'), h('span', { class: 'espaco' }),
            h('button', { class: 'bt', onclick: () => copiarDeOutroProjeto(criar) }, ic('search'), 'Escolher…')) : null)) : null));
    requestAnimationFrame(() => nome.focus());
  },
};

/** "Neste PC: Claude Code logado · Codex não instalado · 1 provedor por API". */
function resumoDosMotores() {
  if (!S.situacaoMotores) return 'Vendo quais modelos de IA existem neste PC…';
  const cli = ['claude', 'codex'].map((m) => `${nomeDoMotor(m)} ${traduzir(motorPronto(m) ? 'pronto' : situacaoDoMotor(m))}`);
  const api_ = (S.provedores || []).filter((p) => p.temChave || p.semChave).length;
  const porApi = api_ ? traduzir(api_ === 1 ? '1 provedor por API' : `${api_} provedores por API`) : null;
  return `Neste PC: ${[...cli, porApi].filter(Boolean).join(' · ')}. Cada agente já vem com um que funciona aqui; clique no modelo do card para trocar.`;
}

function copiarDeOutroProjeto(criar) {
  const outros = S.config.projetos.filter((p) => p !== S.projeto.caminho);
  abrirPaleta({
    placeholder: 'De qual projeto?',
    itens: (busca) => outros.filter((p) => nota(p, busca) >= 0).map((p) => ({ rotulo: p.split(/[\\/]/).pop(), detalhe: p, icone: 'folder', p })),
    aoEscolher: async (it) => {
      const lista = await api('times:deOutroProjeto', it.p);
      if (!lista.length) return aviso('Esse projeto ainda não tem times.', 'info');
      abrirPaleta({
        placeholder: 'Qual time copiar?',
        itens: () => lista.map((t) => ({ rotulo: t.nome, detalhe: `${t.agentes} agentes`, icone: 'organization', cor: t.cor, t })),
        aoEscolher: (x) => criar({ projeto: it.p, time: x.t.id }),
      });
    },
  });
}

/* ---------- editar time ---------- */

function abrirTime(id) {
  const t = timeDe(id);
  if (!t) return;
  abrirAba({ id: `time:${id}`, tipo: 'time', titulo: t.nome, timeId: id, rascunho: { nome: t.nome, cor: t.cor, descricao: t.descricao }, sujo: false });
}

PAGINAS.time = {
  icone: (aba) => h('span', { class: 'icone-aba-agente', cor: aba.rascunho.cor }, ic('organization')),
  desenhar(aba, host) {
    const t = timeDe(aba.timeId);
    if (!t) return host.append(h('div', { class: 'pagina' }, h('p', {}, 'Esse time não existe mais.')));
    const r = aba.rascunho;
    const nome = h('input', { valor: r.nome, maxlength: 40 });
    nome.addEventListener('input', () => { r.nome = nome.value; marcarSuja(aba); });
    const desc = h('input', { valor: r.descricao });
    desc.addEventListener('input', () => { r.descricao = desc.value; marcarSuja(aba); });
    const cores = h('div', { class: 'grade-cores' }, CORES_TIME.map((c) => h('button', {
      type: 'button', class: `bt-cor${r.cor === c ? ' marcado' : ''}`, cor: c,
      onclick: (e) => { r.cor = c; marcarSuja(aba); e.currentTarget.parentElement.querySelectorAll('.bt-cor').forEach((b) => b.classList.toggle('marcado', b === e.currentTarget)); },
    })));
    const ocupado = vivosDoProjeto().some((v) => v.estado?.time === t.id);
    host.append(h('div', { class: 'pagina' },
      h('header', { class: 'agente-topo', cor: r.cor },
        h('span', { class: 'agente-icone-grande' }, ic('organization')),
        h('div', { class: 'agente-titulo' }, h('h1', {}, r.nome || 'Sem nome'), h('span', { class: 'mudo mono' }, `.orbion/times/${t.id}`)),
        h('div', { class: 'agente-acoes' },
          h('button', { class: 'bt', onclick: () => novoPedido(t.id) }, ic('comment-discussion'), 'Pedido para este time'),
          h('button', { class: 'bt-icone perigo', title: 'Mandar o time para a lixeira', onclick: () => excluirTime(aba) }, ic('trash')),
          h('button', { class: 'bt bt-principal', id: 'bt-salvar-agente', disabled: !aba.sujo, onclick: () => salvarAba(aba) }, ic('save'), 'Salvar'))),
      ocupado ? h('p', { class: 'faixa-info' }, ic('loading', 'codicon-modifier-spin'), 'Este time está trabalhando num pedido agora.') : null,
      h('section', { class: 'grupo' },
        h('h2', {}, 'Time'),
        h('div', { class: 'grade-campos' }, campo('Nome', null, nome), campo('Descrição', null, desc), h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, 'Cor'), cores))),
      h('section', { class: 'grupo' },
        h('h2', {}, `Agentes (${t.agentes.length})`),
        h('div', { class: 'grade-modelos' }, t.agentes.map((a) => h('div', { class: `cartao-modelo${a.ativo ? '' : ' inativo'}`, cor: a.cor, onclick: () => abrirAgente(t.id, a.id) },
          h('span', { class: 'cartao-icone' }, ic(a.icone)),
          h('span', { class: 'cartao-texto' },
            h('strong', {}, a.nome, a.papel !== 'executor' ? h('span', { class: `tag-papel papel-${a.papel}` }, PAPEL[a.papel]) : null, !a.ativo ? h('span', { class: 'tag-inativo' }, 'desligado') : null),
            h('span', {}, a.descricao),
            h('span', { class: 'chip-motor' }, a.modelo ? `${a.motor} · ${nomeModelo(a.modelo)}` : a.motor)),
          h('span', {})))),
        h('div', { class: 'linha-botoes' }, h('button', { class: 'bt bt-principal', onclick: () => novoAgente(t.id) }, ic('add'), 'Criar agente neste time')))));
  },
  async salvar(aba) {
    aplicarTimes(await api('time:salvar', S.projeto.caminho, aba.timeId, aba.rascunho));
    aba.sujo = false;
    aba.titulo = aba.rascunho.nome;
    aviso('Time salvo.', 'ok');
    desenharTudo();
    redesenharPagina(aba);
  },
};

async function excluirTime(aba) {
  const t = timeDe(aba.timeId);
  if (!confirm(`Mandar o time "${t.nome}" e os ${t.agentes.length} agentes dele para a lixeira? Dá para recuperar de lá.`)) return;
  try {
    aplicarTimes(await api('time:excluir', S.projeto.caminho, aba.timeId));
  } catch {
    return;
  }
  for (const a of S.abas.filter((x) => x.id === aba.id || x.time === aba.timeId)) fecharAba(a.id, true);
  desenharTudo();
}

/* ---------- criar, duplicar, copiar, prévia ---------- */

async function novoAgente(time = S.timeAtual) {
  if (!S.projeto?.montado) return abrirMontarTime();
  const modelos = await modelosDeAgente();
  const t = timeDe(time) || S.projeto.times[0];
  abrirPaleta({
    placeholder: `Criar agente no ${t.nome} a partir de um modelo`,
    itens: (busca) => [
      { rotulo: 'Em branco', detalhe: 'Começar do zero', icone: 'new-file', id: 'branco' },
      ...modelos.map((m) => ({ rotulo: m.nome, detalhe: m.descricao, icone: m.icone, cor: m.cor, id: m.id })),
    ].filter((x) => nota(`${x.rotulo} ${x.detalhe}`, busca) >= 0),
    aoEscolher: (item) => pedirTexto({
      placeholder: 'Nome do agente (ex.: DBA Postgres, Dev Front, QA Mobile)',
      valor: item.id === 'branco' ? '' : item.rotulo,
      aoConfirmar: async (nome) => {
        const r = await api('agente:criar', S.projeto.caminho, t.id, item.id, nome.trim());
        aplicarTimes(r.times);
        desenharTudo();
        abrirAgente(t.id, r.id);
      },
    }),
  });
}

async function duplicarAgente(time, id) {
  const r = await api('agente:duplicar', S.projeto.caminho, time, id);
  aplicarTimes(r.times);
  desenharTudo();
  abrirAgente(time, r.id);
}

function copiarAgenteParaOutroTime(time, a) {
  abrirPaleta({
    placeholder: `Copiar ${a.nome} para qual time?`,
    itens: () => S.projeto.times.filter((t) => t.id !== time).map((t) => ({ rotulo: t.nome, icone: 'organization', cor: t.cor, id: t.id })),
    aoEscolher: async (it) => {
      aplicarTimes(await api('agente:copiarPara', S.projeto.caminho, time, a.id, it.id));
      desenharTudo();
      aviso(`${a.nome} copiado para ${it.rotulo}.`, 'ok');
    },
  });
}

async function previaAgente(time, id) {
  const texto = await api('agente:previa', S.projeto.caminho, time, id);
  const a = agentesDe(time).find((x) => x.id === id);
  abrirTextoSomenteLeitura(`previa:${time}/${id}`, `Prompt: ${a?.nome || id}`, texto);
}

/* ---------- editor de agente ---------- */

function abrirAgente(time, id) {
  const a = agentesDe(time).find((x) => x.id === id);
  if (!a) return;
  abrirAba({ id: `agente:${time}/${id}`, tipo: 'agente', titulo: a.nome, time, agenteId: id, rascunho: structuredClone(a), sujo: false });
}

function campo(rotulo, dica, controle) {
  return h('label', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, rotulo), dica ? h('span', { class: 'campo-dica' }, dica) : null, controle);
}

function entrada(aba, chave, props = {}) {
  const el = h('input', { ...props, valor: aba.rascunho[chave] ?? '' });
  el.addEventListener('input', () => {
    aba.rascunho[chave] = props.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    marcarSuja(aba);
  });
  return el;
}

function caixa(aba, chave, texto) {
  const el = h('input', { type: 'checkbox', checked: !!aba.rascunho[chave] });
  el.addEventListener('change', () => { aba.rascunho[chave] = el.checked; marcarSuja(aba); redesenharPagina(aba); });
  return h('label', { class: 'caixa' }, el, h('span', {}, texto));
}

function escolha(aba, chave, opcoes, aoMudar) {
  const el = h('select', {}, opcoes.map(([v, r]) => h('option', { value: v, selected: (aba.rascunho[chave] ?? '') === v }, r)));
  el.addEventListener('change', () => { aba.rascunho[chave] = el.value; marcarSuja(aba); aoMudar?.(); });
  return el;
}

function marcarSuja(aba) {
  if (!aba.sujo) {
    aba.sujo = true;
    desenharAbas();
  }
  const b = $('#bt-salvar-agente');
  if (b) b.disabled = false;
}

function redesenharPagina(aba) {
  if (S.ativa !== aba.id) return;
  const pg = $('#host-pagina');
  const rolagem = pg.scrollTop;
  PAGINAS[aba.tipo].sair?.(aba);
  pg.replaceChildren();
  PAGINAS[aba.tipo].desenhar(aba, pg);
  pg.scrollTop = rolagem;
}

PAGINAS.agente = {
  icone: (aba) => h('span', { class: 'icone-aba-agente', cor: aba.rascunho.cor }, ic(aba.rascunho.icone)),
  desenhar(aba, host) {
    const a = aba.rascunho;
    const time = timeDe(aba.time);
    if (!S.skills) api('skills:listar', S.projeto.caminho).then((s) => { S.skills = s; redesenharPagina(aba); });
    if (!aba.prompts) api('prompts:listar', S.projeto.caminho).then((p) => { aba.prompts = p; redesenharPagina(aba); });

    const papelCartao = (valor, titulo, texto, icone) => h('label', { class: `cartao-papel${a.papel === valor ? ' marcado' : ''}` },
      h('input', { type: 'radio', name: 'papel', checked: a.papel === valor, onchange: () => { a.papel = valor; marcarSuja(aba); redesenharPagina(aba); } }),
      ic(icone), h('strong', {}, titulo), h('span', {}, texto));

    const icones = h('div', { class: 'grade-icones' }, ICONES_AGENTE.map((nome) => h('button', {
      type: 'button', class: `bt-icone-escolha${a.icone === nome ? ' marcado' : ''}`, title: nome,
      onclick: () => { a.icone = nome; marcarSuja(aba); redesenharPagina(aba); },
    }, ic(nome))));

    const busca = h('input', { type: 'search', placeholder: 'Procurar entre as skills instaladas', valor: aba.buscaSkills || '' });
    const caixaSkills = h('div', { class: 'lista-skills' });
    const desenharSkills = () => {
      const termo = (aba.buscaSkills || '').toLowerCase();
      const todas = S.skills || [];
      const nomes = new Set(todas.map((s) => s.nome));
      const faltando = a.skills.filter((n) => !nomes.has(n));
      const lista = todas.filter((s) => !termo || `${s.nome} ${s.descricao}`.toLowerCase().includes(termo))
        .sort((x, y) => a.skills.includes(y.nome) - a.skills.includes(x.nome));
      caixaSkills.replaceChildren(...[
        ...faltando.map((n) => h('div', { class: 'skill faltando' }, ic('warning'), `${n}: não encontrei esta skill neste PC`)),
        ...lista.map((s) => {
          const c = h('input', { type: 'checkbox', checked: a.skills.includes(s.nome) });
          c.addEventListener('change', () => {
            a.skills = c.checked ? [...a.skills, s.nome] : a.skills.filter((n) => n !== s.nome);
            marcarSuja(aba);
          });
          return h('label', { class: 'skill', title: s.descricao }, c, h('span', { class: 'skill-nome' }, s.nome), h('span', { class: 'skill-desc' }, s.descricao));
        }),
        !todas.length ? h('div', { class: 'mudo' }, S.skills ? 'Nenhuma skill instalada encontrada.' : 'Procurando skills…') : null,
      ].filter(Boolean));
    };
    busca.addEventListener('input', () => { aba.buscaSkills = busca.value; desenharSkills(); });
    desenharSkills();

    const nomePrompt = a.papel === 'receptor' ? 'receptor.md' : 'tarefa.md';
    const opcoesPrompt = [['', `Padrão do projeto (${nomePrompt})`], ...(aba.prompts || []).filter((p) => !p.padrao).map((p) => [p.nome, p.nome]),
      ...(a.modeloPrompt && !(aba.prompts || []).some((p) => p.nome === a.modeloPrompt) ? [[a.modeloPrompt, `${a.modeloPrompt} (não existe ainda)`]] : [])];

    const hostInstrucoes = h('div', { class: 'editor-instrucoes' });
    const derivadas = ['Read', 'Glob', 'Grep', ...(a.editaArquivos ? ['Edit', 'Write'] : []), ...(a.rodaComandos ? ['PowerShell', 'Bash'] : [])].join(',');
    const rel = `.orbion/times/${aba.time}/agentes/${aba.agenteId}.md`;

    host.append(h('div', { class: 'pagina pagina-agente' },
      h('header', { class: 'agente-topo', cor: a.cor },
        h('span', { class: 'agente-icone-grande' }, ic(a.icone)),
        h('div', { class: 'agente-titulo' },
          h('h1', {}, a.nome || 'Sem nome', !a.ativo ? h('span', { class: 'tag-inativo' }, 'desligado') : null),
          h('span', { class: 'mudo' }, h('i', { class: 'bolinha', cor: time?.cor }), ` ${time?.nome || aba.time} · `, h('span', { class: 'mono' }, rel))),
        h('div', { class: 'agente-acoes' },
          h('button', { class: 'bt', title: 'Ver o prompt completo que este agente recebe', onclick: () => previaAgente(aba.time, aba.agenteId) }, ic('eye'), 'Prévia do prompt'),
          h('button', { class: 'bt-icone', title: 'Duplicar', onclick: () => duplicarAgente(aba.time, aba.agenteId) }, ic('copy')),
          S.projeto.times.length > 1 ? h('button', { class: 'bt-icone', title: 'Copiar para outro time', onclick: () => copiarAgenteParaOutroTime(aba.time, a) }, ic('arrow-swap')) : null,
          h('button', { class: 'bt-icone', title: 'Abrir o arquivo .md', onclick: () => abrirArquivo(rel) }, ic('go-to-file')),
          h('button', { class: 'bt-icone perigo', title: 'Mandar para a lixeira', onclick: () => excluirAgente(aba) }, ic('trash')),
          h('button', { class: 'bt bt-principal', id: 'bt-salvar-agente', disabled: !aba.sujo, onclick: () => salvarAba(aba) }, ic('save'), 'Salvar'))),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Identidade'),
        h('div', { class: 'grade-campos' },
          campo('Nome', null, entrada(aba, 'nome', { maxlength: 40 })),
          campo('Cor', null, entrada(aba, 'cor', { type: 'color' })),
          campo('Ordem na lista', null, entrada(aba, 'ordem', { type: 'number', min: 0, max: 99 })),
          h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, 'Situação'), caixa(aba, 'ativo', 'Ligado (o Receptor pode chamar)'))),
        campo('Descrição', 'O Receptor lê isto para decidir quando chamar este agente.', (() => {
          const t = h('textarea', { rows: 2, valor: a.descricao });
          t.addEventListener('input', () => { a.descricao = t.value; marcarSuja(aba); });
          return t;
        })()),
        h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, 'Ícone'), icones)),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Papel no fluxo'),
        h('div', { class: 'grade-papeis' },
          papelCartao('receptor', 'Receptor', 'Lê o pedido e monta o plano. Só um por time.', 'inbox'),
          papelCartao('executor', 'Executor', 'Faz as tarefas que o Receptor passar para ele.', 'tools'),
          papelCartao('verificador', 'Verificador', 'Confere o trabalho dos outros e pode devolver para correção.', 'beaker'))),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Motor'),
        h('div', { class: 'grade-campos' },
          campo('Motor', h('span', {}, 'Assinatura (CLI) ou modelo por token. ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); abrirContas(); } }, 'Contas e modelos')),
            escolha(aba, 'motor', [['claude', 'Claude Code (assinatura)'], ['codex', 'Codex (assinatura)'], ...(S.provedores || []).map((p) => [`api:${p.id}`, `${p.nome} (API)`]),
              ...(a.motor.startsWith('api:') && !(S.provedores || []).some((p) => `api:${p.id}` === a.motor) ? [[a.motor, `${a.motor} (não cadastrado)`]] : [])], () => { a.modelo = ''; redesenharPagina(aba); })),
          campo('Modelo', a.motor.startsWith('api:') && !(S.modelos?.[a.motor] || []).length ? h('span', {}, 'Teste o provedor em ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); abrirContas(); } }, 'Contas e modelos'), ' para listar os modelos.') : null,
            seletorModelo(a.motor, a.modelo, (v) => { a.modelo = v; marcarSuja(aba); redesenharPagina(aba); })),
          campo('Esforço de raciocínio', null, escolha(aba, 'esforco', ESFORCOS)),
          campo('Tempo máximo (min)', 'Vazio usa o do projeto. 0 é sem limite.', entrada(aba, 'tempoMax', { type: 'number', min: 0, max: 600, placeholder: S.projeto.config?.tempoMaxMin ? String(S.projeto.config.tempoMaxMin) : 'sem limite' }))),
        ),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Permissões'),
        h('div', { class: 'linha-caixas' },
          caixa(aba, 'editaArquivos', 'Pode criar e editar arquivos (entra na fila de escrita)'),
          caixa(aba, 'rodaComandos', 'Pode rodar comandos no terminal')),
        a.motor === 'claude'
          ? campo('Ferramentas do Claude', 'Vazio usa as das permissões acima. Aceita regras como Bash(npm *).', entrada(aba, 'ferramentas', { placeholder: derivadas, class: 'mono' }))
          : a.motor === 'codex'
            ? h('p', { class: 'campo-dica' }, `No Codex as permissões viram o modo de sandbox: ${a.editaArquivos || a.rodaComandos ? 'workspace-write (lê tudo, escreve no projeto)' : 'read-only (só lê)'}.`)
            : h('p', { class: 'campo-dica' }, `No modelo por API, o Orbion dá as ferramentas: ler, listar e buscar sempre${a.editaArquivos ? '; escrever e substituir texto' : ''}${a.rodaComandos ? '; rodar comandos' : ''}. O modelo precisa aceitar ferramentas (function calling).`),
        !a.motor.startsWith('api:') ? campo('Argumentos extras do CLI', `Vão direto para o ${a.motor === 'codex' ? 'codex exec' : 'claude -p'}. Para quem sabe o que está fazendo.`, entrada(aba, 'argsExtras', { class: 'mono', placeholder: a.motor === 'codex' ? '-c model_verbosity="low"' : '--fallback-model sonnet' })) : null),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Skills'),
        h('p', { class: 'campo-dica' }, 'O agente lê o SKILL.md de cada skill marcada antes de começar. Vale para o Claude e para o Codex.'),
        busca, caixaSkills),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Prompt'),
        h('div', { class: 'grade-campos' },
          campo('Modelo do prompt', 'O texto em volta das instruções: regras, contexto, memória, tarefa e formato do passe.', escolha(aba, 'modeloPrompt', opcoesPrompt)),
          h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, ' '),
            h('div', { class: 'linha-botoes esquerda' },
              h('button', { class: 'bt', onclick: () => editarModeloPrompt(a.modeloPrompt || nomePrompt) }, ic('edit'), 'Editar modelo'),
              h('button', { class: 'bt', onclick: () => novoModeloPrompt(aba) }, ic('add'), 'Novo modelo só para ele')))),
        h('div', { class: 'campo' },
          h('span', { class: 'campo-rotulo' }, 'Instruções do papel'),
          h('span', { class: 'campo-dica' }, 'Entram no lugar de {{agente.instrucoes}} no modelo. Markdown.'),
          hostInstrucoes))));

    // As instruções ficam num editor de verdade (Monaco), com o modelo guardado na aba.
    if (!aba.modeloInstrucoes) {
      aba.modeloInstrucoes = monaco.editor.createModel(a.instrucoes || '', 'markdown');
      aba.modeloInstrucoes.onDidChangeContent(() => { a.instrucoes = aba.modeloInstrucoes.getValue(); marcarSuja(aba); });
    }
    aba.editorInstrucoes = monaco.editor.create(hostInstrucoes, {
      ...opcoesEditor(), model: aba.modeloInstrucoes, minimap: { enabled: false }, wordWrap: 'on', lineNumbers: 'off', stickyScroll: { enabled: false },
      scrollBeyondLastLine: false, glyphMargin: false, folding: false, lineDecorationsWidth: 8,
    });
    aba.editorInstrucoes.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => salvarAba(aba));
  },
  sair(aba) {
    aba.editorInstrucoes?.dispose();
    aba.editorInstrucoes = null;
  },
  fechar(aba) {
    aba.editorInstrucoes?.dispose();
    aba.modeloInstrucoes?.dispose();
  },
  async salvar(aba) {
    const a = aba.rascunho;
    if (!a.nome.trim()) return aviso('Dê um nome para o agente.');
    aplicarTimes(await api('agente:salvar', S.projeto.caminho, aba.time, aba.agenteId, { ...a, nome: a.nome.trim() }));
    aba.sujo = false;
    aba.titulo = a.nome.trim();
    aviso(`${aba.titulo} salvo.`, 'ok');
    desenharTudo();
    redesenharPagina(aba);
  },
};

async function excluirAgente(aba) {
  if (!confirm(`Mandar ${aba.rascunho.nome} para a lixeira? Dá para recuperar de lá.`)) return;
  try {
    aplicarTimes(await api('agente:excluir', S.projeto.caminho, aba.time, aba.agenteId));
  } catch {
    return;
  }
  fecharAba(aba.id, true);
  desenharTudo();
}

async function editarModeloPrompt(nome) {
  const rel = await api('prompts:garantir', S.projeto.caminho, nome);
  await carregarPasta('.orbion');
  await carregarPasta('.orbion/prompts');
  abrirArquivo(rel);
}

function novoModeloPrompt(aba) {
  const base = aba.rascunho.papel === 'receptor' ? 'receptor.md' : 'tarefa.md';
  pedirTexto({
    placeholder: 'Nome do modelo (ex.: tarefa-dev.md)',
    valor: `${base.replace('.md', '')}-${aba.agenteId}.md`,
    aoConfirmar: async (nome) => {
      const n = nome.trim().toLowerCase().endsWith('.md') ? nome.trim().toLowerCase() : `${nome.trim().toLowerCase()}.md`;
      const rel = await api('prompts:garantir', S.projeto.caminho, n, base);
      aba.rascunho.modeloPrompt = n;
      aba.prompts = await api('prompts:listar', S.projeto.caminho);
      marcarSuja(aba);
      redesenharPagina(aba);
      abrirArquivo(rel);
    },
  });
}
