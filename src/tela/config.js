// Configurações (aparência, motores, fluxo do projeto, prompts) e a vista de temas e extensões.

function abrirConfig() {
  abrirAba({ id: 'config', tipo: 'config', titulo: 'Configurações' });
}

PAGINAS.config = {
  icone: () => ic('settings-gear'),
  desenhar(aba, host) {
    const g = S.config;
    const p = S.projeto?.config;
    const salvarGeral = debounce(async (parcial) => {
      S.config = { ...S.config, ...(await api('config:salvar', parcial)) };
      aplicarOpcoesEditor();
      aviso('Configurações salvas.', 'ok');
    }, 500);
    const salvarProjeto = debounce(async (parcial) => {
      S.projeto.config = await api('projeto:config:salvar', S.projeto.caminho, parcial);
      aviso('Configurações do projeto salvas.', 'ok');
    }, 500);

    const texto = (valor, aoMudar, props = {}) => {
      const el = h('input', { ...props, valor });
      el.addEventListener('input', () => aoMudar(props.type === 'number' ? Number(el.value) : el.value));
      return el;
    };
    const marca = (valor, aoMudar, rotulo) => {
      const el = h('input', { type: 'checkbox', checked: !!valor });
      el.addEventListener('change', () => aoMudar(el.checked));
      return h('label', { class: 'caixa' }, el, h('span', {}, rotulo));
    };
    const selecao = (valor, opcoes, aoMudar) => {
      const el = h('select', {}, opcoes);
      el.value = valor;
      el.addEventListener('change', () => aoMudar(el.value));
      return el;
    };
    const grupoTemas = (lista) => {
      const porExt = new Map();
      for (const t of lista) porExt.set(t.extensao, [...(porExt.get(t.extensao) || []), t]);
      return [...porExt].map(([ext, itens]) => h('optgroup', { label: ext }, itens.map((t) => h('option', { value: t.id }, t.nome))));
    };

    const prompts = h('div', { class: 'lista-prompts' }, h('p', { class: 'mudo' }, 'Carregando…'));
    if (S.projeto) {
      api('prompts:listar', S.projeto.caminho).then((lista) => {
        prompts.replaceChildren(...lista.map((m) => h('div', { class: 'linha-prompt' },
          ic('file-code'),
          h('span', { class: 'mono' }, m.nome),
          h('span', { class: 'mudo' }, m.padrao ? (m.personalizado ? 'padrão, editado neste projeto' : 'padrão') : 'criado neste projeto'),
          h('span', { class: 'espaco' }),
          h('button', { class: 'bt', onclick: () => editarModeloPrompt(m.nome) }, ic('edit'), 'Editar'),
          m.padrao && m.personalizado ? h('button', {
            class: 'bt', onclick: async () => {
              if (!confirm(`Voltar ${m.nome} para o texto padrão do Orbion.ai?`)) return;
              await api('prompts:restaurar', S.projeto.caminho, m.nome);
              aviso(`${m.nome} voltou ao padrão.`, 'ok');
            },
          }, ic('discard'), 'Restaurar padrão') : null)));
      });
    }

    host.append(h('div', { class: 'pagina pagina-config' },
      h('h1', {}, ic('settings-gear'), 'Configurações'),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Aparência'),
        h('div', { class: 'grade-campos' },
          campo('Idioma', 'Language · Idioma. O Orbion recarrega no idioma novo, e os agentes passam a responder nele.', selecao(g.idioma || IDIOMA, Object.entries(IDIOMAS).map(([id, nome]) => h('option', { value: id, translate: 'no' }, nome)), mudarIdioma)),
          campo('Tema de cores', 'Inclui os temas das extensões do VS Code instaladas.', selecao(g.tema, grupoTemas(S.temas.cores), trocarTema)),
          campo('Tema de ícones', 'Ícones de pastas e arquivos (Material Icon Theme e outros).', selecao(g.temaIcones, grupoTemas(S.temas.icones), trocarIcones)),
          campo('Fonte do editor', null, texto(g.fonte, (v) => salvarGeral({ fonte: v }), { class: 'mono' })),
          campo('Tamanho da fonte', null, texto(g.tamanhoFonte, (v) => salvarGeral({ tamanhoFonte: v }), { type: 'number', min: 9, max: 32 })))),

      h('section', { class: 'grupo' },
        h('h2', {}, 'Motores'),
        h('p', { class: 'campo-dica' }, 'O Orbion.ai chama estes programas, que já estão logados no teu PC. Não precisa de chave de API.'),
        h('div', { class: 'grade-campos' },
          campo('Comando do Claude Code', null, texto(g.comandos.claude, (v) => salvarGeral({ comandos: { claude: v || 'claude' } }), { class: 'mono' })),
          campo('Comando do Codex', null, texto(g.comandos.codex, (v) => salvarGeral({ comandos: { codex: v || 'codex' } }), { class: 'mono' })))),

      S.projeto ? h('section', { class: 'grupo' },
        h('h2', {}, `Fluxo deste projeto · ${S.projeto.nome}`),
        h('p', { class: 'campo-dica' }, 'Fica em .orbion/config.json, dentro do projeto.'),
        h('div', { class: 'linha-caixas' },
          marca(p.aprovarPlano, (v) => salvarProjeto({ aprovarPlano: v }), 'Pedir minha aprovação antes de o time começar'),
          marca(p.paralelo, (v) => salvarProjeto({ paralelo: v }), 'Tarefas independentes rodam ao mesmo tempo (quem edita sempre espera a vez)'),
          marca(p.memoria, (v) => salvarProjeto({ memoria: v }), 'Memória do projeto: os agentes anotam o que aprendem e leem nos próximos pedidos'),
          marca(p.mapearFluxos !== false, (v) => salvarProjeto({ mapearFluxos: v }), 'Mapear os fluxos sozinho: na primeira vez que o projeto abre, uma IA lê o projeto e desenha os fluxos dele')),
        h('div', { class: 'grade-campos' },
          campo('Voltas de correção', 'Quantas vezes um verificador pode devolver o trabalho.', texto(p.maxVoltas, (v) => salvarProjeto({ maxVoltas: v }), { type: 'number', min: 0, max: 10 })),
          campo('Máximo de tarefas por plano', null, texto(p.maxTarefas, (v) => salvarProjeto({ maxTarefas: v }), { type: 'number', min: 1, max: 20 })),
          campo('Tempo máximo por tarefa (min)', 'Vazio ou 0: sem limite, o agente trabalha até terminar. Cada agente pode ter o seu.', texto(p.tempoMaxMin || '', (v) => salvarProjeto({ tempoMaxMin: v || 0 }), { type: 'number', min: 0, max: 600, placeholder: 'sem limite' })),
          campo('Pedidos anteriores no contexto', 'Quantos o Receptor vê para ter contexto.', texto(p.pedidosAnteriores, (v) => salvarProjeto({ pedidosAnteriores: v }), { type: 'number', min: 0, max: 10 })))) : null,

      S.projeto ? h('section', { class: 'grupo' },
        h('h2', {}, 'Prompts deste projeto'),
        h('p', { class: 'campo-dica' }, 'Os modelos de texto que os agentes recebem. Editar cria uma cópia em .orbion/prompts que vale só para este projeto. Cada agente pode escolher um modelo próprio no editor dele.'),
        prompts) : null,

      h('section', { class: 'grupo' },
        h('h2', {}, 'Atalhos'),
        h('dl', { class: 'atalhos' }, [
          ['Ctrl+I', 'Novo pedido ao time'], ['Ctrl+Shift+V', 'Voo: o que as IAs estão fazendo'], ['Ctrl+´', 'Mostrar ou esconder o terminal'],
          ['Ctrl+Shift+´', 'Novo terminal'], ['Ctrl+P', 'Buscar arquivo'], ['Ctrl+Shift+P', 'Comandos'], ['Ctrl+S', 'Salvar'], ['Ctrl+W', 'Fechar aba'],
          ['Ctrl+Tab', 'Próxima aba'], ['Ctrl+B', 'Barra lateral'], ['Ctrl+J', 'Painel de baixo'], ['Ctrl+Alt+B', 'Painel direito'],
          ['Ctrl+Shift+E / T / G / X', 'Explorador / Times / Mudanças / Extensões'], ['Enter / Ctrl+Enter', 'Enviar a mensagem / quebrar a linha (nos chats)'], ['Ctrl+= / Ctrl+-', 'Tamanho da fonte'], ['Ctrl+,', 'Configurações'],
        ].map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)])))));
  },
};

/* ---------- extensões: as instaladas e a loja do Open VSX ---------- */

const LOJA = { campo: null, termo: '', resultados: null, buscando: false, instalando: new Set(), erro: null };

const buscarNaLoja = debounce(async () => {
  LOJA.buscando = true;
  LOJA.erro = null;
  if (S.vista === 'extensoes') desenharLateral();
  try {
    LOJA.resultados = await chamar('loja:buscar', LOJA.termo);
  } catch (e) {
    LOJA.erro = 'Não consegui falar com o Open VSX. Confira a internet.';
    LOJA.resultados = [];
  }
  LOJA.buscando = false;
  if (S.vista === 'extensoes') desenharLateral();
}, 350);

async function instalarDaLoja(x) {
  LOJA.instalando.add(x.id);
  desenharLateral();
  try {
    const r = await api('loja:instalar', x.namespace, x.nome);
    S.temas = r.temas;
    aviso(r.jaTinha ? `${x.titulo} já estava instalada.` : `${x.titulo} instalada: ${r.temas.cores.length} temas de cores e ${r.temas.icones.length} de ícones disponíveis.`, 'ok');
  } catch {}
  LOJA.instalando.delete(x.id);
  desenharLateral();
}

const ordemSkill = (x) => ['projeto', 'orbion-usuario', 'orbion'].indexOf(x.origem) + 1 || 9;
const ORIGEM_SKILL = { orbion: 'Orbion', 'orbion-usuario': 'tua', projeto: 'projeto', claude: 'Claude Code', codex: 'Codex', agents: '.agents', plugin: 'plugin' };

VISTAS.extensoes = {
  titulo: 'Extensões',
  acoes: () => [
    ['refresh', 'Procurar de novo nas pastas', async () => { S.temas = await api('temas:listar'); S.skills = null; desenharLateral(); }],
    ['folder-opened', 'Abrir a pasta de extensões do Orbion', () => api('extensoes:abrirPasta')],
  ],
  desenhar() {
    if (!S.skills) api('skills:listar', S.projeto?.caminho || null).then((x) => { S.skills = x; if (S.vista === 'extensoes') desenharLateral(); });
    if (!LOJA.campo) {
      LOJA.campo = h('input', { type: 'search', class: 'busca-loja', placeholder: 'Buscar temas no Open VSX (ex.: dracula, one dark, material)' });
      LOJA.campo.addEventListener('input', () => { LOJA.termo = LOJA.campo.value.trim(); buscarNaLoja(); });
      buscarNaLoja();
    }
    const instaladas = new Set([...S.temas.cores, ...S.temas.icones].map((t) => t.id.split('#')[0]));
    const linha = (t, ativo, aoClicar) => h('div', {
      class: `item-arvore item-tema${ativo ? ' selecionado' : ''}`, title: `${t.nome}\n${t.extensao}`, onclick: aoClicar,
    },
    ic(ativo ? 'pass-filled' : 'circle-large-outline'),
    h('span', { class: 'item-nome' }, t.nome),
    h('span', { class: 'item-dica' }, t.extensao));
    const resultado = (x) => {
      const tem = instaladas.has(x.id);
      const ocupado = LOJA.instalando.has(x.id);
      return h('div', { class: 'item-loja', title: x.descricao },
        x.icone ? h('img', { class: 'loja-icone', src: x.icone, alt: '' }) : h('span', { class: 'loja-icone' }, ic('extensions')),
        h('div', { class: 'loja-texto' },
          h('div', { class: 'loja-linha' }, h('strong', {}, x.titulo), h('span', { class: 'item-dica' }, `${(x.downloads / 1000).toFixed(x.downloads >= 10000 ? 0 : 1)} mil`)),
          h('div', { class: 'loja-desc' }, x.descricao),
          h('div', { class: 'loja-linha' }, h('span', { class: 'item-dica' }, x.namespace),
            tem ? h('span', { class: 'tag-instalada' }, ic('check'), 'Instalada')
              : h('button', { class: 'bt-mini bt-instalar', disabled: ocupado, onclick: () => instalarDaLoja(x) }, ocupado ? ic('loading', 'codicon-modifier-spin') : null, ocupado ? 'Instalando…' : 'Instalar'))));
    };
    return [
      h('div', { class: 'loja-topo' }, LOJA.campo),
      secao('loja', LOJA.termo ? 'Open VSX: resultados' : 'Open VSX: temas mais baixados', [
        LOJA.erro ? h('p', { class: 'lateral-texto' }, LOJA.erro) : null,
        LOJA.buscando && !LOJA.resultados?.length ? h('p', { class: 'lateral-texto' }, ic('loading', 'codicon-modifier-spin'), ' Buscando…') : null,
        ...(LOJA.resultados || []).map(resultado),
        LOJA.resultados && !LOJA.resultados.length && !LOJA.erro ? h('p', { class: 'lateral-texto' }, 'Nada encontrado.') : null,
        h('p', { class: 'lateral-texto pequeno' }, 'O Open VSX é o registro aberto que o VSCodium e o Cursor usam. O Marketplace da Microsoft só pode ser usado pelos produtos dela. Por enquanto o Orbion.ai usa das extensões só os temas de cores e de ícones.'),
      ], { cresce: true }),
      secao('skills', 'Skills', [
        !S.skills ? h('p', { class: 'lateral-texto' }, ic('loading', 'codicon-modifier-spin'), ' Procurando…') : null,
        ...[...(S.skills || [])].sort((a, b) => ordemSkill(a) - ordemSkill(b) || a.nome.localeCompare(b.nome)).map((x) => h('div', {
          class: 'item-arvore item-skill', title: `${x.nome}
${x.descricao}
${x.arquivo}`,
          onclick: async () => { const l = await api('skill:ler', x.nome, S.projeto?.caminho || null); abrirTextoSomenteLeitura(`skill:${x.nome}`, `Skill: ${x.nome}`, `# ${x.nome}

> ${l.descricao}

${l.corpo}`); },
        }, ic(x.nome === 'grill-me' ? 'flame' : 'sparkle'), h('span', { class: 'item-nome' }, x.nome), h('span', { class: 'item-dica' }, ORIGEM_SKILL[x.origem] || x.origem))),
        h('div', { class: 'lateral-texto' }, h('button', { class: 'bt-mini', onclick: () => abrirNovaSkill() }, ic('add'), 'Nova skill'), ' ', h('button', { class: 'bt-mini', onclick: abrirDescobrir }, ic('compass'), 'Descobrir')),
      ], { contador: S.skills?.length }),
      secao('cores', 'Temas de cores instalados', S.temas.cores.map((t) => linha(t, t.id === S.config.tema, () => trocarTema(t.id))), { contador: S.temas.cores.length }),
      secao('icones', 'Temas de ícones instalados', S.temas.icones.map((t) => linha(t, t.id === S.config.temaIcones, () => trocarIcones(t.id))), { contador: S.temas.icones.length }),
      secao('pastas', 'De onde vêm', h('div', { class: 'lateral-texto' },
        h('p', {}, 'Além do que tu instala aqui, o Orbion.ai lê as extensões de tema do VS Code e do Cursor deste PC.'),
        S.temas.pastas.map((p) => h('p', { class: 'mono pequeno' }, p)))),
    ];
  },
};
