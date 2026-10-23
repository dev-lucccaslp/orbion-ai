// A prévia do que os agentes constroem: a tela numa aba ao lado da Orquestra, que recarrega quando os
// arquivos mudam, e o jeito de opinar. Tu escreve o que mudar e pode marcar pontos na tela, e o Orbion
// manda isso com uma foto da prévia para o agente que fez, na mesma conversa.

const PREVIAS_MOSTRADAS = new Set(); // `${pedido}:${tarefa}:${tentativa}` que já abriram sozinhas

const ehEndereco = (alvo) => /^https?:\/\//i.test(alvo);

/** Abre a prévia de um .html do projeto ou de um endereço local (http://localhost:5173). */
function abrirPrevia(alvo, origem = {}) {
  if (!alvo || !S.projeto) return;
  const id = `web:${alvo}`;
  const existente = S.abas.find((a) => a.id === id);
  if (existente) {
    Object.assign(existente.origem, origem);
    if (S.ativa === id) return carregarPrevia(existente);
    return ativarAba(id); // mostrar a aba de novo já recarrega a tela
  }
  abrirAba({
    id, tipo: 'web', alvo, origem: { ...origem }, pontos: [], comentario: '', marcando: false,
    titulo: `Prévia: ${ehEndereco(alvo) ? alvo.replace(/^https?:\/\//i, '') : nomeDe(alvo)}`,
  });
}

function pedirPrevia() {
  if (!S.projeto) return;
  pedirTexto({
    placeholder: 'Arquivo .html do projeto (ex.: public/index.html) ou endereço (http://localhost:5173)',
    valor: 'index.html',
    aoConfirmar: (v) => abrirPrevia(String(v).trim()),
  });
}

async function carregarPrevia(aba) {
  if (!aba.quadro) return;
  try {
    aba.url = await api('previa:endereco', S.projeto.caminho, aba.alvo);
  } catch {
    return;
  }
  // about:blank no meio força recarregar mesmo quando o endereço é o mesmo.
  aba.quadro.src = 'about:blank';
  requestAnimationFrame(() => { if (aba.quadro) aba.quadro.src = aba.url; });
}

/** Quando um arquivo do projeto muda (o agente salvou), a prévia aberta recarrega. */
const recarregarPrevias = debounce(() => {
  const a = abaAtiva();
  if (a?.tipo === 'web' && !ehEndereco(a.alvo)) carregarPrevia(a);
}, 500);

function previasMudaram(rels) {
  if (rels.some((r) => !r.startsWith('.orbion/') && !r.startsWith('.git'))) recarregarPrevias();
}

/** Para quem vai a opinião sobre a prévia de uma tarefa: o agente, se foi ele que mexeu no arquivo dela;
 *  senão (o Designer que só especificou, por exemplo) o Receptor decide quem muda. */
function origemDaPrevia(t, estado) {
  const limpo = (c) => String(c || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/:\d+$/, '').toLowerCase();
  const mexeu = (t.passe?.arquivos || []).some((a) => limpo(a) === limpo(t.passe.previa));
  return { agente: mexeu ? t.agente : '', time: estado.time, fio: estado.fio || estado.id };
}

/** Abre sozinha a prévia de quem acabou de terminar algo que se vê. */
function previaDoEstado(estado) {
  for (const t of estado.tarefas || []) {
    const chave = `${estado.id}:${t.id}:${t.tentativas}`;
    if (t.status !== 'concluida' || !t.passe?.previa || PREVIAS_MOSTRADAS.has(chave)) continue;
    PREVIAS_MOSTRADAS.add(chave);
    abrirPrevia(t.passe.previa, origemDaPrevia(t, estado));
  }
}

/* ---------- opinar: pontos na tela e o comentário ---------- */

function marcarPonto(aba, e) {
  if (!aba.marcando) return;
  const r = aba.camada.getBoundingClientRect();
  aba.pontos.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, texto: '' });
  desenharPontos(aba);
  requestAnimationFrame(() => aba.listaPontos?.querySelector('.previa-ponto-linha:last-child input')?.focus());
}

function desenharPontos(aba) {
  if (!aba.camada) return;
  aba.camada.replaceChildren(...aba.pontos.map((p, i) => h('span', { class: 'previa-ponto', estilo: { left: `${p.x * 100}%`, top: `${p.y * 100}%` } }, String(i + 1))));
  aba.listaPontos.replaceChildren(...aba.pontos.map((p, i) => {
    const campo = h('input', { valor: p.texto, placeholder: `O que mudar no ponto ${i + 1}?` });
    campo.addEventListener('input', () => { p.texto = campo.value; });
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); enviarOpiniao(aba); } });
    return h('div', { class: 'previa-ponto-linha' },
      h('span', { class: 'previa-num' }, String(i + 1)),
      campo,
      h('button', { class: 'bt-icone', title: 'Tirar o ponto', onclick: () => { aba.pontos.splice(i, 1); desenharPontos(aba); } }, ic('close')));
  }));
}

function alternarMarcar(aba, ligar = !aba.marcando) {
  aba.marcando = ligar;
  aba.camada?.classList.toggle('marcando', ligar);
  aba.botaoMarcar?.classList.toggle('ligado', ligar);
}

/** Quem recebe a opinião: o agente que fez a tela (o padrão), outro do time, ou o Receptor decide. */
function opcoesDeDestino(aba) {
  const time = aba.origem.time || S.timeAtual || S.projeto.times[0]?.id;
  const agentes = agentesDe(time).filter((a) => a.ativo && a.papel !== 'receptor');
  const ordem = [...agentes].sort((a, b) => (b.id === aba.origem.agente) - (a.id === aba.origem.agente));
  return { time, opcoes: [...ordem.map((a) => [a.id, a.nome]), ['', 'Receptor decide']] };
}

async function enviarOpiniao(aba) {
  const pontos = aba.pontos.filter((p) => p.texto.trim());
  const comentario = aba.comentario.trim();
  if (!comentario && !pontos.length) {
    aviso('Escreva o que mudar ou marque um ponto na tela.', 'info');
    return aba.campoComentario?.focus();
  }
  const { time } = opcoesDeDestino(aba);
  const agente = aba.destino ?? aba.origem.agente ?? '';
  // A foto sai com os pontos por cima, que é o que o agente precisa ver.
  aba.camada.classList.add('fotografando');
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  let foto;
  try {
    const r = aba.area.getBoundingClientRect();
    foto = await api('previa:capturar', { x: r.left, y: r.top, width: r.width, height: r.height });
  } catch {
    return;
  } finally {
    aba.camada.classList.remove('fotografando');
  }
  const pedido = [
    `Ajustes na tela ${aba.alvo}. A imagem anexada é a prévia como está agora${pontos.length ? '; os números em vermelho marcam os pontos' : ''}.`,
    ...pontos.map((p) => `${aba.pontos.indexOf(p) + 1}. ${p.texto.trim()}`),
    comentario,
  ].filter(Boolean).join('\n');
  let estado;
  try {
    estado = await api('execucao:iniciar', S.projeto.caminho, time, pedido, {
      agente: agente || null, fio: aba.origem.fio || null, somenteLeitura: false,
      anexos: [{ nome: 'previa.png', tipo: 'image/png', dados: foto }],
    });
  } catch {
    return;
  }
  aba.pontos = [];
  aba.comentario = '';
  if (aba.campoComentario) aba.campoComentario.value = '';
  alternarMarcar(aba, false);
  desenharPontos(aba);
  const nome = agentePorId(agente)?.nome || 'o time';
  aviso(`Mandado para ${nome}. A prévia recarrega quando ${agente ? 'ele' : 'o time'} terminar.`, 'ok');
  await seguirPedido(estado);
  abrirDireita('orquestra');
}

PAGINAS.web = {
  icone: () => ic('preview'),
  desenhar(aba, host) {
    aba.quadro = h('iframe', { class: 'previa-quadro', title: 'Prévia', sandbox: 'allow-scripts allow-forms allow-same-origin allow-popups allow-modals', referrerpolicy: 'no-referrer' });
    aba.camada = h('div', { class: `previa-camada${aba.marcando ? ' marcando' : ''}`, onclick: (e) => marcarPonto(aba, e) });
    aba.area = h('div', { class: 'previa-area' }, aba.quadro, aba.camada);
    const endereco = h('input', { class: 'previa-endereco mono', valor: aba.alvo, spellcheck: 'false', title: 'Arquivo do projeto ou endereço local; Enter abre' });
    endereco.addEventListener('keydown', (e) => { if (e.key === 'Enter') { aba.alvo = endereco.value.trim() || aba.alvo; carregarPrevia(aba); } });
    aba.botaoMarcar = h('button', { class: `bt${aba.marcando ? ' ligado' : ''}`, title: 'Clique na tela para marcar o ponto que precisa mudar', onclick: () => alternarMarcar(aba) }, ic('pinned'), 'Marcar pontos');
    aba.listaPontos = h('div', { class: 'previa-pontos' });
    aba.campoComentario = h('textarea', { rows: 2, valor: aba.comentario, placeholder: 'O que precisa mudar? (Enter manda · Ctrl+Enter quebra a linha)' });
    aba.campoComentario.addEventListener('input', () => { aba.comentario = aba.campoComentario.value; });
    aba.campoComentario.addEventListener('keydown', (e) => teclaDeChat(e, () => enviarOpiniao(aba)));
    const { opcoes } = opcoesDeDestino(aba);
    const destino = h('select', { title: 'Quem recebe' }, opcoes.map(([v, r]) => h('option', { value: v, selected: (aba.destino ?? aba.origem.agente ?? '') === v }, r)));
    destino.addEventListener('change', () => { aba.destino = destino.value; });
    host.append(h('div', { class: 'pagina-web' },
      h('div', { class: 'previa-barra' },
        ic('preview'),
        endereco,
        h('button', { class: 'bt-icone', title: 'Recarregar', onclick: () => carregarPrevia(aba) }, ic('refresh')),
        h('button', { class: 'bt-icone', title: 'Abrir no navegador', onclick: () => aba.url && api('previa:abrirFora', aba.url) }, ic('link-external')),
        aba.botaoMarcar),
      aba.area,
      h('div', { class: 'previa-opinar' },
        aba.listaPontos,
        aba.campoComentario,
        h('div', { class: 'previa-acoes' },
          h('span', { class: 'mudo pequeno' }, 'Vai com uma foto da tela'),
          h('span', { class: 'espaco' }),
          h('label', { class: 'previa-destino' }, 'Para', destino),
          h('button', { class: 'bt bt-principal', onclick: () => enviarOpiniao(aba) }, ic('send'), 'Mandar')))));
    desenharPontos(aba);
    carregarPrevia(aba);
  },
  sair(aba) {
    aba.quadro = aba.camada = aba.area = aba.listaPontos = aba.campoComentario = aba.botaoMarcar = null;
  },
};
