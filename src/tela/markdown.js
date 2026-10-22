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
      const pre = h('pre', { class: 'md-codigo' }, h('code', {}, codigo.join('\n')));
      const copiar = h('button', { class: 'md-copiar', title: 'Copiar', onclick: () => { navigator.clipboard.writeText(codigo.join('\n')); aviso('Copiado.', 'ok'); } }, ic('copy'));
      raiz.append(h('div', { class: 'md-bloco' }, m[1] ? h('span', { class: 'md-lingua' }, m[1]) : null, copiar, pre));
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
      raiz.append(h('div', { class: 'md-tabela' }, h('table', {},
        h('thead', {}, h('tr', {}, cabeca.map((c) => h('th', {}, trechoMd(c))))),
        h('tbody', {}, corpo.map((r) => h('tr', {}, r.map((c) => h('td', {}, trechoMd(c)))))))));
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
