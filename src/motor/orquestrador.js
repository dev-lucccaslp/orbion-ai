// Conduz um pedido do começo ao fim: o Receptor do time monta o plano, a pessoa aprova,
// cada agente faz a sua tarefa e passa o bastão, e quem verifica pode devolver
// o trabalho para correção até um limite de voltas.
//
// Como várias IAs trabalham juntas aqui:
// - Quem decide o fluxo é este código, não as IAs: elas só sugerem pelo passe.
// - Leitores em paralelo, um escritor por vez: tarefas de agentes que não editam
//   arquivos rodam juntas; quem edita pega a trava de escrita do projeto, que vale
//   para todos os times e pedidos abertos ao mesmo tempo. Assim não há conflito.
// - Cada agente recebe só o que precisa: a tarefa, os passes dos colegas e a memória do projeto.
// - A pessoa entra nas decisões (plano, perguntas, falhas) e pode intervir num agente no meio do trabalho.

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { rodarAgente } = require('./executor');
const { carregarAgentes } = require('./agentes');
const { acharSkills } = require('./skills');
const { promptReceptor, promptTarefa } = require('./prompts');
const { PLANO, PASSE } = require('./esquemas');
const projetoCfg = require('./projeto');
const { caminhos: anexosCaminhos } = require('./anexos');
const tokens = require('./tokens');
const times = require('./times');

const pastaExecucoes = (projeto) => path.join(projeto, '.orbion', 'execucoes');

const CONFIG_PADRAO = {
  comandos: { claude: 'claude', codex: 'codex' },
};

/** Trava de escrita: um agente que edita arquivos por vez, em fila. */
class Trava {
  constructor() {
    this.dono = null;
    this.fila = [];
  }

  pegar(quem, sinal) {
    if (!this.dono) {
      this.dono = quem;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const item = { quem, resolve };
      this.fila.push(item);
      sinal?.addEventListener('abort', () => {
        this.fila = this.fila.filter((x) => x !== item);
        resolve(false);
      }, { once: true });
    });
  }

  soltar(quem) {
    if (this.dono !== quem) return;
    const proximo = this.fila.shift();
    this.dono = proximo ? proximo.quem : null;
    proximo?.resolve(true);
  }
}

/** Arruma o plano do Receptor: agentes que existem, ids únicos, dependências só para trás. */
function validarPlano(bruto, time, maxTarefas = 20) {
  const porChave = new Map();
  for (const a of time) {
    porChave.set(a.id.toLowerCase(), a);
    porChave.set(a.nome.toLowerCase(), a);
  }
  const novoId = new Map();
  const tarefas = [];
  for (const t of (bruto.tarefas || []).slice(0, maxTarefas)) {
    const agente = porChave.get(String(t.agente || '').toLowerCase());
    if (!agente) continue;
    const id = `t${tarefas.length + 1}`;
    if (t.id) novoId.set(t.id, id);
    tarefas.push({
      id,
      agente: agente.id,
      titulo: t.titulo || 'Tarefa',
      descricao: t.descricao || '',
      criterio_pronto: t.criterio_pronto || '',
      depende_de: (t.depende_de || []).map(String),
    });
  }
  tarefas.forEach((t, i) => {
    const anteriores = new Set(tarefas.slice(0, i).map((x) => x.id));
    t.depende_de = [...new Set(t.depende_de.map((d) => novoId.get(d) || d))].filter((d) => anteriores.has(d));
    Object.assign(t, {
      status: 'pendente', tentativas: 0, voltas: 0, passe: null, erro: null, gastoApi: 0,
      correcao: null, respostaHumana: null, inicio: null, fim: null,
    });
  });
  const tipo = !tarefas.length ? 'pergunta' : ['verificacao', 'mudanca'].includes(bruto.tipo) ? bruto.tipo : 'mudanca';
  return { tipo, entendimento: bruto.entendimento || '', tarefas };
}

class Execucao extends EventEmitter {
  /**
   * @param {object} op
   * @param {string} op.projeto pasta do projeto
   * @param {string} op.time id do time que vai trabalhar
   * @param {string} op.pedido o que a pessoa pediu
   * @param {object} [op.config] comandos dos CLIs (o fluxo vem das configurações do projeto)
   * @param {Trava} [op.trava] trava de escrita do projeto, dividida entre os pedidos abertos
   * @param {(p: object) => Promise<{acao: string, texto?: string}>} op.perguntar
   */
  constructor({ projeto, time, pedido, agente = null, fio = null, somenteLeitura = false, anexos = [], config = {}, trava = new Trava(), perguntar }) {
    super();
    this.projeto = projeto;
    this.time = time;
    this.agenteDireto = agente; // pedido direto para um agente, sem passar pelo Receptor
    this.config = { ...CONFIG_PADRAO, ...projetoCfg.lerConfig(projeto), ...config, comandos: { ...CONFIG_PADRAO.comandos, ...config.comandos } };
    this.trava = trava;
    this.perguntar = perguntar;
    this.controle = new AbortController();
    this.controles = new Map(); // tarefa → AbortController
    this.filaPerguntas = Promise.resolve();
    const id = `${new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')}-${Math.random().toString(36).slice(2, 6)}`;
    this.pasta = path.join(pastaExecucoes(projeto), id);
    const info = times.lerInfo(projeto, time);
    this.estado = {
      id, fio: fio || id, pedido, criadaEm: Date.now(), status: 'planejando', // fio: a conversa de que o pedido faz parte
      time, timeNome: info.nome || time, timeCor: info.cor || '#bd93f9', direto: agente,
      // tipo: pergunta | verificacao (ninguém altera nada) | mudanca. "Só validar" força verificação.
      tipo: somenteLeitura ? 'verificacao' : null, somenteLeitura,
      anexos, // imagens da pessoa: [{ nome, tipo, rel }] em .orbion/anexos
      entendimento: '', tarefas: [], erro: null, gastoApi: 0, pergunta: null,
    };
    fs.mkdirSync(this.pasta, { recursive: true });
    this.salvar();
  }

  cancelar() {
    this.controle.abort();
  }

  get cancelada() {
    return this.controle.signal.aborted;
  }

  /** Para um agente no meio do trabalho e pergunta à pessoa como ele deve seguir. */
  intervir(tarefaId) {
    const t = this.estado.tarefas.find((x) => x.id === tarefaId);
    if (!t || !['rodando', 'na_fila'].includes(t.status)) return false;
    t.intervencao = true;
    this.controles.get(tarefaId)?.abort();
    return true;
  }

  salvar() {
    fs.writeFileSync(path.join(this.pasta, 'estado.json'), JSON.stringify(this.estado, null, 2));
  }

  mudar(campos) {
    Object.assign(this.estado, campos);
    this.salvar();
    this.emit('evento', { tipo: 'estado', estado: this.estado });
  }

  log(tarefaId, agente, ev) {
    // O contador ao vivo vai só para a tela: não entra no log do pedido.
    if (ev.tipo === 'tokens') {
      this.emit('evento', { tipo: 'tokens', tarefa: tarefaId, info: ev.info });
      return;
    }
    if (ev.tipo === 'uso') {
      this.emit('evento', { tipo: 'uso', motor: ev.motor, info: ev.info });
      return;
    }
    const linha = { tarefa: tarefaId, agente: agente?.id || 'sistema', nome: agente?.nome || 'Orbion', cor: agente?.cor, hora: Date.now(), ...ev };
    fs.appendFileSync(path.join(this.pasta, 'eventos.jsonl'), `${JSON.stringify(linha)}\n`);
    this.emit('evento', { tipo: 'log', linha });
  }

  avisar(texto, tarefaId = null) {
    this.log(tarefaId, null, { tipo: 'sistema', texto });
  }

  /** Uma pergunta por vez para a pessoa, mesmo com várias tarefas rodando juntas. */
  perguntarPessoa(p) {
    const vez = this.filaPerguntas.then(async () => {
      if (this.cancelada) return { acao: 'cancelar' };
      const anterior = this.estado.status;
      this.mudar({ status: 'aguardando', pergunta: p });
      const cancelou = new Promise((resolve) => this.controle.signal.addEventListener('abort', () => resolve({ acao: 'cancelar' }), { once: true }));
      const resposta = await Promise.race([this.perguntar(p), cancelou]);
      this.mudar({ status: anterior === 'aguardando' ? 'rodando' : anterior, pergunta: null });
      return resposta;
    });
    this.filaPerguntas = vez.catch(() => {});
    return vez;
  }

  async chamar(agente, tarefaId, tentativa, prompt, esquema, skills, sinal) {
    const r = await rodarAgente({
      motor: agente.motor,
      comando: this.config.comandos[agente.motor],
      cwd: this.projeto,
      prompt,
      esquema,
      pasta: path.join(this.pasta, `${tarefaId}-${agente.id}-${tentativa}`),
      modelo: agente.modelo,
      editaArquivos: agente.editaArquivos,
      rodaComandos: agente.rodaComandos,
      ferramentas: agente.ferramentas,
      esforco: agente.esforco,
      argsExtras: agente.argsExtras,
      dirsExtras: skills.map((s) => s.pasta),
      tempoMaxMs: (Number(agente.tempoMax) || Number(this.config.tempoMaxMin) || 0) * 60 * 1000, // 0 = sem limite
      sinal,
      aoEvento: (e) => this.log(tarefaId, agente, e),
      imagens: anexosCaminhos(this.projeto, this.estado.anexos || []),
    });
    this.estado.gastoApi += r.custo || 0;
    if (tarefaId === 'receptor') this.estado.tokensReceptor = tokens.somar(this.estado.tokensReceptor, r.tokens);
    else {
      const t = this.estado.tarefas.find((x) => x.id === tarefaId);
      if (t) t.tokens = tokens.somar(t.tokens, r.tokens);
    }
    this.estado.tokens = tokens.somar(this.estado.tokensReceptor, ...this.estado.tarefas.map((x) => x.tokens));
    return r;
  }

  async rodar() {
    try {
      await (this.agenteDireto ? this.planejarDireto() : this.planejar());
      if (['concluida', 'cancelada', 'falhou'].includes(this.estado.status)) return this.estado;
      this.mudar({ status: 'rodando' });
      await this.executarPlano();
      this.encerrar();
    } catch (e) {
      this.avisar(`Erro no orquestrador: ${e.message}`);
      this.mudar({ status: 'falhou', erro: e.message });
    }
    return this.estado;
  }

  /** Começa toda tarefa pronta; quem edita espera a trava, quem só lê vai direto. */
  async executarPlano() {
    const rodando = new Map();
    for (;;) {
      if (this.cancelada) break;
      const feitas = new Set(this.estado.tarefas.filter((t) => t.status === 'concluida').map((t) => t.id));
      const prontas = this.estado.tarefas.filter((t) => t.status === 'pendente' && !rodando.has(t.id) && t.depende_de.every((d) => feitas.has(d)));
      for (const t of prontas) {
        if (!this.config.paralelo && rodando.size) break;
        rodando.set(t.id, this.rodarTarefa(t).catch((e) => {
          t.status = 'falhou';
          t.erro = e.message;
          this.mudar({});
        }).finally(() => rodando.delete(t.id)));
      }
      if (!rodando.size) break;
      await Promise.race(rodando.values());
    }
    await Promise.allSettled(rodando.values());
  }

  /** A pessoa escolheu o agente: o plano é uma tarefa só, sem Receptor e sem aprovação. */
  async planejarDireto() {
    this.agentes = carregarAgentes(this.projeto, this.time);
    const a = this.agentes.find((x) => x.id === this.agenteDireto);
    if (!a) throw new Error('Esse agente não existe mais neste time.');
    const pedido = this.estado.pedido;
    const conversa = conversaDoFio(this.projeto, this.estado.fio, this.estado.id);
    const tarefa = {
      id: 't1', agente: a.id, titulo: pedido.split('\n')[0].slice(0, 90), descricao: conversa ? `${conversa}\n\n# O pedido agora\n${pedido}` : pedido, criterio_pronto: 'Atender o pedido da pessoa.', depende_de: [],
      status: 'pendente', tentativas: 0, voltas: 0, passe: null, erro: null, gastoApi: 0, correcao: null, respostaHumana: null, inicio: null, fim: null,
    };
    this.avisar(`Pedido direto para ${a.nome}, sem passar pelo Receptor.`);
    this.mudar({ entendimento: `Pedido direto para ${a.nome}.`, tarefas: [tarefa] });
  }

  async planejar() {
    const agentes = carregarAgentes(this.projeto, this.time);
    this.agentes = agentes;
    const receptor = agentes.find((a) => a.ativo && a.papel === 'receptor');
    const time = agentes.filter((a) => a.ativo && a.papel !== 'receptor');
    if (!receptor) throw new Error('Nenhum agente ativo deste time tem o papel de Receptor. Ele é quem monta o plano.');
    if (!time.length) throw new Error('O time não tem nenhum agente ativo além do Receptor.');

    this.avisar(`${receptor.nome} está entendendo o pedido.`, 'receptor');
    const conversa = conversaDoFio(this.projeto, this.estado.fio, this.estado.id);
    const anteriores = conversa ? [] : listarExecucoes(this.projeto).filter((e) => e.id !== this.estado.id).slice(0, this.config.pedidosAnteriores);
    const memoria = this.config.memoria ? projetoCfg.lerMemoria(this.projeto) : '';
    const prompt = promptReceptor({ receptor, time, pedido: this.estado.pedido, projeto: this.projeto, anteriores, conversa, somenteLeitura: this.estado.somenteLeitura, anexos: this.estado.anexos || [], config: this.config, memoria });
    const r = await this.chamar(receptor, 'receptor', 1, prompt, PLANO, acharSkills(receptor.skills, this.projeto).achadas, this.controle.signal);
    if (r.cancelado) return this.mudar({ status: 'cancelada' });
    if (r.erro) throw new Error(`O Receptor não conseguiu montar o plano: ${r.erro}`);

    const plano = validarPlano(r.saida, time, this.config.maxTarefas);
    fs.writeFileSync(path.join(this.pasta, 'plano.json'), JSON.stringify(plano, null, 2));
    const tipo = this.estado.somenteLeitura && plano.tipo === 'mudanca' ? 'verificacao' : plano.tipo;
    this.mudar({ tipo, entendimento: plano.entendimento, tarefas: plano.tarefas });

    if (!plano.tarefas.length) {
      this.avisar('O Receptor respondeu sem precisar do time.');
      return this.mudar({ status: 'concluida' });
    }
    this.avisar(`Plano com ${plano.tarefas.length} tarefa(s)${tipo === 'verificacao' ? ', só de verificação' : ''}.`);

    if (this.config.aprovarPlano) {
      const resp = await this.perguntarPessoa({ tipo: 'aprovar_plano', titulo: 'Aprovar o plano?', texto: plano.entendimento, efeito: this.efeitoDoPlano() });
      if (resp.acao !== 'aprovar') {
        this.avisar('Plano recusado.');
        return this.cancelarPendentes('cancelada');
      }
      this.avisar('Tu aprovou o plano.');
      if (resp.texto) this.estado.tarefas.forEach((t) => { t.respostaHumana = resp.texto; });
    }
  }

  /** Num pedido de verificação ninguém edita: o agente roda como se não tivesse essa permissão. */
  agenteDaTarefa(t) {
    const a = this.agentes.find((x) => x.id === t.agente);
    if (this.estado.tipo !== 'verificacao' || !a.editaArquivos) return a;
    const semEdicao = (a.ferramentas || '').split(',').map((f) => f.trim()).filter((f) => f && !/^(Write|Edit|MultiEdit|NotebookEdit)\b/.test(f)).join(',');
    return { ...a, editaArquivos: false, ferramentas: semEdicao };
  }

  /** O que o plano vai fazer no projeto, em uma frase, para a pessoa aprovar sabendo. */
  efeitoDoPlano() {
    if (this.estado.tipo === 'verificacao') return 'Só verificação: os agentes leem e consultam, ninguém altera arquivos, e ninguém volta para corrigir.';
    const editam = [...new Set(this.estado.tarefas.map((t) => this.agentes.find((a) => a.id === t.agente)).filter((a) => a?.editaArquivos).map((a) => a.nome))];
    return editam.length ? `Vai mudar o projeto: ${editam.join(', ')} pode${editam.length > 1 ? 'm' : ''} criar e editar arquivos.` : 'Ninguém neste plano edita arquivos.';
  }

  async rodarTarefa(t) {
    const agente = this.agenteDaTarefa(t);
    const { achadas, faltando } = acharSkills(agente.skills, this.projeto);
    if (faltando.length) this.avisar(`Skills não encontradas para ${agente.nome}: ${faltando.join(', ')}`, t.id);

    const controle = new AbortController();
    const pararTudo = () => controle.abort();
    this.controle.signal.addEventListener('abort', pararTudo, { once: true });
    this.controles.set(t.id, controle);
    t.intervencao = false;
    t.tentativas += 1;
    t.erro = null;

    const dono = `${this.estado.id}:${t.id}`;
    let r;
    try {
      if (agente.editaArquivos) {
        // Quem edita espera a vez: um escritor por projeto, em fila.
        t.status = 'na_fila';
        this.mudar({});
        if (this.trava.dono) this.avisar(`${agente.nome} está na fila de escrita.`, t.id);
        const pegou = await this.trava.pegar(dono, controle.signal);
        if (!pegou) r = { cancelado: true };
      }
      if (!r) {
        t.status = 'rodando';
        t.inicio = Date.now();
        this.mudar({});
        this.avisar(`${agente.nome} começou: ${t.titulo}${t.tentativas > 1 ? ` (rodada ${t.tentativas})` : ''}`, t.id);
        const memoria = this.config.memoria ? projetoCfg.lerMemoria(this.projeto) : '';
        const prompt = promptTarefa({ agente, tarefa: t, estado: this.estado, agentes: this.agentes, projeto: this.projeto, skills: achadas, memoria });
        r = await this.chamar(agente, t.id, t.tentativas, prompt, PASSE, achadas, controle.signal);
      }
    } finally {
      this.trava.soltar(dono);
      this.controles.delete(t.id);
      this.controle.signal.removeEventListener('abort', pararTudo);
      t.fim = Date.now();
    }
    t.gastoApi += r.custo || 0;

    if (r.cancelado) {
      if (t.intervencao && !this.cancelada) return this.depoisDaIntervencao(t, agente);
      t.status = 'cancelada';
      return this.mudar({});
    }
    if (r.erro) {
      t.erro = r.erro;
      return this.tratarFalha(t, agente, `O agente parou com erro: ${r.erro}`, false);
    }

    const passe = r.saida;
    t.passe = {
      status: passe.status,
      resumo: passe.resumo || '',
      arquivos: Array.isArray(passe.arquivos) ? passe.arquivos : [],
      recado_para_proximo: passe.recado_para_proximo || '',
      pergunta: passe.pergunta || '',
      aprendizados: Array.isArray(passe.aprendizados) ? passe.aprendizados.filter(Boolean) : [],
      previa: previaDoPasse(passe),
    };
    if (this.config.memoria && t.passe.aprendizados.length) {
      projetoCfg.anotarMemoria(this.projeto, agente.nome, t.passe.aprendizados);
      this.avisar(`${agente.nome} anotou ${t.passe.aprendizados.length} aprendizado(s) na memória do projeto.`, t.id);
    }

    if (passe.status === 'concluida') {
      Object.assign(t, { status: 'concluida', correcao: null, respostaHumana: null });
      this.avisar(`${agente.nome} concluiu: ${t.titulo}`, t.id);
      return this.mudar({});
    }
    if (passe.status === 'bloqueada') {
      t.status = 'bloqueada';
      this.mudar({});
      const resp = await this.perguntarPessoa({
        tipo: 'pergunta', tarefa: t.id, titulo: `${agente.nome} precisa de ti`, texto: t.passe.pergunta || t.passe.resumo,
      });
      if (resp.acao === 'responder' && resp.texto) {
        Object.assign(t, { status: 'pendente', respostaHumana: resp.texto });
        return this.mudar({});
      }
      return this.cancelarPendentes('cancelada');
    }
    return this.tratarFalha(t, agente, t.passe.resumo, true);
  }

  async depoisDaIntervencao(t, agente) {
    t.status = 'bloqueada';
    this.avisar(`Tu parou ${agente.nome}.`, t.id);
    this.mudar({});
    const resp = await this.perguntarPessoa({
      tipo: 'intervencao', tarefa: t.id, titulo: `Tu parou ${agente.nome}`,
      texto: `O que ${agente.nome} deve fazer diferente em "${t.titulo}"? Ele recomeça a tarefa com a tua orientação.`,
    });
    if (resp.acao === 'tentar') {
      Object.assign(t, { status: 'pendente', respostaHumana: resp.texto || null });
      return this.mudar({});
    }
    if (resp.acao === 'pular') {
      t.status = 'cancelada';
      this.avisar(`${t.titulo} foi pulada.`, t.id);
      return this.mudar({});
    }
    return this.cancelarPendentes('cancelada');
  }

  async tratarFalha(t, agente, motivo, reprovou) {
    // Na verificação a reprovação é o próprio resultado: ninguém volta para corrigir.
    if (reprovou && this.estado.tipo === 'verificacao') {
      t.status = 'concluida';
      this.avisar(`${agente.nome} apontou problemas (veja o resumo). Como é só verificação, ninguém volta para corrigir.`, t.id);
      return this.mudar({});
    }
    // Quem verifica reprovou: devolve para quem fez (as dependências que editam arquivos).
    const autores = t.depende_de
      .map((id) => this.estado.tarefas.find((x) => x.id === id))
      .filter((d) => this.agentes.find((a) => a.id === d.agente)?.editaArquivos);
    if (reprovou && agente.papel === 'verificador' && autores.length && t.voltas < this.config.maxVoltas) {
      t.voltas += 1;
      const texto = [motivo, t.passe.recado_para_proximo].filter(Boolean).join('\n\n');
      for (const d of autores) Object.assign(d, { status: 'pendente', correcao: { de: agente.nome, volta: t.voltas, texto } });
      t.status = 'pendente';
      const nomes = autores.map((d) => this.agentes.find((a) => a.id === d.agente).nome).join(', ');
      this.avisar(`${agente.nome} reprovou. Volta ${t.voltas} de ${this.config.maxVoltas}: devolvendo para ${nomes}.`, t.id);
      return this.mudar({});
    }

    t.status = 'falhou';
    this.mudar({});
    const semVoltas = agente.papel === 'verificador' && autores.length && t.voltas >= this.config.maxVoltas;
    const resp = await this.perguntarPessoa({
      tipo: 'falha',
      tarefa: t.id,
      titulo: semVoltas ? `Acabaram as ${this.config.maxVoltas} voltas de correção` : `${agente.nome} não conseguiu`,
      texto: motivo,
    });
    if (resp.acao === 'tentar') {
      Object.assign(t, { status: 'pendente', respostaHumana: resp.texto || null });
      if (semVoltas) t.voltas = 0;
      return this.mudar({});
    }
    return this.cancelarPendentes('falhou');
  }

  cancelarPendentes(statusFinal) {
    for (const t of this.estado.tarefas) {
      if (['pendente', 'bloqueada', 'na_fila'].includes(t.status)) t.status = 'cancelada';
    }
    for (const c of this.controles.values()) c.abort();
    this.mudar({ status: statusFinal });
  }

  encerrar() {
    if (this.cancelada) {
      this.avisar('Execução cancelada.');
      return this.cancelarPendentes('cancelada');
    }
    if (['cancelada', 'falhou', 'concluida'].includes(this.estado.status)) return;
    const todas = this.estado.tarefas.every((t) => t.status === 'concluida' || t.status === 'cancelada');
    const algumaFeita = this.estado.tarefas.some((t) => t.status === 'concluida');
    const ok = todas && algumaFeita;
    this.avisar(ok ? 'Tudo pronto. O time terminou o pedido.' : 'A execução parou antes de terminar todas as tarefas.');
    this.mudar({ status: ok ? 'concluida' : 'falhou' });
  }
}

function listarExecucoes(projeto) {
  const base = pastaExecucoes(projeto);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base)
    .map((id) => {
      try {
        const e = JSON.parse(fs.readFileSync(path.join(base, id, 'estado.json'), 'utf8'));
        return {
          id: e.id, fio: e.fio || e.id, pedido: e.pedido, status: e.status, criadaEm: e.criadaEm, gastoApi: e.gastoApi, tokens: e.tokens || null,
          time: e.time || 'principal', timeNome: e.timeNome || 'Time principal', timeCor: e.timeCor, direto: e.direto || null,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.criadaEm - a.criadaEm);
}

/** O que abrir para a pessoa ver: o que o agente disse, ou o .html que ele criou ou mexeu (o index primeiro). */
function previaDoPasse(passe) {
  const dita = String(passe.previa || '').trim().replace(/\\/g, '/');
  if (dita) return dita;
  const htmls = (Array.isArray(passe.arquivos) ? passe.arquivos : []).map((a) => String(a).replace(/\\/g, '/').replace(/:\d+$/, '')).filter((a) => /\.html?$/i.test(a));
  return htmls.find((a) => /(^|\/)index\.html?$/i.test(a)) || htmls[0] || '';
}

const corta = (t, n) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** O que já foi pedido e feito nesta conversa (o fio), do mais antigo para o mais novo, para o
 *  Receptor (ou o agente do pedido direto) lembrar dela. Vazio no primeiro pedido. */
function conversaDoFio(projeto, fio, idAtual, limiteCaracteres = 14000) {
  const base = pastaExecucoes(projeto);
  const partes = [];
  let tamanho = 0;
  for (const x of listarExecucoes(projeto).filter((e) => e.fio === fio && e.id !== idAtual)) { // mais novos primeiro
    let e;
    try {
      e = JSON.parse(fs.readFileSync(path.join(base, x.id, 'estado.json'), 'utf8'));
    } catch {
      continue;
    }
    if (e.status === 'cancelada' && !(e.tarefas || []).length) continue; // parado antes do plano: texto errado, não conta
    const linhas = [`## A pessoa pediu: ${e.pedido}`];
    if (e.entendimento) linhas.push(`Entendimento: ${e.entendimento}`);
    for (const t of e.tarefas || []) linhas.push(`- ${t.id} ${t.agente} (${t.status}): ${t.titulo}${t.passe?.resumo ? ` → ${corta(t.passe.resumo, 700)}` : ''}`);
    if (e.erro) linhas.push(`Erro: ${e.erro}`);
    const texto = linhas.join('\n');
    tamanho += texto.length;
    if (tamanho > limiteCaracteres) break;
    partes.unshift(texto);
  }
  if (!partes.length) return '';
  return `# Esta conversa até aqui (do mais antigo para o mais novo)\nA pessoa está continuando a mesma conversa com o time. Use o que já foi pedido e feito para entender o pedido novo (por exemplo "isso", "agora faça o mesmo em…", "deu erro").\n\n${partes.join('\n\n')}`;
}

/** Apaga os pedidos de uma conversa (menos os que ainda estão rodando). */
function excluirFio(projeto, fio, rodando = new Set()) {
  const base = pastaExecucoes(projeto);
  let n = 0;
  for (const e of listarExecucoes(projeto).filter((x) => x.fio === fio && !rodando.has(x.id))) {
    fs.rmSync(path.join(base, path.basename(e.id)), { recursive: true, force: true });
    n++;
  }
  return n;
}

function lerExecucao(projeto, id) {
  const pasta = path.join(pastaExecucoes(projeto), path.basename(id));
  const estado = JSON.parse(fs.readFileSync(path.join(pasta, 'estado.json'), 'utf8'));
  estado.time = estado.time || 'principal';
  const arquivo = path.join(pasta, 'eventos.jsonl');
  const eventos = fs.existsSync(arquivo)
    ? fs.readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).slice(-3000).map((l) => JSON.parse(l))
    : [];
  return { estado, eventos };
}

module.exports = { Execucao, Trava, listarExecucoes, lerExecucao, validarPlano, CONFIG_PADRAO, conversaDoFio, excluirFio };
