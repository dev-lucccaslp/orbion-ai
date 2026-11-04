// Skills: as instruções que ensinam um jeito de trabalhar aos agentes e à Conversa (um passo a passo, um
// checklist, as regras do time). Vista própria na barra lateral, agrupada por origem, e uma página para
// cada skill, com o texto, de onde ela vem, quem usa e o que dá para fazer com ela.

const ORIGENS_SKILL = [
  { id: 'projeto', nome: 'Deste projeto', icone: 'folder', cor: '#4c9aff' },
  { id: 'orbion-usuario', nome: 'Tuas', icone: 'account', cor: '#a78bfa' },
  { id: 'orbion', nome: 'Do Orbion', icone: 'sparkle', cor: '#4c6bff' },
  { id: 'claude', nome: 'Do Claude Code', icone: 'hubot', cor: '#d97757' },
  { id: 'codex', nome: 'Do Codex', icone: 'terminal', cor: '#10a37f' },
  { id: 'agents', nome: 'De .agents', icone: 'organization', cor: '#94a3b8' },
  { id: 'plugin', nome: 'De plugins', icone: 'extensions', cor: '#f59e0b' },
];
const origemDaSkill = (x) => ORIGENS_SKILL.find((o) => o.id === x.origem) || { id: x.origem, nome: x.origem, icone: 'sparkle', cor: '#94a3b8' };
const SKV = { campo: null, termo: '' };

function carregarSkills(forcar = false) {
  if (S.skills && !forcar) return;
  api('skills:listar', S.projeto?.caminho || null).then((x) => { S.skills = x; desenharLateralSeSkills(); redesenharPaginaDeSkill(); }).catch(() => {});
}
const desenharLateralSeSkills = () => { if (S.vista === 'skills' && !$('#lateral').hidden) desenharLateral(); };
function redesenharPaginaDeSkill() {
  const a = abaAtiva();
  if (a?.tipo === 'skill') redesenharPagina(a);
}

function abrirSkill(nome) {
  const id = `skill-pagina:${nome}`;
  if (S.abas.some((a) => a.id === id)) return ativarAba(id);
  abrirAba({ id, tipo: 'skill', titulo: nome, nome });
}

const iconeDaSkill = (x, grande = false) => {
  const o = origemDaSkill(x);
  return h('span', { class: `skill-icone${grande ? ' grande' : ''}`, cor: o.cor }, ic(x.nome === 'grill-me' ? 'flame' : o.icone));
};

VISTAS.skills = {
  titulo: 'Skills',
  acoes: () => [
    ['add', 'Nova skill', () => abrirNovaSkill()],
    ['compass', 'Descobrir skills e mods', abrirDescobrir],
    ['refresh', 'Procurar de novo', () => { S.skills = null; carregarSkills(true); desenharLateral(); }],
  ],
  desenhar() {
    carregarSkills();
    if (!SKV.campo) {
      SKV.campo = h('input', { type: 'search', placeholder: 'Buscar skills' });
      SKV.campo.addEventListener('input', () => { SKV.termo = SKV.campo.value.trim(); desenharLateral(); });
    }
    const aberta = abaAtiva()?.tipo === 'skill' ? abaAtiva().nome : null;
    const lista = (S.skills || []).filter((x) => !SKV.termo || nota(`${x.nome} ${x.descricao}`, SKV.termo) >= 0);
    const linha = (x) => h('div', { class: `item-skill-linha${aberta === x.nome ? ' selecionado' : ''}`, title: x.descricao, onclick: () => abrirSkill(x.nome) },
      iconeDaSkill(x),
      h('div', { class: 'sk-textos' },
        h('span', { class: 'sk-nome' }, x.nome),
        h('span', { class: 'sk-desc' }, x.descricao || 'Sem descrição.')));
    return [
      h('div', { class: 'loja-topo' }, h('label', { class: 'busca-com-icone' }, ic('search'), SKV.campo)),
      SKV.termo ? null : h('div', { class: 'skills-entrada' },
        h('p', {}, 'Uma skill ensina um jeito de trabalhar: um passo a passo, um checklist, as regras do time. Os agentes seguem a skill quando ela entra no editor deles, e a Conversa usa como modo.'),
        h('div', { class: 'skills-entrada-acoes' },
          h('button', { class: 'bt bt-principal', onclick: () => abrirNovaSkill() }, ic('add'), 'Nova skill'),
          h('button', { class: 'bt', onclick: abrirDescobrir }, ic('compass'), 'Descobrir'))),
      !S.skills ? h('p', { class: 'lateral-texto' }, ic('loading', 'codicon-modifier-spin'), ' Procurando skills…') : null,
      S.skills && !lista.length ? h('p', { class: 'lateral-texto' }, SKV.termo ? 'Nenhuma skill com esse nome.' : 'Nenhuma skill ainda.') : null,
      ...ORIGENS_SKILL.map((o) => {
        const daqui = lista.filter((x) => x.origem === o.id).sort((a, b) => a.nome.localeCompare(b.nome));
        return daqui.length ? secao(`skills-${o.id}`, o.nome, daqui.map(linha), { contador: daqui.length }) : null;
      }),
      ...(() => {
        const outras = lista.filter((x) => !ORIGENS_SKILL.some((o) => o.id === x.origem));
        return outras.length ? [secao('skills-outras', 'Outras', outras.map(linha), { contador: outras.length })] : [];
      })(),
    ];
  },
};

/* ---------- a página de uma skill ---------- */

const relDoProjeto = (arquivo) => {
  if (!S.projeto) return null;
  const raiz = S.projeto.caminho.replace(/\\/g, '/').toLowerCase();
  const a = String(arquivo).replace(/\\/g, '/');
  return a.toLowerCase().startsWith(`${raiz}/`) ? a.slice(raiz.length + 1) : null;
};

PAGINAS.skill = {
  icone: () => ic('sparkle'),
  desenhar(aba, host) {
    if (!aba.dados && !aba.carregando && !aba.erro) {
      aba.carregando = true;
      chamar('skill:ler', aba.nome, S.projeto?.caminho || null)
        .then((d) => { if (d) aba.dados = d; else aba.erro = 'Esta skill não existe mais.'; })
        .catch(() => { aba.erro = 'Não consegui ler esta skill.'; })
        .finally(() => { aba.carregando = false; if (S.ativa === aba.id) redesenharPagina(aba); });
    }
    const d = aba.dados;
    const base = d || (S.skills || []).find((x) => x.nome === aba.nome) || { nome: aba.nome, origem: '', descricao: '' };
    const o = origemDaSkill(base);
    // Quem usa: os agentes dos times deste projeto que têm a skill no editor.
    const usam = (S.projeto?.times || []).flatMap((t) => t.agentes.filter((a) => (a.skills || []).includes(aba.nome)).map((a) => ({ a, t })));
    const rel = d ? relDoProjeto(d.arquivo) : null;
    const abrirArquivoDaSkill = () => (rel ? abrirArquivo(rel) : abrirTextoSomenteLeitura(`skill:${aba.nome}`, `SKILL.md · ${aba.nome}`, d ? `# ${d.nome}\n\n> ${d.descricao}\n\n${d.corpo}` : ''));
    host.append(h('div', { class: 'pagina pagina-skill' },
      h('div', { class: 'ext-topo' },
        iconeDaSkill(base, true),
        h('div', { class: 'ext-cabeca' },
          h('h1', { class: 'skill-titulo' }, aba.nome),
          h('div', { class: 'ext-meta' }, h('span', { class: 'skill-origem', cor: o.cor }, ic(o.icone), o.nome)),
          h('p', { class: 'ext-desc' }, base.descricao || 'Sem descrição.'),
          h('div', { class: 'ext-acoes' },
            h('button', { class: 'bt bt-principal', onclick: () => iniciarConversa(aba.nome) }, ic('comment-discussion'), 'Conversar neste modo'),
            d ? h('button', { class: 'bt', onclick: abrirArquivoDaSkill }, ic('go-to-file'), rel ? 'Editar o SKILL.md' : 'Ver o SKILL.md') : null,
            d ? h('button', { class: 'bt', onclick: () => abrirNovaSkill({ nome: `${aba.nome}-meu`, descricao: d.descricao, instrucoes: d.corpo }) }, ic('copy'), 'Fazer uma versão minha') : null))),
      h('div', { class: 'ext-corpo' },
        h('div', { class: 'ext-leiame skill-corpo' },
          aba.erro ? h('p', { class: 'erro-texto' }, aba.erro)
            : !d ? h('p', { class: 'mudo' }, ic('loading', 'codicon-modifier-spin'), ' Carregando…')
              : d.corpo ? markdown(d.corpo) : h('p', { class: 'mudo' }, 'Esta skill não tem instruções.')),
        h('aside', { class: 'ext-lado' },
          h('h4', {}, 'De onde vem'),
          h('div', { class: 'ext-dado' }, h('span', {}, o.nome)),
          d ? h('div', { class: 'ext-dado' }, h('span', { class: 'mudo' }, 'Arquivo'), h('span', { class: 'mono pequeno skill-caminho', title: d.arquivo }, rel || d.arquivo)) : null,
          h('h4', {}, 'Quem usa'),
          usam.length
            ? h('div', { class: 'ext-chips' }, usam.map(({ a, t }) => h('button', { class: 'skill-agente', cor: a.cor, title: `${a.nome} · ${t.nome}`, onclick: () => abrirAgente(t.id, a.id) }, h('i', { class: 'bolinha', cor: a.cor }), a.nome)))
            : h('p', { class: 'mudo pequeno' }, 'Nenhum agente deste projeto. Para usar, marque a skill no editor do agente.'),
          h('h4', {}, 'Como usar'),
          h('p', { class: 'mudo pequeno' }, 'Na Conversa, escolha a skill como modo. Num agente, marque a skill no editor dele: ele lê e segue antes de começar cada tarefa.')))));
  },
};
