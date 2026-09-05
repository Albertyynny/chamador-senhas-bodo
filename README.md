# Chamador de Senhas — pronto para Netlify

Sistema simples de fila para recepção, unidade de saúde, farmácia, consultório ou atendimento público.

## O que inclui

- `tv.html`: painel público para deixar aberto na TV.
- `painel.html`: painel protegido por PIN para o atendente.
- `retirar.html`: retirada digital de senha, sem nome/CPF.
- Netlify Function + Netlify Blobs para sincronização entre aparelhos.
- Voz automática na TV, após o primeiro clique em **Ativar som**.
- Chamar próxima, rechamar, chamar senha específica, finalizar, remover da fila e resetar.
- Histórico local do sistema (até 2.000 registros) e exportação CSV.
- 6 filas prontas: Odontológico, Consultório Médico, Nutricionista, Fisioterapia, Exames Laboratoriais e Enfermaria.

## Publicar no Netlify

### Opção recomendada — importar pelo GitHub

1. Extraia este ZIP e envie a pasta para um repositório GitHub.
2. No Netlify: **Add new project / Import an existing project**.
3. Selecione o repositório.
4. Não é necessário comando de build. O diretório de publicação é `public`.
5. Faça o deploy.

O Netlify instalará a dependência `@netlify/blobs` informada em `package.json`.

### PIN do painel

O sistema vem com PIN de demonstração `2468`.

Antes de usar em produção, no Netlify crie a variável de ambiente:

- Nome: `PAINEL_PIN`
- Valor: escolha um PIN seu, por exemplo 6 a 10 dígitos.

Depois faça um novo deploy para a alteração entrar em vigor.

## Endereços depois de publicado

- Página inicial: `https://SEU-SITE.netlify.app/`
- TV: `https://SEU-SITE.netlify.app/tv.html`
- Atendente: `https://SEU-SITE.netlify.app/painel.html`
- Retirada de senha: `https://SEU-SITE.netlify.app/retirar.html`

## Como usar na TV

1. Abra `tv.html` no navegador da Smart TV ou em um computador conectado à TV por HDMI.
2. Clique uma vez em **Ativar som** para permitir a voz do navegador.
3. Clique em **Tela cheia**.
4. Deixe a página aberta.

## Como usar no atendimento

1. Abra `painel.html` no computador, tablet ou celular.
2. Digite o PIN.
3. Selecione a fila e informe o local, por exemplo `Consultório 01` ou `Sala de Enfermaria`.
4. Clique em **Chamar próxima**.
5. A TV atualiza automaticamente e anuncia a senha.

## Privacidade

O sistema não pede nome, CPF, telefone, prontuário ou diagnóstico. Ele registra apenas código da senha, tipo de fila, horário e local de atendimento.

## Observações

- O armazenamento usa Netlify Blobs.
- O painel público é atualizado por consultas periódicas à Function; não exige WebSocket.
- Para ambientes com volume muito alto, múltiplas unidades ou requisitos formais de auditoria, use um banco relacional e autenticação por usuário.
