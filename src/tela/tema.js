// Aplica temas de cores e de ícones no formato do VS Code: na interface (variáveis CSS),
// no editor Monaco (regras de sintaxe) e na barra de título.

const PADRAO_ESCURO = {
  'editor.background': '#1F1F1F', foreground: '#CCCCCC', descriptionForeground: '#9D9D9D', focusBorder: '#0078D4',
  'sideBar.background': '#181818', 'activityBar.background': '#181818', 'activityBar.foreground': '#D7D7D7',
  'activityBar.inactiveForeground': '#868686', 'activityBar.activeBorder': '#0078D4', 'activityBarBadge.background': '#0078D4',
  'activityBarBadge.foreground': '#FFFFFF', 'editorGroupHeader.tabsBackground': '#181818', 'tab.activeBackground': '#1F1F1F',
  'tab.inactiveBackground': '#181818', 'tab.activeForeground': '#FFFFFF', 'tab.inactiveForeground': '#9D9D9D', 'tab.border': '#2B2B2B',
  'panel.background': '#181818', 'panel.border': '#2B2B2B', 'statusBar.background': '#181818', 'statusBar.foreground': '#CCCCCC',
  'list.hoverBackground': '#2A2D2E', 'list.activeSelectionBackground': '#04395E', 'list.inactiveSelectionBackground': '#37373D',
  'input.background': '#313131', 'input.border': '#3C3C3C', 'button.background': '#0078D4', 'button.foreground': '#FFFFFF',
  'button.hoverBackground': '#026EC1', 'editorWidget.background': '#202020', 'widget.shadow': '#0000005C', errorForeground: '#F85149',
  'editorWarning.foreground': '#CCA700', 'gitDecoration.modifiedResourceForeground': '#E2C08D', 'gitDecoration.untrackedResourceForeground': '#73C991',
  'gitDecoration.addedResourceForeground': '#81B88B', 'gitDecoration.deletedResourceForeground': '#C74E39', 'scrollbarSlider.background': '#79797966',
  'badge.background': '#616161', 'badge.foreground': '#F8F8F8', 'progressBar.background': '#0078D4', 'terminal.ansiGreen': '#0DBC79',
};
const PADRAO_CLARO = {
  'editor.background': '#FFFFFF', foreground: '#3B3B3B', descriptionForeground: '#717171', focusBorder: '#005FB8',
  'sideBar.background': '#F8F8F8', 'activityBar.background': '#F8F8F8', 'activityBar.foreground': '#1F1F1F',
  'activityBar.inactiveForeground': '#616161', 'activityBar.activeBorder': '#005FB8', 'activityBarBadge.background': '#005FB8',
  'activityBarBadge.foreground': '#FFFFFF', 'editorGroupHeader.tabsBackground': '#F8F8F8', 'tab.activeBackground': '#FFFFFF',
  'tab.inactiveBackground': '#F8F8F8', 'tab.activeForeground': '#3B3B3B', 'tab.inactiveForeground': '#868686', 'tab.border': '#E5E5E5',
  'panel.background': '#F8F8F8', 'panel.border': '#E5E5E5', 'statusBar.background': '#F8F8F8', 'statusBar.foreground': '#3B3B3B',
  'list.hoverBackground': '#F2F2F2', 'list.activeSelectionBackground': '#E8E8E8', 'list.inactiveSelectionBackground': '#E4E6F1',
  'input.background': '#FFFFFF', 'input.border': '#CECECE', 'button.background': '#005FB8', 'button.foreground': '#FFFFFF',
  'button.hoverBackground': '#0258A8', 'editorWidget.background': '#F8F8F8', 'widget.shadow': '#00000029', errorForeground: '#F85149',
  'editorWarning.foreground': '#BF8803', 'gitDecoration.modifiedResourceForeground': '#895503', 'gitDecoration.untrackedResourceForeground': '#007100',
  'gitDecoration.addedResourceForeground': '#587C0C', 'gitDecoration.deletedResourceForeground': '#AD0707', 'scrollbarSlider.background': '#64646466',
  'badge.background': '#CCCCCC', 'badge.foreground': '#3B3B3B', 'progressBar.background': '#005FB8', 'terminal.ansiGreen': '#00BC00',
};

const corValida = (c) => typeof c === 'string' && /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c.trim());

function aplicarTema(tema) {
  S.tema = tema;
  const claro = tema.type === 'light';
  const base = claro ? PADRAO_CLARO : PADRAO_ESCURO;
  const c = (...chaves) => {
    for (const k of chaves) {
      if (corValida(tema.colors?.[k])) return tema.colors[k];
      if (corValida(base[k])) return base[k];
    }
    return null;
  };
  const vars = {
    '--fundo': c('editor.background'),
    '--texto': c('foreground', 'editor.foreground'),
    '--mudo': c('descriptionForeground', 'tab.inactiveForeground'),
    '--borda': c('sideBar.border', 'editorGroup.border', 'panel.border', 'tab.border'),
    '--foco': c('focusBorder'),
    '--titulo': c('titleBar.activeBackground', 'sideBar.background'),
    '--titulo-texto': c('titleBar.activeForeground', 'foreground'),
    '--atividades': c('activityBar.background'),
    '--atividades-texto': c('activityBar.foreground'),
    '--atividades-inativo': c('activityBar.inactiveForeground'),
    '--atividades-marca': c('activityBar.activeBorder', 'focusBorder'),
    '--selo': c('activityBarBadge.background'),
    '--selo-texto': c('activityBarBadge.foreground'),
    '--lateral': c('sideBar.background'),
    '--lateral-texto': c('sideBar.foreground', 'foreground'),
    '--lateral-titulo': c('sideBarTitle.foreground', 'descriptionForeground'),
    '--secao': c('sideBarSectionHeader.background', 'sideBar.background'),
    '--secao-texto': c('sideBarSectionHeader.foreground', 'sideBar.foreground', 'foreground'),
    '--abas': c('editorGroupHeader.tabsBackground'),
    '--aba': c('tab.inactiveBackground'),
    '--aba-ativa': c('tab.activeBackground', 'editor.background'),
    '--aba-texto': c('tab.inactiveForeground'),
    '--aba-ativa-texto': c('tab.activeForeground'),
    '--aba-borda': c('tab.border'),
    '--aba-topo': c('tab.activeBorderTop', 'focusBorder'),
    '--painel': c('panel.background'),
    '--painel-borda': c('panel.border'),
    '--painel-marca': c('panelTitle.activeBorder', 'focusBorder'),
    '--status': c('statusBar.background'),
    '--status-texto': c('statusBar.foreground'),
    '--status-borda': c('statusBar.border', 'panel.border'),
    '--status-destaque': c('statusBarItem.remoteBackground', 'button.background'),
    '--status-destaque-texto': c('statusBarItem.remoteForeground', 'button.foreground'),
    '--hover': c('list.hoverBackground'),
    '--sel': c('list.activeSelectionBackground'),
    '--sel-texto': c('list.activeSelectionForeground', 'foreground'),
    '--sel-inativa': c('list.inactiveSelectionBackground'),
    '--entrada': c('input.background'),
    '--entrada-texto': c('input.foreground', 'foreground'),
    '--entrada-borda': c('input.border', 'panel.border'),
    '--placeholder': c('input.placeholderForeground', 'descriptionForeground'),
    '--botao': c('button.background'),
    '--botao-texto': c('button.foreground'),
    '--botao-hover': c('button.hoverBackground', 'button.background'),
    '--botao2': c('button.secondaryBackground', 'list.hoverBackground'),
    '--botao2-texto': c('button.secondaryForeground', 'foreground'),
    '--widget': c('editorWidget.background', 'sideBar.background'),
    '--sombra': c('widget.shadow'),
    '--erro': c('errorForeground', 'editorError.foreground'),
    '--aviso': c('editorWarning.foreground'),
    '--ok': c('terminal.ansiGreen', 'gitDecoration.addedResourceForeground'),
    '--git-m': c('gitDecoration.modifiedResourceForeground'),
    '--git-u': c('gitDecoration.untrackedResourceForeground'),
    '--git-a': c('gitDecoration.addedResourceForeground'),
    '--git-d': c('gitDecoration.deletedResourceForeground'),
    '--scroll': c('scrollbarSlider.background'),
    '--progresso': c('progressBar.background', 'focusBorder'),
    '--badge': c('badge.background'),
    '--badge-texto': c('badge.foreground'),
  };
  const raiz = document.documentElement;
  for (const [k, v] of Object.entries(vars)) if (v) raiz.style.setProperty(k, v);
  raiz.dataset.claro = claro ? 'sim' : 'nao';
  api('janela:titulo', vars['--titulo'].slice(0, 7), vars['--titulo-texto'].slice(0, 7)).catch(() => {});
  if (window.monaco) aplicarTemaMonaco();
}

/* ---------- sintaxe no Monaco a partir dos tokenColors do tema ---------- */

const MAPA_TOKENS = [
  ['comment', 'comment'], ['string', 'string.quoted'], ['string.escape', 'constant.character.escape'], ['number', 'constant.numeric'],
  ['regexp', 'string.regexp'], ['keyword', 'keyword.control', 'keyword', 'storage.type'], ['operator', 'keyword.operator'],
  ['delimiter', 'punctuation'], ['type', 'entity.name.type', 'support.type', 'storage.type'], ['type.identifier', 'entity.name.type', 'support.class'],
  ['identifier', 'variable.other', 'variable'], ['variable', 'variable'], ['variable.predefined', 'variable.language'],
  ['constant', 'constant.language'], ['tag', 'entity.name.tag'], ['metatag', 'entity.name.tag'], ['attribute.name', 'entity.other.attribute-name'],
  ['attribute.value', 'string.quoted'], ['annotation', 'meta.decorator', 'storage.type.annotation'], ['predefined', 'support.function'],
  ['key', 'support.type.property-name'], ['string.key.json', 'support.type.property-name.json', 'support.type.property-name'],
  ['string.value.json', 'string.quoted'], ['keyword.json', 'constant.language'], ['number.json', 'constant.numeric'],
  ['keyword.md', 'markup.heading', 'entity.name.section'], ['strong', 'markup.bold'], ['emphasis', 'markup.italic'],
  ['string.link.md', 'markup.underline.link'], ['variable.md', 'markup.inline.raw'],
];

function seletores(regra) {
  const s = regra.scope;
  const lista = Array.isArray(s) ? s : String(s || '').split(',');
  return lista.map((x) => x.trim()).filter((x) => x && !x.includes(' '));
}

function estiloDoEscopo(tokenColors, escopo) {
  let melhor = null;
  let tamanho = -1;
  for (const regra of tokenColors) {
    if (!regra.settings) continue;
    for (const sel of seletores(regra)) {
      if ((escopo === sel || escopo.startsWith(`${sel}.`)) && sel.length >= tamanho) {
        melhor = regra.settings;
        tamanho = sel.length;
      }
    }
  }
  return melhor;
}

function aplicarTemaMonaco() {
  const t = S.tema;
  const regras = [];
  for (const [token, ...escopos] of MAPA_TOKENS) {
    let estilo = null;
    for (const e of escopos) if ((estilo = estiloDoEscopo(t.tokenColors || [], e))) break;
    if (!estilo) continue;
    const regra = { token };
    if (corValida(estilo.foreground)) regra.foreground = estilo.foreground.replace('#', '');
    if (estilo.fontStyle) regra.fontStyle = estilo.fontStyle;
    if (regra.foreground || regra.fontStyle) regras.push(regra);
  }
  const cores = {};
  for (const [k, v] of Object.entries(t.colors || {})) if (corValida(v)) cores[k] = v;
  const base = t.type === 'light' ? 'vs' : 'vs-dark';
  try {
    monaco.editor.defineTheme('orbion', { base, inherit: true, rules: regras, colors: cores });
  } catch {
    monaco.editor.defineTheme('orbion', { base, inherit: true, rules: regras, colors: {} });
  }
  monaco.editor.setTheme('orbion');
}

/* ---------- temas de ícones ---------- */

const CORES_MINIMO = {
  js: '#F1DD3F', mjs: '#F1DD3F', cjs: '#F1DD3F', jsx: '#61DAFB', ts: '#3178C6', tsx: '#3178C6', json: '#F5A623', md: '#42A5F5',
  css: '#42A5F5', scss: '#EC407A', html: '#E44D26', py: '#3572A5', java: '#E76F00', cs: '#68217A', go: '#00ADD8', rs: '#DEA584',
  sql: '#E38C00', yml: '#CB171E', yaml: '#CB171E', svg: '#FFB13B', png: '#26A69A', jpg: '#26A69A', sh: '#89E051', env: '#ECD53F',
};

function aplicarIcones(tema) {
  if (tema && !tema.minimo && tema.light && S.tema?.type === 'light') {
    const juntar = (a, b) => ({ ...(a || {}), ...(b || {}) });
    const l = tema.light;
    tema = {
      ...tema,
      file: l.file || tema.file, folder: l.folder || tema.folder, folderExpanded: l.folderExpanded || tema.folderExpanded,
      rootFolder: l.rootFolder || tema.rootFolder, rootFolderExpanded: l.rootFolderExpanded || tema.rootFolderExpanded,
      fileExtensions: juntar(tema.fileExtensions, l.fileExtensions), fileNames: juntar(tema.fileNames, l.fileNames),
      folderNames: juntar(tema.folderNames, l.folderNames), folderNamesExpanded: juntar(tema.folderNamesExpanded, l.folderNamesExpanded),
      languageIds: juntar(tema.languageIds, l.languageIds),
    };
  }
  S.icones = tema;
}

/** Ícone de um arquivo ou pasta pelo tema de ícones ativo. */
function iconeDe(nome, { pasta = false, aberta = false, raiz = false } = {}) {
  const t = S.icones;
  const n = nome.toLowerCase();
  if (!t || t.minimo) {
    if (pasta) return h('i', { class: `codicon codicon-${aberta ? 'folder-opened' : 'folder'} icone-item` });
    const ext = n.split('.').pop();
    return h('i', { class: 'codicon codicon-file icone-item', cor: CORES_MINIMO[ext] || 'var(--mudo)' });
  }
  let id;
  if (pasta) {
    if (raiz) id = aberta ? (t.rootFolderNamesExpanded[n] || t.rootFolderExpanded) : (t.rootFolderNames[n] || t.rootFolder);
    id = id || (aberta ? (t.folderNamesExpanded[n] || t.folderExpanded) : t.folderNames[n] || t.folder);
  } else {
    id = t.fileNames[n];
    const partes = n.split('.');
    for (let i = 1; !id && i < partes.length; i++) id = t.fileExtensions[partes.slice(i).join('.')];
    if (!id) {
      const lang = linguagemDoArquivo(nome);
      if (lang) id = t.languageIds[lang];
    }
    id = id || t.file;
  }
  const url = t.defs[id] || t.defs[pasta ? t.folder : t.file];
  if (!url) return h('i', { class: `codicon codicon-${pasta ? 'folder' : 'file'} icone-item` });
  return h('img', { class: 'icone-item', src: url, alt: '', draggable: 'false' });
}

async function trocarTema(id) {
  const tema = await api('temas:cores', id);
  aplicarTema(tema);
  aplicarTemaTerminais();
  if (S.icones && !S.icones.minimo) aplicarIcones(await api('temas:icones', S.config.temaIcones));
  S.config = { ...S.config, ...(await api('config:salvar', { tema: id })) };
  desenharTudo();
}

async function trocarIcones(id) {
  aplicarIcones(await api('temas:icones', id));
  S.config = { ...S.config, ...(await api('config:salvar', { temaIcones: id })) };
  desenharTudo();
}
