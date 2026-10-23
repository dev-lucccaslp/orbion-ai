// Markdown para as respostas das IAs, montado com elementos (nunca com innerHTML),
// então nada que a IA escreva vira HTML ou script na tela.

function trechoMd(texto) {
  // **negrito**, *itálico* ou _itálico_, `código`, [link](https://...)
  const partes = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(?<![\w*])\*([^*\n]+)\*(?!\*)|(?<![\w_])_([^_\n]+)_(?![\w_]))/g;
  let ultimo = 0;
  let m;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    if (m[2]) partes.push(h('strong', {}, trechoMd(m[2])));
    else if (m[3]) partes.push(h('code', {}, m[3]));
    else if (m[4]) partes.push(h('a', { href: '#', title: m[5], onclick: (e) => { e.preventDefault(); api('abrir:link', m[5]); } }, m[4]));
    else if (m[6] || m[7]) partes.push(h('em', {}, m[6] || m[7]));
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

// As linguagens dos blocos de código, pelos nomes que as IAs costumam usar.
const LINGUAS_MD = {
  js: 'javascript', javascript: 'javascript', jsx: 'javascript', ts: 'typescript', typescript: 'typescript', tsx: 'typescript',
  json: 'json', sql: 'sql', pgsql: 'pgsql', postgres: 'pgsql', postgresql: 'pgsql', py: 'python', python: 'python',
  sh: 'shell', bash: 'shell', shell: 'shell', zsh: 'shell', ps1: 'powershell', powershell: 'powershell', pwsh: 'powershell',
  html: 'html', xml: 'xml', css: 'css', scss: 'scss', yaml: 'yaml', yml: 'yaml', md: 'markdown', markdown: 'markdown',
  java: 'java', cs: 'csharp', csharp: 'csharp', go: 'go', rs: 'rust', rust: 'rust', php: 'php', rb: 'ruby', diff: 'plaintext',
};

/** Sem a linguagem no bloco, tenta reconhecer SQL e JSON, que são os mais comuns nas respostas. */
function adivinharLingua(codigo) {
  if (/^\s*(select|with|insert|update|delete|create|alter|begin|where|from)\b/i.test(codigo) || /\b(select|from|where|group by|order by|join)\b[\s\S]*\b(from|where|limit|by)\b/i.test(codigo)) return 'sql';
  if (/^\s*[{[]/.test(codigo)) { try { JSON.parse(codigo); return 'json'; } catch {} }
  return null;
}

/** Pinta o código com o tema do editor. O Monaco escapa o texto: nada vira HTML de verdade. */
function colorirCodigo(el, codigo, lingua) {
  const id = LINGUAS_MD[String(lingua || '').toLowerCase()] || adivinharLingua(codigo);
  if (!id || id === 'plaintext' || !window.monaco?.editor?.colorize) return;
  monaco.editor.colorize(codigo, id, { tabSize: 2 }).then((html) => { el.innerHTML = html; }).catch(() => {});
}

const ehNumero = (c) => /^[\s\d.,:%+–—-]+$/.test(c) && /\d/.test(c);

// Código comprido começa recolhido; os que a pessoa abriu ficam abertos quando a tela redesenha.
const LINHAS_CODIGO_ABERTO = 12;
const CODIGOS_ABERTOS = new Set();
const chaveCodigo = (texto) => {
  let n = 5381;
  for (let i = 0; i < texto.length; i++) n = ((n * 33) ^ texto.charCodeAt(i)) >>> 0;
  return `${texto.length}:${n}`;
};

function blocoDeCodigo(lingua, fonte, nLinhas, copiar, pre) {
  const grande = nLinhas > LINHAS_CODIGO_ABERTO || fonte.length > 1500;
  const bloco = h('div', { class: `md-bloco${grande ? ' grande' : ''}` }, lingua ? h('span', { class: 'md-lingua' }, lingua) : null, copiar, pre);
  if (!grande) return bloco;
  const chave = chaveCodigo(fonte);
  const botao = h('button', { class: 'md-expandir', type: 'button' });
  const mostrar = (aberto) => {
    bloco.classList.toggle('aberto', aberto);
    botao.replaceChildren(ic(aberto ? 'chevron-up' : 'chevron-down'), aberto ? 'Recolher' : `Expandir (${nLinhas} linhas)`);
  };
  botao.addEventListener('click', () => {
    const aberto = !CODIGOS_ABERTOS.has(chave);
    if (aberto) CODIGOS_ABERTOS.add(chave);
    else CODIGOS_ABERTOS.delete(chave);
    mostrar(aberto);
  });
  mostrar(CODIGOS_ABERTOS.has(chave));
  bloco.append(botao);
  return bloco;
}

function markdown(texto) {
  const raiz = h('div', { class: 'md' });
  const linhas = String(texto || '').replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let paragrafo = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) raiz.append(h('p', {}, trechoMd(paragrafo.join(' '))));
    paragrafo = [];
  };
  while (i < linhas.length) {
    const l = linhas[i];
    let m;
    if ((m = /^```\s*([\w+-]*)\s*$/.exec(l))) {
      fecharParagrafo();
      const codigo = [];
      i++;
      while (i < linhas.length && !/^```\s*$/.test(linhas[i])) codigo.push(linhas[i++]);
      i++;
      const fonte = codigo.join('\n');
      const codeEl = h('code', {}, fonte);
      const pre = h('pre', { class: 'md-codigo' }, codeEl);
      colorirCodigo(codeEl, fonte, m[1]);
      const copiar = h('button', { class: 'md-copiar', title: 'Copiar', onclick: () => { navigator.clipboard.writeText(fonte); aviso('Copiado.', 'ok'); } }, ic('copy'));
      raiz.append(blocoDeCodigo(m[1], fonte, codigo.length, copiar, pre));
      continue;
    }
    if (!l.trim()) { fecharParagrafo(); i++; continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
      fecharParagrafo();
      raiz.append(h(`h${Math.min(6, m[1].length + 2)}`, {}, trechoMd(m[2])));
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { fecharParagrafo(); raiz.append(h('hr')); i++; continue; }
    if (/^>\s?/.test(l)) {
      fecharParagrafo();
      const citacao = [];
      while (i < linhas.length && /^>\s?/.test(linhas[i])) citacao.push(linhas[i++].replace(/^>\s?/, ''));
      raiz.append(h('blockquote', {}, markdown(citacao.join('\n'))));
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1] || '')) {
      fecharParagrafo();
      const celulas = (x) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const cabeca = celulas(l);
      i += 2;
      const corpo = [];
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) corpo.push(celulas(linhas[i++]));
      // Coluna de números (o "–" de vazio conta junto) fica toda alinhada à direita.
      const vazio = (c) => !c || /^[–—-]$/.test(c);
      const colunaNumerica = cabeca.map((_, j) => corpo.some((r) => ehNumero(r[j] || '')) && corpo.every((r) => vazio(r[j]) || ehNumero(r[j])));
      raiz.append(h('div', { class: 'md-tabela' }, h('table', {},
        h('thead', {}, h('tr', {}, cabeca.map((c, j) => h('th', { class: colunaNumerica[j] ? 'num' : null }, trechoMd(c))))),
        h('tbody', {}, corpo.map((r) => h('tr', {}, r.map((c, j) => h('td', { class: colunaNumerica[j] ? 'num' : null }, trechoMd(c)))))))));
      continue;
    }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l))) {
      fecharParagrafo();
      const ordenada = /\d/.test(m[2]);
      const lista = h(ordenada ? 'ol' : 'ul');
      while (i < linhas.length && (m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(linhas[i]))) {
        const item = [m[3]];
        i++;
        while (i < linhas.length && /^\s{2,}\S/.test(linhas[i]) && !/^(\s*)([-*+]|\d+[.)])\s+/.test(linhas[i])) item.push(linhas[i++].trim());
        lista.append(h('li', {}, trechoMd(item.join(' '))));
      }
      raiz.append(lista);
      continue;
    }
    paragrafo.push(l.trim());
    i++;
  }
  fecharParagrafo();
  return raiz;
}
