// Ferramentas em volta do time: sugestões de melhoria, criar skill, criar projeto e o
// catálogo Descobrir (skills do Orbion e ideias da comunidade).

const ASSIST = { rodando: null, acoes: [] };

function eventoAssistente(ev) {
  if (ev.tipo === 'acao' || ev.tipo === 'texto') {
    ASSIST.acoes.push(ev.texto);
    const el = $('#assist-agora');
    if (el) el.textContent = ev.texto.split('\n')[0].slice(0, 140);
  } else if (ev.tipo === 'uso' && ev.motor === 'claude') {
    S.uso.claude = ev.info;
    desenharStatus();
  }
}

/* ---------- sugestões de melhoria ---------- */

function abrirMelhorias(rodarJa = false) {
  if (!S.projeto) return;
  abrirAba({ id: 'melhorias', tipo: 'melhorias', titulo: 'Melhorias' });
  if (rodarJa) rodarMelhorias(abaAtiva());
}

async function rodarMelhorias(aba, foco = '') {
  if (ASSIST.rodando) return;
  ASSIST.rodando = 'melhorias';
  ASSIST.acoes = [];
  redesenharPagina(aba);
  try {
    aba.resultado = await api('melhorias:rodar', S.projeto.caminho, { foco });
  } catch {}
  ASSIST.rodando = null;
  redesenharPagina(aba);
}

const PESO = { alto: 0, medio: 1, baixo: 2, pequeno: 0, grande: 2 };
const NIVEL = { alto: 'alto', medio: 'médio', baixo: 'baixo', pequeno: 'pequeno', grande: 'grande' };
const AREA = { bug: 'Bug', seguranca: 'Segurança', testes: 'Testes', codigo: 'Código', desempenho: 'Desempenho', experiencia: 'Experiência', arquitetura: 'Arquitetura', documentacao: 'Documentação', infra: 'Infra' };

PAGINAS.melhorias = {
  icone: () => ic('lightbulb'),
  desenhar(aba, host) {
    if (aba.resultado === undefined) api('melhorias:ultimas', S.projeto.caminho).then((r) => { aba.resultado = r; redesenharPagina(aba); });
    const r = aba.resultado;
    const foco = h('input', { placeholder: 'Foco (opcional): ex. segurança do login, desempenho da busca…', valor: aba.foco || '' });
    foco.addEventListener('input', () => { aba.foco = foco.value; });
    const a = S.config.assistente || { motor: 'claude' };
    const rodando = ASSIST.rodando === 'melhorias';
    const lista = r?.sugestoes ? [...r.sugestoes].sort((x, y) => PESO[x.impacto] - PESO[y.impacto] || PESO[x.esforco] - PESO[y.esforco]) : [];
    host.append(h('div', { class: 'pagina' },
      h('h1', {}, ic('lightbulb'), 'Sugestões de melhoria'),
      h('p', { class: 'mudo' }, `Uma IA lê o projeto e aponta o que mais vale a pena melhorar, com um pedido pronto para o time. Quem analisa: ${rotuloMotor(a.motor, a.modelo)} (troque em Contas e modelos). Nada é alterado.`),
      h('div', { class: 'linha-analise' }, foco,
        rodando
          ? h('button', { class: 'bt bt-perigo', onclick: () => api('assistente:parar') }, ic('debug-stop'), 'Parar')
          : h('button', { class: 'bt bt-principal', onclick: () => rodarMelhorias(aba, foco.value.trim()) }, ic('search'), r ? 'Analisar de novo' : 'Analisar o projeto')),
      rodando ? h('p', { class: 'faixa-info' }, ic('loading', 'codicon-modifier-spin'), h('span', { id: 'assist-agora' }, ASSIST.acoes.at(-1) || 'Lendo o projeto…')) : null,
      r && !rodando ? [
        h('section', { class: 'grupo' }, h('h2', {}, 'Como o projeto está'), h('p', {}, r.resumo), h('p', { class: 'mudo pequeno' }, `Análise de ${data(r.criadaEm)}`)),
        h('section', { class: 'grupo' }, h('h2', {}, `Sugestões (${lista.length})`),
          lista.map((s) => h('div', { class: `cartao-melhoria imp-${s.impacto}` },
            h('div', { class: 'melhoria-topo' },
              h('span', { class: 'tag-area' }, AREA[s.area] || s.area),
              h('strong', {}, s.titulo),
              h('span', { class: 'espaco' }),
              h('span', { class: `badge-imp imp-${s.impacto}`, title: 'Impacto' }, `impacto ${NIVEL[s.impacto] || s.impacto}`),
              h('span', { class: 'badge-esf', title: 'Esforço' }, `esforço ${NIVEL[s.esforco] || s.esforco}`)),
            h('p', {}, s.descricao),
            s.arquivos?.length ? h('div', { class: 'arquivos' }, s.arquivos.map((arq) => h('button', { class: 'arquivo', onclick: () => abrirArquivo(normalizarCaminho(arq).replace(/:\d+$/, '')) }, iconeDe(nomeDe(arq.replace(/:\d+$/, ''))), arq))) : null,
            h('details', {}, h('summary', {}, 'Pedido pronto para o time'), h('p', { class: 'pre' }, s.pedido)),
            h('div', { class: 'msg-acoes' },
              h('button', { class: 'bt-mini', onclick: () => { S.rascunhoPedido = s.pedido; novoPedido(); const c = $('#pedido'); if (c) { c.value = s.pedido; c.focus(); } } }, ic('organization'), 'Mandar para o time'),
              h('button', { class: 'bt-mini', onclick: () => { CV.atual = null; CV.modo = 'grill-me'; CV.rascunho = `Quero fazer esta melhoria: ${s.titulo}. ${s.descricao}`; abrirDireita('conversa'); } }, ic('flame'), 'Discutir antes'),
              h('button', { class: 'bt-mini', onclick: () => { navigator.clipboard.writeText(s.pedido); aviso('Copiado.', 'ok'); } }, ic('copy'), 'Copiar')))))] : null,
      !r && !rodando ? h('div', { class: 'vazio-centro' }, ic('lightbulb', 'grande'), h('p', { class: 'mudo' }, 'Ainda não tem análise deste projeto.')) : null));
  },
};

/* ---------- criar skill ---------- */

function abrirNovaSkill(base = {}) {
  abrirAba({ id: 'nova-skill', tipo: 'novaSkill', titulo: 'Nova skill', rascunho: { nome: '', descricao: '', instrucoes: '', onde: S.projeto ? 'projeto' : 'usuario', ideia: '', ...base } });
}

PAGINAS.novaSkill = {
  icone: () => ic('sparkle'),
  desenhar(aba, host) {
    const r = aba.rascunho;
    const nome = h('input', { valor: r.nome, placeholder: 'ex.: revisar-pr', class: 'mono' });
    nome.addEventListener('input', () => { r.nome = nome.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'); });
    const desc = h('textarea', { rows: 2, valor: r.descricao, placeholder: 'O que faz e quando usar. Ex.: Revisa um pull request procurando bugs. Use quando pedirem "revisa o PR" ou "olha essas mudanças".' });
    desc.addEventListener('input', () => { r.descricao = desc.value; });
    const ideia = h('textarea', { rows: 2, valor: r.ideia, placeholder: 'Descreva em poucas palavras o que a skill deve fazer, e a IA escreve para ti.' });
    ideia.addEventListener('input', () => { r.ideia = ideia.value; });
    const hostEditor = h('div', { class: 'editor-instrucoes' });
    const rodando = ASSIST.rodando === 'skill';
    const onde = (valor, rotulo, dica) => h('label', { class: `cartao-papel${r.onde === valor ? ' marcado' : ''}` },
      h('input', { type: 'radio', name: 'onde', checked: r.onde === valor, onchange: () => { r.onde = valor; redesenharPagina(aba); } }),
      ic(valor === 'projeto' ? 'folder' : 'globe'), h('strong', {}, rotulo), h('span', {}, dica));
    host.append(h('div', { class: 'pagina pagina-agente' },
      h('h1', {}, ic('sparkle'), 'Nova skill'),
      h('p', { class: 'mudo' }, 'Uma skill é um conjunto de instruções que qualquer agente ou conversa pode usar. Os agentes do Claude e do Codex, e os modelos por API, leem o SKILL.md antes de começar.'),
      h('section', { class: 'grupo' },
        h('h2', {}, 'Escrever com IA'),
        h('div', { class: 'linha-analise' }, ideia,
          rodando ? h('button', { class: 'bt bt-perigo', onclick: () => api('assistente:parar') }, ic('debug-stop'), 'Parar')
            : h('button', { class: 'bt bt-principal', onclick: () => escreverSkillComIa(aba) }, ic('sparkle'), 'Escrever')),
        rodando ? h('p', { class: 'faixa-info' }, ic('loading', 'codicon-modifier-spin'), h('span', { id: 'assist-agora' }, 'Escrevendo a skill…')) : null),
      h('section', { class: 'grupo' },
        h('h2', {}, 'A skill'),
        h('div', { class: 'grade-campos' }, campo('Nome', 'Minúsculas e hífen.', nome)),
        campo('Descrição', 'A IA lê isto para decidir quando usar a skill. É a parte mais importante.', desc),
        h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, 'Onde guardar'),
          h('div', { class: 'grade-papeis' },
            S.projeto ? onde('projeto', 'Neste projeto', 'Em .claude/skills. O Claude Code também usa.') : null,
            onde('usuario', 'Em todos os projetos', 'Em ~/.orbion/skills, para qualquer projeto no Orbion.'))),
        h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, 'Instruções'), hostEditor),
        h('div', { class: 'linha-botoes' }, h('button', { class: 'bt bt-principal', onclick: () => salvarNovaSkill(aba) }, ic('save'), 'Salvar a skill')))));
    if (!aba.modelo) {
      aba.modelo = monaco.editor.createModel(r.instrucoes || '', 'markdown');
      aba.modelo.onDidChangeContent(() => { r.instrucoes = aba.modelo.getValue(); });
    }
    aba.editor = monaco.editor.create(hostEditor, { ...opcoesEditor(), model: aba.modelo, minimap: { enabled: false }, wordWrap: 'on', lineNumbers: 'off', stickyScroll: { enabled: false } });
  },
  sair(aba) { aba.editor?.dispose(); aba.editor = null; },
  fechar(aba) { aba.editor?.dispose(); aba.modelo?.dispose(); },
};

async function escreverSkillComIa(aba) {
  const r = aba.rascunho;
  if (!r.ideia.trim()) return aviso('Descreva o que a skill deve fazer.', 'info');
  ASSIST.rodando = 'skill';
  redesenharPagina(aba);
  try {
    const s = await api('skill:escrever', S.projeto?.caminho || null, { descricao: r.ideia.trim() });
    r.nome = String(s.nome || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    r.descricao = s.descricao;
    r.instrucoes = s.instrucoes;
    aba.modelo?.setValue(s.instrucoes || '');
  } catch {}
  ASSIST.rodando = null;
  redesenharPagina(aba);
}

async function salvarNovaSkill(aba) {
  const r = aba.rascunho;
  if (!r.nome || !r.descricao.trim() || !r.instrucoes.trim()) return aviso('Preencha nome, descrição e instruções.', 'info');
  let arquivo;
  try {
    arquivo = await api('skill:salvar', { projeto: S.projeto?.caminho, onde: r.onde, nome: r.nome, descricao: r.descricao, instrucoes: r.instrucoes });
  } catch {
    return;
  }
  S.skills = null;
  aviso(`Skill ${r.nome} salva. Ela já aparece nos agentes e nas conversas.`, 'ok');
  fecharAba(aba.id, true);
  if (r.onde === 'projeto' && S.projeto) {
    await carregarPasta('.claude');
    abrirArquivo(normalizarCaminho(arquivo));
  }
}

/* ---------- criar projeto ---------- */

function abrirNovoProjeto() {
  abrirAba({ id: 'novo-projeto', tipo: 'novoProjeto', titulo: 'Novo projeto', rascunho: { nome: '', pai: null, modelo: 'vazio', descricao: '', git: true, time: true, depois: 'time' } });
}

PAGINAS.novoProjeto = {
  icone: () => ic('new-folder'),
  desenhar(aba, host) {
    const r = aba.rascunho;
    if (!r.pai) api('projeto:pastaPadrao').then((p) => { r.pai = p; redesenharPagina(aba); });
    if (!aba.modelos) api('projeto:modelos').then((m) => { aba.modelos = m; redesenharPagina(aba); });
    const nome = h('input', { valor: r.nome, placeholder: 'ex.: Loja da Ana' });
    nome.addEventListener('input', () => { r.nome = nome.value; });
    const desc = h('textarea', { rows: 4, valor: r.descricao, placeholder: 'O que é o projeto, para quem, o que a primeira versão precisa ter. Quanto mais claro, melhor o time monta o começo.' });
    desc.addEventListener('input', () => { r.descricao = desc.value; });
    const marca = (chave, texto) => {
      const el = h('input', { type: 'checkbox', checked: !!r[chave] });
      el.addEventListener('change', () => { r[chave] = el.checked; });
      return h('label', { class: 'caixa' }, el, h('span', {}, texto));
    };
    const depois = (valor, titulo, texto, icone) => h('label', { class: `cartao-papel${r.depois === valor ? ' marcado' : ''}` },
      h('input', { type: 'radio', name: 'depois', checked: r.depois === valor, onchange: () => { r.depois = valor; redesenharPagina(aba); } }),
      ic(icone), h('strong', {}, titulo), h('span', {}, texto));
    host.append(h('div', { class: 'pagina' },
      h('h1', {}, ic('new-folder'), 'Novo projeto'),
      h('section', { class: 'grupo' },
        h('div', { class: 'grade-campos' },
          campo('Nome', null, nome),
          h('div', { class: 'campo' }, h('span', { class: 'campo-rotulo' }, 'Onde criar'),
            h('div', { class: 'linha-pasta' }, h('span', { class: 'mono pequeno', title: r.pai || '' }, r.pai || '…'),
              h('button', { class: 'bt', onclick: async () => { const p = await api('projeto:escolherPai'); if (p) { r.pai = p; redesenharPagina(aba); } } }, ic('folder-opened'), 'Escolher')))),
        campo('Descrição', null, desc)),
      h('section', { class: 'grupo' },
        h('h2', {}, 'Começar com'),
        h('div', { class: 'grade-modelos' }, (aba.modelos || []).map((m) => h('label', { class: `cartao-modelo${r.modelo === m.id ? ' marcado' : ''}`, cor: 'var(--foco)' },
          h('input', { type: 'radio', name: 'modelo', checked: r.modelo === m.id, onchange: () => { r.modelo = m.id; redesenharPagina(aba); } }),
          h('span', { class: 'cartao-icone' }, ic({ vazio: 'file', node: 'symbol-namespace', web: 'globe', python: 'symbol-method' }[m.id] || 'file')),
          h('span', { class: 'cartao-texto' }, h('strong', {}, m.nome), h('span', {}, m.descricao))))),
        h('div', { class: 'linha-caixas' }, marca('git', 'Criar repositório git (dá para desfazer o que os agentes fizerem)'), marca('time', 'Criar o time padrão'))),
      h('section', { class: 'grupo' },
        h('h2', {}, 'Depois de criar'),
        h('div', { class: 'grade-papeis' },
          depois('time', 'O time monta o começo', 'Manda a descrição como primeiro pedido para o time.', 'organization'),
          depois('grill', 'Conversar antes', 'Grill-me: a IA te questiona até o escopo ficar claro.', 'flame'),
          depois('nada', 'Só criar', 'Abre o projeto vazio para tu começar.', 'folder'))),
      h('div', { class: 'linha-botoes' }, h('button', { class: 'bt bt-principal', onclick: () => criarNovoProjeto(aba) }, ic('rocket'), 'Criar o projeto'))));
  },
};

async function criarNovoProjeto(aba) {
  const r = aba.rascunho;
  if (!r.nome.trim()) return aviso('Dê um nome para o projeto.', 'info');
  if (r.depois !== 'nada' && !r.descricao.trim()) return aviso('Escreva a descrição: é ela que vai para o time ou para a conversa.', 'info');
  if (r.depois === 'time' && !r.time) r.time = true;
  let criado;
  try {
    criado = await api('projeto:criar', { pai: r.pai, nome: r.nome.trim(), modelo: r.modelo, descricao: r.descricao, git: r.git, time: r.time });
  } catch {
    return;
  }
  fecharAba(aba.id, true);
  await abrirProjeto(criado.caminho);
  aviso(`Projeto ${r.nome} criado${criado.git ? ' com git' : ''}.`, 'ok');
  if (r.depois === 'time') {
    novoPedido();
    const c = $('#pedido');
    if (c) {
      c.value = `Monte o começo deste projeto.\n\n${r.descricao.trim()}`;
      enviarPedido();
    }
  } else if (r.depois === 'grill') {
    await iniciarConversa('grill-me');
    const c = $('#conversa-campo');
    if (c) {
      c.value = `Quero começar este projeto e fechar o escopo antes:\n\n${r.descricao.trim()}`;
      enviarConversa();
    }
  }
}

/* ---------- Descobrir ---------- */

const COMUNIDADE = [
  {
    grupo: 'Skills para instalar no Claude Code', categoria: 'skill', itens: [
      ['Superpowers', 'Pacote grande de fluxos de trabalho para devs experientes: refatoração, análise de arquitetura e geração de código.'],
      ['Taste-Skill', 'Dá bom gosto de design para a IA e evita interfaces genéricas. Tu já tem uma parecida (design-taste-frontend).'],
      ['ECC (Frontend, E2E, Security, Backend, TDD)', 'Padrões de React/Next, Playwright, segurança OWASP, APIs e TDD, do everything-claude-code.'],
      ['Trail of Bits Skills', 'Segurança: código seguro, checklists de auditoria e modelagem de ameaças.'],
      ['DevOps Skills', 'Pipelines de CI/CD, Docker, Kubernetes e Terraform.'],
      ['Marketing Skills', 'Copy, SEO, conversão e precificação.'],
    ],
  },
  {
    grupo: 'Mods (ideias que o Orbion já tem ou pode ter)', categoria: 'mod', itens: [
      ['Claude Flightdeck', 'Painel ao vivo dos agentes. No Orbion: a aba Voo.'],
      ['Burn Meter e cctop', 'Medidores de gasto e de cota. No Orbion: os medidores do Voo e da barra de status.'],
      ['Secret Redactor', 'Esconde chaves e senhas antes de irem para o modelo. Boa ideia para os agentes do Orbion.'],
      ['Launch Codes', 'Pede confirmação antes de comandos destrutivos. Boa ideia para os agentes que rodam comandos.'],
      ['GitHub CI Status e PR Tracker', 'Status de CI e de pull requests ao lado da conversa.'],
    ],
  },
  {
    grupo: 'Servidores MCP, agentes e hooks', categoria: 'mcp', itens: [
      ['Servidores MCP', 'Conectam a IA a outros sistemas (banco, Jira, navegador...). Ficam no Claude Code e o Orbion não usa nos agentes, para isolar cada um.'],
      ['Agentes e hooks', 'Subagentes prontos e automações que rodam antes ou depois das ferramentas do Claude Code.'],
    ],
  },
];

function abrirDescobrir() {
  abrirAba({ id: 'descobrir', tipo: 'descobrir', titulo: 'Descobrir' });
}

PAGINAS.descobrir = {
  icone: () => ic('compass'),
  desenhar(aba, host) {
    if (!S.skills) api('skills:listar', S.projeto?.caminho || null).then((s) => { S.skills = s; redesenharPagina(aba); });
    const minhas = (S.skills || []).filter((s) => s.origem === 'orbion');
    const tuas = (S.skills || []).filter((s) => ['projeto', 'orbion-usuario'].includes(s.origem));
    const cartaoSkill = (s) => h('div', { class: 'cartao-modelo', cor: 'var(--foco)' },
      h('span', { class: 'cartao-icone' }, ic(s.nome === 'grill-me' ? 'flame' : 'sparkle')),
      h('span', { class: 'cartao-texto' },
        h('strong', {}, s.nome),
        h('span', {}, s.descricao),
        h('span', { class: 'msg-acoes' },
          h('button', { class: 'bt-mini', onclick: () => iniciarConversa(s.nome) }, ic('comment-discussion'), 'Conversar com ela'),
          h('button', { class: 'bt-mini', onclick: async () => { const x = await api('skill:ler', s.nome, S.projeto?.caminho || null); abrirTextoSomenteLeitura(`skill:${s.nome}`, `Skill: ${s.nome}`, `# ${s.nome}\n\n> ${x.descricao}\n\n${x.corpo}`); } }, ic('eye'), 'Ver'))),
      h('span', {}));
    host.append(h('div', { class: 'pagina' },
      h('h1', {}, ic('compass'), 'Descobrir'),
      h('p', { class: 'mudo' }, 'Skills que já vêm no Orbion.ai, as tuas, e ideias da comunidade para ir além.'),
      h('section', { class: 'grupo' },
        h('h2', {}, `Já vêm no Orbion (${minhas.length})`),
        h('p', { class: 'campo-dica' }, 'Use numa conversa (aba Conversa → modo), em qualquer agente (editor do agente → Skills) ou com /grill no pedido.'),
        h('div', { class: 'grade-modelos' }, minhas.map(cartaoSkill))),
      h('section', { class: 'grupo' },
        h('h2', {}, `As tuas (${tuas.length})`),
        tuas.length ? h('div', { class: 'grade-modelos' }, tuas.map(cartaoSkill)) : h('p', { class: 'mudo' }, 'Nenhuma ainda.'),
        h('div', { class: 'linha-botoes esquerda' }, h('button', { class: 'bt bt-principal', onclick: () => abrirNovaSkill() }, ic('add'), 'Criar skill'))),
      h('section', { class: 'grupo' },
        h('h2', {}, 'Da comunidade (claudemod.com)'),
        h('p', { class: 'campo-dica' }, 'O claudemod.com é um diretório com 170+ mods, skills, servidores MCP e plugins para o Claude Code. Skills instaladas no Claude Code aparecem no Orbion sozinhas.'),
        COMUNIDADE.map((g) => h('div', { class: 'bloco-comunidade' },
          h('div', { class: 'melhoria-topo' }, h('strong', {}, g.grupo), h('span', { class: 'espaco' }),
            h('button', { class: 'bt-mini', onclick: () => api('abrir:link', `https://www.claudemod.com/browse?category=${g.categoria}`) }, ic('link-external'), 'Ver no claudemod.com')),
          h('ul', { class: 'lista-comunidade' }, g.itens.map(([n, d]) => h('li', {}, h('strong', {}, n), ` · ${d}`))))))));
  },
};
