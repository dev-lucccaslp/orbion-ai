// Provedores de IA por API (no formato da OpenAI), com o token que a pessoa cadastra:
// Gemini, Grok, OpenRouter, OpenCode, Groq, DeepSeek, Mistral, OpenAI, Ollama, LM Studio
// ou qualquer outro compatível. Os tokens ficam criptografados pelo sistema (Electron safeStorage).

const fs = require('node:fs');
const path = require('node:path');

const PRESETS = [
  { id: 'opencode', nome: 'OpenCode', base: 'https://opencode.ai/inference/openai/v1', modelosUrl: 'https://opencode.ai/inference/v1/models', site: 'https://opencode.ai/console', gratis: 'Tem modelos grátis (big-pickle, glm-5.3-flash-free e outros) por tempo limitado.', modelo: 'big-pickle' },
  { id: 'openrouter', nome: 'OpenRouter', base: 'https://openrouter.ai/api/v1', site: 'https://openrouter.ai/keys', gratis: 'Os modelos terminados em :free não custam nada (com limite de uso).' },
  { id: 'gemini', nome: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', site: 'https://aistudio.google.com/apikey', gratis: 'A chave do Google AI Studio tem uma cota grátis.', modelo: 'gemini-2.5-flash' },
  { id: 'xai', nome: 'xAI Grok', base: 'https://api.x.ai/v1', site: 'https://console.x.ai' },
  { id: 'groq', nome: 'Groq', base: 'https://api.groq.com/openai/v1', site: 'https://console.groq.com/keys', gratis: 'Tem uma cota grátis com modelos abertos e rápidos.' },
  { id: 'deepseek', nome: 'DeepSeek', base: 'https://api.deepseek.com/v1', site: 'https://platform.deepseek.com/api_keys', modelo: 'deepseek-chat' },
  { id: 'mistral', nome: 'Mistral', base: 'https://api.mistral.ai/v1', site: 'https://console.mistral.ai/api-keys' },
  { id: 'openai', nome: 'OpenAI (API)', base: 'https://api.openai.com/v1', site: 'https://platform.openai.com/api-keys' },
  { id: 'ollama', nome: 'Ollama (no teu PC)', base: 'http://localhost:11434/v1', site: 'https://ollama.com/download', semChave: true, gratis: 'Roda modelos abertos no teu PC, sem internet e sem custo.' },
  { id: 'lmstudio', nome: 'LM Studio (no teu PC)', base: 'http://localhost:1234/v1', site: 'https://lmstudio.ai', semChave: true, gratis: 'Roda modelos abertos no teu PC, sem custo.' },
];

let arquivo = null;
let cripto = { cifrar: (t) => Buffer.from(t, 'utf8').toString('base64'), decifrar: (t) => Buffer.from(t, 'base64').toString('utf8'), segura: false };

/** O processo principal liga isto ao safeStorage do Electron e diz onde guardar. */
function configurar({ pasta, cifrar, decifrar, segura }) {
  arquivo = path.join(pasta, 'provedores.json');
  if (cifrar) cripto = { cifrar, decifrar, segura };
}

function ler() {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    return { provedores: [] };
  }
}

function gravar(dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
}

/** Lista para a tela: nunca devolve o token, só se ele existe. */
function listar() {
  return ler().provedores.map(({ chave, ...resto }) => ({ ...resto, temChave: !!chave }));
}

function salvar(p) {
  const dados = ler();
  const atual = dados.provedores.find((x) => x.id === p.id);
  const preset = PRESETS.find((x) => x.id === p.preset) || {};
  const novo = {
    id: p.id,
    preset: p.preset || null,
    nome: String(p.nome || preset.nome || p.id).trim(),
    base: String(p.base || preset.base || '').trim().replace(/\/+$/, ''),
    modelosUrl: p.modelosUrl ?? preset.modelosUrl ?? null,
    semChave: !!(p.semChave ?? preset.semChave),
    modelos: p.modelos || atual?.modelos || [],
    modelo: p.modelo ?? atual?.modelo ?? preset.modelo ?? '',
    chave: atual?.chave || null,
  };
  if (!/^https?:\/\//.test(novo.base)) throw new Error('Endereço da API inválido. Use http:// ou https://');
  if (p.chave) novo.chave = cripto.cifrar(String(p.chave).trim());
  if (p.chave === '') novo.chave = null;
  dados.provedores = [...dados.provedores.filter((x) => x.id !== p.id), novo];
  gravar(dados);
  return listar();
}

function remover(id) {
  const dados = ler();
  dados.provedores = dados.provedores.filter((x) => x.id !== id);
  gravar(dados);
  return listar();
}

/** Provedor com o token já aberto, só para o motor usar (nunca vai para a tela). */
function resolver(id) {
  const p = ler().provedores.find((x) => x.id === id);
  if (!p) throw new Error(`O provedor "${id}" não está cadastrado. Cadastre em Contas e modelos.`);
  const envio = process.env[`ORBION_CHAVE_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
  let chave = envio || null;
  if (!chave && p.chave) {
    try { chave = cripto.decifrar(p.chave); } catch { throw new Error(`Não consegui abrir o token de ${p.nome}. Cadastre de novo.`); }
  }
  if (!chave && !p.semChave) throw new Error(`${p.nome} está sem token. Cadastre em Contas e modelos.`);
  return { ...p, chave };
}

function cabecalhos(p) {
  const h = { 'content-type': 'application/json' };
  if (p.chave) h.authorization = `Bearer ${p.chave}`;
  if (p.base.includes('openrouter.ai')) {
    h['HTTP-Referer'] = 'https://orbion.ai';
    h['X-Title'] = 'Orbion.ai';
  }
  return h;
}

/** Busca a lista de modelos do provedor e guarda; serve também para testar o token. */
async function buscarModelos(id) {
  const p = resolver(id);
  const r = await fetch(p.modelosUrl || `${p.base}/models`, { headers: cabecalhos(p), signal: AbortSignal.timeout(20000) });
  if (!r.ok) {
    const texto = (await r.text()).slice(0, 300);
    throw new Error(r.status === 401 || r.status === 403 ? `Token recusado por ${p.nome} (${r.status}).` : `${p.nome} respondeu ${r.status}: ${texto}`);
  }
  const j = await r.json();
  const lista = (j.data || j.models || []).map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)
    .map((m) => m.replace(/^models\//, ''))
    .sort((a, b) => (b.endsWith(':free') || /-free$/.test(b)) - (a.endsWith(':free') || /-free$/.test(a)) || a.localeCompare(b));
  const dados = ler();
  const x = dados.provedores.find((q) => q.id === id);
  if (x) {
    x.modelos = lista.slice(0, 400);
    if (!x.modelo && lista.length) x.modelo = lista[0];
    gravar(dados);
  }
  return lista;
}

module.exports = { PRESETS, configurar, listar, salvar, remover, resolver, buscarModelos, cabecalhos, criptografiaSegura: () => cripto.segura };
