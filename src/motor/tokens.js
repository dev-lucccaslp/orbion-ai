// Tokens no mesmo formato para os três motores: { entrada, cacheLido, cacheCriado, saida }.
// No plano do Claude ou do ChatGPT não se paga por token, mas eles gastam o limite de 5 horas e o da
// semana; o cache lido pesa bem menos que a entrada nova.

const vazio = () => ({ entrada: 0, cacheLido: 0, cacheCriado: 0, saida: 0 });

/** O "usage" do Claude Code (o mesmo da API da Anthropic). */
const deClaude = (u = {}) => ({
  entrada: u.input_tokens || 0,
  cacheLido: u.cache_read_input_tokens || 0,
  cacheCriado: u.cache_creation_input_tokens || 0,
  saida: u.output_tokens || 0,
});

/** O "usage" do Codex: a entrada dele já inclui o que veio do cache. */
function deCodex(u = {}) {
  const cache = u.cached_input_tokens || 0;
  return { entrada: Math.max(0, (u.input_tokens || 0) - cache), cacheLido: cache, cacheCriado: 0, saida: u.output_tokens || 0 };
}

/** O "usage" das APIs no formato da OpenAI. */
function deApi(u = {}) {
  const cache = u.prompt_tokens_details?.cached_tokens || 0;
  return { entrada: Math.max(0, (u.prompt_tokens || 0) - cache), cacheLido: cache, cacheCriado: 0, saida: u.completion_tokens || 0 };
}

function somar(...lista) {
  const r = vazio();
  for (const t of lista) if (t) for (const k of Object.keys(r)) r[k] += t[k] || 0;
  return r;
}

const total = (t) => (t ? (t.entrada || 0) + (t.cacheLido || 0) + (t.cacheCriado || 0) + (t.saida || 0) : 0);

module.exports = { vazio, deClaude, deCodex, deApi, somar, total };
