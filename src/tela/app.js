// Liga tudo: barras, painéis, atalhos e o início do app.

/* ---------- barra lateral e atividades ---------- */

function mudarVista(vista) {
  if (S.vista === vista && !$('#lateral').hidden) return alternarLateral();
  S.vista = vista;
  $('#lateral').hidden = false;
  $('#divisor-lateral').hidden = false;
  desenharLateral();
}

function alternarLateral() {
  const lateral = $('#lateral');
  lateral.hidden = !lateral.hidden;
  $('#divisor-lateral').hidden = lateral.hidden;
  desenharAtividades();
}

function desenharAtividades() {
  for (const b of document.querySelectorAll('#atividades [data-vista]')) {
    b.classList.toggle('ativa', b.dataset.vista === S.vista && !$('#lateral').hidden);
  }
}

function desenharLateral() {
  const v = VISTAS[S.vista];
  $('#lateral-titulo').textContent = v.titulo;
  $('#lateral-acoes').replaceChildren(...v.acoes().map(([icone, dica, fn]) => h('button', { class: 'bt-icone', title: dica, onclick: fn }, ic(icone))));
  const corpo = $('#lateral-corpo');
  const rolagem = corpo.scrollTop;
  corpo.replaceChildren(...[v.desenhar()].flat().filter(Boolean));
  corpo.scrollTop = rolagem;
  desenharAtividades();
}

function desenharSelos() {
  const nGit = Object.keys(S.git?.arquivos || {}).length;
  const selo = $('#selo-mudancas');
  selo.hidden = !nGit;
  selo.textContent = nGit > 99 ? '99+' : nGit;
  const vivos = vivosDoProjeto();
  const aguardando = vivos.some((v) => v.estado?.status === 'aguardando');
  const st = $('#selo-times');
  st.hidden = !vivos.length;
  st.textContent = aguardando ? '!' : vivos.length;
  st.classList.toggle('alerta', aguardando);
}

/* ---------- barra de status ---------- */

function desenharStatus() {
  const itens = [];
  const vivos = vivosDoProjeto();
  const aguardando = vivos.find((v) => v.estado?.status === 'aguardando');
  const quem = vivos.flatMap((v) => [...trabalhandoEm(v.estado)].map((id) => agentePorId(id, v.estado.time)?.nome)).filter(Boolean);
  itens.push(h('button', {
    class: `status-item status-time${vivos.length ? ' ativo' : ''}${aguardando ? ' alerta' : ''}`,
    title: 'Ver o que as IAs estão fazendo (Voo)',
    onclick: () => (aguardando ? mostrarExecucao(aguardando.id).then(() => abrirDireita('orquestra')) : abrirDireita('voo')),
  },
  vivos.length ? ic(aguardando ? 'bell-dot' : 'loading', aguardando ? '' : 'codicon-modifier-spin') : ic('organization'),
  aguardando ? 'O time precisa de ti'
    : vivos.length ? `${vivos.length > 1 ? `${vivos.length} pedidos · ` : ''}${quem.length ? `${[...new Set(quem)].join(', ')} trabalhando` : 'Time trabalhando'}`
      : 'Times parados'));
  if (S.git?.ramo) itens.push(h('button', { class: 'status-item', title: 'Trocar de branch', onclick: (e) => escolherRamo(e.currentTarget) }, ic('git-branch'), S.git.ramo));
  if (S.git?.upstream) {
    itens.push(h('button', { class: 'status-item', title: S.git.atras || S.git.frente ? `Sincronizar: ${S.git.atras} para puxar, ${S.git.frente} para enviar` : 'Sincronizado. Clique para buscar novidades', onclick: () => (S.git.atras || S.git.frente ? sincronizarGit() : buscarGit()) },
      ic(GITV.ocupado ? 'loading' : 'sync', GITV.ocupado ? 'codicon-modifier-spin' : ''), S.git.atras || S.git.frente ? `${S.git.atras}↓ ${S.git.frente}↑` : ''));
  } else if (S.git?.remoto && S.git.temCommits) {
    itens.push(h('button', { class: 'status-item', title: 'Publicar a branch no servidor', onclick: enviarGit }, ic('cloud-upload')));
  }
  if (S.git) itens.push(h('button', { class: 'status-item', title: 'Mudanças', onclick: () => mudarVista('mudancas') }, ic('diff'), String(Object.keys(S.git.arquivos).length)));
  if (TERMINAIS.length) itens.push(h('button', { class: 'status-item', title: 'Terminais', onclick: () => abrirPainelEm('terminal') }, ic('terminal'), String(TERMINAIS.length)));

  const direita = [];
  const a = abaAtiva();
  if ((a?.tipo === 'arquivo' || a?.tipo === 'previa') && S.cursor) {
    const m = a.modelo;
    direita.push(h('span', { class: 'status-item' }, `Ln ${S.cursor.linha}, Col ${S.cursor.coluna}`));
    direita.push(h('span', { class: 'status-item' }, `Espaços: ${m.getOptions().tabSize}`));
    direita.push(h('span', { class: 'status-item' }, 'UTF-8'));
    direita.push(h('span', { class: 'status-item' }, m.getEOL() === '\r\n' ? 'CRLF' : 'LF'));
    direita.push(h('span', { class: 'status-item' }, rotuloLinguagem(m.getLanguageId())));
  }
  const janelas = S.uso.claude?.unifiedWindows;
  if (janelas) {
    const pct = (x) => Math.round((x?.utilization || 0) * 100);
    const cinco = pct(janelas.five_hour);
    direita.push(h('button', { class: `status-item${cinco >= 80 ? ' alerta' : ''}`, title: 'Quanto do teu limite do Claude já foi usado (5 horas e semana)', onclick: () => abrirDireita('voo') },
      ic('pulse'), `Claude ${cinco}% · sem. ${pct(janelas.seven_day)}%`));
  }
  if (S.uso.codex) {
    const n = (S.uso.codex.input_tokens || 0) + (S.uso.codex.output_tokens || 0);
    direita.push(h('span', { class: 'status-item', title: 'Tokens da última chamada ao Codex' }, ic('zap'), `Codex ${n.toLocaleString(localeAtual())}`));
  }
  direita.push(h('button', { class: 'status-item', title: 'Trocar tema de cores', onclick: escolherTema }, ic('symbol-color'), S.tema?.name || 'Tema'));
  direita.push(h('button', { class: 'status-item', title: 'Trocar tema de ícones', onclick: escolherIcones }, ic('file-media')));
  $('#status').replaceChildren(h('div', { class: 'status-lado' }, itens), h('div', { class: 'status-lado' }, direita));
}

function desenharTitulo() {
  $('#titulo-busca-texto').textContent = S.projeto ? S.projeto.nome : 'Orbion.ai';
  document.title = S.projeto ? `${S.projeto.nome} — Orbion.ai` : 'Orbion.ai';
}

function desenharTudo() {
  desenharTitulo();
  desenharMenus();
  desenharLateral();
  desenharAbas();
  desenharMigalhas();
  desenharStatus();
  desenharSelos();
  desenharLog();
  if (!$('#direita').hidden) desenharDireita();
  const a = abaAtiva();
  if (a && ['time'].includes(a.tipo)) redesenharPagina(a);
}

/* ---------- painel de baixo ---------- */

function abrirPainelEm(aba) {
  S.painelAba = aba;
  $('#painel').hidden = false;
  $('#divisor-painel').hidden = false;
  for (const b of document.querySelectorAll('.painel-aba')) b.classList.toggle('ativa', b.dataset.painel === aba);
  $('#vista-terminal').hidden = aba !== 'terminal';
  $('#vista-log').hidden = aba !== 'log';
  if (aba === 'terminal') {
    if (!TERMINAIS.length) desenharListaTerminais();
    else if (terminalAtivo != null) ativarTerminal(terminalAtivo);
  } else {
    const l = $('#log');
    l.scrollTop = l.scrollHeight;
  }
  desenharAcoesPainel();
}

function desenharAcoesPainel() {
  const box = $('#painel-acoes');
  if (S.painelAba === 'terminal') {
    const t = TERMINAIS.find((x) => x.id === terminalAtivo);
    box.replaceChildren(...[
      t ? h('span', { class: 'mudo pequeno' }, t.nome) : null,
      h('button', { class: 'bt-icone', title: 'Novo terminal (Ctrl+Shift+´)', onclick: () => novoTerminal() }, ic('add')),
      h('button', { class: 'bt-icone', title: 'Novo terminal com…', onclick: escolherShell }, ic('chevron-down')),
      t ? h('button', { class: 'bt-icone', title: 'Fechar este terminal', onclick: () => fecharTerminal() }, ic('trash')) : null,
    ].filter(Boolean));
  } else {
    box.replaceChildren(...[
      S.filtro ? h('button', { class: 'filtro', onclick: () => { S.filtro = null; desenharLog(); } }, `Só ${S.filtro} · limpar`) : null,
      h('button', { class: 'bt-icone', title: 'Ir para o fim', onclick: () => { const l = $('#log'); l.scrollTop = l.scrollHeight; } }, ic('arrow-down')),
    ].filter(Boolean));
  }
}

function alternarPainel() {
  const p = $('#painel');
  if (!p.hidden && document.activeElement?.closest?.('.xterm')) { editor?.focus(); }
  p.hidden = !p.hidden;
  $('#divisor-painel').hidden = p.hidden;
  if (!p.hidden) abrirPainelEm(S.painelAba);
  api('config:salvar', { layout: { painelAberto: !p.hidden } }).catch(() => {});
}

function alternarTerminal() {
  const p = $('#painel');
  if (p.hidden || S.painelAba !== 'terminal') abrirPainelEm('terminal');
  else alternarPainel();
}

/* ---------- redimensionar ---------- */

function arrastar(divisor, aoMover, aoSoltar, cursor = 'col-resize') {
  divisor.addEventListener('mousedown', (e) => {
    e.preventDefault();
    divisor.classList.add('arrastando');
    document.body.classList.add('redimensionando');
    document.body.style.cursor = cursor;
    const mover = (ev) => aoMover(ev);
    const soltar = () => {
      divisor.classList.remove('arrastando');
      document.body.classList.remove('redimensionando');
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      aoSoltar();
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  });
}

function aplicarLayout() {
  const l = S.config.layout || {};
  $('#lateral').style.width = `${l.lateral || 280}px`;
  $('#painel').style.height = `${l.painel || 260}px`;
  $('#direita').style.width = `${l.direita || 400}px`;
  $('#painel').hidden = l.painelAberto === false;
  $('#divisor-painel').hidden = $('#painel').hidden;
  $('#direita').hidden = l.direitaAberta === false;
  $('#divisor-direita').hidden = $('#direita').hidden;
}

arrastar($('#divisor-lateral'), (e) => {
  const x = Math.max(170, Math.min(e.clientX - $('#atividades').offsetWidth, 640));
  $('#lateral').style.width = `${x}px`;
}, () => api('config:salvar', { layout: { lateral: $('#lateral').offsetWidth } }).catch(() => {}));

arrastar($('#divisor-direita'), (e) => {
  const x = Math.max(300, Math.min(window.innerWidth - e.clientX, 760));
  $('#direita').style.width = `${x}px`;
}, () => api('config:salvar', { layout: { direita: $('#direita').offsetWidth } }).catch(() => {}));

arrastar($('#divisor-painel'), (e) => {
  const area = $('.area').getBoundingClientRect();
  const altura = Math.max(90, Math.min(area.bottom - e.clientY, area.height - 160));
  $('#painel').style.height = `${altura}px`;
}, () => api('config:salvar', { layout: { painel: $('#painel').offsetHeight } }).catch(() => {}), 'row-resize');

/* ---------- projeto ---------- */

async function escolherProjeto() {
  const p = await api('projeto:escolher');
  if (!p) return;
  S.config = { ...S.config, ...(await api('config:ler')) };
  await abrirProjeto(p);
}

async function abrirProjeto(caminho) {
  let dados;
  try {
    dados = await api('projeto:abrir', caminho);
  } catch {
    return;
  }
  if (S.projeto?.caminho !== caminho) fecharTodasAbas();
  S.projeto = dados;
  S.config = { ...S.config, projetos: [caminho, ...S.config.projetos.filter((p) => p !== caminho)] };
  S.arvore = { abertas: new Set(), filhos: new Map(), selecionado: null };
  S.skills = null;
  S.filtro = null;
  S.abertas.clear();
  S.git = null;
  S.fio = null;
  S.fioIds = [];
  S.fioCache.clear();
  HIST.aberto = null;
  let guardado = null;
  try { guardado = localStorage.getItem(`orbion:time:${caminho}`); } catch {}
  S.timeAtual = timeDe(guardado) ? guardado : dados.times[0]?.id || null;
  for (const v of dados.vivas) {
    const x = garantirVivo({ execucao: v.id, projeto: v.projeto });
    x.estado = v.estado;
  }
  await carregarPasta('');
  const vivo = vivosDoProjeto()[0];
  if (vivo) await mostrarExecucao(vivo.id);
  else if (dados.execucoes[0]) await mostrarExecucao(dados.execucoes[0].id);
  else { S.vendo = null; S.eventos = []; }
  await carregarUltimaConversa();
  atualizarGit();
  desenharTudo();
  if (!dados.montado) {
    S.vista = 'times';
    abrirMontarTime();
  } else if (!abaAtiva()) mostrarAba();
  desenharLateral();
  desenharDireita();
  iniciarFluxosDoProjeto();
}

async function recarregarProjeto() {
  if (!S.projeto) return;
  const dados = await api('projeto:dados', S.projeto.caminho);
  Object.assign(S.projeto, { times: dados.times, execucoes: dados.execucoes, montado: dados.montado, config: dados.config });
  if (!timeDe(S.timeAtual)) S.timeAtual = dados.times[0]?.id || null;
}

const recarregarTimes = debounce(async () => {
  await recarregarProjeto();
  if (S.vista === 'times') desenharLateral();
  if (!$('#direita').hidden) desenharDireita();
}, 300);

async function tratarMudancaDeArquivos(ev) {
  if (!S.projeto || ev.projeto !== S.projeto.caminho) return;
  const pastas = new Set();
  for (const rel of ev.rels) {
    pastas.add(pastaDe(rel));
    if (S.arvore.filhos.has(rel)) pastas.add(rel);
    if (rel.startsWith('.orbion/times')) recarregarTimes();
  }
  await Promise.all([...pastas].filter((p) => S.arvore.filhos.has(p)).map(carregarPasta));
  for (const rel of ev.rels) arquivoMudouNoDisco(rel);
  previasMudaram(ev.rels);
  cacheArquivos.quando = 0;
  atualizarGit();
  if (S.vista === 'explorador') desenharLateral();
}

/* ---------- página inicial (sem abas abertas) ---------- */

PAGINAS.inicio = {
  desenhar(_aba, host) {
    const atalho = (k, t) => h('div', { class: 'inicio-atalho' }, h('span', {}, t), h('kbd', {}, k));
    const pagina = h('div', { class: 'pagina-inicio' },
      $('#marca-grande').content.firstElementChild.cloneNode(true),
      h('div', { class: 'inicio-atalhos' },
        S.projeto ? [
          atalho('Ctrl+I', 'Novo pedido ao time'),
          atalho('Ctrl+Shift+V', 'Ver o que as IAs estão fazendo'),
          atalho('Ctrl+P', 'Buscar arquivo'),
          atalho('Ctrl+Shift+P', 'Comandos'),
          atalho('Ctrl+´', 'Terminal'),
        ] : [
          h('button', { class: 'bt bt-principal', onclick: escolherProjeto }, ic('folder-opened'), 'Abrir pasta de projeto'),
          atalho('Ctrl+Shift+P', 'Comandos'),
        ]));
    host.append(pagina);
  },
};

/* ---------- atalhos ---------- */

document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const crase = e.code === 'Backquote' || e.code === 'Quote' || ['`', "'", '´'].includes(e.key);
  const parar = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'Escape' && menuAberto) return fecharMenus();
  if (ctrl && crase) { parar(); return e.shiftKey ? novoTerminal() : alternarTerminal(); }
  if (ctrl && e.altKey && k === 'b') { parar(); return alternarDireita(); }
  if (ctrl && e.shiftKey) {
    const vistas = { e: 'explorador', g: 'mudancas', x: 'extensoes', t: 'times' };
    if (vistas[k]) { parar(); return mudarVista(vistas[k]); }
    if (k === 'v') { parar(); return abrirDireita('voo'); }
    if (k === 'f' && S.projeto) { parar(); if (S.vista !== 'fluxos' || $('#lateral').hidden) mudarVista('fluxos'); return abrirFluxo(); }
    if (k === 'p') { parar(); return abrirComandos(); }
    if (k === 'i') { parar(); return api('janela:devtools'); }
  }
  if (ctrl && k === 'tab') { parar(); return trocarAba(e.shiftKey ? -1 : 1); }
  if (ctrl && !e.altKey && !e.shiftKey) {
    if (e.target.closest?.('.xterm') && ['c', 'v'].includes(k)) return; // o terminal trata
    const acoes = {
      p: abrirBuscaArquivos,
      s: () => (e.target.closest?.('.monaco-editor') ? null : salvarAbaAtiva()),
      w: () => S.ativa && fecharAba(S.ativa),
      b: alternarLateral,
      j: alternarPainel,
      i: () => novoPedido(),
      l: () => abrirDireita('conversa'),
      ',': abrirConfig,
      '=': () => mudarFonte(1),
      '-': () => mudarFonte(-1),
    };
    if (acoes[k] && !(k === 'p' && e.target.closest?.('.paleta'))) {
      if (k === 's' && e.target.closest?.('.monaco-editor')) return; // o próprio editor salva
      parar();
      acoes[k]();
    }
  }
  if (e.key === 'F12') api('janela:devtools');
}, true);

/* ---------- ligações fixas ---------- */

for (const b of document.querySelectorAll('#atividades [data-vista]')) b.addEventListener('click', () => mudarVista(b.dataset.vista));
// O botão dos fluxos também abre a tela deles, que é onde o fluxo se vê.
$('#atividades [data-vista="fluxos"]').addEventListener('click', () => { if (S.projeto && !$('#lateral').hidden) abrirFluxo(); });
for (const b of document.querySelectorAll('.painel-aba')) b.addEventListener('click', () => abrirPainelEm(b.dataset.painel));
for (const b of document.querySelectorAll('.direita-aba')) b.addEventListener('click', () => abrirDireita(b.dataset.direita));
$('#bt-config').addEventListener('click', abrirConfig);
$('#bt-contas').addEventListener('click', abrirContas);
$('#titulo-busca').addEventListener('click', () => (S.projeto ? abrirBuscaArquivos() : abrirComandos()));
$('#bt-painel-fechar').addEventListener('click', alternarPainel);
$('#bt-alt-lateral').addEventListener('click', alternarLateral);
$('#bt-alt-painel').addEventListener('click', alternarPainel);
$('#bt-alt-direita').addEventListener('click', alternarDireita);

aoEvento((ev) => {
  if (ev.tipo === 'fs') return tratarMudancaDeArquivos(ev);
  if (ev.tipo === 'terminal' || ev.tipo === 'terminal-fim') return eventoTerminal(ev);
  if (ev.tipo === 'conversa') return eventoConversa(ev.ev);
  if (ev.tipo === 'assistente') return eventoAssistente(ev.ev);
  if (ev.tipo === 'mapa') return eventoMapa(ev);
  eventoParaFluxo(ev);
  return tratarEventoExecucao(ev);
});

window.addEventListener('beforeunload', (e) => {
  if (S.abas.some((a) => a.sujo)) { e.preventDefault(); e.returnValue = ''; }
});

(async function iniciar() {
  S.config = await api('config:ler');
  prepararIdioma(S.config.idioma); // antes de desenhar: o que aparecer já sai no idioma
  ligarTraducao();
  try { S.soValidar = !!localStorage.getItem('orbion:soValidar'); } catch {}
  const [modelos, listaTemas, tema, icones] = await Promise.all([
    api('modelos:listar'), api('temas:listar'), api('temas:cores', S.config.tema), api('temas:icones', S.config.temaIcones),
  ]);
  S.modelos = modelos.listas;
  S.infoModelos = modelos.info;
  S.temas = listaTemas;
  await carregarProvedores();
  aplicarTema(tema);
  aplicarIcones(icones);
  aplicarLayout();
  await carregarMonaco();
  aplicarTemaMonaco();
  criarEditores();
  for (const v of S.config.vivas || []) {
    const x = garantirVivo({ execucao: v.id, projeto: v.projeto });
    x.estado = v.estado;
  }
  mostrarAba();
  const painelFechado = $('#painel').hidden;
  abrirPainelEm(S.painelAba);
  if (painelFechado) {
    $('#painel').hidden = true;
    $('#divisor-painel').hidden = true;
  }
  desenharTudo();
  const primeiro = S.config.vivas?.[0]?.projeto || S.config.projetos[0];
  if (primeiro) await abrirProjeto(primeiro);
  document.body.classList.add('pronto');
  tourDaPrimeiraVez();
})();
