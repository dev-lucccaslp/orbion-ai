// Roda um pedido sem abrir o app, direto no terminal:
//   node src/cli.js <pasta-do-projeto> "o que tu quer" [--time <id>] [--auto]
// Com --auto, aprova o plano sozinho e não para para perguntas.

const path = require('node:path');
const readline = require('node:readline/promises');
const { Execucao } = require('./motor/orquestrador');
const times = require('./motor/times');

const args = process.argv.slice(2);
const auto = args.includes('--auto');
const iTime = args.indexOf('--time');
const timePedido = iTime >= 0 ? args[iTime + 1] : null;
const [pasta, pedido] = args.filter((a, i) => a !== '--auto' && i !== iTime && i !== iTime + 1);
if (!pasta || !pedido) {
  console.log('Uso: node src/cli.js <pasta-do-projeto> "pedido" [--time <id>] [--auto]');
  process.exit(1);
}
const projeto = path.resolve(pasta);
let lista = times.listar(projeto);
if (!lista.length) {
  times.criar(projeto, { nome: 'Time principal', origem: 'padrao' });
  lista = times.listar(projeto);
  console.log(`Criei o time padrão em ${path.join(projeto, '.orbion', 'times')}`);
}
const time = timePedido || lista[0].id;
if (!lista.some((t) => t.id === time)) {
  console.log(`Não achei o time "${time}". Times deste projeto: ${lista.map((t) => t.id).join(', ')}`);
  process.exit(1);
}

const cor = (hex, texto) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? `\x1b[38;2;${parseInt(m[1], 16)};${parseInt(m[2], 16)};${parseInt(m[3], 16)}m${texto}\x1b[0m` : texto;
};

const tela = readline.createInterface({ input: process.stdin, output: process.stdout });

async function perguntar(p) {
  console.log(`\n=== ${p.titulo}\n${p.texto}`);
  if (p.tipo === 'aprovar_plano') {
    for (const t of execucao.estado.tarefas) console.log(`  ${t.id} [${t.agente}] ${t.titulo}${t.depende_de.length ? ` (depois de ${t.depende_de.join(', ')})` : ''}`);
    if (auto) return { acao: 'aprovar' };
    const r = await tela.question('Aprovar? (s/n) ');
    return { acao: /^s/i.test(r) ? 'aprovar' : 'cancelar' };
  }
  if (p.tipo === 'pergunta') {
    if (auto) return { acao: 'responder', texto: 'Decida você pelo caminho mais simples e registre como premissa.' };
    const r = await tela.question('Tua resposta (vazio para parar): ');
    return r.trim() ? { acao: 'responder', texto: r } : { acao: 'cancelar' };
  }
  if (auto) return { acao: 'parar' };
  const r = await tela.question('Orientação para tentar de novo (vazio para parar): ');
  return r.trim() ? { acao: 'tentar', texto: r } : { acao: 'parar' };
}

const execucao = new Execucao({ projeto, time, pedido, perguntar });
execucao.on('evento', (ev) => {
  if (ev.tipo === 'log') {
    const l = ev.linha;
    const prefixo = cor(l.cor, `[${l.nome}]`);
    const texto = l.tipo === 'texto' ? l.texto.replace(/\n/g, '\n    ') : l.texto;
    console.log(`${prefixo} ${l.tipo === 'aviso' ? '! ' : ''}${texto}`);
  } else if (ev.tipo === 'uso' && ev.motor === 'claude') {
    const j = ev.info?.unifiedWindows;
    if (j) console.log(`  (uso do Claude: 5h ${Math.round(j.five_hour.utilization * 100)}%, semana ${Math.round(j.seven_day.utilization * 100)}%)`);
  }
});
process.on('SIGINT', () => execucao.cancelar());

execucao.rodar().then((estado) => {
  console.log(`\nFim: ${estado.status}${estado.erro ? ` (${estado.erro})` : ''}`);
  if (estado.entendimento) console.log(`Entendimento: ${estado.entendimento}`);
  for (const t of estado.tarefas) console.log(`  ${t.id} [${t.agente}] ${t.status} — ${t.titulo}${t.voltas ? ` (${t.voltas} volta(s))` : ''}`);
  console.log(`Registro: ${execucao.pasta}`);
  tela.close();
});
