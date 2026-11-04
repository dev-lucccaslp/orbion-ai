// Gerador de imagens: pede a imagem a um provedor por API já cadastrado em Contas e modelos (OpenAI, Google
// Gemini, OpenRouter, xAI...) e devolve PNG em base64. O Claude Code e o Codex não geram imagens, então este é o
// caminho. Salvar no projeto é à parte, sempre dentro da pasta do projeto.

const fs = require('node:fs');
const path = require('node:path');
const provedores = require('./provedores');

// Os modelos de imagem que cada provedor conhecido oferece, para quando a lista dele ainda não foi buscada.
const SUGERIDOS = {
  openai: ['gpt-image-1', 'dall-e-3'],
  gemini: ['imagen-4.0-generate-001', 'imagen-3.0-generate-002'],
  openrouter: ['google/gemini-2.5-flash-image', 'openai/gpt-image-1'],
  xai: ['grok-2-image'],
};
const PARECE_IMAGEM = /(gpt-image|dall-e|imagen|flux|stable-diffusion|sdxl|-image\b|image-preview|grok-2-image)/i;

/** Os provedores cadastrados que geram imagem, com os modelos de imagem de cada um. */
function modelosDeImagem() {
  return provedores.listar()
    .filter((p) => p.temChave || p.semChave)
    .map((p) => {
      const daLista = [...(p.modelos || []), p.modelo].filter((m) => m && PARECE_IMAGEM.test(m) && !/embed|vision/i.test(m));
      const sugeridos = SUGERIDOS[p.preset] || SUGERIDOS[p.id] || [];
      return { id: p.id, nome: p.nome, modelos: [...new Set([...daLista, ...sugeridos])] };
    })
    .filter((p) => p.modelos.length);
}

async function erroDaResposta(r, p, modelo) {
  const texto = (await r.text().catch(() => '')).slice(0, 400);
  let msg = texto;
  try { msg = JSON.parse(texto)?.error?.message || texto; } catch {}
  if (r.status === 401 || r.status === 403) return new Error(`Token recusado por ${p.nome} (${r.status}).`);
  if (r.status === 404) return new Error(`${p.nome} não tem o modelo ${modelo} para gerar imagens.`);
  if (r.status === 429) return new Error(`${p.nome} pediu para esperar (limite de uso). Tente de novo daqui a pouco.`);
  return new Error(`${p.nome} respondeu ${r.status}: ${msg}`);
}

async function paraBase64(url, sinal) {
  if (url.startsWith('data:')) return { mime: url.slice(5, url.indexOf(';')) || 'image/png', base64: url.slice(url.indexOf(',') + 1) };
  const r = await fetch(url, { signal: sinal });
  if (!r.ok) throw new Error(`Não consegui baixar a imagem gerada (${r.status}).`);
  return { mime: r.headers.get('content-type') || 'image/png', base64: Buffer.from(await r.arrayBuffer()).toString('base64') };
}

/** Gera as imagens. Devolve [{ mime, base64 }]. */
async function gerar({ provedor, modelo, prompt, tamanho = '1024x1024', quantidade = 1, sinal }) {
  const texto = String(prompt || '').trim();
  if (!texto) throw new Error('Descreva a imagem que tu quer.');
  const p = provedores.resolver(provedor);
  const n = Math.max(1, Math.min(4, Number(quantidade) || 1));
  // O OpenRouter gera imagem pelos chats: o modelo devolve a imagem junto da resposta.
  if (p.base.includes('openrouter.ai')) {
    const saida = [];
    for (let i = 0; i < n; i++) {
      const r = await fetch(`${p.base}/chat/completions`, {
        method: 'POST', headers: provedores.cabecalhos(p), signal: sinal,
        body: JSON.stringify({ model: modelo, modalities: ['image', 'text'], messages: [{ role: 'user', content: `${texto}\n\nFormato: ${tamanho.replace('x', '×')} px.` }] }),
      });
      if (!r.ok) throw await erroDaResposta(r, p, modelo);
      const j = await r.json();
      const imagens = j.choices?.[0]?.message?.images || [];
      if (!imagens.length) throw new Error(`${modelo} respondeu sem imagem. Escolha um modelo que gere imagens.`);
      for (const im of imagens) saida.push(await paraBase64(im.image_url?.url || im.url, sinal));
    }
    return saida;
  }
  // O resto fala o formato de imagens da OpenAI (a OpenAI, o Google Gemini e outros compatíveis).
  const corpo = { model: modelo, prompt: texto, n, size: tamanho };
  if (!/gpt-image/i.test(modelo)) corpo.response_format = 'b64_json';
  const r = await fetch(`${p.base}/images/generations`, { method: 'POST', headers: provedores.cabecalhos(p), body: JSON.stringify(corpo), signal: sinal });
  if (!r.ok) throw await erroDaResposta(r, p, modelo);
  const j = await r.json();
  const lista = j.data || [];
  if (!lista.length) throw new Error(`${p.nome} respondeu sem imagem.`);
  return Promise.all(lista.map((d) => (d.b64_json ? { mime: 'image/png', base64: d.b64_json } : paraBase64(d.url, sinal))));
}

/** Grava a imagem dentro do projeto (nunca fora dele, nem em pastas ocultas). Devolve o caminho relativo. */
function salvar(projeto, rel, base64) {
  const limpo = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!limpo || limpo.split('/').some((parte) => !parte || parte === '..' || parte.startsWith('.'))) throw new Error('Escolha um caminho dentro do projeto (sem pastas ocultas).');
  const final = /\.(png|jpe?g|webp)$/i.test(limpo) ? limpo : `${limpo}.png`;
  const alvo = path.resolve(projeto, final);
  if (!alvo.startsWith(path.resolve(projeto) + path.sep)) throw new Error('Escolha um caminho dentro do projeto.');
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, Buffer.from(base64, 'base64'));
  return final;
}

module.exports = { modelosDeImagem, gerar, salvar };
