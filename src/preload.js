// Ponte entre a tela e o processo principal: só estas chamadas existem.

const { contextBridge, ipcRenderer } = require('electron');

const CANAIS = [
  'config:ler', 'config:salvar', 'modelos:listar',
  'projeto:escolher', 'projeto:tirar', 'projeto:abrir', 'projeto:dados', 'projeto:config:salvar', 'memoria:garantir',
  'times:listar', 'time:criar', 'time:salvar', 'time:excluir', 'times:deOutroProjeto',
  'agentes:modelos', 'agente:criar', 'agente:salvar', 'agente:duplicar', 'agente:copiarPara', 'agente:excluir', 'agente:previa', 'skills:listar',
  'prompts:listar', 'prompts:garantir', 'prompts:restaurar',
  'fs:listar', 'fs:ler', 'fs:salvar', 'fs:criar', 'fs:renomear', 'fs:lixeira', 'fs:todos', 'fs:revelar', 'fs:abrirExterno',
  'git:status', 'git:original', 'git:indice', 'git:preparar', 'git:despreparar', 'git:descartar', 'git:commit', 'git:ramos',
  'git:trocarRamo', 'git:criarRamo', 'git:puxar', 'git:enviar', 'git:sincronizar', 'git:buscar', 'git:iniciar', 'git:publicar', 'git:mensagem',
  'temas:listar', 'temas:cores', 'temas:icones', 'extensoes:abrirPasta',
  'loja:buscar', 'loja:instalar', 'loja:instaladas', 'loja:remover',
  'terminal:shells', 'terminal:criar', 'terminal:fechar',
  'janela:titulo', 'janela:devtools', 'janela:recarregar', 'janela:sair',
  'execucao:iniciar', 'execucao:responder', 'execucao:cancelar', 'execucao:intervir', 'execucao:ler', 'execucao:vivas',
  'abrir:pasta', 'abrir:link', 'app:notificar',
  'skill:ler', 'skill:salvar', 'skill:escrever',
  'provedores:presets', 'provedores:listar', 'provedores:salvar', 'provedores:remover', 'provedores:modelos',
  'contas:situacao', 'contas:instalar',
  'conversa:listar', 'conversa:ler', 'conversa:criar', 'conversa:configurar', 'conversa:enviar', 'conversa:parar', 'conversa:excluir', 'execucao:excluirFio',
  'melhorias:rodar', 'melhorias:ultimas', 'assistente:parar',
  'projeto:modelos', 'projeto:pastaPadrao', 'projeto:escolherPai', 'projeto:criar',
];
const RAPIDOS = ['terminal:escrever', 'terminal:tamanho']; // sem resposta, para teclas e redimensionar

contextBridge.exposeInMainWorld('orq', {
  chamar: (canal, ...args) => {
    if (!CANAIS.includes(canal)) throw new Error(`Canal desconhecido: ${canal}`);
    return ipcRenderer.invoke(canal, ...args);
  },
  enviar: (canal, ...args) => {
    if (RAPIDOS.includes(canal)) ipcRenderer.send(canal, ...args);
  },
  aoEvento: (fn) => ipcRenderer.on('orq:evento', (_e, ev) => fn(ev)),
});
