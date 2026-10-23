// Formatos de resposta que os agentes são obrigados a devolver.
// Os dois seguem as regras do modo estrito do Codex (todo campo obrigatório,
// sem campos extras), que o Claude também aceita.

const PLANO = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'entendimento', 'tarefas'],
  properties: {
    tipo: {
      type: 'string',
      enum: ['pergunta', 'verificacao', 'mudanca'],
      description: 'pergunta: dá para responder sem o time (tarefas vazia). verificacao: a pessoa quer conferir, validar, consultar, investigar ou entender algo, sem mudar nada. mudanca: a pessoa pediu para criar, corrigir ou alterar algo.',
    },
    entendimento: {
      type: 'string',
      description: 'O que a pessoa quer, em uma ou duas frases. Se não houver trabalho a fazer, a resposta para ela.',
    },
    tarefas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'agente', 'titulo', 'descricao', 'criterio_pronto', 'depende_de'],
        properties: {
          id: { type: 'string', description: 't1, t2, t3...' },
          agente: { type: 'string', description: 'id de um dos agentes disponíveis' },
          titulo: { type: 'string' },
          descricao: { type: 'string' },
          criterio_pronto: { type: 'string' },
          depende_de: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const PASSE = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'resumo', 'arquivos', 'recado_para_proximo', 'pergunta', 'aprendizados', 'previa'],
  properties: {
    status: { type: 'string', enum: ['concluida', 'falhou', 'bloqueada'] },
    resumo: { type: 'string', description: 'Markdown curto: a conclusão em uma ou duas frases primeiro; depois listas, tabelas e blocos de código só se precisar.' },
    arquivos: { type: 'array', items: { type: 'string' } },
    recado_para_proximo: { type: 'string' },
    pergunta: { type: 'string' },
    aprendizados: {
      type: 'array',
      items: { type: 'string' },
      description: 'Fatos duráveis sobre o projeto que valem para os próximos pedidos (convenções, comandos, armadilhas). [] se nada novo.',
    },
    previa: {
      type: 'string',
      description: 'Se você criou ou mudou algo que se vê (página, tela, componente): o .html relativo ao projeto que mostra o resultado, ou o endereço http://localhost:PORTA de um servidor que já esteja rodando. "" se não tiver nada para ver.',
    },
  },
};

module.exports = { PLANO, PASSE };
