// Temas de cores e de ícones: os que vêm com o Orbion.ai e os das extensões do
// VS Code (e do Cursor) que a pessoa já tem instaladas, no mesmo formato delas.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EMBUTIDOS } = require('./temas-embutidos');

function pastasExtensoes() {
  const casa = os.homedir();
  return [
    path.join(casa, '.orbion', 'extensoes'),
    path.join(casa, '.vscode', 'extensions'),
    path.join(casa, '.vscode-insiders', 'extensions'),
    path.join(casa, '.cursor', 'extensions'),
  ].filter((p) => fs.existsSync(p));
}

/** JSON com comentários e vírgulas sobrando, como os temas do VS Code. */
function lerJsonc(texto) {
  let saida = '';
  let emTexto = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const prox = texto[i + 1];
    if (emTexto) {
      saida += c;
      if (c === '\\') { saida += prox ?? ''; i++; } else if (c === '"') emTexto = false;
    } else if (c === '"') {
      emTexto = true;
      saida += c;
    } else if (c === '/' && prox === '/') {
      while (i < texto.length && texto[i] !== '\n') i++;
      saida += '\n';
    } else if (c === '/' && prox === '*') {
      i += 2;
      while (i < texto.length && !(texto[i] === '*' && texto[i + 1] === '/')) i++;
      i++;
    } else {
      saida += c;
    }
  }
  const limpo = saida.charCodeAt(0) === 0xfeff ? saida.slice(1) : saida;
  return JSON.parse(limpo.replace(/,(\s*[}\]])/g, '$1'));
}

const lerArquivoJson = (arquivo) => lerJsonc(fs.readFileSync(arquivo, 'utf8'));

function compararVersoes(a, b) {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

function traduzir(rotulo, nls) {
  const m = /^%(.+)%$/.exec(rotulo || '');
  return m && nls[m[1]] ? (typeof nls[m[1]] === 'string' ? nls[m[1]] : nls[m[1]].message) : rotulo;
}

/** Varre as pastas de extensões e devolve os temas que elas oferecem (a versão mais nova de cada). */
function escanear() {
  const porExtensao = new Map();
  for (const base of pastasExtensoes()) {
    let pastas = [];
    try { pastas = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch {}
    for (const d of pastas) {
      const raiz = path.join(base, d.name);
      let pkg;
      try { pkg = lerArquivoJson(path.join(raiz, 'package.json')); } catch { continue; }
      const c = pkg.contributes || {};
      if (!c.themes?.length && !c.iconThemes?.length) continue;
      const id = `${pkg.publisher || 'local'}.${pkg.name || d.name}`.toLowerCase();
      const atual = porExtensao.get(id);
      if (atual && compararVersoes(atual.pkg.version || '0', pkg.version || '0') >= 0) continue;
      porExtensao.set(id, { id, raiz, pkg, origem: base });
    }
  }
  const cores = [];
  const icones = [];
  for (const ext of porExtensao.values()) {
    let nls = {};
    try { nls = lerArquivoJson(path.join(ext.raiz, 'package.nls.json')); } catch {}
    const nomeExt = traduzir(ext.pkg.displayName, nls) || ext.pkg.name;
    (ext.pkg.contributes.themes || []).forEach((t, i) => {
      cores.push({
        id: `${ext.id}#${t.id || t.label || i}`,
        nome: traduzir(t.label, nls) || t.id || `Tema ${i + 1}`,
        tipo: t.uiTheme === 'vs' || /light/.test(t.uiTheme) ? 'claro' : 'escuro',
        extensao: nomeExt,
        arquivo: path.resolve(ext.raiz, t.path),
      });
    });
    (ext.pkg.contributes.iconThemes || []).forEach((t) => {
      icones.push({
        id: `${ext.id}#${t.id}`,
        nome: traduzir(t.label, nls) || t.id,
        extensao: nomeExt,
        arquivo: path.resolve(ext.raiz, t.path),
      });
    });
  }
  const porNome = (a, b) => a.nome.localeCompare(b.nome);
  return { cores: cores.sort(porNome), icones: icones.sort(porNome) };
}

function listar() {
  const { cores, icones } = escanear();
  const embutidos = Object.entries(EMBUTIDOS).map(([id, t]) => ({ id, nome: t.name, tipo: t.type === 'light' ? 'claro' : 'escuro', extensao: 'Orbion.ai' }));
  return {
    cores: [...embutidos, ...cores],
    icones: [{ id: 'orbion.minimo', nome: 'Orbion Mínimo', extensao: 'Orbion.ai' }, ...icones],
    pastas: pastasExtensoes(),
  };
}

function carregarTemaCores(arquivo, visto = new Set()) {
  if (visto.has(arquivo)) return { colors: {}, tokenColors: [] };
  visto.add(arquivo);
  const j = lerArquivoJson(arquivo);
  let base = { colors: {}, tokenColors: [] };
  if (j.include) base = carregarTemaCores(path.resolve(path.dirname(arquivo), j.include), visto);
  // tokenColors como caminho para .tmTheme não é suportado: fica só com as cores da interface.
  const tokens = Array.isArray(j.tokenColors) ? j.tokenColors : [];
  return {
    name: j.name,
    type: j.type,
    colors: { ...base.colors, ...(j.colors || {}) },
    tokenColors: [...base.tokenColors, ...tokens],
  };
}

function temaCores(id) {
  if (EMBUTIDOS[id]) return { id, ...EMBUTIDOS[id] };
  const t = escanear().cores.find((x) => x.id === id);
  if (!t) return null;
  const lido = carregarTemaCores(t.arquivo);
  return { id, name: t.nome, type: t.tipo === 'claro' ? 'light' : lido.type || 'dark', colors: lido.colors, tokenColors: lido.tokenColors };
}

const urlIcone = (arquivo) => `orbion://icone/${encodeURIComponent(arquivo)}`;

/** Tema de ícones no formato do VS Code, com cada ícone já como URL que a tela pode carregar. */
function temaIcones(id) {
  if (id === 'orbion.minimo') return { id, minimo: true };
  const t = escanear().icones.find((x) => x.id === id);
  if (!t) return null;
  const j = lerArquivoJson(t.arquivo);
  const dir = path.dirname(t.arquivo);
  const defs = {};
  for (const [nome, def] of Object.entries(j.iconDefinitions || {})) {
    if (def.iconPath) defs[nome] = urlIcone(path.resolve(dir, def.iconPath));
  }
  const pegar = (o) => o && {
    file: o.file, folder: o.folder, folderExpanded: o.folderExpanded, rootFolder: o.rootFolder, rootFolderExpanded: o.rootFolderExpanded,
    fileExtensions: o.fileExtensions || {}, fileNames: o.fileNames || {}, folderNames: o.folderNames || {},
    folderNamesExpanded: o.folderNamesExpanded || {}, rootFolderNames: o.rootFolderNames || {}, rootFolderNamesExpanded: o.rootFolderNamesExpanded || {},
    languageIds: o.languageIds || {},
  };
  return { id, nome: t.nome, defs, ...pegar(j), light: pegar(j.light), setas: !j.hidesExplorerArrows };
}

/** Só serve ícones que estão dentro das pastas de extensões. */
function iconePermitido(arquivo) {
  const alvo = path.resolve(arquivo).toLowerCase();
  return pastasExtensoes().some((p) => alvo.startsWith(path.resolve(p).toLowerCase() + path.sep)) && /\.(svg|png|jpe?g|gif|webp)$/i.test(alvo);
}

module.exports = { listar, temaCores, temaIcones, iconePermitido, pastasExtensoes, lerJsonc };
