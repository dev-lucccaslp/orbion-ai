// Extensões: o tema em uso, os temas instalados com uma miniatura das cores de cada um, a loja do Open VSX
// em cartões e a página de cada extensão, como no VS Code (descrição, README, versão, licença, instalar).
// As skills têm a vista delas (skills.js).

const AMOSTRAS = new Map(); // id do tema → as cores que a miniatura mostra
let buscandoAmostras = false;

function amostraDoTema(t) {
  const c = t.colors || {};
  const cor = (...k) => k.map((x) => c[x]).find((v) => typeof v === 'string' && v.startsWith('#'));
  const token = (alvo) => (t.tokenColors || []).find((r) => [].concat(r.scope || []).some((s) => String(s).split(/[\s,]+/).some((x) => x === alvo || x.startsWith(`${alvo}.`))))?.settings?.foreground;
  const claro = t.type === 'light';
  const texto = cor('editor.foreground', 'foreground') || (claro ? '#333333' : '#cccccc');
  const destaque = cor('button.background', 'focusBorder', 'activityBar.activeBorder') || '#4c6bff';
  return {
    fundo: cor('editor.background') || (claro ? '#ffffff' : '#1e1e1e'),
    lateral: cor('sideBar.background', 'activityBar.background', 'editor.background') || (claro ? '#f3f3f3' : '#252526'),
    topo: cor('titleBar.activeBackground', 'activityBar.background', 'sideBar.background') || (claro ? '#e5e5e5' : '#181818'),
    destaque,
    texto,
    palavra: token('keyword') || token('storage') || destaque,
    texto2: token('string') || texto,
    funcao: token('entity.name.function') || token('support.function') || destaque,
  };
}

/** Lê as cores dos temas instalados (uma vez), para as miniaturas. */
async function carregarAmostras() {
  if (buscandoAmostras) return;
  const faltam = (S.temas?.cores || []).filter((t) => !AMOSTRAS.has(t.id));
  if (!faltam.length) return;
  buscandoAmostras = true;
  await Promise.all(faltam.map((t) => chamar('temas:cores', t.id).then((x) => AMOSTRAS.set(t.id, amostraDoTema(x || {}))).catch(() => AMOSTRAS.set(t.id, amostraDoTema({})))));
  buscandoAmostras = false;
  if (S.vista === 'extensoes') desenharLateral();
}

/** Uma janelinha com as cores do tema: barra de cima, lateral e três linhas de código. */
function miniaturaDoTema(id, grande = false) {
  const a = AMOSTRAS.get(id);
  if (!a) return h('span', { class: `mini-tema vazio${grande ? ' grande' : ''}` });
  return h('span', {
    class: `mini-tema${grande ? ' grande' : ''}`,
    style: `--m-fundo:${a.fundo};--m-lateral:${a.lateral};--m-topo:${a.topo};--m-destaque:${a.destaque}`,
  },
  h('i', { class: 'mini-topo' }),
  h('i', { class: 'mini-lateral' }),
  h('span', { class: 'mini-codigo' },
    h('i', { style: `background:${a.palavra};width:38%` }),
    h('i', { style: `background:${a.funcao};width:58%;margin-left:12%` }),
    h('i', { style: `background:${a.texto2};width:46%;margin-left:12%` }),
    grande ? h('i', { style: `background:${a.texto};width:30%;opacity:.55` }) : null));
}

const idDaExtensaoDoTema = (t) => t.id.split('#')[0];
// Os temas instalados começam recolhidos: o que mais se usa aqui é a loja.
secoesFechadas.add('ext-cores');
secoesFechadas.add('ext-icones');

/** A página da extensão de onde vem um tema instalado; os temas do próprio Orbion levam às Configurações. */
function abrirPaginaDoTema(t) {
  const id = idDaExtensaoDoTema(t);
  const ponto = id.indexOf('.');
  if (ponto < 1 || t.extensao === 'Orbion.ai') return abrirConfig();
  abrirExtensao({ id, namespace: id.slice(0, ponto), nome: id.slice(ponto + 1), titulo: t.extensao || id, descricao: '', downloads: 0 });
}
const extensaoInstalada = (id) => [...S.temas.cores, ...S.temas.icones].some((t) => idDaExtensaoDoTema(t) === id);

function abrirExtensao(x) {
  const id = `ext:${x.id}`;
  if (S.abas.some((a) => a.id === id)) return ativarAba(id);
  abrirAba({ id, tipo: 'extensao', titulo: x.titulo, x });
}

function botaoInstalar(x, grande = false) {
  if (extensaoInstalada(x.id)) return h('span', { class: `tag-instalada${grande ? ' grande' : ''}` }, ic('check'), 'Instalada');
  const ocupado = LOJA.instalando.has(x.id);
  return h('button', {
    class: grande ? 'bt bt-principal' : 'bt-mini bt-instalar',
    disabled: ocupado,
    onclick: async (e) => {
      e.stopPropagation();
      await instalarDaLoja(x);
      const aba = S.abas.find((a) => a.id === `ext:${x.id}`);
      if (aba && S.ativa === aba.id) redesenharPagina(aba);
    },
  }, ocupado ? ic('loading', 'codicon-modifier-spin') : grande ? ic('cloud-download') : null, ocupado ? 'Instalando…' : 'Instalar');
}

VISTAS.extensoes = {
  titulo: 'Extensões',
  acoes: () => [
    ['refresh', 'Procurar de novo nas pastas', async () => { S.temas = await api('temas:listar'); S.skills = null; AMOSTRAS.clear(); desenharLateral(); }],
    ['folder-opened', 'Abrir a pasta de extensões do Orbion', () => api('extensoes:abrirPasta')],
  ],
  desenhar() {
    carregarAmostras();
    if (!LOJA.campo) {
      LOJA.campo = h('input', { type: 'search', class: 'busca-loja', placeholder: 'Buscar temas' });
      LOJA.campo.addEventListener('input', () => { LOJA.termo = LOJA.campo.value.trim(); buscarNaLoja(); desenharLateral(); });
      buscarNaLoja();
    }
    const filtro = (t) => !LOJA.termo || nota(`${t.nome} ${t.extensao}`, LOJA.termo) >= 0;
    const temaAtual = S.temas.cores.find((t) => t.id === S.config.tema);
    const iconesAtuais = S.temas.icones.find((t) => t.id === S.config.temaIcones);

    // Trocar de tema é nas Configurações; aqui, o clique abre a página da extensão de onde o tema vem.
    const abrirOrigem = (t) => abrirPaginaDoTema(t);
    const linhaTema = (t) => h('div', {
      class: `item-arvore item-tema${t.id === S.config.tema ? ' selecionado' : ''}`, title: `${t.nome}\n${t.extensao}`, onclick: () => abrirOrigem(t),
    },
    miniaturaDoTema(t.id),
    h('span', { class: 'item-nome' }, t.nome),
    h('span', { class: 'item-dica' }, t.extensao),
    t.id === S.config.tema ? ic('check', 'tema-marcado') : null);
    const linhaIcones = (t) => h('div', {
      class: `item-arvore item-tema${t.id === S.config.temaIcones ? ' selecionado' : ''}`, title: `${t.nome}\n${t.extensao}`, onclick: () => abrirOrigem(t),
    },
    h('span', { class: 'mini-icones' }, ic('folder'), ic('file-code'), ic('json')),
    h('span', { class: 'item-nome' }, t.nome),
    h('span', { class: 'item-dica' }, t.extensao),
    t.id === S.config.temaIcones ? ic('check', 'tema-marcado') : null);

    const cartaoLoja = (x) => h('div', { class: 'item-loja', title: x.descricao, onclick: () => abrirExtensao(x) },
      x.icone ? h('img', { class: 'loja-icone', src: x.icone, alt: '' }) : h('span', { class: 'loja-icone' }, ic('extensions')),
      h('div', { class: 'loja-texto' },
        h('div', { class: 'loja-linha' }, h('strong', {}, x.titulo), botaoInstalar(x)),
        h('div', { class: 'loja-desc' }, x.descricao),
        h('div', { class: 'loja-meta' },
          h('span', { class: 'loja-autor' }, x.namespace),
          h('span', {}, ic('cloud-download'), fmtTokens(x.downloads)),
          x.nota ? h('span', {}, ic('star-full'), x.nota.toFixed(1)) : null)));

    const cores = S.temas.cores.filter(filtro);
    const icones = S.temas.icones.filter(filtro);
    return [
      h('div', { class: 'loja-topo' }, h('label', { class: 'busca-com-icone' }, ic('search'), LOJA.campo)),
      LOJA.termo ? null : h('div', { class: 'tema-atual' },
        miniaturaDoTema(S.config.tema, true),
        h('div', { class: 'tema-atual-texto' },
          h('span', { class: 'tema-atual-rotulo' }, 'Em uso'),
          h('strong', {}, temaAtual?.nome || S.config.tema),
          h('span', { class: 'item-dica' }, iconesAtuais ? `Ícones: ${iconesAtuais.nome}` : ''),
          h('div', { class: 'tema-atual-acoes' },
            h('button', { class: 'bt-mini', onclick: abrirConfig }, ic('settings-gear'), 'Trocar nas Configurações')))),
      secao('ext-cores', 'Temas de cores', cores.length ? cores.map(linhaTema) : h('p', { class: 'lateral-texto' }, 'Nenhum tema instalado com esse nome.'), { contador: cores.length }),
      secao('ext-icones', 'Temas de ícones', icones.map(linhaIcones), { contador: icones.length }),
      secao('ext-loja', LOJA.termo ? 'Open VSX: resultados' : 'Open VSX: os mais baixados', [
        LOJA.erro ? h('p', { class: 'lateral-texto' }, LOJA.erro) : null,
        LOJA.buscando && !LOJA.resultados?.length ? h('p', { class: 'lateral-texto' }, ic('loading', 'codicon-modifier-spin'), ' Buscando…') : null,
        ...(LOJA.resultados || []).map(cartaoLoja),
        LOJA.resultados && !LOJA.resultados.length && !LOJA.erro ? h('p', { class: 'lateral-texto' }, 'Nada encontrado.') : null,
      ], { cresce: true }),
    ];
  },
};

/* ---------- a página de uma extensão ---------- */

/** O README sem imagens e sem HTML, que a página não mostra (vem de fora e ficaria quebrado). */
const leiameLimpo = (texto) => String(texto || '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[\s*\]\([^)]*\)/g, '') // o link que só tinha uma imagem
  .replace(/<img\b[^>]*>/gi, '')
  .replace(/<\/?(p|div|a|span|br|h\d|img|picture|source|table|tr|td|th|tbody|thead|center|sup|sub|details|summary)\b[^>]*>/gi, '')
  .split('\n').filter((l) => !(l.includes('|') && !l.replace(/[|:\s-]/g, ''))).join('\n') // linha de tabela que ficou vazia
  .replace(/\n{3,}/g, '\n\n')
  .trim();

PAGINAS.extensao = {
  icone: () => ic('extensions'),
  desenhar(aba, host) {
    const x = aba.x;
    const d = LOJA.detalhes.get(x.id);
    if (!d && !aba.carregando && !aba.erro) {
      aba.carregando = true;
      chamar('loja:detalhes', x.namespace, x.nome)
        .then((r) => { LOJA.detalhes.set(x.id, r); })
        .catch((e) => { aba.erro = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); })
        .finally(() => { aba.carregando = false; if (S.ativa === aba.id) redesenharPagina(aba); });
    }
    const info = { ...x, ...(d || {}) };
    const temasDela = S.temas.cores.filter((t) => idDaExtensaoDoTema(t) === x.id);
    const iconesDela = S.temas.icones.filter((t) => idDaExtensaoDoTema(t) === x.id);
    const link = (url, texto) => h('a', { href: '#', title: url, onclick: (e) => { e.preventDefault(); api('abrir:link', url); } }, texto || url.replace(/^https?:\/\/(www\.)?/, ''));
    const sep = () => h('span', { class: 'ext-sep' }, '·');
    const linha = (rotulo, valor) => (valor ? h('div', { class: 'ext-dado' }, h('span', { class: 'mudo' }, rotulo), h('span', {}, valor)) : null);
    const quando = d?.data ? new Date(d.data).toLocaleDateString(localeAtual(), { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    host.append(h('div', { class: 'pagina pagina-extensao' },
      h('div', { class: 'ext-topo' },
        info.icone ? h('img', { class: 'ext-icone', src: info.icone, alt: '' }) : h('span', { class: 'ext-icone' }, ic('extensions')),
        h('div', { class: 'ext-cabeca' },
          h('h1', {}, info.titulo),
          h('div', { class: 'ext-meta' },
            h('span', { class: 'ext-autor' }, d?.editor || x.namespace, d?.verificado ? ic('verified-filled', 'ext-verificado') : null),
            sep(), h('span', {}, ic('cloud-download'), fmtTokens(info.downloads || 0)),
            info.nota ? [sep(), h('span', {}, ic('star-full', 'ext-estrela'), info.nota.toFixed(1), d?.avaliacoes ? ` (${d.avaliacoes})` : '')] : null,
            info.versao ? [sep(), h('span', { class: 'mono' }, `v${info.versao}`)] : null),
          h('p', { class: 'ext-desc' }, info.descricao),
          h('div', { class: 'ext-acoes' },
            botaoInstalar(x, true),
            ...temasDela.slice(0, 3).map((t) => h('button', { class: `bt${t.id === S.config.tema ? ' ligado' : ''}`, onclick: () => trocarTema(t.id).then(() => redesenharPagina(aba)) },
              miniaturaDoTema(t.id), t.id === S.config.tema ? `Em uso: ${t.nome}` : `Usar ${t.nome}`)),
            ...iconesDela.slice(0, 2).map((t) => h('button', { class: 'bt', onclick: () => trocarIcones(t.id).then(() => redesenharPagina(aba)) }, ic('file-media'), `Usar ${t.nome}`)),
            h('button', { class: 'bt', onclick: () => api('abrir:link', d?.url || `https://open-vsx.org/extension/${x.namespace}/${x.nome}`) }, ic('link-external'), 'Abrir no Open VSX')),
          temasDela.length > 3 ? h('p', { class: 'mudo pequeno' }, `Mais ${temasDela.length - 3} temas desta extensão na lista de temas de cores.`) : null)),
      h('div', { class: 'ext-corpo' },
        h('div', { class: 'ext-leiame' },
          aba.erro ? h('p', { class: 'erro-texto' }, aba.erro)
            : !d ? h('p', { class: 'mudo' }, ic('loading', 'codicon-modifier-spin'), ' Carregando a página da extensão…')
              : leiameLimpo(d.leiame) ? markdown(leiameLimpo(d.leiame)) : h('p', { class: 'mudo' }, 'Esta extensão não tem uma descrição longa.')),
        d ? h('aside', { class: 'ext-lado' },
          h('h4', {}, 'Detalhes'),
          linha('Versão', d.versao),
          linha('Atualizada', quando),
          linha('Licença', d.licenca),
          linha('Identificador', h('span', { class: 'mono' }, `${d.namespace}.${d.nome}`)),
          d.categorias.length ? h('div', { class: 'ext-dado' }, h('span', { class: 'mudo' }, 'Categorias'), h('div', { class: 'ext-chips' }, d.categorias.map((c) => h('span', { class: 'ext-chip' }, c)))) : null,
          d.tags.length ? h('div', { class: 'ext-dado' }, h('span', { class: 'mudo' }, 'Tags'), h('div', { class: 'ext-chips' }, d.tags.map((c) => h('span', { class: 'ext-chip' }, c)))) : null,
          d.repositorio || d.site ? h('h4', {}, 'Links') : null,
          d.repositorio ? h('div', { class: 'ext-dado' }, ic('github'), link(d.repositorio)) : null,
          d.site && d.site !== d.repositorio ? h('div', { class: 'ext-dado' }, ic('globe'), link(d.site)) : null) : null)));
  },
};
