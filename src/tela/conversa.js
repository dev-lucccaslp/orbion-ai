// Aba Conversa: falar sobre o projeto com uma IA que lê os arquivos (sem alterar nada),
// num modo escolhido (livre, grill-me, planejar-projeto, qualquer skill) e no motor escolhido.

const CV = { atual: null, rodando: false, parcial: '', acoes: [], lista: [] };

const rotuloMotor = (motor, modelo) => {
  if (!motor || motor === 'claude') return `Claude${modelo ? ` · ${nomeModelo(modelo)}` : ''}`;
  const p = S.provedores?.find((x) => `api:${x.id}` === motor);
  return `${p?.nome || motor.replace(/^api:/, '')}${modelo ? ` · ${modelo}` : ''}`;
};

function preferenciaConversa() {
  return { modo: CV.modo ?? '', motor: CV.motor || S.config.assistente?.motor || 'claude', modelo: CV.modelo ?? S.config.assistente?.modelo ?? '' };
}

/** Ao abrir um projeto, a Conversa volta na última conversa dele (como no Claude). */
async function carregarUltimaConversa() {
  CV.atual = null;
  CV.parcial = '';
  CV.rascunho = '';
  try {
    const ultima = (await api('conversa:listar', S.projeto.caminho)).find((c) => c.mensagens);
    if (ultima) CV.atual = await api('conversa:ler', S.projeto.caminho, ultima.id);
  } catch {}
}

async function iniciarConversa(modo = '') {
  HIST.aberto = null;
  CV.atual = null;
  CV.modo = modo;
  CV.parcial = '';
  abrirDireita('conversa');
  requestAnimationFrame(() => $('#conversa-campo')?.focus());
}

function desenharConversa() {
  const corpo = h('div', { class: 'chat conversa' });
  const pref = CV.atual ? { modo: CV.atual.modo, motor: CV.atual.motor, modelo: CV.atual.modelo } : preferenciaConversa();
  const campo = h('textarea', {
    id: 'conversa-campo', rows: 3,
    placeholder: `${pref.modo === 'grill-me' ? 'Conte o plano ou a ideia que tu quer testar…' : 'Pergunte sobre o projeto…'} (Enter envia · Ctrl+Enter quebra a linha)`,
    oninput: (e) => { CV.rascunho = e.target.value; },
    onkeydown: (e) => teclaDeChat(e, enviarConversa),
  });
  campo.value = CV.rascunho || '';
  corpo.append(
    h('div', { class: 'conversa-topo' },
      h('button', { class: 'chip-time', title: 'Modo da conversa (uma skill)', onclick: (e) => escolherModo(e.currentTarget) }, ic('sparkle'), h('span', { class: 'chip-time-nome' }, pref.modo || 'Conversa livre'), ic('chevron-down')),
      h('button', { class: 'chip-time', title: 'Qual IA responde', onclick: (e) => escolherMotorConversa(e.currentTarget) }, ic('hubot'), h('span', { class: 'chip-time-nome' }, rotuloMotor(pref.motor, pref.modelo)), ic('chevron-down')),
      h('span', { class: 'espaco' }),
      h('button', { class: 'bt-icone', title: 'Histórico de conversas', onclick: () => alternarHistorico('conversa') }, ic('history')),
      h('button', { class: 'bt-icone', title: 'Nova conversa', onclick: () => iniciarConversa(pref.modo) }, ic('add'))),
    h('div', { class: 'chat-mensagens', id: 'conversa-mensagens' }),
    h('form', { class: 'chat-compositor', onsubmit: (e) => { e.preventDefault(); enviarConversa(); } },
      campo,
      h('div', { class: 'chat-linha' },
        h('button', { type: 'button', class: 'bt-mini', title: 'Leva a última resposta para a Orquestra como pedido', onclick: virarPedido, disabled: !CV.atual?.mensagens.some((m) => m.papel === 'ia' && m.texto) }, ic('organization'), 'Virar pedido'),
        h('span', { class: 'dica' }, CV.rodando ? 'Respondendo…' : ''),
        CV.rodando
          ? h('button', { type: 'button', class: 'bt bt-perigo', onclick: () => api('conversa:parar', CV.atual?.id) }, ic('debug-stop'), 'Parar')
          : h('button', { type: 'submit', class: 'bt bt-principal' }, ic('send'), 'Enviar'))));
  return corpo;
}

function atualizarMensagensConversa() {
  const box = $('#conversa-mensagens');
  if (!box) return;
  const noFim = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const msgs = CV.atual?.mensagens || [];
  const itens = [];
  if (!msgs.length && !CV.rodando) {
    const modo = (CV.atual?.modo ?? CV.modo) || '';
    itens.push(h('div', { class: 'chat-boas-vindas' },
      ic(modo === 'grill-me' ? 'flame' : 'comment-discussion', 'grande'),
      h('h3', {}, modo === 'grill-me' ? 'Grill-me: testar uma ideia' : modo ? `Conversa no modo ${modo}` : 'Conversar sobre o projeto'),
      h('p', {}, modo === 'grill-me'
        ? 'Conte o plano. A IA lê o projeto e faz perguntas em rodadas, cada uma com uma resposta recomendada, até vocês dois concordarem. No fim, o resumo vira um pedido para o time.'
        : 'Pergunte como algo funciona, peça opinião ou discuta uma ideia. A IA lê os arquivos, mas não altera nada.'),
      h('div', { class: 'sugestoes' }, [
        ['grill-me', 'Me questione sobre o próximo passo deste projeto'],
        ['explicar-projeto', 'Explique como este projeto está organizado'],
        ['planejar-projeto', 'Vamos planejar a próxima versão'],
      ].map(([m, t]) => h('button', { class: 'sugestao', onclick: () => { CV.modo = m; CV.atual = null; CV.rascunho = t; desenharDireita(); } }, ic('sparkle'), ` ${m} · ${t}`)))));
  }
  for (const m of msgs) {
    if (m.papel === 'pessoa') itens.push(h('div', { class: 'msg msg-pessoa' }, h('div', { class: 'msg-balao' }, m.texto)));
    else itens.push(balaoIa(m.texto, m.erro));
  }
  if (CV.rodando) itens.push(balaoIa(CV.parcial, null, true));
  box.replaceChildren(...itens);
  if (noFim || CV.rodando) box.scrollTop = box.scrollHeight;
}

function balaoIa(texto, erro, vivo = false) {
  return h('div', { class: `msg msg-ia${vivo ? ' vivo' : ''}` },
    h('div', { class: 'msg-conteudo' },
      vivo && CV.acoes.length ? h('div', { class: 'msg-acoes-ia' }, CV.acoes.slice(-3).map((a) => h('div', { class: 'msg-agora mono' }, ic('eye'), a))) : null,
      texto ? markdown(texto) : vivo ? h('p', { class: 'msg-agora' }, ic('loading', 'codicon-modifier-spin'), 'Pensando…') : null,
      erro ? h('p', { class: 'erro-texto' }, erro) : null,
      !vivo && texto ? h('div', { class: 'msg-acoes' },
        h('button', { class: 'bt-mini', onclick: () => { navigator.clipboard.writeText(texto); aviso('Copiado.', 'ok'); } }, ic('copy'), 'Copiar'),
        h('button', { class: 'bt-mini', onclick: () => virarPedido(texto) }, ic('organization'), 'Virar pedido')) : null));
}

const redesenharConversa = debounce(atualizarMensagensConversa, 60);

async function enviarConversa() {
  const campo = $('#conversa-campo');
  const texto = campo?.value.trim();
  if (!texto || CV.rodando || !S.projeto) return;
  if (!CV.atual) CV.atual = await api('conversa:criar', S.projeto.caminho, preferenciaConversa());
  CV.atual.mensagens.push({ papel: 'pessoa', texto, hora: Date.now() });
  CV.rodando = true;
  CV.parcial = '';
  CV.acoes = [];
  campo.value = '';
  CV.rascunho = '';
  desenharDireita();
  try {
    CV.atual = await api('conversa:enviar', S.projeto.caminho, CV.atual.id, texto);
  } catch {
    CV.atual.mensagens.push({ papel: 'ia', texto: CV.parcial, erro: 'A conversa parou com erro.' });
  }
  CV.rodando = false;
  CV.parcial = '';
  if (S.direitaAba === 'conversa') desenharDireita();
}

function eventoConversa(ev) {
  if (!CV.atual || ev.conversa !== CV.atual.id) return;
  if (ev.tipo === 'delta') CV.parcial += ev.texto;
  else if (ev.tipo === 'nova-parte' && CV.parcial && !CV.parcial.endsWith('\n\n')) CV.parcial += '\n\n';
  else if (ev.tipo === 'acao') CV.acoes.push(ev.texto);
  else if (ev.tipo === 'uso') {
    if (ev.motor === 'claude') S.uso.claude = ev.info;
    desenharStatus();
    return;
  }
  if (S.direitaAba === 'conversa') redesenharConversa();
}

function virarPedido(texto) {
  const ultimo = typeof texto === 'string' ? texto : [...(CV.atual?.mensagens || [])].reverse().find((m) => m.papel === 'ia' && m.texto)?.texto;
  if (!ultimo) return;
  S.rascunhoPedido = `Com base nesta conversa sobre o projeto:\n\n${ultimo}`;
  novoPedido();
  const campo = $('#pedido');
  if (campo) { campo.value = S.rascunhoPedido; campo.focus(); }
}

async function escolherModo(ancora) {
  if (!S.skills) S.skills = await api('skills:listar', S.projeto.caminho);
  const atual = CV.atual ? CV.atual.modo : CV.modo || '';
  const item = (s) => ({ rotulo: s.nome, detalhe: s.descricao, icone: s.nome === 'grill-me' ? 'flame' : 'sparkle', marcado: s.nome === atual, acao: () => mudarModo(s.nome) });
  const orbion = S.skills.filter((s) => s.origem === 'orbion');
  const outras = S.skills.filter((s) => s.origem !== 'orbion');
  abrirPopover(ancora, [
    { rotulo: 'Conversa livre', icone: 'comment-discussion', marcado: !atual, acao: () => mudarModo('') },
    '-',
    ...orbion.map(item),
    '-',
    { rotulo: 'Tuas skills e as instaladas', icone: 'library', filhos: outras.map(item) },
    { rotulo: 'Criar skill…', icone: 'add', acao: () => abrirNovaSkill() },
  ]);
}

async function mudarModo(modo) {
  if (CV.atual?.mensagens.length) {
    CV.atual = await api('conversa:configurar', S.projeto.caminho, CV.atual.id, { modo });
  } else {
    CV.atual = null;
    CV.modo = modo;
  }
  desenharDireita();
}

function escolherMotorConversa(ancora) {
  const atual = CV.atual ? CV.atual.motor : preferenciaConversa().motor;
  const mudar = async (motor, modelo) => {
    CV.motor = motor;
    CV.modelo = modelo;
    if (CV.atual) CV.atual = await api('conversa:configurar', S.projeto.caminho, CV.atual.id, { motor, modelo });
    desenharDireita();
  };
  const modelosClaude = ['', ...(S.modelos.claude || [])].map((m) => ({ rotulo: m ? nomeModelo(m) : 'Padrão do Claude Code', detalhe: m ? S.infoModelos?.[m]?.detalhe : 'o do teu plano', icone: 'circle-small-filled', marcado: atual === 'claude' && nomeModelo((CV.atual ? CV.atual.modelo : preferenciaConversa().modelo) || '') === nomeModelo(m), acao: () => mudar('claude', m) }));
  abrirPopover(ancora, [
    { rotulo: 'Claude Code', detalhe: 'teu plano', icone: 'hubot', marcado: atual === 'claude', filhos: modelosClaude },
    ...(S.provedores || []).map((p) => ({
      rotulo: p.nome, detalhe: p.temChave || p.semChave ? 'API' : 'sem token', icone: 'key', marcado: atual === `api:${p.id}`,
      filhos: (p.modelos?.length ? p.modelos.slice(0, 40) : [p.modelo].filter(Boolean)).map((m) => ({ rotulo: m, icone: /(:free|-free)$/.test(m) ? 'gift' : 'circle-small-filled', detalhe: /(:free|-free)$/.test(m) ? 'grátis' : '', acao: () => mudar(`api:${p.id}`, m) })),
    })),
    '-',
    { rotulo: 'Contas e modelos…', icone: 'account', acao: abrirContas },
  ]);
}
