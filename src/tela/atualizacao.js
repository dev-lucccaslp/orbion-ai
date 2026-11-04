// Atualizações: quando sai uma versão nova no GitHub, uma notificação oferece (e as Configurações também).
// Nada acontece sozinho. Se a pessoa aceitar, o Orbion baixa, instala, reinicia e mostra o que mudou.

const ATU = { versaoAtual: null, info: null, verificando: false, verificadoEm: null, erro: '', baixando: null, fase: '', arquivo: '', dispensada: new Set() };
const SEIS_HORAS = 6 * 60 * 60 * 1000;

function compararVersoes(a, b) {
  const pa = String(a || '').replace(/^v/, '').split('-')[0].split('.').map((n) => Number(n) || 0);
  const pb = String(b || '').replace(/^v/, '').split('-')[0].split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  return 0;
}

async function iniciarAtualizacoes() {
  try { ATU.versaoAtual = await chamar('app:versao'); } catch {}
  await mostrarNovidadesSeAtualizou();
  if (S.config.avisarAtualizacoes === false) return;
  setTimeout(() => verificarAtualizacao(false), 6000);
  setInterval(() => { if (S.config.avisarAtualizacoes !== false) verificarAtualizacao(false); }, SEIS_HORAS);
}

/** Pergunta ao GitHub. Sem ser pedido (manual = false), só aparece algo se houver versão nova. */
async function verificarAtualizacao(manual = false) {
  if (ATU.verificando) return;
  ATU.verificando = true;
  ATU.erro = '';
  redesenharAtualizacao();
  try {
    ATU.info = await chamar('atualizacao:verificar');
    ATU.verificadoEm = Date.now();
    if (ATU.info.nova) {
      if (manual || !ATU.dispensada.has(ATU.info.versao)) mostrarOfertaDeAtualizacao();
    } else if (manual) {
      aviso(`Tu já está na versão mais nova (${ATU.info.atual || ATU.versaoAtual}).`, 'ok');
    }
  } catch (e) {
    ATU.erro = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    if (manual) aviso(`Não consegui procurar atualizações: ${ATU.erro}`);
  }
  ATU.verificando = false;
  redesenharAtualizacao();
}

function redesenharAtualizacao() {
  desenharStatus();
  desenharOfertaDeAtualizacao();
  const secao = document.getElementById('secao-atualizacoes');
  if (secao) secao.replaceWith(secaoDeAtualizacoes());
}

/* ---------- a notificação que oferece ---------- */

function mostrarOfertaDeAtualizacao() {
  ATU.ofertaAberta = true;
  desenharOfertaDeAtualizacao();
}

function fecharOfertaDeAtualizacao() {
  if (ATU.info?.versao) ATU.dispensada.add(ATU.info.versao);
  ATU.ofertaAberta = false;
  desenharOfertaDeAtualizacao();
  desenharStatus();
}

/** As primeiras linhas das notas, para a notificação. */
function resumoDasNotas(notas, max = 3) {
  return String(notas || '').split('\n').map((l) => l.trim())
    .filter((l) => /^(###|-|\*)\s/.test(l))
    .map((l) => l.replace(/^(###|-|\*)\s+/, '').replace(/\*\*/g, ''))
    .slice(0, max);
}

function desenharOfertaDeAtualizacao() {
  document.getElementById('oferta-atualizacao')?.remove();
  const info = ATU.info;
  if (!ATU.ofertaAberta || !info?.nova) return;
  const baixando = ATU.baixando;
  const pct = baixando?.total ? Math.round((baixando.recebido / baixando.total) * 100) : null;
  const corpo = [];
  if (ATU.fase === 'reiniciando') {
    corpo.push(h('p', {}, ic('loading', 'codicon-modifier-spin'), ' Instalando. O Orbion vai fechar e abrir de novo na versão nova.'));
  } else if (ATU.fase === 'manual') {
    corpo.push(h('p', {}, 'Abri o instalador. Termine por lá: no Mac, arraste o Orbion.ai para Aplicativos e abra de novo.'));
  } else if (ATU.fase === 'dev') {
    corpo.push(h('p', {}, 'Rodando pelo código: o instalador foi baixado, mas não instalo por cima. Ele está em:'), h('p', { class: 'mono pequeno' }, ATU.arquivo));
  } else if (baixando) {
    corpo.push(
      h('p', {}, pct == null ? 'Baixando a versão nova…' : `Baixando a versão nova… ${pct}%`),
      h('div', { class: 'atu-barra' }, h('i', { style: `width:${pct ?? 30}%` })),
      h('div', { class: 'atu-acoes' }, h('span', { class: 'espaco' }), h('button', { class: 'bt', onclick: () => chamar('atualizacao:cancelar').catch(() => {}) }, 'Cancelar')));
  } else {
    const resumo = resumoDasNotas(info.notas);
    corpo.push(
      h('p', {}, `A versão ${info.versao} já saiu. Tu está na ${info.atual || ATU.versaoAtual}.`),
      resumo.length ? h('ul', { class: 'atu-resumo' }, resumo.map((l) => h('li', {}, l))) : null,
      !info.arquivo ? h('p', { class: 'mudo pequeno' }, 'Esta versão não tem instalador para o teu sistema; dá para baixar pela página dela.') : null,
      h('div', { class: 'atu-acoes' },
        h('button', { class: 'bt-texto atu-depois', onclick: fecharOfertaDeAtualizacao }, 'Agora não'),
        h('span', { class: 'espaco' }),
        h('button', { class: 'bt', onclick: () => mostrarNovidades({ versao: info.versao, titulo: info.titulo, notas: info.notas, pagina: info.pagina }, true) }, 'O que mudou'),
        info.arquivo
          ? h('button', { class: 'bt bt-principal', onclick: atualizarAgora }, ic('arrow-circle-up'), 'Atualizar')
          : h('button', { class: 'bt bt-principal', onclick: () => api('abrir:link', info.pagina) }, ic('link-external'), 'Abrir a página')));
  }
  document.body.append(h('div', { class: 'oferta-atualizacao', id: 'oferta-atualizacao', role: 'dialog' },
    h('div', { class: 'atu-topo' },
      h('span', { class: 'atu-marca' }, $('#marca-grande').content.firstElementChild.cloneNode(true)),
      h('div', { class: 'atu-titulo' }, h('strong', {}, 'Atualização disponível'), h('span', { class: 'mudo pequeno' }, `Orbion.ai ${info.versao}`)),
      baixando || ATU.fase ? null : h('button', { class: 'bt-icone', title: 'Agora não', onclick: fecharOfertaDeAtualizacao }, ic('close'))),
    ...corpo));
}

async function atualizarAgora() {
  const info = ATU.info;
  if (!info?.arquivo) return;
  if (vivosDoProjeto().length && !confirm('Tem pedido do time rodando agora. Atualizar fecha o Orbion e para esse trabalho. Atualizar mesmo assim?')) return;
  ATU.ofertaAberta = true;
  ATU.baixando = { recebido: 0, total: info.arquivo.tamanho || 0 };
  ATU.fase = '';
  redesenharAtualizacao();
  try {
    const r = await api('atualizacao:instalar', info);
    ATU.fase = r.modo;
    ATU.arquivo = r.arquivo;
  } catch {
    ATU.fase = '';
  }
  ATU.baixando = null;
  redesenharAtualizacao();
}

function eventoAtualizacao(ev) {
  if (ev.fase === 'baixando') ATU.baixando = { recebido: ev.recebido, total: ev.total };
  else { ATU.fase = ev.fase; ATU.arquivo = ev.arquivo || ''; ATU.baixando = null; }
  redesenharAtualizacao();
}

/** Na barra de status, enquanto houver versão nova: um clique traz a oferta de volta. */
function itemDeAtualizacaoNaBarra() {
  if (!ATU.info?.nova) return null;
  return h('button', { class: 'status-item status-atualizacao', title: 'Ver a atualização', onclick: mostrarOfertaDeAtualizacao },
    ic('arrow-circle-up'), `Versão ${ATU.info.versao}`);
}

/* ---------- nas Configurações ---------- */

function secaoDeAtualizacoes() {
  const info = ATU.info;
  const quando = ATU.verificadoEm ? new Date(ATU.verificadoEm).toLocaleTimeString(localeAtual(), { hour: '2-digit', minute: '2-digit' }) : '';
  const avisar = h('input', { type: 'checkbox', checked: S.config.avisarAtualizacoes !== false });
  avisar.addEventListener('change', async () => { S.config = await api('config:salvar', { avisarAtualizacoes: avisar.checked }); });
  let situacao;
  if (ATU.verificando) situacao = h('p', { class: 'mudo' }, ic('loading', 'codicon-modifier-spin'), ' Procurando…');
  else if (ATU.erro) situacao = h('p', { class: 'erro-texto' }, ATU.erro);
  else if (info?.nova) {
    situacao = h('div', { class: 'atu-cartao' },
      h('div', { class: 'atu-cartao-topo' },
        h('div', {}, h('strong', {}, `Versão ${info.versao} disponível`), h('div', { class: 'mudo pequeno' }, info.publicadaEm ? `Publicada em ${new Date(info.publicadaEm).toLocaleDateString(localeAtual(), { day: '2-digit', month: 'short', year: 'numeric' })}` : '')),
        h('span', { class: 'espaco' }),
        h('button', { class: 'bt', onclick: () => api('abrir:link', info.pagina) }, ic('link-external'), 'No GitHub'),
        info.arquivo ? h('button', { class: 'bt bt-principal', disabled: !!ATU.baixando, onclick: atualizarAgora }, ic('arrow-circle-up'), ATU.baixando ? 'Baixando…' : 'Atualizar') : null),
      info.notas ? h('div', { class: 'atu-notas' }, markdown(info.notas)) : null);
  } else if (info) situacao = h('p', { class: 'mudo' }, ic('check'), ` Tu está na versão mais nova${quando ? ` (procurado às ${quando})` : ''}.`);
  else situacao = h('p', { class: 'mudo' }, 'Ainda não procurei nesta sessão.');
  return h('section', { class: 'grupo', id: 'secao-atualizacoes' },
    h('h2', {}, 'Atualizações'),
    h('div', { class: 'atu-linha' },
      h('span', {}, 'Versão instalada: ', h('strong', {}, ATU.versaoAtual || '—')),
      h('span', { class: 'espaco' }),
      h('button', { class: 'bt', disabled: ATU.verificando, onclick: () => verificarAtualizacao(true) }, ic('refresh'), 'Procurar agora'),
      h('button', { class: 'bt', onclick: () => mostrarNovidades() }, ic('history'), 'O que mudou nesta versão')),
    situacao,
    h('label', { class: 'caixa' }, avisar, 'Avisar quando sair uma versão nova (o Orbion nunca atualiza sozinho)'));
}

/* ---------- depois de atualizar: o que mudou ---------- */

async function mostrarNovidadesSeAtualizou() {
  const atual = ATU.versaoAtual;
  if (!atual) return;
  const vista = S.config.ultimaVersaoVista;
  if (vista && compararVersoes(atual, vista) > 0) {
    const guardadas = S.config.notasPendentes?.versao === atual ? S.config.notasPendentes : null;
    const dados = guardadas || await chamar('atualizacao:notas', atual).catch(() => null);
    setTimeout(() => mostrarNovidades(dados || { versao: atual, notas: '' }, false, true), 900);
  }
  if (vista !== atual || S.config.notasPendentes) {
    S.config = await api('config:salvar', { ultimaVersaoVista: atual, notasPendentes: null }).catch(() => S.config);
  }
}

/** A janela com o que mudou: depois de atualizar, pelo menu Ajuda, ou antes de atualizar ("O que mudou"). */
async function mostrarNovidades(dados = null, antes = false, acabouDeAtualizar = false) {
  if (!dados) {
    const versao = ATU.versaoAtual || await chamar('app:versao').catch(() => '');
    dados = await chamar('atualizacao:notas', versao).catch(() => null) || { versao, notas: '' };
  }
  document.getElementById('novidades')?.remove();
  const fechar = () => { document.getElementById('novidades')?.remove(); document.removeEventListener('keydown', tecla, true); };
  const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } };
  document.addEventListener('keydown', tecla, true);
  const titulo = acabouDeAtualizar ? `O Orbion foi atualizado para a versão ${dados.versao}` : antes ? `O que muda na versão ${dados.versao}` : `O que mudou na versão ${dados.versao}`;
  document.body.append(h('div', { class: 'novidades-camada', id: 'novidades', onmousedown: (e) => { if (e.target.id === 'novidades') fechar(); } },
    h('div', { class: 'novidades-cartao', role: 'dialog' },
      h('div', { class: 'novidades-topo' },
        h('span', { class: 'atu-marca grande' }, $('#marca-grande').content.firstElementChild.cloneNode(true)),
        h('div', {}, h('span', { class: 'tema-atual-rotulo' }, acabouDeAtualizar ? 'Novidades' : 'Notas da versão'), h('h2', {}, titulo))),
      h('div', { class: 'novidades-corpo' }, dados.notas ? markdown(dados.notas) : h('p', { class: 'mudo' }, 'Esta versão não tem notas.')),
      h('div', { class: 'atu-acoes' },
        dados.pagina ? h('button', { class: 'bt-texto', onclick: () => api('abrir:link', dados.pagina) }, 'Ver no GitHub') : null,
        h('span', { class: 'espaco' }),
        antes && ATU.info?.arquivo && !ATU.baixando ? h('button', { class: 'bt', onclick: () => { fechar(); atualizarAgora(); } }, ic('arrow-circle-up'), 'Atualizar') : null,
        h('button', { class: 'bt bt-principal', onclick: fechar }, acabouDeAtualizar ? 'Começar a usar' : 'Fechar')))));
}
