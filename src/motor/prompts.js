// Monta o texto que cada agente recebe, a partir de modelos editáveis.
// Os modelos padrão ficam em src/modelos/prompts; o projeto pode ter os seus em
// .orbion/prompts (mesmo nome substitui o padrão; nome novo vira modelo extra
// que um agente escolhe no campo modelo_prompt).

const fs = require('node:fs');
const path = require('node:path');
const { paraPrompt: anexosParaPrompt } = require('./anexos');

const PADROES = path.join(__dirname, '..', 'modelos', 'prompts');
const NOMES_PADRAO = ['receptor.md', 'tarefa.md'];

const STATUS = {
  pendente: 'a fazer',
  rodando: 'em andamento',
  concluida: 'concluída',
  falhou: 'falhou',
  bloqueada: 'aguardando a pessoa',
  cancelada: 'cancelada',
};

const pastaPrompts = (projeto) => path.join(projeto, '.orbion', 'prompts');
const nomeValido = (nome) => /^[a-z0-9][a-z0-9-]{0,40}\.md$/.test(nome);

function listarModelos(projeto) {
  const proprios = fs.existsSync(pastaPrompts(projeto)) ? fs.readdirSync(pastaPrompts(projeto)).filter(nomeValido) : [];
  return [...new Set([...NOMES_PADRAO, ...proprios])].map((nome) => ({
    nome,
    padrao: NOMES_PADRAO.includes(nome),
    personalizado: proprios.includes(nome),
  }));
}

function lerModelo(projeto, nome) {
  const proprio = path.join(pastaPrompts(projeto), path.basename(nome));
  if (fs.existsSync(proprio)) return fs.readFileSync(proprio, 'utf8');
  const padrao = path.join(PADROES, path.basename(nome));
  if (fs.existsSync(padrao)) return fs.readFileSync(padrao, 'utf8');
  return fs.readFileSync(path.join(PADROES, 'tarefa.md'), 'utf8');
}

/** Garante uma cópia editável do modelo no projeto e devolve o caminho relativo a ele. */
function garantirModelo(projeto, nome, base = 'tarefa.md') {
  if (!nomeValido(nome)) throw new Error('Use letras minúsculas, números e hífen, terminando em .md.');
  const destino = path.join(pastaPrompts(projeto), nome);
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(pastaPrompts(projeto), { recursive: true });
    const origem = path.join(PADROES, NOMES_PADRAO.includes(nome) ? nome : base);
    fs.writeFileSync(destino, fs.readFileSync(origem, 'utf8'));
  }
  return path.relative(projeto, destino).split(path.sep).join('/');
}

function restaurarModelo(projeto, nome) {
  if (!NOMES_PADRAO.includes(nome)) throw new Error('Só os modelos padrão podem ser restaurados.');
  const destino = path.join(pastaPrompts(projeto), nome);
  if (fs.existsSync(destino)) fs.writeFileSync(destino, fs.readFileSync(path.join(PADROES, nome), 'utf8'));
}

/** Troca cada {{campo}} pelo valor; campos vazios somem e as linhas em branco extras também. */
function preencher(modelo, valores) {
  return modelo
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (_, chave) => {
      const v = chave.split('.').reduce((o, k) => (o == null ? o : o[k]), valores);
      return v == null ? '' : String(v);
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function permissoes(a) {
  return `Pode editar arquivos: ${a.editaArquivos ? 'sim' : 'não'}. Pode rodar comandos: ${a.rodaComandos ? 'sim' : 'não'}.`;
}

const hoje = () => new Date().toLocaleDateString('pt-BR');

// O que marca uma subpasta como um projeto de verdade.
const MARCAS_PROJETO = ['package.json', '.git', 'pyproject.toml', 'requirements.txt', 'go.mod', 'pom.xml', 'composer.json', 'Cargo.toml', 'deno.json', 'AGENTS.md', 'CLAUDE.md', 'README.md'];

/** As subpastas que são projetos próprios (quando a pasta aberta junta vários, como um monorepo). */
function subprojetos(projeto) {
  try {
    return fs.readdirSync(projeto, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
      .filter((d) => MARCAS_PROJETO.some((m) => fs.existsSync(path.join(projeto, d.name, m))))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function secaoProjetos(projeto) {
  const lista = subprojetos(projeto);
  if (lista.length < 2) return '';
  return `# Projetos dentro desta pasta\nEsta pasta junta vários projetos: ${lista.join(', ')}. Cada pedido é sobre um (ou alguns) deles.\n- Tudo o que for criado (código, documentos, protótipos) vai dentro da subpasta do projeto do pedido. Nunca crie pasta nova solta na raiz.\n- Documentos de design vão em <projeto>/docs-design/<assunto>.md e de arquitetura em <projeto>/docs-arquitetura/<assunto>.md.`;
}

const secaoMemoria = (memoria) => (memoria ? `# Memória do projeto\nO que o time já aprendeu neste projeto em pedidos anteriores:\n${memoria}` : '');

function promptReceptor({ receptor, time, pedido, projeto, anteriores, conversa = '', somenteLeitura = false, anexos = [], config, memoria = '' }) {
  return preencher(lerModelo(projeto, receptor.modeloPrompt || 'receptor.md'), {
    agente: receptor,
    projeto,
    pedido: [pedido, somenteLeitura ? '(A pessoa marcou "Só validar": o tipo é verificacao. Ninguém pode alterar nada; planeje só leitura e consultas.)' : '', anexosParaPrompt(projeto, anexos)].filter(Boolean).join('\n\n'),
    data: hoje(),
    memoria: secaoMemoria(memoria),
    max_tarefas: config.maxTarefas,
    projetos: secaoProjetos(projeto),
    time: time.map((a) => `- ${a.id} — ${a.nome} [${a.motor}]${a.papel === 'verificador' ? ' (verificador: pode reprovar e devolver para correção)' : ''}: ${a.descricao} ${permissoes(a)}`).join('\n'),
    // Numa conversa, vai o que já foi dito nela; no primeiro pedido, os últimos pedidos do projeto.
    anteriores: conversa || (anteriores.length
      ? `# Pedidos anteriores neste projeto (mais recentes primeiro)\n${anteriores.map((e) => `- "${e.pedido}" (${e.status})`).join('\n')}`
      : ''),
  });
}

function promptTarefa({ agente, tarefa, estado, agentes, projeto, skills, memoria = '' }) {
  const nomeDe = (id) => agentes.find((a) => a.id === id)?.nome || id;

  const regras = [
    agente.editaArquivos
      ? 'Você pode criar e editar arquivos dentro da pasta do projeto. Não mexa na pasta .orbion.'
      : 'Você NÃO pode criar nem alterar arquivos: entregue tudo no resumo do passe.',
    agente.rodaComandos ? 'Você pode rodar comandos no terminal do projeto.' : 'Você não pode rodar comandos.',
    'Faça só a sua tarefa: as outras partes ficam com os colegas do plano.',
    subprojetos(projeto).length > 1 && agente.editaArquivos ? 'Esta pasta junta vários projetos: crie e mude arquivos só dentro do projeto do pedido. Nada de pasta nova solta na raiz.' : null,
    estado.tipo === 'verificacao' ? 'Este pedido é SÓ DE VERIFICAÇÃO: leia, consulte e responda no resumo. Não altere arquivos, dados nem configurações, nem aqui nem em outros sistemas (nada de INSERT/UPDATE/DELETE, deploy, publicar ou reiniciar). Se achar algo para corrigir, diga o que e onde no resumo.' : null,
  ].filter(Boolean).map((r) => `- ${r}`).join('\n');

  const entregas = estado.tarefas.filter((t) => t.id !== tarefa.id && t.passe && t.status === 'concluida');
  const correcao = tarefa.correcao;

  return preencher(lerModelo(projeto, agente.modeloPrompt || 'tarefa.md'), {
    agente,
    projeto,
    data: hoje(),
    memoria: secaoMemoria(memoria),
    projetos: secaoProjetos(projeto),
    pedido: [`> ${estado.pedido.replace(/\n/g, '\n> ')}`, anexosParaPrompt(projeto, estado.anexos)].filter(Boolean).join('\n\n'),
    entendimento: estado.entendimento,
    plano: estado.tarefas
      .map((t) => `${t.id === tarefa.id ? '→' : ' '} ${t.id} [${nomeDe(t.agente)}] ${t.titulo} (${STATUS[t.status] || t.status})`)
      .join('\n'),
    tarefa,
    regras,
    skills: skills.length
      ? `# Skills que você deve usar\nAntes de começar, leia por inteiro cada arquivo abaixo e siga as orientações dele no seu trabalho:\n${skills.map((s) => `- ${s.nome}: ${s.arquivo}`).join('\n')}`
      : '',
    entregas: entregas.length
      ? `# O que os colegas já entregaram\n${entregas.map((t) => [
        `## ${t.id} — ${nomeDe(t.agente)}: ${t.titulo}`,
        t.passe.resumo,
        t.passe.arquivos.length ? `Arquivos: ${t.passe.arquivos.join(', ')}` : '',
        t.passe.recado_para_proximo ? `Recado: ${t.passe.recado_para_proximo}` : '',
      ].filter(Boolean).join('\n')).join('\n\n')}`
      : '',
    correcao: correcao
      ? `# Correção pedida\n${correcao.de} reprovou o trabalho (volta ${correcao.volta}). Corrija isto:\n${correcao.texto}`
      : '',
    verificacao_anterior: tarefa.voltas > 0 && tarefa.passe?.status === 'falhou'
      ? `# Sua verificação anterior\nNa rodada passada você reprovou com:\n${tarefa.passe.resumo}\nO trabalho foi corrigido depois disso. Verifique tudo de novo.`
      : '',
    resposta_pessoa: tarefa.respostaHumana ? `# Resposta da pessoa\n${tarefa.respostaHumana}` : '',
  });
}

/** Mostra como ficaria o prompt de um agente, com uma tarefa de exemplo. */
function previa({ agente, agentes, projeto, config, skills, memoria = '' }) {
  if (agente.papel === 'receptor') {
    const time = agentes.filter((a) => a.ativo && a.papel !== 'receptor');
    return promptReceptor({ receptor: agente, time, pedido: '(exemplo) Criar a tela de cadastro de clientes com validação de CPF.', projeto, anteriores: [], config, memoria });
  }
  const tarefa = {
    id: 't2', agente: agente.id, titulo: '(exemplo) Tarefa deste agente', descricao: 'Aqui entra a descrição que o Receptor escrever.',
    criterio_pronto: 'Aqui entra o critério de pronto.', status: 'rodando', voltas: 0, passe: null,
  };
  const estado = {
    pedido: '(exemplo) Criar a tela de cadastro de clientes com validação de CPF.',
    entendimento: '(exemplo) A pessoa quer uma tela nova de cadastro com validação de CPF.',
    tarefas: [
      { id: 't1', agente: 'po', titulo: '(exemplo) Fechar requisitos', status: 'concluida', passe: { resumo: '(exemplo) Passe de bastão do colega anterior.', arquivos: [], recado_para_proximo: '' } },
      tarefa,
    ],
  };
  return promptTarefa({ agente, tarefa, estado, agentes, projeto, skills, memoria });
}

module.exports = { promptReceptor, promptTarefa, previa, listarModelos, lerModelo, garantirModelo, restaurarModelo, STATUS, NOMES_PADRAO };
