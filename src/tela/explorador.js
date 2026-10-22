// Barra lateral: explorador de arquivos e mudanças (git e o que cada agente tocou).

const VISTAS = {};
const secoesFechadas = new Set(['skills']);

/** Seção recolhível da barra lateral, como as do VS Code. */
function secao(chave, titulo, conteudo, { acoes = [], contador = null, cresce = false } = {}) {
  const fechada = secoesFechadas.has(chave);
  return h('section', { class: `secao${fechada ? ' fechada' : ''}${cresce ? ' cresce' : ''}` },
    h('header', {
      class: 'secao-topo',
      onclick: () => { if (fechada) secoesFechadas.delete(chave); else secoesFechadas.add(chave); desenharLateral(); },
    },
    ic(fechada ? 'chevron-right' : 'chevron-down'),
    h('span', { class: 'secao-titulo' }, titulo),
    contador != null ? h('span', { class: 'contador' }, contador) : null,
    h('span', { class: 'secao-acoes' }, acoes.map(([icone, dica, fn]) => h('button', {
      class: 'bt-icone', title: dica, onclick: (e) => { e.stopPropagation(); fn(); },
    }, ic(icone))))),
    fechada ? null : h('div', { class: 'secao-corpo' }, conteudo));
}

/* ---------- menu de contexto ---------- */

function abrirMenu(e, itens) {
  e.preventDefault();
  e.stopPropagation();
  const menu = $('#menu');
  menu.replaceChildren(...itens.filter(Boolean).map((it) => (it === '-'
    ? h('div', { class: 'menu-sep' })
    : h('button', { class: 'menu-item', onclick: () => { fecharMenu(); it[2](); } }, ic(it[0]), h('span', {}, it[1])))));
  menu.hidden = false;
  const { innerWidth: lw, innerHeight: lh } = window;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(e.clientX, lw - r.width - 4)}px`;
  menu.style.top = `${Math.min(e.clientY, lh - r.height - 4)}px`;
}
function fecharMenu() { $('#menu').hidden = true; }
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#menu')) fecharMenu(); });
window.addEventListener('blur', fecharMenu);

/* ---------- árvore de arquivos ---------- */

async function carregarPasta(rel) {
  try {
    S.arvore.filhos.set(rel, await chamar('fs:listar', S.projeto.caminho, rel));
  } catch {
    S.arvore.filhos.delete(rel);
  }
}

async function recarregarArvore() {
  if (!S.projeto) return;
  const pastas = ['', ...S.arvore.abertas];
  await Promise.all(pastas.map(carregarPasta));
  desenharLateral();
}

async function alternarPasta(rel) {
  if (S.arvore.abertas.has(rel)) S.arvore.abertas.delete(rel);
  else {
    S.arvore.abertas.add(rel);
    if (!S.arvore.filhos.has(rel)) await carregarPasta(rel);
  }
  desenharLateral();
}

/** Abre as pastas até o arquivo e o seleciona na árvore. */
async function revelarNaArvore(rel) {
  const partes = rel.split('/');
  for (let i = 1; i < partes.length; i++) {
    const p = partes.slice(0, i).join('/');
    S.arvore.abertas.add(p);
    if (!S.arvore.filhos.has(p)) await carregarPasta(p);
  }
  S.arvore.selecionado = rel;
  desenharLateral();
}

const PRIORIDADE_GIT = { D: 4, M: 3, A: 2, U: 2, R: 1 };

function decoracoesDePastas(toques) {
  const git = new Map();
  const agentes = new Map();
  for (const [rel, letra] of Object.entries(S.git?.arquivos || {})) {
    for (let p = pastaDe(rel); p; p = pastaDe(p)) {
      if ((PRIORIDADE_GIT[letra] || 0) > (PRIORIDADE_GIT[git.get(p)] || 0)) git.set(p, letra);
    }
  }
  for (const [rel, lista] of toques) {
    for (let p = pastaDe(rel); p; p = pastaDe(p)) {
      const atual = agentes.get(p) || [];
      for (const x of lista) if (!atual.some((y) => y.id === x.id)) atual.push(x);
      agentes.set(p, atual);
    }
  }
  return { git, agentes };
}

function linhasDaArvore(rel, nivel, toques, pastas, saida) {
  const setas = !S.icones || S.icones.minimo || S.icones.setas !== false;
  for (const item of S.arvore.filhos.get(rel) || []) {
    const aberta = item.pasta && S.arvore.abertas.has(item.rel);
    const letra = item.pasta ? pastas.git.get(item.rel) : S.git?.arquivos?.[item.rel];
    const mexidos = item.pasta ? pastas.agentes.get(item.rel) : toques.get(item.rel);
    const ativa = abaAtiva();
    const selecionado = S.arvore.selecionado === item.rel || (!S.arvore.selecionado && ativa?.rel === item.rel);
    saida.push(h('div', {
      class: `item-arvore${selecionado ? ' selecionado' : ''}${letra ? ` git-${letra}` : ''}`,
      title: item.rel,
      onclick: () => {
        S.arvore.selecionado = item.rel;
        if (item.pasta) alternarPasta(item.rel);
        else { abrirArquivo(item.rel); desenharLateral(); }
      },
      oncontextmenu: (e) => menuDoItem(e, item),
    },
    Array.from({ length: nivel }, () => h('span', { class: 'guia' })),
    setas ? h('span', { class: 'seta' }, item.pasta ? ic(aberta ? 'chevron-down' : 'chevron-right') : null) : null,
    iconeDe(item.nome, { pasta: item.pasta, aberta }),
    h('span', { class: 'item-nome' }, item.nome),
    pontosAgentes(mexidos),
    letra && !item.pasta ? h('span', { class: 'letra-git' }, letra) : letra ? h('span', { class: 'ponto-git' }) : null));
    if (aberta) linhasDaArvore(item.rel, nivel + 1, toques, pastas, saida);
  }
  return saida;
}

function menuDoItem(e, item) {
  const p = S.projeto.caminho;
  const ondeCriar = item.pasta ? item.rel : pastaDe(item.rel);
  abrirMenu(e, [
    !item.pasta && ['go-to-file', 'Abrir', () => abrirArquivo(item.rel)],
    !item.pasta && S.git?.arquivos?.[item.rel] && ['git-compare', 'Ver mudanças', () => abrirDiff(item.rel)],
    ['new-file', 'Novo arquivo aqui', () => novoItem(false, ondeCriar)],
    ['new-folder', 'Nova pasta aqui', () => novoItem(true, ondeCriar)],
    '-',
    ['sparkle', 'Pedir ao time sobre isto…', () => pedirSobre(item.rel)],
    '-',
    ['edit', 'Renomear', () => renomearItem(item)],
    ['copy', 'Copiar caminho relativo', () => navigator.clipboard.writeText(item.rel)],
    ['folder-opened', 'Mostrar no Explorador do Windows', () => api('fs:revelar', p, item.rel)],
    '-',
    ['trash', 'Mandar para a lixeira', async () => {
      if (!confirm(`Mandar "${item.nome}" para a lixeira?`)) return;
      await api('fs:lixeira', p, item.rel);
      for (const a of S.abas.filter((x) => x.rel === item.rel || x.rel?.startsWith(`${item.rel}/`))) fecharAba(a.id, true);
    }],
  ]);
}

function novoItem(pasta, onde = null) {
  const base = onde ?? (S.arvore.selecionado ? (S.arvore.filhos.has(S.arvore.selecionado) && S.arvore.abertas.has(S.arvore.selecionado) ? S.arvore.selecionado : pastaDe(S.arvore.selecionado)) : '');
  pedirTexto({
    placeholder: pasta ? `Nome da nova pasta${base ? ` em ${base}` : ''}` : `Nome do novo arquivo${base ? ` em ${base}` : ''}`,
    aoConfirmar: async (nome) => {
      const rel = [base, nome.trim().replace(/\\/g, '/')].filter(Boolean).join('/');
      await api('fs:criar', S.projeto.caminho, rel, pasta);
      await revelarNaArvore(rel);
      await carregarPasta(pastaDe(rel));
      desenharLateral();
      if (!pasta) abrirArquivo(rel);
    },
  });
}

function renomearItem(item) {
  pedirTexto({
    placeholder: 'Novo nome',
    valor: item.nome,
    aoConfirmar: async (nome) => {
      const para = [pastaDe(item.rel), nome.trim()].filter(Boolean).join('/');
      if (para === item.rel) return;
      if (S.abas.some((a) => (a.rel === item.rel || a.rel?.startsWith(`${item.rel}/`)) && a.sujo)) return aviso('Salve os arquivos abertos antes de renomear.');
      await api('fs:renomear', S.projeto.caminho, item.rel, para);
      for (const a of S.abas.filter((x) => x.rel === item.rel || x.rel?.startsWith(`${item.rel}/`))) fecharAba(a.id, true);
      await carregarPasta(pastaDe(item.rel));
      if (!item.pasta) abrirArquivo(para);
      desenharLateral();
    },
  });
}

VISTAS.explorador = {
  titulo: 'Explorador',
  acoes: () => (S.projeto ? [
    ['new-file', 'Novo arquivo', () => novoItem(false)],
    ['new-folder', 'Nova pasta', () => novoItem(true)],
    ['refresh', 'Atualizar', recarregarArvore],
    ['collapse-all', 'Recolher tudo', () => { S.arvore.abertas.clear(); desenharLateral(); }],
  ] : []),
  desenhar() {
    if (!S.projeto) return semProjeto();
    const toques = toquesDosAgentes();
    const pastas = decoracoesDePastas(toques);
    const abertos = S.abas.filter((a) => a.tipo === 'arquivo');
    return [
      abertos.length ? secao('abertos', 'Editores abertos', abertos.map((a) => h('div', {
        class: `item-arvore${a.id === S.ativa ? ' selecionado' : ''}`, onclick: () => ativarAba(a.id), title: a.rel,
      }, h('button', { class: 'bt-icone mini', title: 'Fechar', onclick: (e) => { e.stopPropagation(); fecharAba(a.id); } }, ic(a.sujo ? 'circle-filled' : 'close')),
      iconeDe(a.titulo), h('span', { class: 'item-nome' }, a.titulo), h('span', { class: 'item-dica' }, pastaDe(a.rel)))), { contador: abertos.length }) : null,
      secao('arvore', S.projeto.nome, h('div', { class: 'arvore', oncontextmenu: (e) => menuDoItem(e, { pasta: true, rel: '', nome: S.projeto.nome }) },
        linhasDaArvore('', 0, toques, pastas, [])), { cresce: true }),
    ];
  },
};

function semProjeto() {
  return h('div', { class: 'lateral-vazia' },
    h('p', {}, 'Nenhuma pasta aberta.'),
    h('button', { class: 'bt bt-principal largo', onclick: escolherProjeto }, ic('folder-opened'), 'Abrir pasta'),
    S.config.projetos.length ? h('p', { class: 'mudo' }, 'Recentes') : null,
    S.config.projetos.slice(0, 8).map((p) => h('button', { class: 'link-recente', title: p, onclick: () => abrirProjeto(p) },
      ic('folder'), h('span', {}, p.split(/[\\/]/).pop()), h('span', { class: 'item-dica' }, p))));
}

/* ---------- mudanças ---------- */

async function atualizarGitAgora() {
  if (!S.projeto) return;
  S.git = await chamar('git:status', S.projeto.caminho).catch(() => null);
  desenharSelos();
  if (S.vista === 'mudancas' || S.vista === 'explorador') desenharLateral();
  desenharStatus();
}

const atualizarGit = debounce(atualizarGitAgora, 400);

const ROTULO_GIT = { M: 'Modificado', A: 'Adicionado', D: 'Apagado', U: 'Novo, fora do git', R: 'Renomeado', '!': 'Em conflito' };

/* ---------- Mudanças: o Controle de Código, como no VS Code ---------- */

const GITV = { mensagens: new Map(), ocupado: null };

const mensagemCommit = () => GITV.mensagens.get(S.projeto?.caminho) || '';

/** Roda uma operação do git com a vista travada, e atualiza tudo no fim. Erros já viram aviso pelo api(). */
async function operacaoGit(nome, fn, sucesso) {
  if (GITV.ocupado) return undefined;
  GITV.ocupado = nome;
  if (S.vista === 'mudancas') desenharLateral();
  try {
    const r = await fn();
    if (sucesso) aviso(typeof sucesso === 'function' ? sucesso(r) : sucesso, 'ok');
    return r ?? true;
  } catch {
    return undefined;
  } finally {
    GITV.ocupado = null;
    await atualizarGitAgora();
  }
}

const gitApi = (canal, ...args) => api(canal, S.projeto.caminho, ...args);

async function fazerCommit(depois = null) {
  const msg = mensagemCommit().trim();
  if (!msg) {
    aviso('Escreva a mensagem do commit (ou clique na estrela para a IA escrever).', 'info');
    return $('#git-mensagem')?.focus();
  }
  let tudo = false;
  if (!Object.keys(S.git.preparados || {}).length) {
    if (!Object.keys(S.git.alterados || {}).length) return aviso('Não há mudanças para o commit.', 'info');
    if (!confirm('Nada está preparado. Preparar todas as mudanças e fazer o commit?')) return;
    tudo = true;
  }
  const ramo = S.git.ramo || 'main';
  const hash = await operacaoGit('commit', () => gitApi('git:commit', msg, { tudo }));
  if (!hash) return;
  GITV.mensagens.set(S.projeto.caminho, '');
  aviso(`Commit ${hash} feito em ${ramo}.`, 'ok');
  if (depois === 'enviar') await enviarGit();
  if (depois === 'sincronizar') await sincronizarGit();
  desenharLateral();
}

async function escreverMensagemComIa() {
  const r = await operacaoGit('mensagem', () => gitApi('git:mensagem'));
  if (typeof r === 'string' && r) {
    GITV.mensagens.set(S.projeto.caminho, r);
    desenharLateral();
  }
}

const sincronizarGit = () => operacaoGit('sincronizar', () => gitApi('git:sincronizar'), 'Sincronizado com o servidor.');
const enviarGit = () => operacaoGit('enviar', () => gitApi('git:enviar'), S.git?.upstream ? 'Commits enviados.' : 'Branch publicada no servidor.');
const puxarGit = () => operacaoGit('puxar', () => gitApi('git:puxar'), 'Atualizado com o servidor.');
const buscarGit = () => operacaoGit('buscar', () => gitApi('git:buscar'), 'Buscou as novidades do servidor.');

async function descartarGit(rels) {
  const novos = rels.filter((r) => S.git.alterados[r] === 'U');
  const texto = rels.length === 1
    ? (novos.length ? `Apagar o arquivo novo ${rels[0]}? Ele vai para a lixeira.` : `Descartar as mudanças em ${rels[0]}? Isso não pode ser desfeito.`)
    : `Descartar as mudanças em ${rels.length} arquivos?${novos.length ? ` Os ${novos.length} novos vão para a lixeira.` : ''} Isso não pode ser desfeito.`;
  if (!confirm(texto)) return;
  await operacaoGit('descartar', () => gitApi('git:descartar', rels, novos));
}

async function escolherRamo(ancora) {
  if (!S.git) return;
  let r;
  try {
    r = await gitApi('git:ramos');
  } catch {
    return;
  }
  const locais = new Set(r.locais.map((b) => b.nome));
  const trocar = (nome) => operacaoGit('ramo', () => gitApi('git:trocarRamo', nome), `Agora em ${nome.replace(/^[^/]+\//, '')}.`);
  abrirPopover(ancora, [
    { rotulo: 'Criar branch…', icone: 'add', acao: criarRamoGit },
    '-',
    ...r.locais.map((b) => ({ rotulo: b.nome, detalhe: b.upstream || 'só neste PC', icone: 'git-branch', marcado: b.atual, acao: () => !b.atual && trocar(b.nome) })),
    ...r.remotos.filter((n) => !locais.has(n.replace(/^[^/]+\//, ''))).map((n) => ({ rotulo: n, detalhe: 'no servidor', icone: 'cloud', acao: () => trocar(n) })),
  ]);
}

function criarRamoGit() {
  pedirTexto({
    placeholder: `Nome da branch nova (sai de ${S.git?.ramo || 'main'})`,
    aoConfirmar: (nome) => operacaoGit('ramo', () => gitApi('git:criarRamo', nome), (n) => `Branch ${n} criada.`),
  });
}

/** Como o "Publicar no GitHub" do VS Code: inicia o git e faz o primeiro commit, se faltar, e cria o repositório. */
async function publicarNoGitHub() {
  if (!S.git) {
    if (!confirm('Iniciar um repositório git neste projeto?')) return;
    if (!(await operacaoGit('iniciar', () => gitApi('git:iniciar')))) return;
  }
  if (!S.git?.temCommits) {
    if (!confirm('O GitHub precisa de pelo menos um commit. Fazer o primeiro commit com todos os arquivos?')) return;
    if (!(await operacaoGit('commit', () => gitApi('git:commit', 'Primeiro commit', { tudo: true })))) return;
  }
  abrirPaleta({
    placeholder: 'Publicar no GitHub como…',
    itens: () => [
      { rotulo: 'Repositório privado', detalhe: 'só tu e quem tu convidar', icone: 'lock', id: 'privado' },
      { rotulo: 'Repositório público', detalhe: 'qualquer pessoa vê', icone: 'globe', id: 'publico' },
    ],
    aoEscolher: (it) => setTimeout(() => pedirTexto({
      placeholder: 'Nome do repositório no GitHub',
      valor: (S.projeto.nome || 'projeto').replace(/\s+/g, '-'),
      aoConfirmar: async (nome) => {
        const url = await operacaoGit('publicar', () => gitApi('git:publicar', { nome, privado: it.id === 'privado' }));
        if (typeof url === 'string') aviso(url ? `Publicado em ${url}` : 'Publicado no GitHub.', 'ok');
      },
    }), 0),
  });
}

/** O endereço do repositório no navegador, se o servidor for o GitHub. */
function urlDoGitHub() {
  const m = /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(S.git?.remoto || '');
  return m ? `https://github.com/${m[1]}` : null;
}

function menuGit(ancora) {
  const g = S.git;
  const url = urlDoGitHub();
  abrirPopover(ancora, [
    { rotulo: 'Puxar (pull)', icone: 'arrow-down', acao: puxarGit },
    { rotulo: g?.upstream ? 'Enviar (push)' : 'Publicar a branch', icone: 'arrow-up', acao: enviarGit },
    { rotulo: 'Sincronizar', detalhe: 'puxar e enviar', icone: 'sync', acao: sincronizarGit },
    { rotulo: 'Buscar (fetch)', icone: 'repo-fetch', acao: buscarGit },
    '-',
    { rotulo: 'Trocar de branch…', icone: 'git-branch', acao: () => escolherRamo(ancora) },
    { rotulo: 'Criar branch…', icone: 'add', acao: criarRamoGit },
    '-',
    { rotulo: 'Commit e enviar', icone: 'check', acao: () => fazerCommit('enviar') },
    { rotulo: 'Commit e sincronizar', icone: 'check-all', acao: () => fazerCommit('sincronizar') },
    '-',
    { rotulo: 'Preparar tudo', icone: 'add', acao: () => operacaoGit('preparar', () => gitApi('git:preparar', [])) },
    { rotulo: 'Despreparar tudo', icone: 'remove', acao: () => operacaoGit('despreparar', () => gitApi('git:despreparar', [])) },
    { rotulo: 'Descartar todas as mudanças…', icone: 'discard', acao: () => descartarGit(Object.keys(g?.alterados || {})) },
    '-',
    url ? { rotulo: 'Abrir no GitHub', icone: 'github', acao: () => api('abrir:link', url) } : { rotulo: 'Publicar no GitHub…', icone: 'github', acao: publicarNoGitHub },
  ]);
}

VISTAS.mudancas = {
  titulo: 'Mudanças',
  acoes: () => (S.projeto && S.git ? [
    ['check', `Commit (Ctrl+Enter)`, () => fazerCommit()],
    ['refresh', 'Atualizar', atualizarGitAgora],
    ['ellipsis', 'Mais ações do git', (e) => menuGit(e.currentTarget)],
  ] : S.projeto ? [['refresh', 'Atualizar', atualizarGitAgora]] : []),
  desenhar() {
    if (!S.projeto) return semProjeto();
    const toques = toquesDosAgentes();
    const g = S.git;
    const ocupado = GITV.ocupado;
    const girando = (nome) => (ocupado === nome ? ic('loading', 'codicon-modifier-spin') : null);
    const linha = (rel, fim, acao, acoes = []) => h('div', { class: 'item-arvore item-git', title: rel, onclick: acao },
      iconeDe(nomeDe(rel)), h('span', { class: 'item-nome' }, nomeDe(rel)), h('span', { class: 'item-dica' }, pastaDe(rel)),
      h('span', { class: 'git-acoes' }, acoes.map(([icone, dica, fn]) => h('button', {
        class: 'bt-icone', title: dica, disabled: !!ocupado, onclick: (e) => { e.stopPropagation(); fn(); },
      }, ic(icone)))),
      fim);
    const tocados = secao('toques', 'Tocados pelos agentes', toques.size
      ? [...toques].map(([rel, quem]) => linha(rel, pontosAgentes(quem), () => (g ? abrirDiff(rel) : abrirArquivo(rel))))
      : h('p', { class: 'lateral-texto' }, 'Os arquivos que os agentes criarem ou editarem no pedido aberto na Orquestra aparecem aqui, com a cor de cada um.'),
    { contador: toques.size || null });

    if (!g) {
      return [
        h('div', { class: 'git-vazio' },
          h('p', {}, 'Este projeto ainda não está no git. Com o git, tu vê o antes e o depois de tudo o que os agentes mudarem e pode desfazer.'),
          h('button', { class: 'bt bt-principal', disabled: !!ocupado, onclick: () => operacaoGit('iniciar', () => gitApi('git:iniciar'), 'Repositório iniciado.') }, girando('iniciar') || ic('git-commit'), 'Inicializar repositório'),
          h('button', { class: 'bt', disabled: !!ocupado, onclick: publicarNoGitHub }, girando('publicar') || ic('github'), 'Publicar no GitHub')),
        tocados,
      ];
    }

    const ordenar = (o) => Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b));
    const preparados = ordenar(g.preparados);
    const alterados = ordenar(g.alterados);
    const classe = (letra) => `git-${letra === '!' ? 'C' : letra}`;
    const letra = (l) => h('span', { class: 'letra-git', title: ROTULO_GIT[l] }, l);

    const campo = h('textarea', {
      id: 'git-mensagem', rows: 1, spellcheck: 'true', disabled: !!ocupado,
      placeholder: `Mensagem (Ctrl+Enter faz o commit em "${g.ramo || 'main'}")`,
      oninput: (e) => { GITV.mensagens.set(S.projeto.caminho, e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; },
      onkeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fazerCommit(); } },
    });
    campo.value = mensagemCommit();
    requestAnimationFrame(() => { campo.style.height = 'auto'; campo.style.height = `${Math.min(campo.scrollHeight, 160)}px`; });

    // O botão de baixo muda como no VS Code: publicar a branch, sincronizar, ou nada a fazer.
    const sync = !g.remoto
      ? h('button', { class: 'bt git-sync', disabled: !!ocupado || !g.temCommits, title: g.temCommits ? '' : 'Faça o primeiro commit antes', onclick: publicarNoGitHub }, girando('publicar') || ic('github'), 'Publicar no GitHub')
      : !g.upstream
        ? h('button', { class: 'bt git-sync', disabled: !!ocupado || !g.temCommits, onclick: enviarGit }, girando('enviar') || ic('cloud-upload'), 'Publicar a branch')
        : g.atras || g.frente
          ? h('button', { class: 'bt git-sync', disabled: !!ocupado, onclick: sincronizarGit, title: `${g.atras} para puxar, ${g.frente} para enviar` }, girando('sincronizar') || ic('sync'), `Sincronizar ${g.atras}↓ ${g.frente}↑`)
          : null;

    return [
      h('div', { class: 'git-topo' },
        h('button', { class: 'git-ramo', title: 'Trocar de branch', disabled: !!ocupado, onclick: (e) => escolherRamo(e.currentTarget) },
          girando('ramo') || ic('git-branch'), h('span', {}, g.ramo || '(sem branch)'), ic('chevron-down')),
        g.upstream ? h('span', { class: 'git-upstream', title: 'A branch no servidor' }, ic('cloud'), g.upstream) : null),
      h('div', { class: 'git-commit' },
        h('div', { class: 'git-campo' },
          campo,
          h('button', { class: 'bt-icone git-ia', title: 'A IA escreve a mensagem a partir das mudanças', disabled: !!ocupado, onclick: escreverMensagemComIa }, girando('mensagem') || ic('sparkle'))),
        h('div', { class: 'git-botoes' },
          h('button', { class: 'bt bt-principal git-bt-commit', disabled: !!ocupado || (!preparados.length && !alterados.length), onclick: () => fazerCommit() },
            girando('commit') || ic('check'), preparados.length || !alterados.length ? 'Commit' : 'Commit de tudo'),
          h('button', { class: 'bt git-bt-mais', title: 'Commit e enviar, ou commit e sincronizar', disabled: !!ocupado, onclick: (e) => abrirPopover(e.currentTarget, [
            { rotulo: 'Commit', icone: 'check', acao: () => fazerCommit() },
            { rotulo: 'Commit e enviar', icone: 'arrow-up', acao: () => fazerCommit('enviar') },
            { rotulo: 'Commit e sincronizar', icone: 'sync', acao: () => fazerCommit('sincronizar') },
          ]) }, ic('chevron-down'))),
        sync),
      preparados.length ? secao('git-preparados', 'Preparadas para o commit', preparados.map(([rel, l]) => h('div', { class: classe(l) },
        linha(rel, letra(l), () => abrirDiff(rel, 'preparado'), [
          ['go-to-file', 'Abrir o arquivo', () => abrirArquivo(rel)],
          ['remove', 'Despreparar', () => operacaoGit('despreparar', () => gitApi('git:despreparar', [rel]))],
        ]))), {
        contador: preparados.length,
        acoes: [['remove', 'Despreparar tudo', () => operacaoGit('despreparar', () => gitApi('git:despreparar', []))]],
      }) : null,
      secao('git', 'Alterações', alterados.length
        ? alterados.map(([rel, l]) => h('div', { class: classe(l) },
          linha(rel, [pontosAgentes(toques.get(rel)), letra(l)], () => (l === 'U' || l === 'D' ? abrirDiff(rel) : abrirDiff(rel, 'alterado')), [
            ['go-to-file', 'Abrir o arquivo', () => abrirArquivo(rel)],
            ['discard', l === 'U' ? 'Apagar (vai para a lixeira)' : 'Descartar as mudanças', () => descartarGit([rel])],
            ['add', 'Preparar para o commit', () => operacaoGit('preparar', () => gitApi('git:preparar', [rel]))],
          ])))
        : h('p', { class: 'lateral-texto' }, preparados.length ? 'O resto já está preparado.' : 'Nenhuma mudança desde o último commit.'), {
        contador: alterados.length,
        acoes: alterados.length ? [
          ['discard', 'Descartar todas', () => descartarGit(alterados.map(([rel]) => rel))],
          ['add', 'Preparar todas', () => operacaoGit('preparar', () => gitApi('git:preparar', []))],
        ] : [],
      }),
      tocados,
    ];
  },
};
