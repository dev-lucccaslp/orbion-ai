// Contas e modelos: as assinaturas conectadas (Claude Code e Codex) e os modelos por
// token (OpenCode grátis, OpenRouter, Gemini, Grok, Groq, Ollama...).

async function carregarProvedores() {
  const r = await api('provedores:listar');
  S.provedores = r.lista;
  S.tokensSeguros = r.segura;
  const m = await api('modelos:listar');
  S.modelos = m.listas;
  S.infoModelos = m.info;
}

function abrirContas() {
  abrirAba({ id: 'contas', tipo: 'contas', titulo: 'Contas e modelos' });
}

const CT = { situacao: null, presets: null, editando: null, testando: null };

PAGINAS.contas = {
  icone: () => ic('account'),
  desenhar(aba, host) {
    if (!CT.situacao) api('contas:situacao').then((s) => { CT.situacao = s; redesenharPagina(aba); });
    if (!CT.presets) api('provedores:presets').then((p) => { CT.presets = p; redesenharPagina(aba); });

    const cli = (c) => h('div', { class: 'cartao-conta' },
      h('span', { class: `conta-icone${c.logado ? ' ok' : ''}` }, ic({ claude: 'hubot', codex: 'robot', github: 'github' }[c.id] || 'account')),
      h('div', { class: 'conta-texto' },
        h('strong', {}, c.nome, c.versao ? h('span', { class: 'mudo pequeno' }, ` ${c.versao}`) : null),
        h('span', { class: c.logado ? 'conta-ok' : 'mudo' }, !c.instalado ? (c.id === 'github' ? 'GitHub CLI não instalado' : 'Não instalado') : c.logado ? `Conectado · ${c.conta}` : 'Instalado, mas sem login'),
        c.git ? h('span', { class: 'mudo pequeno' }, `Os commits saem como ${c.git}`) : null),
      h('div', { class: 'conta-acoes' },
        !c.instalado
          ? h('button', { class: 'bt', onclick: async () => { const cmd = (await api('contas:instalar'))[c.id]; rodarNoTerminal(cmd); } }, ic('cloud-download'), 'Instalar')
          : c.logado
            ? h('button', { class: 'bt', onclick: () => rodarNoTerminal(c.sair, c.terminalNovo) }, ic('sign-out'), 'Sair')
            : h('button', { class: 'bt bt-principal', onclick: () => rodarNoTerminal(c.entrar, c.terminalNovo) }, ic('sign-in'), 'Conectar'),
        h('button', { class: 'bt-icone', title: 'Ver de novo', onclick: () => { CT.situacao = null; redesenharPagina(aba); } }, ic('refresh'))));

    const provedor = (p) => {
      const testando = CT.testando === p.id;
      return h('div', { class: 'cartao-conta' },
        h('span', { class: `conta-icone${p.temChave || p.semChave ? ' ok' : ''}` }, ic(p.semChave ? 'vm' : 'key')),
        h('div', { class: 'conta-texto' },
          h('strong', {}, p.nome),
          h('span', { class: 'mudo pequeno mono' }, p.base),
          h('span', { class: 'mudo pequeno' }, [p.semChave ? 'Sem token (local)' : p.temChave ? 'Token guardado' : 'Sem token', p.modelos?.length ? `${p.modelos.length} modelos` : 'modelos ainda não buscados', p.modelo ? `padrão: ${p.modelo}` : null].filter(Boolean).join(' · '))),
        h('div', { class: 'conta-acoes' },
          h('button', { class: 'bt', disabled: testando, onclick: () => testarProvedor(aba, p.id) }, testando ? ic('loading', 'codicon-modifier-spin') : ic('plug'), testando ? 'Testando…' : 'Testar'),
          h('button', { class: 'bt-icone', title: 'Editar', onclick: () => { CT.editando = { ...p, chave: '' }; redesenharPagina(aba); } }, ic('edit')),
          h('button', { class: 'bt-icone perigo', title: 'Remover', onclick: async () => { if (!confirm(`Remover ${p.nome}? Os agentes que usam ele vão parar de funcionar.`)) return; S.provedores = await api('provedores:remover', p.id); await carregarProvedores(); redesenharPagina(aba); } }, ic('trash'))));
    };

    const a = S.config.assistente || { motor: 'claude', modelo: '' };
    const opcoesMotor = [['claude', 'Claude Code'], ...(S.provedores || []).map((p) => [`api:${p.id}`, `${p.nome} (API)`])];
    const motorAssist = h('select', {}, opcoesMotor.map(([v, r]) => h('option', { value: v, selected: a.motor === v }, r)));
    const salvarAssist = async (motor, modelo) => {
      S.config = { ...S.config, ...(await api('config:salvar', { assistente: { motor, modelo } })) };
      aviso('Salvo.', 'ok');
      redesenharPagina(aba);
    };
    motorAssist.addEventListener('change', () => salvarAssist(motorAssist.value, ''));
    const modeloAssist = seletorModelo(a.motor, a.modelo || '', (m) => salvarAssist(a.motor, m));

    host.append(h('div', { class: 'pagina' },
      h('h1', {}, ic('account'), 'Contas e modelos'),
      h('p', { class: 'mudo' }, 'O Orbion.ai usa as tuas assinaturas pelo Claude Code e pelo Codex já logados neste PC, e qualquer modelo por token: inclusive modelos grátis (OpenCode, OpenRouter :free, Gemini, Groq) e modelos que rodam no teu PC (Ollama, LM Studio). Cada agente escolhe o seu motor no editor dele.'),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Assinaturas (CLIs)'),
        CT.situacao ? CT.situacao.filter((c) => c.id !== 'github').map(cli) : h('p', { class: 'mudo' }, ic('loading', 'codicon-modifier-spin'), ' Vendo quem está conectado…'),
        h('p', { class: 'campo-dica' }, 'Conectar e Sair abrem o login no terminal aqui embaixo. Termine por lá e depois clique em atualizar.')),

      h('section', { class: 'grupo' },
        h('h2', {}, 'GitHub'),
        CT.situacao ? CT.situacao.filter((c) => c.id === 'github').map(cli) : h('p', { class: 'mudo' }, ic('loading', 'codicon-modifier-spin'), ' Vendo a conta do GitHub…'),
        h('p', { class: 'campo-dica' }, 'O Orbion usa o GitHub CLI (gh). O Conectar mostra um código no terminal e abre o GitHub no navegador para tu confirmar.')),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Modelos por token (API)'),
        S.tokensSeguros === false ? h('p', { class: 'faixa-info' }, ic('warning'), 'A criptografia do sistema não está disponível: os tokens ficam só embaralhados no disco.') : null,
        (S.provedores || []).length ? S.provedores.map(provedor) : h('p', { class: 'mudo' }, 'Nenhum provedor cadastrado ainda.'),
        CT.editando ? formularioProvedor(aba) : h('div', {},
          h('h3', { class: 'subtitulo' }, 'Adicionar'),
          h('div', { class: 'grade-presets' }, [...(CT.presets || []), { id: 'personalizado', nome: 'Outro (compatível com OpenAI)', base: '', gratis: 'Qualquer serviço que fale o formato da API da OpenAI.' }]
            .map((pr) => h('button', { class: 'cartao-preset', onclick: () => { CT.editando = { preset: pr.id, id: idProvedorLivre(pr.id), nome: pr.nome.replace(/ \(.*\)$/, ''), base: pr.base, semChave: pr.semChave, site: pr.site, modelo: pr.modelo || '', novo: true, chave: '' }; redesenharPagina(aba); } },
              h('strong', {}, pr.nome), pr.gratis ? h('span', { class: 'tag-gratis' }, ic('gift'), pr.gratis) : h('span', { class: 'mudo pequeno' }, pr.base)))))),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Quem responde as conversas, as melhorias e as skills'),
        h('div', { class: 'grade-campos' }, campo('Motor', null, motorAssist), campo('Modelo', null, modeloAssist)))));
  },
};

function idProvedorLivre(base) {
  let id = base;
  for (let i = 2; (S.provedores || []).some((p) => p.id === id); i++) id = `${base}-${i}`;
  return id;
}

function formularioProvedor(aba) {
  const e = CT.editando;
  const nome = h('input', { valor: e.nome || '' });
  const base = h('input', { valor: e.base || '', class: 'mono', placeholder: 'https://…/v1' });
  const chave = h('input', { type: 'password', valor: '', placeholder: e.semChave ? 'não precisa' : e.temChave ? 'já guardado (deixe vazio para manter)' : 'cole o token aqui', autocomplete: 'off' });
  const modelo = h('input', { valor: e.modelo || '', list: 'modelos-provedor', placeholder: 'escolha depois de testar' });
  const lista = h('datalist', { id: 'modelos-provedor' }, (e.modelos || []).map((m) => h('option', { value: m })));
  const semChave = h('input', { type: 'checkbox', checked: !!e.semChave });
  const salvar = async (testar) => {
    try {
      S.provedores = await api('provedores:salvar', { id: e.id, preset: e.preset, nome: nome.value.trim(), base: base.value.trim(), chave: chave.value, modelo: modelo.value.trim(), semChave: semChave.checked });
    } catch {
      return;
    }
    CT.editando = null;
    await carregarProvedores();
    redesenharPagina(aba);
    if (testar) testarProvedor(aba, e.id);
  };
  return h('div', { class: 'form-provedor' },
    h('h3', { class: 'subtitulo' }, e.novo ? `Adicionar ${e.nome}` : `Editar ${e.nome}`),
    h('div', { class: 'grade-campos' },
      campo('Nome', null, nome),
      campo('Endereço da API', 'Base no formato da OpenAI (termina em /v1, normalmente).', base),
      campo('Token', e.site ? h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); api('abrir:link', e.site); } }, 'Pegar o token no site') : null, chave),
      campo('Modelo padrão', null, modelo)),
    lista,
    h('label', { class: 'caixa' }, semChave, h('span', {}, 'Este provedor não usa token (roda no meu PC)')),
    h('p', { class: 'campo-dica' }, 'O token fica criptografado pelo Windows e só abre neste usuário. Ele nunca aparece na tela de novo.'),
    h('div', { class: 'linha-botoes esquerda' },
      h('button', { class: 'bt', onclick: () => { CT.editando = null; redesenharPagina(aba); } }, 'Cancelar'),
      h('button', { class: 'bt', onclick: () => salvar(false) }, ic('save'), 'Salvar'),
      h('button', { class: 'bt bt-principal', onclick: () => salvar(true) }, ic('plug'), 'Salvar e testar')));
}

async function testarProvedor(aba, id) {
  CT.testando = id;
  redesenharPagina(aba);
  try {
    const modelos = await api('provedores:modelos', id);
    const gratis = modelos.filter((m) => /(:free|-free)$/.test(m)).length;
    aviso(`Funcionou: ${modelos.length} modelos${gratis ? `, ${gratis} grátis` : ''}.`, 'ok');
  } catch {}
  CT.testando = null;
  await carregarProvedores();
  redesenharPagina(aba);
}
