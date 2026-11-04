// O tour do Orbion: na primeira vez que o app abre, destaca cada parte da janela com uma explicação curta.
// Tem Pular em todos os passos (e Esc), Voltar e Próximo (setas e Enter). Rever: Ajuda → Tour do Orbion.

const PASSOS_DO_TOUR = [
  {
    titulo: 'Bem-vindo ao Orbion.ai',
    texto: 'Um editor de código onde times de IAs trabalham juntos no teu projeto. Em um minuto tu vê onde fica cada coisa.',
  },
  {
    alvo: '#atividades',
    titulo: 'Tudo do projeto',
    texto: 'Daqui tu troca entre os arquivos (Explorador), os Times, as Mudanças do git, os Fluxos e as Extensões.',
    antes: () => { if ($('#lateral').hidden) alternarLateral(); },
  },
  {
    alvo: '.area',
    titulo: 'O código',
    texto: 'O editor é o mesmo do VS Code: abas, busca de arquivos (Ctrl+P), comandos (Ctrl+Shift+P) e o terminal embaixo (Ctrl+´).',
  },
  {
    alvo: () => $('.chat-compositor') || $('#direita'),
    titulo: 'A Orquestra',
    texto: 'Aqui tu conversa com o time. Escreva o que quer: o Receptor entende, monta o plano e chama quem precisa. Tu aprova antes de começar.',
    antes: () => abrirDireita('orquestra'),
  },
  {
    alvo: () => ($('#chip-time') && $('#chip-validar') ? $('#chip-time').parentElement : null),
    titulo: 'Quem faz e como',
    texto: 'Escolha o time, ou fale direto com um agente com @nome. Só validar: o time só lê e confere, sem mudar nada.',
  },
  {
    alvo: '#atividades [data-vista="times"]',
    titulo: 'Times e agentes',
    texto: 'Monte quantos times quiser. Cada agente tem papel, permissões e o modelo de IA dele, que já vem do que tu tem neste PC.',
  },
  {
    alvo: '#atividades [data-vista="fluxos"]',
    titulo: 'Fluxos ao vivo',
    texto: 'Cada funcionalidade vira um fluxo de blocos (tela → rota → banco). Enquanto o time trabalha, o bloco de cada agente acende; depois, um clique no bloco pede mudança só nele.',
  },
  {
    alvo: '.direita-aba[data-direita="voo"]',
    titulo: 'O Voo',
    texto: 'O que cada IA está fazendo agora, quem está escrevendo no projeto e quantos tokens já foram.',
  },
  {
    alvo: '#bt-contas',
    titulo: 'Contas e modelos',
    texto: 'Conecte o Claude Code e o Codex que tu já usa, ou modelos por API, inclusive os grátis e os que rodam no teu PC.',
  },
  {
    alvo: '#bt-config',
    titulo: 'Configurações',
    texto: 'Idioma, tema, fonte e como o time trabalha neste projeto: aprovação do plano, memória e limites.',
  },
  {
    titulo: 'Pronto!',
    texto: 'Para rever este tour, vá em Ajuda → Tour do Orbion. Bom trabalho!',
    fim: true,
  },
];

const TOUR = { passo: 0, camada: null, foco: null, cartao: null, aoMudarTamanho: null };

/** Começa o tour (do primeiro passo). */
function iniciarTour() {
  fecharTour(false);
  fecharMenus?.();
  fecharPopover?.();
  TOUR.camada = h('div', { class: 'tour-camada', onmousedown: (e) => e.preventDefault() });
  TOUR.foco = h('div', { class: 'tour-foco' });
  TOUR.cartao = h('div', { class: 'tour-cartao', role: 'dialog', 'aria-live': 'polite' });
  document.body.append(TOUR.camada, TOUR.foco, TOUR.cartao);
  TOUR.aoMudarTamanho = debounce(() => mostrarPassoDoTour(TOUR.passo), 120);
  window.addEventListener('resize', TOUR.aoMudarTamanho);
  document.addEventListener('keydown', teclaNoTour, true);
  mostrarPassoDoTour(0);
}

/** Fecha o tour. Ao pular ou terminar, ele não abre mais sozinho. */
function fecharTour(marcarVisto = true) {
  if (!TOUR.camada) return;
  for (const el of [TOUR.camada, TOUR.foco, TOUR.cartao]) el?.remove();
  TOUR.camada = TOUR.foco = TOUR.cartao = null;
  window.removeEventListener('resize', TOUR.aoMudarTamanho);
  document.removeEventListener('keydown', teclaNoTour, true);
  if (marcarVisto && !S.config.tutorialVisto) {
    S.config.tutorialVisto = true;
    api('config:salvar', { tutorialVisto: true }).then((c) => { S.config = c; }).catch(() => {});
  }
}

function teclaNoTour(e) {
  if (!TOUR.camada) return;
  const pegar = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'Escape') { pegar(); fecharTour(); } else if (e.key === 'ArrowRight' || e.key === 'Enter') { pegar(); avancarTour(1); } else if (e.key === 'ArrowLeft') { pegar(); avancarTour(-1); }
}

/** Anda no tour, pulando os passos cujo alvo não existe agora (sem projeto aberto, por exemplo). */
function avancarTour(direcao) {
  let i = TOUR.passo + direcao;
  while (i > 0 && i < PASSOS_DO_TOUR.length - 1 && !alvoDoPasso(PASSOS_DO_TOUR[i], true)) i += direcao;
  if (i < 0) return;
  if (i >= PASSOS_DO_TOUR.length) return fecharTour();
  mostrarPassoDoTour(i);
}

function alvoDoPasso(passo, testar = false) {
  if (!passo.alvo) return null;
  if (testar) try { passo.antes?.(); } catch {}
  const el = typeof passo.alvo === 'function' ? passo.alvo() : $(passo.alvo);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

function mostrarPassoDoTour(i) {
  if (!TOUR.cartao) return;
  TOUR.passo = i;
  const passo = PASSOS_DO_TOUR[i];
  try { passo.antes?.(); } catch {}
  const alvo = alvoDoPasso(passo);
  const total = PASSOS_DO_TOUR.length;
  const primeiro = i === 0;
  const ultimo = i === total - 1;

  TOUR.cartao.replaceChildren(
    h('div', { class: 'tour-topo' },
      primeiro || ultimo ? h('div', { class: 'tour-marca' }, $('#marca-grande').content.firstElementChild.cloneNode(true)) : null,
      h('span', { class: 'tour-contagem' }, `${i + 1} de ${total}`)),
    h('h3', {}, passo.titulo),
    h('p', {}, passo.texto),
    h('div', { class: 'tour-pontos' }, PASSOS_DO_TOUR.map((_, k) => h('i', { class: k === i ? 'atual' : k < i ? 'visto' : '' }))),
    h('div', { class: 'tour-acoes' },
      ultimo ? null : h('button', { class: 'bt-texto tour-pular', onclick: () => fecharTour() }, 'Pular tour'),
      h('span', { class: 'espaco' }),
      i > 0 && !ultimo ? h('button', { class: 'bt', onclick: () => avancarTour(-1) }, 'Voltar') : null,
      h('button', { class: 'bt bt-principal', onclick: () => (ultimo ? fecharTour() : avancarTour(1)) },
        ultimo ? 'Começar a usar' : primeiro ? 'Começar o tour' : 'Próximo',
        ultimo ? null : ic('arrow-right'))));
  TOUR.cartao.classList.toggle('central', !alvo);
  TOUR.foco.classList.toggle('sem-alvo', !alvo);

  if (!alvo) {
    TOUR.cartao.style.left = TOUR.cartao.style.top = '';
    TOUR.foco.style.cssText = '';
    requestAnimationFrame(() => TOUR.cartao?.querySelector('.bt-principal')?.focus());
    return;
  }
  // O destaque contorna o alvo; a parte de fora escurece.
  const r = alvo.getBoundingClientRect();
  const folga = 6;
  Object.assign(TOUR.foco.style, {
    left: `${r.left - folga}px`, top: `${r.top - folga}px`, width: `${r.width + folga * 2}px`, height: `${r.height + folga * 2}px`,
  });
  // O cartão vai do lado que tiver espaço: direita, esquerda, embaixo ou em cima.
  requestAnimationFrame(() => {
    if (!TOUR.cartao) return;
    const c = TOUR.cartao.getBoundingClientRect();
    const W = innerWidth;
    const H = innerHeight;
    const gap = 16;
    let x;
    let y;
    if (r.right + gap + c.width < W - 12) { x = r.right + gap; y = r.top + r.height / 2 - c.height / 2; } else if (r.left - gap - c.width > 12) { x = r.left - gap - c.width; y = r.top + r.height / 2 - c.height / 2; } else if (r.bottom + gap + c.height < H - 12) { x = r.left + r.width / 2 - c.width / 2; y = r.bottom + gap; } else { x = r.left + r.width / 2 - c.width / 2; y = r.top - gap - c.height; }
    TOUR.cartao.style.left = `${Math.max(12, Math.min(W - c.width - 12, x))}px`;
    TOUR.cartao.style.top = `${Math.max(12, Math.min(H - c.height - 12, y))}px`;
    TOUR.cartao.querySelector('.bt-principal')?.focus();
  });
}

/** Na primeira vez que o Orbion abre, o tour começa sozinho. */
function tourDaPrimeiraVez() {
  if (S.config.tutorialVisto) return;
  setTimeout(() => { if (!TOUR.camada) iniciarTour(); }, 700);
}
