// Imagens que a pessoa cola ou arrasta nos chats. Ficam em <projeto>/.orbion/anexos (o git ignora a pasta)
// e chegam a cada motor do jeito dele: o Claude abre pelo caminho com a ferramenta Read, o Codex recebe
// com -i, e os modelos por API recebem a imagem dentro da mensagem.

const fs = require('node:fs');
const path = require('node:path');

const TIPOS = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_IMAGENS = 8;

function pasta(projeto) {
  const p = path.join(projeto, '.orbion', 'anexos');
  fs.mkdirSync(p, { recursive: true });
  const ignorar = path.join(p, '.gitignore');
  if (!fs.existsSync(ignorar)) fs.writeFileSync(ignorar, '# Imagens dos chats do Orbion: ficam só neste PC.\n*\n');
  return p;
}

/** Guarda o que veio da tela ([{ nome, tipo, dados em base64 }]) e devolve [{ nome, tipo, rel }]. */
function guardar(projeto, lista = []) {
  if (!Array.isArray(lista) || !lista.length) return [];
  if (lista.length > MAX_IMAGENS) throw new Error(`Mande no máximo ${MAX_IMAGENS} imagens por mensagem.`);
  const destino = pasta(projeto);
  return lista.map((a, i) => {
    const ext = TIPOS[a.tipo];
    if (!ext) throw new Error(`O tipo ${a.tipo || 'desconhecido'} não é imagem que o Orbion aceite (PNG, JPG, GIF ou WebP).`);
    const bytes = Buffer.from(String(a.dados || ''), 'base64');
    if (!bytes.length) throw new Error('Uma das imagens veio vazia.');
    if (bytes.length > MAX_BYTES) throw new Error(`A imagem ${a.nome || i + 1} passa de 10 MB.`);
    const base = String(a.nome || 'imagem').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40) || 'imagem';
    const arquivo = `${Date.now().toString(36)}-${i}-${base}${ext}`;
    fs.writeFileSync(path.join(destino, arquivo), bytes);
    return { nome: a.nome || `imagem${ext}`, tipo: a.tipo, rel: `.orbion/anexos/${arquivo}` };
  });
}

/** O caminho completo, só se ele estiver mesmo dentro da pasta de anexos do projeto. */
function absoluto(projeto, rel) {
  const base = path.resolve(projeto, '.orbion', 'anexos');
  const alvo = path.resolve(projeto, String(rel || ''));
  if (!alvo.startsWith(base + path.sep)) throw new Error('Anexo fora da pasta de anexos.');
  return alvo;
}

/** A imagem como data URL, para a tela mostrar e para os modelos por API. */
function dataUrl(projeto, rel) {
  const arquivo = absoluto(projeto, rel);
  const tipo = Object.entries(TIPOS).find(([, ext]) => arquivo.toLowerCase().endsWith(ext))?.[0] || 'image/png';
  return `data:${tipo};base64,${fs.readFileSync(arquivo).toString('base64')}`;
}

const caminhos = (projeto, anexos = []) => anexos.map((a) => absoluto(projeto, a.rel));

/** O trecho do prompt que avisa o agente das imagens e de onde elas estão. */
function paraPrompt(projeto, anexos = []) {
  if (!anexos.length) return '';
  return `# Imagens que a pessoa anexou\nAntes de responder, abra cada imagem com a ferramenta Read (ela mostra a imagem) e use o que ela mostra:\n${caminhos(projeto, anexos).map((c) => `- ${c}`).join('\n')}`;
}

module.exports = { guardar, absoluto, dataUrl, caminhos, paraPrompt };
