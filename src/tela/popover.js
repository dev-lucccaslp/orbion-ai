// Menu que abre colado num elemento (como o seletor de modelo do Cursor), com uma
// segunda coluna ao lado para os itens que têm filhos (o time → os agentes dele).
// Item: { rotulo, detalhe?, icone?, cor?, marcado?, acao?, filhos?: Item[] }

let pop = null;

function abrirPopover(ancora, itens) {
  fecharPopover();
  pop = { ancora, colunas: [], foco: 0 };
  abrirColuna(0, itens, null);
  document.addEventListener('mousedown', foraDoPopover, true);
  document.addEventListener('keydown', teclaNoPopover, true);
  window.addEventListener('resize', fecharPopover);
}

function fecharPopover() {
  if (!pop) return;
  for (const c of pop.colunas) c.el.remove();
  pop = null;
  document.removeEventListener('mousedown', foraDoPopover, true);
  document.removeEventListener('keydown', teclaNoPopover, true);
  window.removeEventListener('resize', fecharPopover);
}

function foraDoPopover(e) {
  if (pop && !e.target.closest('.popover') && !pop.ancora.contains(e.target)) fecharPopover();
}

function abrirColuna(nivel, itens, linhaPai) {
  for (const c of pop.colunas.splice(nivel)) c.el.remove();
  const el = h('div', { class: `popover${nivel ? ' popover-filho' : ''}`, role: 'menu' });
  const coluna = { el, itens, sel: Math.max(0, itens.findIndex((i) => i.marcado)) };
  pop.colunas[nivel] = coluna;
  el.replaceChildren(...itens.map((it, i) => {
    if (it === '-') return h('div', { class: 'popover-sep' });
    const linha = h('button', {
      class: `popover-item${it.marcado ? ' marcado' : ''}`,
      cor: it.cor,
      onmouseenter: () => { selecionar(nivel, i); if (it.filhos) abrirColuna(nivel + 1, it.filhos, linha); else for (const c of pop.colunas.splice(nivel + 1)) c.el.remove(); },
      onclick: () => ativar(it),
    },
    it.icone ? ic(it.icone, it.cor ? 'colorido' : '') : h('i', { class: 'bolinha', cor: it.cor }),
    h('span', { class: 'popover-rotulo' }, it.rotulo),
    it.detalhe ? h('span', { class: 'popover-detalhe' }, it.detalhe) : null,
    it.marcado ? ic('check', 'popover-check') : null,
    it.filhos ? ic('chevron-right', 'popover-seta') : null);
    return linha;
  }));
  document.body.append(el);
  posicionar(nivel, linhaPai);
  selecionar(nivel, coluna.sel);
}

/** A primeira coluna abre acima (ou abaixo) do elemento; as seguintes ao lado, virando se não couber. */
function posicionar(nivel, linhaPai) {
  const el = pop.colunas[nivel].el;
  const r = el.getBoundingClientRect();
  const margem = 6;
  let x;
  let y;
  if (!nivel) {
    const a = pop.ancora.getBoundingClientRect();
    x = Math.min(a.left, window.innerWidth - r.width - margem);
    y = a.top - r.height - 6 >= margem ? a.top - r.height - 6 : a.bottom + 6;
  } else {
    const pai = pop.colunas[nivel - 1].el.getBoundingClientRect();
    const lp = linhaPai.getBoundingClientRect();
    x = pai.right + 4 + r.width <= window.innerWidth - margem ? pai.right + 4 : pai.left - r.width - 4;
    y = Math.min(lp.top - 5, window.innerHeight - r.height - margem);
  }
  el.style.left = `${Math.max(margem, x)}px`;
  el.style.top = `${Math.max(margem, y)}px`;
}

function selecionar(nivel, i) {
  const c = pop?.colunas[nivel];
  if (!c) return;
  c.sel = i;
  pop.foco = nivel;
  c.el.querySelectorAll('.popover-item').forEach((b, j) => b.classList.toggle('ativo', c.itens.filter((x) => x !== '-')[j] === c.itens[i]));
}

function ativar(it) {
  if (!it.acao) return;
  fecharPopover();
  it.acao();
}

function teclaNoPopover(e) {
  if (!pop) return;
  const c = pop.colunas[pop.foco];
  const validos = c.itens.map((x, i) => (x === '-' ? -1 : i)).filter((i) => i >= 0);
  const pos = validos.indexOf(c.sel);
  const parar = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'Escape') { parar(); fecharPopover(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    parar();
    const novo = validos[(pos + (e.key === 'ArrowDown' ? 1 : -1) + validos.length) % validos.length];
    selecionar(pop.foco, novo);
    const it = c.itens[novo];
    const linha = c.el.querySelectorAll('.popover-item')[validos.indexOf(novo)];
    if (it.filhos) abrirColuna(pop.foco + 1, it.filhos, linha);
    else for (const x of pop.colunas.splice(pop.foco + 1)) x.el.remove();
    pop.foco = pop.colunas.indexOf(c);
  } else if (e.key === 'ArrowRight' && c.itens[c.sel]?.filhos) {
    parar();
    const linha = c.el.querySelectorAll('.popover-item')[validos.indexOf(c.sel)];
    if (!pop.colunas[pop.foco + 1]) abrirColuna(pop.foco + 1, c.itens[c.sel].filhos, linha);
    selecionar(pop.foco + 1, pop.colunas[pop.foco + 1].sel);
  } else if (e.key === 'ArrowLeft' && pop.foco > 0) {
    parar();
    for (const x of pop.colunas.splice(pop.foco)) x.el.remove();
    pop.foco -= 1;
  } else if (e.key === 'Enter') {
    parar();
    ativar(c.itens[c.sel]);
  }
}
