// Times e agentes: criar times (do zero, de modelos ou copiando outro), editar o time
// e editar tudo de cada agente.

const ICONES_AGENTE = [
  'person', 'inbox', 'checklist', 'paintcan', 'code', 'beaker', 'database', 'circuit-board', 'eye', 'book', 'shield', 'bug',
  'server', 'graph', 'rocket', 'tools', 'compass', 'lightbulb', 'telescope', 'milestone', 'zap', 'wand', 'globe', 'key',
  'symbol-class', 'symbol-color', 'comment-discussion', 'dashboard', 'pulse', 'organization', 'robot', 'hubot', 'sparkle', 'terminal',
];
const CORES_TIME = ['#bd93f9', '#8be9fd', '#50fa7b', '#ffb86c', '#ff79c6', '#f1fa8c', '#60a5fa', '#f87171'];
const ESFORCOS = [['', 'Padrão do CLI'], ['low', 'Baixo'], ['medium', 'Médio'], ['high', 'Alto'], ['xhigh', 'Muito alto'], ['max', 'Máximo (só Claude)']];

async function modelosDeAgente() {
  if (!S.modelosAgente) S.modelosAgente = await api('agentes:modelos');
  return S.modelosAgente;
}

function aplicarTimes(lista) {
  S.projeto.times = lista;
  S.projeto.montado = lista.length > 0;
  if (!timeDe(S.timeAtual)) S.timeAtual = lista[0]?.id || null;
}

/* ---------- criar time ---------- */

function abrirMontarTime() {
  if (!S.projeto) return;
  abrirAba({ id: 'montar', tipo: 'montar', titulo: S.projeto.montado ? 'Novo time' : 'Montar o time' });
}
const novoTime = abrirMontarTime;

PAGINAS.montar = {
  icone: () => ic('organization', 'icone-orquestra'),
  async desenhar(aba, host) {
    const modelos = await modelosDeAgente();
    const primeiro = !S.projeto.montado;
    aba.marcados ??= new Set(modelos.filter((m) => m.padrao).map((m) => m.id));
    aba.cor ??= CORES_TIME.find((c) => !S.projeto.times.some((t) => t.cor === c)) || CORES_TIME[0];
    const nome = h('input', { valor: aba.nome ?? (primeiro ? 'Time principal' : `Time ${S.projeto.times.length + 1}`), maxlength: 40 });
    nome.addEventListener('input', () => { aba.nome = nome.value; });
    const descricao = h('input', { valor: aba.descricao || '', placeholder: 'Ex.: cuida do front-end; ou: só revisão e testes' });
    descricao.addEventListener('input', () => { aba.descricao = descricao.value; });
    const cores = h('div', { class: 'grade-cores' }, CORES_TIME.map((c) => h('button', {
      type: 'button', class: `bt-cor${aba.cor === c ? ' marcado' : ''}`, cor: c, title: c,
      onclick: (e) => { aba.cor = c; e.currentTarget.parentElement.querySelectorAll('.bt-cor').forEach((b) => b.classList.toggle('marcado', b === e.currentTarget)); },
    })));

    const cartao = (m) => {
      const caixa = h('input', { type: 'checkbox', checked: aba.marcados.has(m.id), disabled: m.id === 'receptor' });
      caixa.addEventListener('change', () => { if (caixa.checked) aba.marcados.add(m.id); else aba.marcados.delete(m.id); });
      return h('label', { class: `cartao-modelo${m.id === 'receptor' ? ' fixo' : ''}`, cor: m.cor },
        caixa,
        h('span', { class: 'cartao-icone' }, ic(m.icone)),
        h('span', { class: 'cartao-texto' },
          h('strong', {}, m.nome, m.papel !== 'executor' ? h('span', { class: `tag-papel papel-${m.papel}` }, PAPEL[m.papel]) : null),
          h('span', {}, m.descricao),
          h('span', { class: 'chip-motor' }, m.motor)));
    };

    const criar = async (origem) => {
      const r = await api('time:criar', S.projeto.caminho, { nome: nome.value.trim() || 'Novo time', cor: aba.cor, descricao: descricao.value.trim(), origem });
      aplicarTimes(r.times);
      S.timeAtual = r.id;
      guardarTimeAtual();
      await carregarPasta('');
      fecharAba('montar', true);
      S.vista = 'times';
      desenharTudo();
      abrirDireita('orquestra');
      aviso(`${timeDe(r.id).nome} criado com ${timeDe(r.id).agentes.length} agente(s).`, 'ok');
    };

    host.append(h('div', { class: 'pagina pagina-estreita' },
      h('div', { class: 'boas-vindas-topo' }, desenharOrbitaVazia(), h('div', {},
        h('h1', {}, primeiro ? 'Monte o time deste projeto' : 'Novo time'),
        h('p', { class: 'mudo' }, 'Um projeto pode ter quantos times tu quiser (por exemplo: Front, API, QA), e times diferentes podem trabalhar ao mesmo tempo. Escolha com quais agentes este começa. Depois dá para mudar tudo em cada um e criar outros do zero. O Receptor sempre entra: é ele quem lê o pedido e monta o plano.'))),
      h('section', { class: 'grupo' },
        h('div', { class: 'grade-campos' },
          campo('Nome do time', null, nome),
          campo('Descrição', 'Opcional. Ajuda a lembrar para que serve.', descricao),
          h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, 'Cor'), cores))),
      h('section', { class: 'grupo' },
        h('h2', {}, 'Agentes'),
        h('div', { class: 'grade-modelos' }, modelos.map(cartao)),
        h('div', { class: 'linha-botoes' },
          h('button', { class: 'bt', onclick: () => criar('vazio') }, 'Só com o Receptor'),
          h('button', { class: 'bt bt-principal', onclick: () => criar([...aba.marcados]) }, ic('organization'), 'Criar o time'))),
      S.projeto.times.length || S.config.projetos.length > 1 ? h('section', { class: 'grupo' },
        h('h2', {}, 'Ou copie um time que já existe'),
        h('div', { class: 'lista-prompts' },
          S.projeto.times.map((t) => h('div', { class: 'linha-prompt' },
            h('i', { class: 'bolinha', cor: t.cor }), h('strong', {}, t.nome), h('span', { class: 'mudo' }, `${t.agentes.length} agentes, deste projeto`),
            h('span', { class: 'espaco' }),
            h('button', { class: 'bt', onclick: () => criar({ projeto: S.projeto.caminho, time: t.id }) }, ic('copy'), 'Copiar'))),
          S.config.projetos.length > 1 ? h('div', { class: 'linha-prompt' }, ic('folder'), h('span', {}, 'De outro projeto'), h('span', { class: 'espaco' }),
            h('button', { class: 'bt', onclick: () => copiarDeOutroProjeto(criar) }, ic('search'), 'Escolher…')) : null)) : null));
    requestAnimationFrame(() => nome.focus());
  },
};

function copiarDeOutroProjeto(criar) {
  const outros = S.config.projetos.filter((p) => p !== S.projeto.caminho);
  abrirPaleta({
    placeholder: 'De qual projeto?',
    itens: (busca) => outros.filter((p) => nota(p, busca) >= 0).map((p) => ({ rotulo: p.split(/[\\/]/).pop(), detalhe: p, icone: 'folder', p })),
    aoEscolher: async (it) => {
      const lista = await api('times:deOutroProjeto', it.p);
      if (!lista.length) return aviso('Esse projeto ainda não tem times.', 'info');
      abrirPaleta({
        placeholder: 'Qual time copiar?',
        itens: () => lista.map((t) => ({ rotulo: t.nome, detalhe: `${t.agentes} agentes`, icone: 'organization', cor: t.cor, t })),
        aoEscolher: (x) => criar({ projeto: it.p, time: x.t.id }),
      });
    },
  });
}

function desenharOrbitaVazia() {
  return svg('svg', { class: 'orbita orbita-pequena', viewBox: '0 0 120 80', 'aria-hidden': 'true' },
    svg('ellipse', { class: 'orbita-anel', cx: 60, cy: 40, rx: 52, ry: 22, transform: 'rotate(-14 60 40)' }),
    svg('circle', { class: 'orbita-planeta', cx: 60, cy: 40, r: 11 }),
    [0.3, 1.9, 3.4, 4.9].map((ang, i) => svg('circle', {
      class: 'orbita-lua', cx: 60 + 52 * Math.cos(ang) * Math.cos(-0.244) - 22 * Math.sin(ang) * Math.sin(-0.244),
      cy: 40 + 52 * Math.cos(ang) * Math.sin(-0.244) + 22 * Math.sin(ang) * Math.cos(-0.244), r: 4.5,
      cor: ['#f5b94a', '#e879f9', '#60a5fa', '#4ade80'][i],
    })));
}

/* ---------- editar time ---------- */

function abrirTime(id) {
  const t = timeDe(id);
  if (!t) return;
  abrirAba({ id: `time:${id}`, tipo: 'time', titulo: t.nome, timeId: id, rascunho: { nome: t.nome, cor: t.cor, descricao: t.descricao }, sujo: false });
}

PAGINAS.time = {
  icone: (aba) => h('span', { class: 'icone-aba-agente', cor: aba.rascunho.cor }, ic('organization')),
  desenhar(aba, host) {
    const t = timeDe(aba.timeId);
    if (!t) return host.append(h('div', { class: 'pagina' }, h('p', {}, 'Esse time não existe mais.')));
    const r = aba.rascunho;
    const nome = h('input', { valor: r.nome, maxlength: 40 });
    nome.addEventListener('input', () => { r.nome = nome.value; marcarSuja(aba); });
    const desc = h('input', { valor: r.descricao });
    desc.addEventListener('input', () => { r.descricao = desc.value; marcarSuja(aba); });
    const cores = h('div', { class: 'grade-cores' }, CORES_TIME.map((c) => h('button', {
      type: 'button', class: `bt-cor${r.cor === c ? ' marcado' : ''}`, cor: c,
      onclick: (e) => { r.cor = c; marcarSuja(aba); e.currentTarget.parentElement.querySelectorAll('.bt-cor').forEach((b) => b.classList.toggle('marcado', b === e.currentTarget)); },
    })));
    const ocupado = vivosDoProjeto().some((v) => v.estado?.time === t.id);
    host.append(h('div', { class: 'pagina' },
      h('header', { class: 'agente-topo', cor: r.cor },
        h('span', { class: 'agente-icone-grande' }, ic('organization')),
        h('div', { class: 'agente-titulo' }, h('h1', {}, r.nome || 'Sem nome'), h('span', { class: 'mudo mono' }, `.orbion/times/${t.id}`)),
        h('div', { class: 'agente-acoes' },
          h('button', { class: 'bt', onclick: () => novoPedido(t.id) }, ic('comment-discussion'), 'Pedido para este time'),
          h('button', { class: 'bt-icone perigo', title: 'Mandar o time para a lixeira', onclick: () => excluirTime(aba) }, ic('trash')),
          h('button', { class: 'bt bt-principal', id: 'bt-salvar-agente', disabled: !aba.sujo, onclick: () => salvarAba(aba) }, ic('save'), 'Salvar'))),
      ocupado ? h('p', { class: 'faixa-info' }, ic('loading', 'codicon-modifier-spin'), 'Este time está trabalhando num pedido agora.') : null,
      h('section', { class: 'grupo' },
        h('h2', {}, 'Time'),
        h('div', { class: 'grade-campos' }, campo('Nome', null, nome), campo('Descrição', null, desc), h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, 'Cor'), cores))),
      h('section', { class: 'grupo' },
        h('h2', {}, `Agentes (${t.agentes.length})`),
        h('div', { class: 'grade-modelos' }, t.agentes.map((a) => h('div', { class: `cartao-modelo${a.ativo ? '' : ' inativo'}`, cor: a.cor, onclick: () => abrirAgente(t.id, a.id) },
          h('span', { class: 'cartao-icone' }, ic(a.icone)),
          h('span', { class: 'cartao-texto' },
            h('strong', {}, a.nome, a.papel !== 'executor' ? h('span', { class: `tag-papel papel-${a.papel}` }, PAPEL[a.papel]) : null, !a.ativo ? h('span', { class: 'tag-inativo' }, 'desligado') : null),
            h('span', {}, a.descricao),
            h('span', { class: 'chip-motor' }, a.modelo ? `${a.motor} · ${nomeModelo(a.modelo)}` : a.motor)),
          h('span', {})))),
        h('div', { class: 'linha-botoes' }, h('button', { class: 'bt bt-principal', onclick: () => novoAgente(t.id) }, ic('add'), 'Criar agente neste time')))));
  },
  async salvar(aba) {
    aplicarTimes(await api('time:salvar', S.projeto.caminho, aba.timeId, aba.rascunho));
    aba.sujo = false;
    aba.titulo = aba.rascunho.nome;
    aviso('Time salvo.', 'ok');
    desenharTudo();
    redesenharPagina(aba);
  },
};

async function excluirTime(aba) {
  const t = timeDe(aba.timeId);
  if (!confirm(`Mandar o time "${t.nome}" e os ${t.agentes.length} agentes dele para a lixeira? Dá para recuperar de lá.`)) return;
  try {
    aplicarTimes(await api('time:excluir', S.projeto.caminho, aba.timeId));
  } catch {
    return;
  }
  for (const a of S.abas.filter((x) => x.id === aba.id || x.time === aba.timeId)) fecharAba(a.id, true);
  desenharTudo();
}

/* ---------- criar, duplicar, copiar, prévia ---------- */

async function novoAgente(time = S.timeAtual) {
  if (!S.projeto?.montado) return abrirMontarTime();
  const modelos = await modelosDeAgente();
  const t = timeDe(time) || S.projeto.times[0];
  abrirPaleta({
    placeholder: `Criar agente no ${t.nome} a partir de um modelo`,
    itens: (busca) => [
      { rotulo: 'Em branco', detalhe: 'Começar do zero', icone: 'new-file', id: 'branco' },
      ...modelos.map((m) => ({ rotulo: m.nome, detalhe: m.descricao, icone: m.icone, cor: m.cor, id: m.id })),
    ].filter((x) => nota(`${x.rotulo} ${x.detalhe}`, busca) >= 0),
    aoEscolher: (item) => pedirTexto({
      placeholder: 'Nome do agente (ex.: DBA Postgres, Dev Front, QA Mobile)',
      valor: item.id === 'branco' ? '' : item.rotulo,
      aoConfirmar: async (nome) => {
        const r = await api('agente:criar', S.projeto.caminho, t.id, item.id, nome.trim());
        aplicarTimes(r.times);
        desenharTudo();
        abrirAgente(t.id, r.id);
      },
    }),
  });
}

async function duplicarAgente(time, id) {
  const r = await api('agente:duplicar', S.projeto.caminho, time, id);
  aplicarTimes(r.times);
  desenharTudo();
  abrirAgente(time, r.id);
}

function copiarAgenteParaOutroTime(time, a) {
  abrirPaleta({
    placeholder: `Copiar ${a.nome} para qual time?`,
    itens: () => S.projeto.times.filter((t) => t.id !== time).map((t) => ({ rotulo: t.nome, icone: 'organization', cor: t.cor, id: t.id })),
    aoEscolher: async (it) => {
      aplicarTimes(await api('agente:copiarPara', S.projeto.caminho, time, a.id, it.id));
      desenharTudo();
      aviso(`${a.nome} copiado para ${it.rotulo}.`, 'ok');
    },
  });
}

async function previaAgente(time, id) {
  const texto = await api('agente:previa', S.projeto.caminho, time, id);
  const a = agentesDe(time).find((x) => x.id === id);
  abrirTextoSomenteLeitura(`previa:${time}/${id}`, `Prompt: ${a?.nome || id}`, texto);
}

/* ---------- editor de agente ---------- */

function abrirAgente(time, id) {
  const a = agentesDe(time).find((x) => x.id === id);
  if (!a) return;
  abrirAba({ id: `agente:${time}/${id}`, tipo: 'agente', titulo: a.nome, time, agenteId: id, rascunho: structuredClone(a), sujo: false });
}

function campo(rotulo, dica, controle) {
  return h('label', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, rotulo), dica ? h('span', { class: 'campo-dica' }, dica) : null, controle);
}

function entrada(aba, chave, props = {}) {
  const el = h('input', { ...props, valor: aba.rascunho[chave] ?? '' });
  el.addEventListener('input', () => {
    aba.rascunho[chave] = props.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    marcarSuja(aba);
  });
  return el;
}

function caixa(aba, chave, texto) {
  const el = h('input', { type: 'checkbox', checked: !!aba.rascunho[chave] });
  el.addEventListener('change', () => { aba.rascunho[chave] = el.checked; marcarSuja(aba); redesenharPagina(aba); });
  return h('label', { class: 'caixa' }, el, h('span', {}, texto));
}

function escolha(aba, chave, opcoes, aoMudar) {
  const el = h('select', {}, opcoes.map(([v, r]) => h('option', { value: v, selected: (aba.rascunho[chave] ?? '') === v }, r)));
  el.addEventListener('change', () => { aba.rascunho[chave] = el.value; marcarSuja(aba); aoMudar?.(); });
  return el;
}

function marcarSuja(aba) {
  if (!aba.sujo) {
    aba.sujo = true;
    desenharAbas();
  }
  const b = $('#bt-salvar-agente');
  if (b) b.disabled = false;
}

function redesenharPagina(aba) {
  if (S.ativa !== aba.id) return;
  const pg = $('#host-pagina');
  const rolagem = pg.scrollTop;
  PAGINAS[aba.tipo].sair?.(aba);
  pg.replaceChildren();
  PAGINAS[aba.tipo].desenhar(aba, pg);
  pg.scrollTop = rolagem;
}

PAGINAS.agente = {
  icone: (aba) => h('span', { class: 'icone-aba-agente', cor: aba.rascunho.cor }, ic(aba.rascunho.icone)),
  desenhar(aba, host) {
    const a = aba.rascunho;
    const time = timeDe(aba.time);
    if (!S.skills) api('skills:listar', S.projeto.caminho).then((s) => { S.skills = s; redesenharPagina(aba); });
    if (!aba.prompts) api('prompts:listar', S.projeto.caminho).then((p) => { aba.prompts = p; redesenharPagina(aba); });

    const papelCartao = (valor, titulo, texto, icone) => h('label', { class: `cartao-papel${a.papel === valor ? ' marcado' : ''}` },
      h('input', { type: 'radio', name: 'papel', checked: a.papel === valor, onchange: () => { a.papel = valor; marcarSuja(aba); redesenharPagina(aba); } }),
      ic(icone), h('strong', {}, titulo), h('span', {}, texto));

    const icones = h('div', { class: 'grade-icones' }, ICONES_AGENTE.map((nome) => h('button', {
      type: 'button', class: `bt-icone-escolha${a.icone === nome ? ' marcado' : ''}`, title: nome,
      onclick: () => { a.icone = nome; marcarSuja(aba); redesenharPagina(aba); },
    }, ic(nome))));

    const busca = h('input', { type: 'search', placeholder: 'Procurar entre as skills instaladas', valor: aba.buscaSkills || '' });
    const caixaSkills = h('div', { class: 'lista-skills' });
    const desenharSkills = () => {
      const termo = (aba.buscaSkills || '').toLowerCase();
      const todas = S.skills || [];
      const nomes = new Set(todas.map((s) => s.nome));
      const faltando = a.skills.filter((n) => !nomes.has(n));
      const lista = todas.filter((s) => !termo || `${s.nome} ${s.descricao}`.toLowerCase().includes(termo))
        .sort((x, y) => a.skills.includes(y.nome) - a.skills.includes(x.nome));
      caixaSkills.replaceChildren(...[
        ...faltando.map((n) => h('div', { class: 'skill faltando' }, ic('warning'), `${n}: não encontrei esta skill neste PC`)),
        ...lista.map((s) => {
          const c = h('input', { type: 'checkbox', checked: a.skills.includes(s.nome) });
          c.addEventListener('change', () => {
            a.skills = c.checked ? [...a.skills, s.nome] : a.skills.filter((n) => n !== s.nome);
            marcarSuja(aba);
          });
          return h('label', { class: 'skill', title: s.descricao }, c, h('span', { class: 'skill-nome' }, s.nome), h('span', { class: 'skill-desc' }, s.descricao));
        }),
        !todas.length ? h('div', { class: 'mudo' }, S.skills ? 'Nenhuma skill instalada encontrada.' : 'Procurando skills…') : null,
      ].filter(Boolean));
    };
    busca.addEventListener('input', () => { aba.buscaSkills = busca.value; desenharSkills(); });
    desenharSkills();

    const nomePrompt = a.papel === 'receptor' ? 'receptor.md' : 'tarefa.md';
    const opcoesPrompt = [['', `Padrão do projeto (${nomePrompt})`], ...(aba.prompts || []).filter((p) => !p.padrao).map((p) => [p.nome, p.nome]),
      ...(a.modeloPrompt && !(aba.prompts || []).some((p) => p.nome === a.modeloPrompt) ? [[a.modeloPrompt, `${a.modeloPrompt} (não existe ainda)`]] : [])];

    const hostInstrucoes = h('div', { class: 'editor-instrucoes' });
    const derivadas = ['Read', 'Glob', 'Grep', ...(a.editaArquivos ? ['Edit', 'Write'] : []), ...(a.rodaComandos ? ['PowerShell', 'Bash'] : [])].join(',');
    const rel = `.orbion/times/${aba.time}/agentes/${aba.agenteId}.md`;

    host.append(h('div', { class: 'pagina pagina-agente' },
      h('header', { class: 'agente-topo', cor: a.cor },
        h('span', { class: 'agente-icone-grande' }, ic(a.icone)),
        h('div', { class: 'agente-titulo' },
          h('h1', {}, a.nome || 'Sem nome', !a.ativo ? h('span', { class: 'tag-inativo' }, 'desligado') : null),
          h('span', { class: 'mudo' }, h('i', { class: 'bolinha', cor: time?.cor }), ` ${time?.nome || aba.time} · `, h('span', { class: 'mono' }, rel))),
        h('div', { class: 'agente-acoes' },
          h('button', { class: 'bt', title: 'Ver o prompt completo que este agente recebe', onclick: () => previaAgente(aba.time, aba.agenteId) }, ic('eye'), 'Prévia do prompt'),
          h('button', { class: 'bt-icone', title: 'Duplicar', onclick: () => duplicarAgente(aba.time, aba.agenteId) }, ic('copy')),
          S.projeto.times.length > 1 ? h('button', { class: 'bt-icone', title: 'Copiar para outro time', onclick: () => copiarAgenteParaOutroTime(aba.time, a) }, ic('arrow-swap')) : null,
          h('button', { class: 'bt-icone', title: 'Abrir o arquivo .md', onclick: () => abrirArquivo(rel) }, ic('go-to-file')),
          h('button', { class: 'bt-icone perigo', title: 'Mandar para a lixeira', onclick: () => excluirAgente(aba) }, ic('trash')),
          h('button', { class: 'bt bt-principal', id: 'bt-salvar-agente', disabled: !aba.sujo, onclick: () => salvarAba(aba) }, ic('save'), 'Salvar'))),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Identidade'),
        h('div', { class: 'grade-campos' },
          campo('Nome', null, entrada(aba, 'nome', { maxlength: 40 })),
          campo('Cor', null, entrada(aba, 'cor', { type: 'color' })),
          campo('Ordem na lista', null, entrada(aba, 'ordem', { type: 'number', min: 0, max: 99 })),
          h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, 'Situação'), caixa(aba, 'ativo', 'Ligado (o Receptor pode chamar)'))),
        campo('Descrição', 'O Receptor lê isto para decidir quando chamar este agente.', (() => {
          const t = h('textarea', { rows: 2, valor: a.descricao });
          t.addEventListener('input', () => { a.descricao = t.value; marcarSuja(aba); });
          return t;
        })()),
        h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, 'Ícone'), icones)),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Papel no fluxo'),
        h('div', { class: 'grade-papeis' },
          papelCartao('receptor', 'Receptor', 'Lê o pedido e monta o plano. Só um por time.', 'inbox'),
          papelCartao('executor', 'Executor', 'Faz as tarefas que o Receptor passar para ele.', 'tools'),
          papelCartao('verificador', 'Verificador', 'Confere o trabalho dos outros e pode devolver para correção.', 'beaker'))),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Motor'),
        h('div', { class: 'grade-campos' },
          campo('Motor', h('span', {}, 'Assinatura (CLI) ou modelo por token. ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); abrirContas(); } }, 'Contas e modelos')),
            escolha(aba, 'motor', [['claude', 'Claude Code (assinatura)'], ['codex', 'Codex (assinatura)'], ...(S.provedores || []).map((p) => [`api:${p.id}`, `${p.nome} (API)`]),
              ...(a.motor.startsWith('api:') && !(S.provedores || []).some((p) => `api:${p.id}` === a.motor) ? [[a.motor, `${a.motor} (não cadastrado)`]] : [])], () => { a.modelo = ''; redesenharPagina(aba); })),
          campo('Modelo', a.motor.startsWith('api:') && !(S.modelos?.[a.motor] || []).length ? h('span', {}, 'Teste o provedor em ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); abrirContas(); } }, 'Contas e modelos'), ' para listar os modelos.') : null,
            seletorModelo(a.motor, a.modelo, (v) => { a.modelo = v; marcarSuja(aba); redesenharPagina(aba); })),
          campo('Esforço de raciocínio', null, escolha(aba, 'esforco', ESFORCOS)),
          campo('Tempo máximo (min)', 'Vazio usa o do projeto.', entrada(aba, 'tempoMax', { type: 'number', min: 1, max: 240, placeholder: String(S.projeto.config?.tempoMaxMin ?? 30) }))),
        ),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Permissões'),
        h('div', { class: 'linha-caixas' },
          caixa(aba, 'editaArquivos', 'Pode criar e editar arquivos (entra na fila de escrita)'),
          caixa(aba, 'rodaComandos', 'Pode rodar comandos no terminal')),
        a.motor === 'claude'
          ? campo('Ferramentas do Claude', 'Vazio usa as das permissões acima. Aceita regras como Bash(npm *).', entrada(aba, 'ferramentas', { placeholder: derivadas, class: 'mono' }))
          : a.motor === 'codex'
            ? h('p', { class: 'campo-dica' }, `No Codex as permissões viram o modo de sandbox: ${a.editaArquivos || a.rodaComandos ? 'workspace-write (lê tudo, escreve no projeto)' : 'read-only (só lê)'}.`)
            : h('p', { class: 'campo-dica' }, `No modelo por API, o Orbion dá as ferramentas: ler, listar e buscar sempre${a.editaArquivos ? '; escrever e substituir texto' : ''}${a.rodaComandos ? '; rodar comandos' : ''}. O modelo precisa aceitar ferramentas (function calling).`),
        !a.motor.startsWith('api:') ? campo('Argumentos extras do CLI', `Vão direto para o ${a.motor === 'codex' ? 'codex exec' : 'claude -p'}. Para quem sabe o que está fazendo.`, entrada(aba, 'argsExtras', { class: 'mono', placeholder: a.motor === 'codex' ? '-c model_verbosity="low"' : '--fallback-model sonnet' })) : null),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Skills'),
        h('p', { class: 'campo-dica' }, 'O agente lê o SKILL.md de cada skill marcada antes de começar. Vale para o Claude e para o Codex.'),
        busca, caixaSkills),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Prompt'),
        h('div', { class: 'grade-campos' },
          campo('Modelo do prompt', 'O texto em volta das instruções: regras, contexto, memória, tarefa e formato do passe.', escolha(aba, 'modeloPrompt', opcoesPrompt)),
          h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, ' '),
            h('div', { class: 'linha-botoes esquerda' },
              h('button', { class: 'bt', onclick: () => editarModeloPrompt(a.modeloPrompt || nomePrompt) }, ic('edit'), 'Editar modelo'),
              h('button', { class: 'bt', onclick: () => novoModeloPrompt(aba) }, ic('add'), 'Novo modelo só para ele')))),
        h('div', { class: 'campo' },
          h('span', { class: 'campo-rotulo' }, 'Instruções do papel'),
          h('span', { class: 'campo-dica' }, 'Entram no lugar de {{agente.instrucoes}} no modelo. Markdown.'),
          hostInstrucoes))));

    // As instruções ficam num editor de verdade (Monaco), com o modelo guardado na aba.
    if (!aba.modeloInstrucoes) {
      aba.modeloInstrucoes = monaco.editor.createModel(a.instrucoes || '', 'markdown');
      aba.modeloInstrucoes.onDidChangeContent(() => { a.instrucoes = aba.modeloInstrucoes.getValue(); marcarSuja(aba); });
    }
    aba.editorInstrucoes = monaco.editor.create(hostInstrucoes, {
      ...opcoesEditor(), model: aba.modeloInstrucoes, minimap: { enabled: false }, wordWrap: 'on', lineNumbers: 'off', stickyScroll: { enabled: false },
      scrollBeyondLastLine: false, glyphMargin: false, folding: false, lineDecorationsWidth: 8,
    });
    aba.editorInstrucoes.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => salvarAba(aba));
  },
  sair(aba) {
    aba.editorInstrucoes?.dispose();
    aba.editorInstrucoes = null;
  },
  fechar(aba) {
    aba.editorInstrucoes?.dispose();
    aba.modeloInstrucoes?.dispose();
  },
  async salvar(aba) {
    const a = aba.rascunho;
    if (!a.nome.trim()) return aviso('Dê um nome para o agente.');
    aplicarTimes(await api('agente:salvar', S.projeto.caminho, aba.time, aba.agenteId, { ...a, nome: a.nome.trim() }));
    aba.sujo = false;
    aba.titulo = a.nome.trim();
    aviso(`${aba.titulo} salvo.`, 'ok');
    desenharTudo();
    redesenharPagina(aba);
  },
};

async function excluirAgente(aba) {
  if (!confirm(`Mandar ${aba.rascunho.nome} para a lixeira? Dá para recuperar de lá.`)) return;
  try {
    aplicarTimes(await api('agente:excluir', S.projeto.caminho, aba.time, aba.agenteId));
  } catch {
    return;
  }
  fecharAba(aba.id, true);
  desenharTudo();
}

async function editarModeloPrompt(nome) {
  const rel = await api('prompts:garantir', S.projeto.caminho, nome);
  await carregarPasta('.orbion');
  await carregarPasta('.orbion/prompts');
  abrirArquivo(rel);
}

function novoModeloPrompt(aba) {
  const base = aba.rascunho.papel === 'receptor' ? 'receptor.md' : 'tarefa.md';
  pedirTexto({
    placeholder: 'Nome do modelo (ex.: tarefa-dev.md)',
    valor: `${base.replace('.md', '')}-${aba.agenteId}.md`,
    aoConfirmar: async (nome) => {
      const n = nome.trim().toLowerCase().endsWith('.md') ? nome.trim().toLowerCase() : `${nome.trim().toLowerCase()}.md`;
      const rel = await api('prompts:garantir', S.projeto.caminho, n, base);
      aba.rascunho.modeloPrompt = n;
      aba.prompts = await api('prompts:listar', S.projeto.caminho);
      marcarSuja(aba);
      redesenharPagina(aba);
      abrirArquivo(rel);
    },
  });
}
