// As traduções da interface. O Orbion é escrito em português; em inglês ou espanhol, cada texto que
// aparece na tela troca pelo do dicionário (i18n/en.js, i18n/es.js), inclusive os que chegam depois,
// por um observador da página. Texto com parte variável ("{0} blocos") vira um padrão, e o que vem do
// projeto ou das IAs (código, arquivos, respostas, terminal) fica como está.

const IDIOMAS = { pt: 'Português', en: 'English', es: 'Español' };
const LOCALES = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };
let IDIOMA = 'pt';
const TRAD = { exatos: new Map(), padroes: [], memoria: new Map(), postos: new WeakMap() };

// Onde o texto é do projeto ou das IAs, e não da interface.
const NAO_TRADUZ = [
  '[translate="no"]', '.monaco-editor', '.xterm', '.md', 'pre', 'code', '.log', '.orbita-nome', '.ev-texto', '.mono',
  '.item-nome', '.msg-texto', '.tarefa-resumo', '.passe', '.entendimento-texto', '.entendimento-pedido', '.portao-texto',
  '.fluxo-titulo', '.fluxo-sub', '.fluxo-rotulo', '.gaveta-nome', '.gaveta-agora', '.fluxo-resumo',
].join(', ');
const ATRIBUTOS_TRADUZIDOS = ['title', 'placeholder', 'aria-label'];

const localeAtual = () => LOCALES[IDIOMA];

function prepararIdioma(id) {
  IDIOMA = IDIOMAS[id] ? id : 'pt';
  document.documentElement.lang = LOCALES[IDIOMA];
  TRAD.exatos = new Map();
  TRAD.padroes = [];
  TRAD.memoria.clear();
  if (IDIOMA === 'pt') return;
  for (const [pt, traducao] of Object.entries(window.I18N?.[IDIOMA] || {})) {
    if (!traducao || traducao === pt) continue;
    if (!/\{\d+\}/.test(pt)) {
      TRAD.exatos.set(pt, traducao);
      // " · do mapa do projeto" é um pedaço de uma linha com separadores: vale também sem o "·".
      const solto = pt.replace(/^·\s*|\s*·$/g, '');
      if (solto !== pt && !TRAD.exatos.has(solto)) TRAD.exatos.set(solto, traducao.replace(/^·\s*|\s*·$/g, ''));
      continue;
    }
    const ordem = [];
    const corpo = pt.split(/(\{\d+\})/).map((parte) => {
      const m = /^\{(\d+)\}$/.exec(parte);
      if (m) { ordem.push(Number(m[1])); return '([\\s\\S]+?)'; }
      return parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    const fixo = pt.replace(/\{\d+\}/g, '').trim();
    if (fixo.length < 2) continue; // "{0}" sozinho não diz nada
    TRAD.padroes.push({ re: new RegExp(`^${corpo}$`), ordem, traducao, peso: fixo.length });
  }
  TRAD.padroes.sort((a, b) => b.peso - a.peso);
}

function traduzirTrecho(s) {
  const exato = TRAD.exatos.get(s);
  if (exato != null) return exato;
  for (const p of TRAD.padroes) {
    const m = p.re.exec(s);
    if (!m) continue;
    const valores = {};
    p.ordem.forEach((n, i) => { const v = m[i + 1]; valores[n] = TRAD.exatos.get(v.trim()) ?? v; });
    return p.traducao.replace(/\{(\d+)\}/g, (_, n) => valores[n] ?? '');
  }
  return null;
}

/** O texto no idioma escolhido, ou null quando não há tradução. */
function traduzirTexto(texto) {
  if (IDIOMA === 'pt' || !texto) return null;
  const limpo = texto.trim();
  if (limpo.length < 2 || limpo.length > 900 || !/[A-Za-zÀ-ÿ]/.test(limpo)) return null;
  let r;
  if (TRAD.memoria.has(limpo)) r = TRAD.memoria.get(limpo);
  else {
    r = TRAD.exatos.get(limpo) ?? null;
    // "9 blocos · do mapa do projeto · 04/11": pedaço por pedaço, antes dos padrões, que pegariam a linha
    // inteira e deixariam o meio sem traduzir.
    if (r == null && limpo.includes(' · ')) {
      const pedacos = limpo.split(' · ');
      const novos = pedacos.map((p) => traduzirTrecho(p) ?? p);
      if (novos.some((x, i) => x !== pedacos[i])) r = novos.join(' · ');
    }
    if (r == null) r = traduzirTrecho(limpo);
    if (TRAD.memoria.size > 6000) TRAD.memoria.clear();
    TRAD.memoria.set(limpo, r);
  }
  return r == null ? null : texto.replace(limpo, () => r);
}

/** Para textos que não passam pela página (notificações, confirm, títulos do sistema). */
const traduzir = (texto) => traduzirTexto(texto) ?? texto;

function trocarTexto(no) {
  if (TRAD.postos.get(no) === no.nodeValue) return; // fomos nós que pusemos este texto
  const novo = traduzirTexto(no.nodeValue);
  if (novo == null || novo === no.nodeValue) return;
  no.nodeValue = novo;
  TRAD.postos.set(no, novo);
}

function trocarAtributos(el) {
  for (const a of ATRIBUTOS_TRADUZIDOS) {
    const v = el.getAttribute?.(a);
    if (!v) continue;
    const novo = traduzirTexto(v);
    if (novo != null && novo !== v) el.setAttribute(a, novo);
  }
}

function traduzirNo(no) {
  if (no.nodeType === 3) {
    if (no.parentElement && !no.parentElement.closest(NAO_TRADUZ)) trocarTexto(no);
    return;
  }
  if (no.nodeType !== 1 || no.closest(NAO_TRADUZ)) return;
  trocarAtributos(no);
  const andar = document.createTreeWalker(no, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(NAO_TRADUZ) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = andar.nextNode(); n; n = andar.nextNode()) {
    if (n.nodeType === 3) trocarTexto(n);
    else trocarAtributos(n);
  }
}

const observadorDeTraducao = new MutationObserver((mudancas) => {
  for (const m of mudancas) {
    if (m.type === 'childList') m.addedNodes.forEach(traduzirNo);
    else if (m.type === 'characterData') traduzirNo(m.target);
    else if (m.target.nodeType === 1 && !m.target.closest(NAO_TRADUZ)) trocarAtributos(m.target);
  }
});

/** Liga a tradução da página inteira (no português, não faz nada). */
function ligarTraducao() {
  if (IDIOMA === 'pt') return;
  traduzirNo(document.body);
  observadorDeTraducao.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS_TRADUZIDOS });
  // As caixas do sistema também falam o idioma escolhido.
  const confirmar = window.confirm.bind(window);
  const alertar = window.alert.bind(window);
  window.confirm = (msg) => confirmar(traduzir(String(msg ?? '')));
  window.alert = (msg) => alertar(traduzir(String(msg ?? '')));
}

/** Troca o idioma: grava e recarrega a janela, que volta toda no idioma novo. */
async function mudarIdioma(id) {
  if (!IDIOMAS[id] || id === S.config.idioma) return;
  S.config = await api('config:salvar', { idioma: id });
  api('janela:recarregar');
}

function escolherIdioma() {
  abrirPaleta({
    placeholder: 'Idioma · Language · Idioma',
    itens: () => Object.entries(IDIOMAS).map(([id, nome]) => ({ rotulo: nome, detalhe: id === IDIOMA ? '✓' : '', icone: 'globe', id })),
    aoEscolher: (it) => mudarIdioma(it.id),
  });
}
