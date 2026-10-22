// Abas e editor: arquivos no Monaco (o editor do VS Code), comparação de mudanças
// e páginas do app (Orquestra, agentes, configurações) como abas também.

let editor = null;
let diffEditor = null;
const PAGINAS = {}; // tipo → { desenhar(aba, host), salvar?(aba), sair?(aba), icone?(aba) }

function carregarMonaco() {
  return new Promise((resolve) => {
    window.require.config({ paths: { vs: '/monaco/vs' } });
    window.require(['vs/editor/editor.main'], (m) => {
      if (!window.monaco) window.monaco = m;
      resolve();
    });
  });
}

function opcoesEditor() {
  return {
    fontFamily: S.config.fonte,
    fontSize: S.config.tamanhoFonte,
    fontLigatures: true,
    automaticLayout: true,
    minimap: { enabled: true, renderCharacters: false },
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'on',
    cursorBlinking: 'smooth',
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: 'active', indentation: true },
    stickyScroll: { enabled: true },
    scrollBeyondLastLine: false,
    fixedOverflowWidgets: true,
    padding: { top: 8 },
    tabSize: 2,
  };
}

function criarEditores() {
  editor = monaco.editor.create($('#host-editor'), { ...opcoesEditor(), model: null });
  diffEditor = monaco.editor.createDiffEditor($('#host-diff'), {
    ...opcoesEditor(), readOnly: true, originalEditable: false, renderSideBySide: true, minimap: { enabled: false },
  });
  editor.onDidChangeCursorPosition((e) => {
    S.cursor = { linha: e.position.lineNumber, coluna: e.position.column };
    desenharStatus();
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => salvarAbaAtiva());
}

function aplicarOpcoesEditor() {
  editor?.updateOptions(opcoesEditor());
  diffEditor?.updateOptions({ fontFamily: S.config.fonte, fontSize: S.config.tamanhoFonte });
}

let mapaLinguagens = null;
function linguagemDoArquivo(nome) {
  if (!window.monaco) return null;
  if (!mapaLinguagens) {
    mapaLinguagens = { ext: {}, nomes: {}, rotulo: {} };
    for (const l of monaco.languages.getLanguages()) {
      mapaLinguagens.rotulo[l.id] = l.aliases?.[0] || l.id;
      for (const e of l.extensions || []) mapaLinguagens.ext[e.toLowerCase()] ??= l.id;
      for (const f of l.filenames || []) mapaLinguagens.nomes[f.toLowerCase()] ??= l.id;
    }
  }
  const n = nome.split('/').pop().toLowerCase();
  if (mapaLinguagens.nomes[n]) return mapaLinguagens.nomes[n];
  const partes = n.split('.');
  for (let i = 1; i < partes.length; i++) {
    const id = mapaLinguagens.ext[`.${partes.slice(i).join('.')}`];
    if (id) return id;
  }
  return null;
}
const rotuloLinguagem = (id) => mapaLinguagens?.rotulo[id] || id || 'Texto';

/* ---------- abas ---------- */

const abaAtiva = () => S.abas.find((a) => a.id === S.ativa) || null;

function abrirAba(aba) {
  if (!S.abas.some((a) => a.id === aba.id)) {
    const i = S.abas.findIndex((a) => a.id === S.ativa);
    S.abas.splice(i < 0 ? S.abas.length : i + 1, 0, aba);
  }
  ativarAba(aba.id);
}

function ativarAba(id) {
  const anterior = abaAtiva();
  if (anterior && anterior.id !== id) {
    if (anterior.tipo === 'arquivo' && editor?.getModel() === anterior.modelo) anterior.vista = editor.saveViewState();
    if (PAGINAS[anterior.tipo]) anterior.rolagem = $('#host-pagina').scrollTop;
    PAGINAS[anterior.tipo]?.sair?.(anterior);
  }
  S.ativa = id;
  mostrarAba();
  desenharAbas();
  desenharMigalhas();
  desenharStatus();
  if (S.vista === 'explorador' || S.vista === 'times') desenharLateral();
}

function mostrarAba() {
  const a = abaAtiva();
  const ed = $('#host-editor');
  const df = $('#host-diff');
  const pg = $('#host-pagina');
  ed.hidden = df.hidden = pg.hidden = true;
  if (!a) {
    pg.hidden = false;
    pg.replaceChildren();
    PAGINAS.inicio.desenhar(null, pg);
    return;
  }
  if (a.tipo === 'arquivo' || a.tipo === 'previa') {
    ed.hidden = false;
    editor.setModel(a.modelo);
    editor.updateOptions({ readOnly: a.tipo === 'previa' });
    if (a.vista) editor.restoreViewState(a.vista);
    const p = editor.getPosition();
    S.cursor = p ? { linha: p.lineNumber, coluna: p.column } : null;
    requestAnimationFrame(() => editor.focus());
  } else if (a.tipo === 'diff') {
    df.hidden = false;
    diffEditor.setModel({ original: a.original, modified: a.modificado });
  } else {
    pg.hidden = false;
    pg.replaceChildren();
    PAGINAS[a.tipo].desenhar(a, pg);
    pg.scrollTop = a.rolagem || 0;
  }
}

function descartarAba(a) {
  if (a.tipo === 'arquivo' || a.tipo === 'previa') {
    if (editor.getModel() === a.modelo) editor.setModel(null);
    a.modelo.dispose();
  } else if (a.tipo === 'diff') {
    if (diffEditor.getModel()?.modified === a.modificado) diffEditor.setModel(null);
    a.original.dispose();
    a.modificado.dispose();
  }
  PAGINAS[a.tipo]?.fechar?.(a);
}

function fecharAba(id, forcar = false) {
  const i = S.abas.findIndex((a) => a.id === id);
  if (i < 0) return;
  const a = S.abas[i];
  if (a.sujo && !forcar && !confirm(`"${a.titulo}" tem mudanças que não foram salvas. Fechar e perder essas mudanças?`)) return;
  if (S.ativa === id) PAGINAS[a.tipo]?.sair?.(a);
  descartarAba(a);
  S.abas.splice(i, 1);
  if (S.ativa === id) {
    const vizinha = S.abas[i] || S.abas[i - 1];
    S.ativa = null;
    if (vizinha) return ativarAba(vizinha.id);
    mostrarAba();
  }
  desenharAbas();
  desenharMigalhas();
  desenharStatus();
}

function fecharTodasAbas() {
  for (const a of [...S.abas]) descartarAba(a);
  S.abas = [];
  S.ativa = null;
  mostrarAba();
  desenharAbas();
  desenharMigalhas();
}

function iconeDaAba(a) {
  if (a.tipo === 'arquivo' || a.tipo === 'diff') return iconeDe(nomeDe(a.rel));
  if (PAGINAS[a.tipo]?.icone) return PAGINAS[a.tipo].icone(a);
  return ic(a.tipo === 'previa' ? 'eye' : 'file');
}

function desenharAbas() {
  const toques = toquesDosAgentes();
  $('#abas').replaceChildren(...S.abas.map((a) => h('div', {
    class: `aba${a.id === S.ativa ? ' ativa' : ''}${a.sujo ? ' suja' : ''}${a.tipo === 'previa' || a.tipo === 'diff' ? ' italica' : ''}`,
    title: a.rel || a.titulo,
    onclick: () => ativarAba(a.id),
    onauxclick: (e) => { if (e.button === 1) fecharAba(a.id); },
  },
  iconeDaAba(a),
  h('span', { class: 'aba-titulo' }, a.titulo),
  a.rel ? pontosAgentes(toques.get(a.rel), 2) : null,
  h('button', { class: 'aba-fechar', title: 'Fechar (Ctrl+W)', onclick: (e) => { e.stopPropagation(); fecharAba(a.id); } },
    ic(a.sujo ? 'circle-filled' : 'close')))));
}

function desenharMigalhas() {
  const a = abaAtiva();
  const box = $('#migalhas');
  box.hidden = !a || !a.rel;
  if (!a?.rel) return box.replaceChildren();
  const partes = a.rel.split('/');
  box.replaceChildren(...[
    ...partes.flatMap((p, i) => [
      i ? ic('chevron-right', 'migalha-sep') : null,
      h('span', { class: 'migalha' }, i === partes.length - 1 ? iconeDe(p) : null, p),
    ]),
    a.tipo === 'diff' ? h('span', { class: 'migalha-acoes' },
      h('button', { class: 'bt-mini', onclick: () => abrirArquivo(a.rel) }, ic('go-to-file'), 'Abrir arquivo')) : null,
  ].filter(Boolean));
}

/* ---------- arquivos ---------- */

async function abrirArquivo(rel) {
  const id = `arquivo:${rel}`;
  if (S.abas.some((a) => a.id === id)) return ativarAba(id);
  let r;
  try {
    r = await api('fs:ler', S.projeto.caminho, rel);
  } catch {
    return;
  }
  if (r.binario || r.grande) {
    aviso(r.grande ? 'Esse arquivo é grande demais para o editor. Abrindo no programa padrão do Windows.' : 'Esse arquivo não é de texto. Abrindo no programa padrão do Windows.', 'info');
    return api('fs:abrirExterno', S.projeto.caminho, rel);
  }
  const uri = monaco.Uri.file(`${S.projeto.caminho}/${rel}`);
  monaco.editor.getModel(uri)?.dispose();
  const modelo = monaco.editor.createModel(r.texto, linguagemDoArquivo(rel) || undefined, uri);
  const aba = { id, tipo: 'arquivo', rel, titulo: nomeDe(rel), modelo, versaoSalva: modelo.getAlternativeVersionId(), sujo: false, salvoEm: 0 };
  modelo.onDidChangeContent(() => {
    const sujo = modelo.getAlternativeVersionId() !== aba.versaoSalva;
    if (sujo !== aba.sujo) {
      aba.sujo = sujo;
      desenharAbas();
    }
  });
  abrirAba(aba);
}

/** O antes e o depois de um arquivo. modo 'tudo': do último commit até o disco; 'preparado': do último commit
 *  até o que vai no commit; 'alterado': do que já está preparado até o disco (como no VS Code). */
async function abrirDiff(rel, modo = 'tudo') {
  const id = modo === 'tudo' ? `diff:${rel}` : `diff:${modo}:${rel}`;
  const existente = S.abas.find((a) => a.id === id);
  const doCommit = () => api('git:original', S.projeto.caminho, rel).catch(() => '');
  const doIndice = () => api('git:indice', S.projeto.caminho, rel).catch(() => '');
  const doDisco = () => api('fs:ler', S.projeto.caminho, rel).then((r) => r.texto ?? '').catch(() => '');
  const [original, atual] = await Promise.all(modo === 'preparado' ? [doCommit(), doIndice()]
    : modo === 'alterado' && S.git?.preparados?.[rel] ? [doIndice(), doDisco()]
      : [doCommit(), doDisco()]);
  if (existente) {
    existente.original.setValue(original || '');
    existente.modificado.setValue(atual || '');
    return ativarAba(id);
  }
  const lang = linguagemDoArquivo(rel) || undefined;
  abrirAba({
    id, tipo: 'diff', rel, modo, titulo: `${nomeDe(rel)} (${modo === 'preparado' ? 'preparado' : 'mudanças'})`,
    original: monaco.editor.createModel(original || '', lang),
    modificado: monaco.editor.createModel(atual || '', lang),
  });
}

function abrirTextoSomenteLeitura(id, titulo, texto, linguagem = 'markdown') {
  const existente = S.abas.find((a) => a.id === id);
  if (existente) {
    existente.modelo.setValue(texto);
    return ativarAba(id);
  }
  abrirAba({ id, tipo: 'previa', titulo, modelo: monaco.editor.createModel(texto, linguagem) });
}

async function salvarAba(a) {
  if (a.tipo === 'arquivo') {
    a.salvoEm = Date.now();
    await api('fs:salvar', S.projeto.caminho, a.rel, a.modelo.getValue());
    a.versaoSalva = a.modelo.getAlternativeVersionId();
    a.sujo = false;
    desenharAbas();
    if (a.rel.startsWith('.orbion/agentes/')) recarregarProjeto().then(desenharTudo);
    atualizarGit();
  } else {
    await PAGINAS[a.tipo]?.salvar?.(a);
  }
}

function salvarAbaAtiva() {
  const a = abaAtiva();
  if (a) salvarAba(a).catch(() => {});
}

/** Quando um arquivo aberto muda no disco (um agente mexeu, por exemplo). */
async function arquivoMudouNoDisco(rel) {
  for (const a of S.abas) {
    if (a.rel !== rel) continue;
    if (a.tipo === 'diff') {
      abrirDiff(rel, a.modo || 'tudo');
      continue;
    }
    if (a.tipo !== 'arquivo' || Date.now() - a.salvoEm < 1500) continue;
    let r;
    try {
      r = await chamar('fs:ler', S.projeto.caminho, rel);
    } catch {
      continue;
    }
    if (r.texto == null || r.texto === a.modelo.getValue()) continue;
    if (a.sujo) {
      aviso(`"${a.titulo}" mudou no disco, mas tu tem mudanças não salvas nele. Salvar vai sobrescrever.`, 'info');
      continue;
    }
    // Mantém o desfazer: a troca entra como uma edição.
    a.modelo.pushEditOperations([], [{ range: a.modelo.getFullModelRange(), text: r.texto }], () => null);
    a.versaoSalva = a.modelo.getAlternativeVersionId();
    a.sujo = false;
  }
  desenharAbas();
}
