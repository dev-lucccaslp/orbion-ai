// Terminal integrado: xterm.js na tela e um pseudo-terminal de verdade (ConPTY) no processo principal.

const TERMINAIS = []; // { id, nome, shell, termo, encaixe, caixa, saiu }
let terminalAtivo = null;
let shellsDisponiveis = null;

function temaDoTerminal() {
  const c = S.tema?.colors || {};
  const valido = (v) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined);
  const css = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const nomes = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
  // O fundo é o mesmo do painel (o terminal fica transparente sobre ele), para não destoar do resto.
  const tema = {
    background: '#00000000',
    foreground: valido(c['terminal.foreground']) || css('--texto'),
    cursor: valido(c['terminalCursor.foreground']) || valido(c['editorCursor.foreground']) || css('--foco'),
    cursorAccent: css('--painel'),
    selectionBackground: valido(c['terminal.selectionBackground']) || valido(c['editor.selectionBackground']) || '#ffffff33',
    scrollbarSliderBackground: css('--scroll'),
  };
  for (const n of nomes) {
    const cap = n[0].toUpperCase() + n.slice(1);
    tema[n] = valido(c[`terminal.ansi${cap}`]);
    tema[`bright${cap}`] = valido(c[`terminal.ansiBright${cap}`]);
  }
  return tema;
}

function aplicarTemaTerminais() {
  const tema = temaDoTerminal();
  for (const t of TERMINAIS) {
    t.termo.options.theme = tema;
    t.termo.options.fontFamily = S.config.fonte;
  }
}

async function novoTerminal(shellId = S.config.terminal) {
  abrirPainelEm('terminal');
  const caixa = h('div', { class: 'terminal-caixa' });
  $('#terminais').append(caixa);
  const termo = new window.Terminal({
    fontFamily: S.config.fonte,
    fontSize: Math.max(11, S.config.tamanhoFonte - 1),
    lineHeight: 1.3,
    fontWeight: '400',
    fontWeightBold: '600',
    cursorBlink: true,
    cursorStyle: 'bar',
    cursorWidth: 2,
    cursorInactiveStyle: 'outline',
    smoothScrollDuration: 90,
    minimumContrastRatio: 3,
    allowTransparency: true,
    allowProposedApi: true,
    scrollback: 5000,
    theme: temaDoTerminal(),
  });
  const encaixe = new window.FitAddon.FitAddon();
  termo.loadAddon(encaixe);
  termo.loadAddon(new window.WebLinksAddon.WebLinksAddon((_e, url) => api('abrir:link', url)));
  termo.open(caixa);
  encaixe.fit();
  let info;
  try {
    info = await api('terminal:criar', S.projeto?.caminho || null, shellId, termo.cols, termo.rows);
  } catch {
    termo.dispose();
    caixa.remove();
    return;
  }
  const t = { id: info.id, nome: info.nome, shell: info.shell, termo, encaixe, caixa, saiu: false };
  const mesmos = TERMINAIS.filter((x) => x.shell === info.shell).length;
  t.nome = mesmos ? `${info.nome} ${mesmos + 1}` : info.nome;
  TERMINAIS.push(t);
  termo.onData((d) => enviarRapido('terminal:escrever', t.id, d));
  termo.onResize(({ cols, rows }) => enviarRapido('terminal:tamanho', t.id, cols, rows));
  // Ctrl+C copia quando há seleção (senão vai para o processo); Ctrl+V cola.
  termo.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    if (e.ctrlKey && e.key === 'c' && termo.hasSelection()) { navigator.clipboard.writeText(termo.getSelection()); return false; }
    if (e.ctrlKey && e.key === 'v') { navigator.clipboard.readText().then((x) => enviarRapido('terminal:escrever', t.id, x)); return false; }
    if (e.ctrlKey && ['p', 'b', 'j', 'w'].includes(e.key.toLowerCase()) && !e.altKey) return false;
    return true;
  });
  new ResizeObserver(() => { if (!caixa.hidden && caixa.offsetWidth) encaixe.fit(); }).observe(caixa);
  ativarTerminal(t.id);
}

function ativarTerminal(id) {
  terminalAtivo = id;
  for (const t of TERMINAIS) t.caixa.hidden = t.id !== id;
  const t = TERMINAIS.find((x) => x.id === id);
  if (t) requestAnimationFrame(() => { t.encaixe.fit(); t.termo.focus(); });
  desenharListaTerminais();
}

function fecharTerminal(id = terminalAtivo) {
  const i = TERMINAIS.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [t] = TERMINAIS.splice(i, 1);
  if (!t.saiu) api('terminal:fechar', t.id).catch(() => {});
  t.termo.dispose();
  t.caixa.remove();
  if (terminalAtivo === id) terminalAtivo = TERMINAIS[i]?.id ?? TERMINAIS[i - 1]?.id ?? null;
  if (terminalAtivo != null) ativarTerminal(terminalAtivo);
  else desenharListaTerminais();
}

function desenharListaTerminais() {
  const ul = $('#lista-terminais');
  ul.hidden = TERMINAIS.length < 2;
  ul.replaceChildren(...TERMINAIS.map((t) => h('li', {
    class: `item-terminal${t.id === terminalAtivo ? ' ativo' : ''}${t.saiu ? ' saiu' : ''}`,
    onclick: () => ativarTerminal(t.id),
  }, ic('terminal'), h('span', { class: 'item-nome' }, t.nome),
  h('button', { class: 'bt-icone mini', title: 'Fechar', onclick: (e) => { e.stopPropagation(); fecharTerminal(t.id); } }, ic('trash')))));
  if (!TERMINAIS.length && S.painelAba === 'terminal') {
    $('#terminais').replaceChildren(h('div', { class: 'terminal-vazio' },
      h('button', { class: 'bt', onclick: () => novoTerminal() }, ic('terminal'), 'Abrir um terminal'),
      h('span', { class: 'mudo' }, 'Ctrl+Shift+´ abre outro. O terminal começa na pasta do projeto.')));
  } else $('#terminais').querySelector('.terminal-vazio')?.remove();
  desenharAcoesPainel();
}

async function escolherShell() {
  shellsDisponiveis ??= await api('terminal:shells');
  abrirPaleta({
    placeholder: 'Abrir terminal com…',
    itens: (busca) => shellsDisponiveis.filter((s) => nota(s.nome, busca) >= 0).map((s) => ({ rotulo: s.nome, icone: 'terminal', id: s.id, detalhe: s.id === S.config.terminal ? 'padrão' : '' })),
    aoEscolher: (s) => novoTerminal(s.id),
  });
}

async function escolherShellPadrao() {
  shellsDisponiveis ??= await api('terminal:shells');
  abrirPaleta({
    placeholder: 'Terminal padrão',
    itens: () => shellsDisponiveis.map((s) => ({ rotulo: s.nome, icone: s.id === S.config.terminal ? 'pass-filled' : 'terminal', id: s.id })),
    aoEscolher: async (s) => { S.config = { ...S.config, ...(await api('config:salvar', { terminal: s.id })) }; aviso(`${s.rotulo} é o terminal padrão.`, 'ok'); },
  });
}

function eventoTerminal(ev) {
  const t = TERMINAIS.find((x) => x.id === ev.id);
  if (!t) return;
  if (ev.tipo === 'terminal') t.termo.write(ev.dados);
  else {
    t.saiu = true;
    t.termo.write(`\r\n\x1b[2m[o processo terminou com código ${ev.codigo}]\x1b[0m\r\n`);
    desenharListaTerminais();
  }
}

/** Roda um comando no terminal ativo (ou num novo), como o "executar" do VS Code. */
/** Escreve e roda um comando no terminal. Com `novo`, abre outro terminal (que já enxerga um programa
 *  instalado depois que o terminal atual abriu). */
async function rodarNoTerminal(comando, novo = false) {
  if (novo || terminalAtivo == null || TERMINAIS.find((x) => x.id === terminalAtivo)?.saiu) await novoTerminal();
  abrirPainelEm('terminal');
  enviarRapido('terminal:escrever', terminalAtivo, `${comando}\r`);
}
