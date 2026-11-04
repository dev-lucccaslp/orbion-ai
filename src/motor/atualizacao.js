// Atualização do Orbion: pergunta ao GitHub qual é a versão mais nova publicada em Releases e, se a pessoa
// aceitar, baixa o instalador certo para o sistema dela, instala e reinicia. Nada acontece sozinho: quem decide
// é a pessoa, pela notificação ou pelas Configurações.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO = 'dev-lucccaslp/orbion-ai';
// Dá para apontar para outro servidor nos testes (um GitHub de mentira, local).
const API = () => (process.env.ORBION_ATUALIZACAO_API || `https://api.github.com/repos/${REPO}`).replace(/\/+$/, '');
const CABECALHOS = { accept: 'application/vnd.github+json', 'user-agent': 'Orbion.ai' };

/** "0.1.10" > "0.1.9": compara número a número (o que vier depois de "-" não conta). */
function comparar(a, b) {
  const pa = String(a).replace(/^v/, '').split('-')[0].split('.').map((n) => Number(n) || 0);
  const pb = String(b).replace(/^v/, '').split('-')[0].split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}

/** O instalador deste sistema entre os arquivos do release. */
function instaladorDoSistema(arquivos, plataforma = process.platform) {
  const achar = (re) => arquivos.find((a) => re.test(a.name));
  if (plataforma === 'win32') return achar(/windows.*\.exe$/i) || achar(/\.exe$/i);
  if (plataforma === 'darwin') return achar(/mac.*arm64.*\.dmg$/i) || achar(/\.dmg$/i);
  if (plataforma === 'linux') return process.env.APPIMAGE ? achar(/\.AppImage$/i) : achar(/\.deb$/i) || achar(/\.AppImage$/i);
  return null;
}

function doRelease(j, versaoAtual) {
  const versao = String(j.tag_name || '').replace(/^v/, '');
  const arquivo = instaladorDoSistema(j.assets || []);
  return {
    versao,
    atual: versaoAtual,
    nova: !!versao && comparar(versao, versaoAtual) > 0,
    titulo: j.name || `Orbion.ai ${j.tag_name}`,
    notas: j.body || '',
    publicadaEm: j.published_at || null,
    pagina: j.html_url || `https://github.com/${REPO}/releases`,
    arquivo: arquivo ? { nome: arquivo.name, url: arquivo.browser_download_url, tamanho: arquivo.size || 0 } : null,
  };
}

/** A versão mais nova publicada, comparada com a desta instalação. */
async function verificar(versaoAtual) {
  const r = await fetch(`${API()}/releases/latest`, { headers: CABECALHOS, signal: AbortSignal.timeout(15000) });
  if (r.status === 404) return { nova: false, atual: versaoAtual, versao: null };
  if (!r.ok) throw new Error(`O GitHub respondeu ${r.status} ao procurar atualizações.`);
  return doRelease(await r.json(), versaoAtual);
}

/** As notas de uma versão (o que mudou), para mostrar depois de atualizar. */
async function notasDaVersao(versao) {
  const r = await fetch(`${API()}/releases/tags/v${String(versao).replace(/^v/, '')}`, { headers: CABECALHOS, signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const j = await r.json();
  return { versao: String(j.tag_name || versao).replace(/^v/, ''), titulo: j.name || '', notas: j.body || '', pagina: j.html_url || '', publicadaEm: j.published_at || null };
}

/** Baixa o instalador para a pasta de Downloads, contando o progresso. Só aceita arquivos dos releases deste repositório. */
async function baixar(arquivo, { aoProgresso = () => {}, sinal } = {}) {
  const permitido = process.env.ORBION_ATUALIZACAO_API ? /^https?:\/\/127\.0\.0\.1(:\d+)?\// : new RegExp(`^https://github\\.com/${REPO.replace('/', '\\/')}/releases/download/`);
  if (!permitido.test(arquivo?.url || '')) throw new Error('Esse arquivo não vem dos releases do Orbion.');
  const r = await fetch(arquivo.url, { signal: sinal, redirect: 'follow' });
  if (!r.ok || !r.body) throw new Error(`Não consegui baixar a atualização (${r.status}).`);
  const total = Number(r.headers.get('content-length')) || arquivo.tamanho || 0;
  const pasta = process.env.ORBION_ATUALIZACAO_PASTA || path.join(os.homedir(), 'Downloads'); // a pasta muda só nos testes
  fs.mkdirSync(pasta, { recursive: true });
  const destino = path.join(pasta, path.basename(arquivo.nome));
  const parcial = `${destino}.baixando`;
  const saida = fs.createWriteStream(parcial);
  let recebido = 0;
  let ultimo = 0;
  try {
    for await (const pedaco of r.body) {
      recebido += pedaco.length;
      if (!saida.write(pedaco)) await new Promise((ok) => saida.once('drain', ok));
      if (Date.now() - ultimo > 200) { ultimo = Date.now(); aoProgresso({ recebido, total }); }
    }
  } finally {
    await new Promise((ok) => saida.end(ok));
  }
  if (sinal?.aborted) { fs.rmSync(parcial, { force: true }); throw new Error('Cancelado.'); }
  fs.renameSync(parcial, destino);
  aoProgresso({ recebido, total: total || recebido });
  return destino;
}

/**
 * Roda o instalador baixado. Devolve true quando o Orbion deve fechar (o instalador abre a versão nova sozinho);
 * false quando a pessoa termina à mão (o .dmg do Mac e o .deb do Linux).
 */
function instalar(arquivo, { abrirComSistema }) {
  if (process.platform === 'win32' && /\.exe$/i.test(arquivo)) {
    // Instalação silenciosa no mesmo lugar, e o instalador abre o Orbion novo quando termina.
    spawn(arquivo, ['/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    return true;
  }
  if (process.platform === 'linux' && /\.AppImage$/i.test(arquivo) && process.env.APPIMAGE) {
    // O AppImage novo toma o lugar do atual e abre.
    const atual = process.env.APPIMAGE;
    fs.chmodSync(arquivo, 0o755);
    fs.copyFileSync(arquivo, `${atual}.novo`);
    fs.chmodSync(`${atual}.novo`, 0o755);
    fs.renameSync(`${atual}.novo`, atual);
    spawn(atual, [], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  abrirComSistema(arquivo);
  return false;
}

module.exports = { REPO, comparar, instaladorDoSistema, verificar, notasDaVersao, baixar, instalar };
