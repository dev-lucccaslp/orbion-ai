// Loja de extensões: busca e instala temas pelo Open VSX (open-vsx.org), o registro
// aberto que o VSCodium e o Cursor usam. O Marketplace da Microsoft só pode ser usado
// pelos produtos dela. As extensões vão para ~/.orbion/extensoes; o Orbion lê delas
// só temas de cores e de ícones (JSON e imagens), nunca roda código de extensão.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const API = 'https://open-vsx.org/api';
const pastaExtensoes = () => path.join(os.homedir(), '.orbion', 'extensoes');

async function buscar(texto, categoria = 'Themes') {
  const url = new URL(`${API}/-/search`);
  url.searchParams.set('query', texto || '');
  if (categoria) url.searchParams.set('category', categoria);
  url.searchParams.set('size', '30');
  url.searchParams.set('sortBy', texto ? 'relevance' : 'downloadCount');
  url.searchParams.set('sortOrder', 'desc');
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`O Open VSX respondeu ${r.status}.`);
  const j = await r.json();
  return (j.extensions || []).map((e) => ({
    id: `${e.namespace}.${e.name}`.toLowerCase(),
    namespace: e.namespace,
    nome: e.name,
    versao: e.version,
    titulo: e.displayName || e.name,
    descricao: e.description || '',
    downloads: e.downloadCount || 0,
    nota: e.averageRating || null,
    icone: e.files?.icon || null,
  }));
}

function extrair(vsix, destino) {
  // O .vsix é um zip; o tar do Windows 10+ abre zip e recusa caminhos que saiam da pasta.
  // No Windows usa o tar do sistema, e não um tar do Git que esteja antes no PATH.
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  return new Promise((resolve, reject) => {
    execFile(tar, ['-xf', vsix, '-C', destino], { windowsHide: true }, (erro) => (erro ? reject(new Error(`Não consegui abrir a extensão: ${erro.message}`)) : resolve()));
  });
}

async function instalar(namespace, nome) {
  const info = await (await fetch(`${API}/${encodeURIComponent(namespace)}/${encodeURIComponent(nome)}`)).json();
  if (!info.files?.download) throw new Error('Essa extensão não tem arquivo para baixar.');
  const versao = info.version;
  const pastaFinal = path.join(pastaExtensoes(), `${namespace}.${nome}-${versao}`.toLowerCase());
  if (fs.existsSync(pastaFinal)) return { pasta: pastaFinal, jaTinha: true };

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbion-ext-'));
  try {
    const r = await fetch(info.files.download);
    if (!r.ok) throw new Error(`O download falhou (${r.status}).`);
    const dados = Buffer.from(await r.arrayBuffer());
    if (info.files.sha256) {
      const esperado = (await (await fetch(info.files.sha256)).text()).trim().split(/\s+/)[0].toLowerCase();
      const obtido = crypto.createHash('sha256').update(dados).digest('hex');
      if (esperado && esperado !== obtido) throw new Error('O arquivo baixado não bate com a assinatura do Open VSX. Instalação cancelada.');
    }
    const vsix = path.join(temp, 'pacote.vsix');
    fs.writeFileSync(vsix, dados);
    const aberto = path.join(temp, 'aberto');
    fs.mkdirSync(aberto);
    await extrair(vsix, aberto);
    const raiz = path.join(aberto, 'extension');
    const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
    const c = pkg.contributes || {};
    if (!c.themes?.length && !c.iconThemes?.length) {
      throw new Error('Essa extensão não traz tema de cores nem de ícones. Por enquanto o Orbion.ai usa só temas.');
    }
    fs.mkdirSync(pastaExtensoes(), { recursive: true });
    fs.cpSync(raiz, pastaFinal, { recursive: true });
    return { pasta: pastaFinal, temas: (c.themes || []).length, icones: (c.iconThemes || []).length };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

/** A página de uma extensão no Open VSX: os dados e o README (só texto; nada dela roda aqui). */
async function detalhes(namespace, nome) {
  const r = await fetch(`${API}/${encodeURIComponent(namespace)}/${encodeURIComponent(nome)}`, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`O Open VSX respondeu ${r.status}.`);
  const e = await r.json();
  let leiame = '';
  if (e.files?.readme) {
    try {
      const t = await fetch(e.files.readme);
      if (t.ok) leiame = (await t.text()).slice(0, 200000);
    } catch {}
  }
  return {
    id: `${e.namespace}.${e.name}`.toLowerCase(),
    namespace: e.namespace,
    nome: e.name,
    titulo: e.displayName || e.name,
    descricao: e.description || '',
    versao: e.version,
    data: e.timestamp || null,
    licenca: e.license || '',
    repositorio: e.repository || '',
    site: e.homepage || '',
    categorias: e.categories || [],
    tags: (e.tags || []).filter((x) => !/^__/.test(x)).slice(0, 12),
    downloads: e.downloadCount || 0,
    nota: e.averageRating || null,
    avaliacoes: e.reviewCount || 0,
    icone: e.files?.icon || null,
    editor: e.namespaceDisplayName || e.namespace,
    verificado: !!e.verified,
    leiame,
    url: `https://open-vsx.org/extension/${e.namespace}/${e.name}`,
  };
}

/** Extensões instaladas pelo Orbion (as do VS Code ficam por conta do VS Code). */
function instaladas() {
  const base = pastaExtensoes();
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(base, d.name, 'package.json'), 'utf8'));
      return { id: `${pkg.publisher}.${pkg.name}`.toLowerCase(), pasta: path.join(base, d.name), titulo: pkg.displayName || pkg.name, versao: pkg.version };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

module.exports = { buscar, detalhes, instalar, instaladas, pastaExtensoes };
