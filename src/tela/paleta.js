// Caixa de busca no topo, como a do VS Code: arquivos (Ctrl+P), comandos (Ctrl+Shift+P)
// e perguntas rápidas (nome de arquivo, nome de agente).

let paletaAtual = null;

function abrirPaleta({ placeholder, itens, aoEscolher, valor = '', modoTexto = false }) {
  const caixa = $('#paleta');
  const campo = $('#paleta-campo');
  paletaAtual = { itens, aoEscolher, modoTexto, selecionado: 0, lista: [] };
  campo.placeholder = placeholder;
  campo.value = valor;
  caixa.hidden = false;
  campo.focus();
  campo.select();
  atualizarPaleta();
}

function fecharPaleta() {
  $('#paleta').hidden = true;
  paletaAtual = null;
}

async function atualizarPaleta() {
  const p = paletaAtual;
  if (!p) return;
  const ul = $('#paleta-lista');
  if (p.modoTexto) {
    ul.replaceChildren(h('li', { class: 'paleta-dica' }, 'Enter confirma, Esc cancela'));
    return;
  }
  const texto = $('#paleta-campo').value;
  const lista = await p.itens(texto);
  if (paletaAtual !== p) return;
  p.lista = lista.slice(0, 80);
  p.selecionado = Math.min(p.selecionado, Math.max(p.lista.length - 1, 0));
  ul.replaceChildren(...p.lista.map((it, i) => h('li', {
    class: `paleta-item${i === p.selecionado ? ' selecionado' : ''}`,
    onmousedown: (e) => { e.preventDefault(); escolherNaPaleta(i); },
  },
  it.iconeArquivo ? iconeDe(it.iconeArquivo) : ic(it.icone || 'circle-small-filled', it.cor ? 'colorido' : ''),
  h('span', { class: 'paleta-rotulo', cor: it.cor }, it.rotulo),
  it.detalhe ? h('span', { class: 'paleta-detalhe' }, it.detalhe) : null,
  it.atalho ? h('kbd', {}, it.atalho) : null)));
  if (!p.lista.length) ul.append(h('li', { class: 'paleta-dica' }, 'Nada encontrado'));
  ul.querySelector('.selecionado')?.scrollIntoView({ block: 'nearest' });
}

function escolherNaPaleta(i) {
  const p = paletaAtual;
  if (!p) return;
  const valor = $('#paleta-campo').value;
  fecharPaleta();
  if (p.modoTexto) {
    if (valor.trim()) p.aoEscolher(valor);
  } else if (p.lista[i]) p.aoEscolher(p.lista[i]);
}

/** Pede um texto curto na caixa do topo (substitui o prompt() do navegador). */
function pedirTexto({ placeholder, valor = '', aoConfirmar }) {
  abrirPaleta({ placeholder, valor, modoTexto: true, itens: () => [], aoEscolher: (v) => Promise.resolve(aoConfirmar(v)).catch(() => {}) });
}

$('#paleta-campo').addEventListener('input', () => {
  if (!paletaAtual) return;
  const v = $('#paleta-campo').value;
  // Como no VS Code: digitar ">" na busca de arquivos vira busca de comandos.
  if (!paletaAtual.modoTexto && paletaAtual.tipo === 'arquivos' && v.startsWith('>')) return abrirComandos(v.slice(1));
  paletaAtual.selecionado = 0;
  atualizarPaleta();
});
$('#paleta-campo').addEventListener('keydown', (e) => {
  const p = paletaAtual;
  if (!p) return;
  if (e.key === 'Escape') { e.preventDefault(); fecharPaleta(); return; }
  if (e.key === 'Enter') { e.preventDefault(); escolherNaPaleta(p.selecionado); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = p.lista.length;
    if (!n) return;
    p.selecionado = (p.selecionado + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    atualizarPaleta();
  }
});
$('#paleta-campo').addEventListener('blur', () => setTimeout(() => { if (paletaAtual && document.activeElement !== $('#paleta-campo')) fecharPaleta(); }, 120));

/* ---------- busca de arquivos ---------- */

let cacheArquivos = { projeto: null, lista: [], quando: 0 };

async function abrirBuscaArquivos() {
  if (!S.projeto) return abrirComandos();
  if (cacheArquivos.projeto !== S.projeto.caminho || Date.now() - cacheArquivos.quando > 15000) {
    cacheArquivos = { projeto: S.projeto.caminho, lista: await api('fs:todos', S.projeto.caminho), quando: Date.now() };
  }
  abrirPaleta({
    placeholder: 'Buscar arquivo pelo nome (digite > para comandos)',
    itens: (busca) => {
      const recentes = S.abas.filter((a) => a.tipo === 'arquivo').map((a) => a.rel);
      const base = busca ? cacheArquivos.lista : [...new Set([...recentes, ...cacheArquivos.lista])];
      return base
        .map((rel) => ({ rel, n: nota(rel, busca) }))
        .filter((x) => x.n >= 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 80)
        .map(({ rel }) => ({ rotulo: nomeDe(rel), detalhe: pastaDe(rel), iconeArquivo: nomeDe(rel), rel }));
    },
    aoEscolher: (it) => { abrirArquivo(it.rel); revelarNaArvore(it.rel); },
  });
  paletaAtual.tipo = 'arquivos';
}

/* ---------- comandos ---------- */

/** Os comandos são os mesmos itens dos menus do topo, com o nome do menu na frente. */
function comandos() {
  return itensDosMenus().flatMap(([menu, itens]) => itens
    .filter((it) => it !== '-' && it[4] !== false)
    .map(([texto, icone, acao, atalho]) => ({ rotulo: `${menu}: ${texto}`, icone, acao, atalho })));
}

function abrirComandos(inicial = '') {
  abrirPaleta({
    placeholder: 'Digite um comando',
    valor: inicial,
    itens: (busca) => comandos()
      .map((c) => ({ ...c, n: nota(c.rotulo, busca) }))
      .filter((c) => c.n >= 0)
      .sort((a, b) => (busca ? b.n - a.n : 0)),
    aoEscolher: (c) => c.acao(),
  });
}

function escolherTema() {
  const original = S.config.tema;
  abrirPaleta({
    placeholder: 'Escolha o tema de cores',
    itens: (busca) => S.temas.cores.filter((t) => nota(`${t.nome} ${t.extensao}`, busca) >= 0)
      .map((t) => ({ rotulo: t.nome, detalhe: t.extensao, icone: t.id === original ? 'pass-filled' : t.tipo === 'claro' ? 'color-mode' : 'circle-filled', id: t.id })),
    aoEscolher: (t) => trocarTema(t.id),
  });
}

function escolherIcones() {
  abrirPaleta({
    placeholder: 'Escolha o tema de ícones',
    itens: (busca) => S.temas.icones.filter((t) => nota(`${t.nome} ${t.extensao}`, busca) >= 0)
      .map((t) => ({ rotulo: t.nome, detalhe: t.extensao, icone: t.id === S.config.temaIcones ? 'pass-filled' : 'file-media', id: t.id })),
    aoEscolher: (t) => trocarIcones(t.id),
  });
}
