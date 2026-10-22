// Barra de menus do topo, como a do VS Code e do Cursor.

const acaoEditor = (id) => () => {
  const a = abaAtiva();
  const ed = a?.tipo === 'agente' ? a.editorInstrucoes : editor;
  if (!ed) return;
  ed.focus();
  ed.trigger('menu', id, null);
};

function itensDosMenus() {
  const p = !!S.projeto;
  return [
    ['Arquivo', [
      ['Novo arquivo', 'new-file', () => novoItem(false), null, p],
      ['Nova pasta', 'new-folder', () => novoItem(true), null, p],
      '-',
      ['Novo projeto…', 'new-folder', abrirNovoProjeto],
      ['Abrir pasta…', 'folder-opened', escolherProjeto],
      ['Abrir recente…', 'history', abrirRecente, null, S.config.projetos.length > 0],
      '-',
      ['Salvar', 'save', salvarAbaAtiva, 'Ctrl+S'],
      ['Salvar todos', 'save-all', salvarTodas],
      '-',
      ['Fechar aba', 'close', () => S.ativa && fecharAba(S.ativa), 'Ctrl+W'],
      ['Fechar todas as abas', 'close-all', fecharTodasAbas],
      '-',
      ['Configurações', 'settings-gear', abrirConfig, 'Ctrl+,'],
      ['Contas e modelos', 'account', abrirContas],
      ['Sair', 'sign-out', () => api('janela:sair')],
    ]],
    ['Editar', [
      ['Desfazer', 'discard', acaoEditor('undo'), 'Ctrl+Z'],
      ['Refazer', 'redo', acaoEditor('redo'), 'Ctrl+Y'],
      '-',
      ['Recortar', 'symbol-text', acaoEditor('editor.action.clipboardCutAction'), 'Ctrl+X'],
      ['Copiar', 'copy', acaoEditor('editor.action.clipboardCopyAction'), 'Ctrl+C'],
      ['Colar', 'clippy', acaoEditor('editor.action.clipboardPasteAction'), 'Ctrl+V'],
      '-',
      ['Localizar', 'search', acaoEditor('actions.find'), 'Ctrl+F'],
      ['Substituir', 'replace', acaoEditor('editor.action.startFindReplaceAction'), 'Ctrl+H'],
      '-',
      ['Comentar linha', 'comment', acaoEditor('editor.action.commentLine'), 'Ctrl+;'],
      ['Formatar documento', 'list-flat', acaoEditor('editor.action.formatDocument'), 'Shift+Alt+F'],
    ]],
    ['Seleção', [
      ['Selecionar tudo', 'list-selection', acaoEditor('editor.action.selectAll'), 'Ctrl+A'],
      ['Expandir seleção', 'arrow-both', acaoEditor('editor.action.smartSelect.expand'), 'Shift+Alt+→'],
      '-',
      ['Copiar linha para cima', 'arrow-up', acaoEditor('editor.action.copyLinesUpAction'), 'Shift+Alt+↑'],
      ['Copiar linha para baixo', 'arrow-down', acaoEditor('editor.action.copyLinesDownAction'), 'Shift+Alt+↓'],
      ['Mover linha para cima', 'arrow-small-up', acaoEditor('editor.action.moveLinesUpAction'), 'Alt+↑'],
      ['Mover linha para baixo', 'arrow-small-down', acaoEditor('editor.action.moveLinesDownAction'), 'Alt+↓'],
      '-',
      ['Adicionar cursor acima', 'add', acaoEditor('editor.action.insertCursorAbove'), 'Ctrl+Alt+↑'],
      ['Adicionar cursor abaixo', 'add', acaoEditor('editor.action.insertCursorBelow'), 'Ctrl+Alt+↓'],
      ['Próxima ocorrência', 'selection', acaoEditor('editor.action.addSelectionToNextFindMatch'), 'Ctrl+D'],
    ]],
    ['Ver', [
      ['Paleta de comandos', 'terminal-cmd', () => abrirComandos(), 'Ctrl+Shift+P'],
      '-',
      ['Explorador', 'files', () => mudarVista('explorador'), 'Ctrl+Shift+E'],
      ['Times', 'organization', () => mudarVista('times'), 'Ctrl+Shift+T'],
      ['Mudanças', 'source-control', () => mudarVista('mudancas'), 'Ctrl+Shift+G'],
      ['Extensões', 'extensions', () => mudarVista('extensoes'), 'Ctrl+Shift+X'],
      '-',
      ['Orquestra', 'comment-discussion', () => abrirDireita('orquestra'), 'Ctrl+I'],
      ['Conversa', 'comment', () => abrirDireita('conversa'), 'Ctrl+L'],
      ['Voo: o que as IAs estão fazendo', 'pulse', () => abrirDireita('voo'), 'Ctrl+Shift+V'],
      ['Ao vivo', 'output', () => abrirPainelEm('log')],
      '-',
      ['Barra lateral', 'layout-sidebar-left', alternarLateral, 'Ctrl+B'],
      ['Painel de baixo', 'layout-panel', alternarPainel, 'Ctrl+J'],
      ['Painel direito', 'layout-sidebar-right', alternarDireita, 'Ctrl+Alt+B'],
      '-',
      ['Aumentar fonte', 'zoom-in', () => mudarFonte(1), 'Ctrl+='],
      ['Diminuir fonte', 'zoom-out', () => mudarFonte(-1), 'Ctrl+-'],
      ['Tema de cores…', 'symbol-color', escolherTema],
      ['Tema de ícones…', 'file-media', escolherIcones],
    ]],
    ['Ir', [
      ['Ir para arquivo…', 'go-to-file', abrirBuscaArquivos, 'Ctrl+P'],
      ['Ir para linha…', 'symbol-number', acaoEditor('editor.action.gotoLine'), 'Ctrl+G'],
      ['Ir para símbolo…', 'symbol-method', acaoEditor('editor.action.quickOutline'), 'Ctrl+Shift+O'],
      '-',
      ['Próxima aba', 'arrow-right', () => trocarAba(1), 'Ctrl+Tab'],
      ['Aba anterior', 'arrow-left', () => trocarAba(-1), 'Ctrl+Shift+Tab'],
    ]],
    ['Terminal', [
      ['Novo terminal', 'terminal', () => novoTerminal(), 'Ctrl+Shift+´'],
      ['Novo terminal com…', 'terminal', escolherShell],
      ['Terminal padrão…', 'settings', escolherShellPadrao],
      '-',
      ['Mostrar terminal', 'layout-panel', () => abrirPainelEm('terminal'), 'Ctrl+´'],
      ['Fechar terminal', 'trash', () => fecharTerminal(), null, terminalAtivo != null],
      '-',
      ['Rodar os testes (npm test)', 'beaker', () => rodarNoTerminal('npm test'), null, p],
    ]],
    ['Time', [
      ['Novo pedido', 'comment-discussion', () => novoPedido(), 'Ctrl+I', p],
      ['Conversas com o time…', 'history', escolherPedido, null, p && S.projeto.execucoes.length > 0],
      '-',
      ['Conversar sobre o projeto', 'comment', () => iniciarConversa(''), 'Ctrl+L', p],
      ['Grill-me: questionar um plano', 'flame', () => iniciarConversa('grill-me'), null, p],
      ['Sugestões de melhoria', 'lightbulb', () => abrirMelhorias(), null, p],
      '-',
      ['Criar time…', 'organization', novoTime, null, p],
      ['Criar agente…', 'person-add', () => novoAgente(), null, p && S.projeto.montado],
      ['Criar skill…', 'sparkle', () => abrirNovaSkill()],
      '-',
      ['Memória do projeto', 'book', abrirMemoria, null, p],
      ['Prompts do projeto', 'file-code', abrirConfig, null, p],
      '-',
      ['Parar todos os pedidos', 'debug-stop', pararTodos, null, vivosDoProjeto().length > 0],
    ]],
    ['Ajuda', [
      ['Descobrir skills e mods', 'compass', abrirDescobrir],
      ['Contas e modelos', 'account', abrirContas],
      ['Atalhos de teclado', 'keyboard', abrirConfig],
      ['Guia do Orbion.ai (README)', 'book', abrirGuia],
      '-',
      ['Recarregar a janela', 'refresh', () => api('janela:recarregar')],
      ['Ferramentas de desenvolvedor', 'debug-console', () => api('janela:devtools'), 'Ctrl+Shift+I'],
    ]],
  ];
}

let menuAberto = null;

function desenharMenus() {
  $('#menus').replaceChildren(...itensDosMenus().map(([rotulo]) => h('button', {
    class: `menu-topo${menuAberto === rotulo ? ' aberto' : ''}`,
    onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); if (menuAberto === rotulo) fecharMenus(); else abrirMenuTopo(rotulo, e.currentTarget); },
    onmouseenter: (e) => { if (menuAberto && menuAberto !== rotulo) abrirMenuTopo(rotulo, e.currentTarget); },
  }, rotulo)));
}

function abrirMenuTopo(rotulo, botao) {
  const [, itens] = itensDosMenus().find(([r]) => r === rotulo);
  menuAberto = rotulo;
  desenharMenus();
  const menu = $('#menu');
  menu.replaceChildren(...itens.map((it) => {
    if (it === '-') return h('div', { class: 'menu-sep' });
    const [texto, icone, acao, atalho, ativo = true] = it;
    return h('button', { class: 'menu-item', disabled: !ativo, onclick: () => { fecharMenus(); acao(); } },
      ic(icone), h('span', {}, texto), atalho ? h('kbd', {}, atalho) : null);
  }));
  menu.hidden = false;
  const r = botao.getBoundingClientRect();
  menu.style.left = `${r.left}px`;
  menu.style.top = `${r.bottom + 2}px`;
}

function fecharMenus() {
  if (!menuAberto) return;
  menuAberto = null;
  $('#menu').hidden = true;
  desenharMenus();
}
document.addEventListener('mousedown', (e) => { if (menuAberto && !e.target.closest('#menu') && !e.target.closest('.menu-topo')) fecharMenus(); });

/* ---------- ações dos menus ---------- */

function abrirRecente() {
  abrirPaleta({
    placeholder: 'Abrir projeto recente',
    itens: (busca) => S.config.projetos.filter((p) => nota(p, busca) >= 0).map((p) => ({ rotulo: p.split(/[\\/]/).pop(), detalhe: p, icone: 'folder', p })),
    aoEscolher: (it) => abrirProjeto(it.p),
  });
}

async function salvarTodas() {
  for (const a of S.abas.filter((x) => x.sujo)) await salvarAba(a).catch(() => {});
}

function trocarAba(passo) {
  if (!S.abas.length) return;
  const i = S.abas.findIndex((a) => a.id === S.ativa);
  ativarAba(S.abas[(i + passo + S.abas.length) % S.abas.length].id);
}

async function mudarFonte(passo) {
  S.config = { ...S.config, ...(await api('config:salvar', { tamanhoFonte: S.config.tamanhoFonte + passo })) };
  aplicarOpcoesEditor();
  for (const t of TERMINAIS) { t.termo.options.fontSize = Math.max(11, S.config.tamanhoFonte - 1); t.encaixe.fit(); }
}

function pararTodos() {
  const vivos = vivosDoProjeto();
  if (!confirm(`Parar os ${vivos.length} pedidos rodando neste projeto?`)) return;
  for (const v of vivos) api('execucao:cancelar', v.id);
}

function abrirGuia() {
  abrirTextoSomenteLeitura('guia', 'Guia do Orbion.ai', GUIA_RAPIDO);
}

const GUIA_RAPIDO = `# Orbion.ai

## Como trabalhar com várias IAs aqui
- **Times**: cada projeto tem quantos times tu quiser (Front, API, QA...). Cada time tem um Receptor, que lê o pedido e monta o plano, e os agentes que tu escolher.
- **Leitores em paralelo, um escritor por vez**: agentes que só leem (PO, Engenheiro, Revisor) trabalham juntos; quem edita arquivos espera a vez na fila de escrita do projeto. Dois times podem trabalhar ao mesmo tempo sem pisar no trabalho um do outro.
- **Passe de bastão**: cada agente termina contando o que fez para o próximo. O próximo recebe a tarefa, os passes dos colegas e a memória do projeto, e nada mais.
- **Revisão cruzada**: deixe quem verifica num motor diferente de quem faz (ex.: Dev no Claude, Tester no Codex). Um modelo pega erros que o outro não vê.
- **Memória do projeto**: o que os agentes aprendem fica em .orbion/memoria.md e entra nos próximos pedidos. Tu pode editar.
- **Tu decide**: aprova o plano, responde dúvidas e pode intervir num agente no meio do trabalho (painel Voo ou Orquestra → Intervir).

## Atalhos
- Ctrl+I: novo pedido · Ctrl+Shift+V: Voo · Ctrl+´: terminal
- Ctrl+P: arquivo · Ctrl+Shift+P: comandos · Ctrl+S: salvar
- Ctrl+B / Ctrl+J / Ctrl+Alt+B: barra lateral / painel de baixo / painel direito
`;
