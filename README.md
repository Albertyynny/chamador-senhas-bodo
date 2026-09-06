# Sistema de Senhas — Centro de Saúde de Bodó/RN

Sistema de organização de filas e chamadas para os atendimentos do Centro de Saúde de Bodó/RN.

## Funcionalidades

- Emissão digital de senhas com nome opcional, sem solicitar CPF ou outros dados pessoais.
- Filas separadas para Odontológico, Consultório Médico, Nutricionista, Fisioterapia, Exames Laboratoriais e Enfermaria.
- Cadastro de novos setores pelo painel, com prefixo exclusivo e numeração independente.
- Agenda de consultas por data, sala e setor, com identificação do guichê que fez o cadastro.
- Painel do atendente protegido por PIN.
- Chamada da próxima senha de cada setor.
- Busca e chamada de uma senha específica.
- Atendimento independente por guichê, com rechamada, início e conclusão.
- Situações aguardando, chamada, em atendimento, concluída, ausente e cancelada.
- Cancelamento preservando o registro e retorno de ausentes ao final da fila.
- Exibição da senha chamada e do local de atendimento na TV.
- Fila de anúncios na TV, com toque e uma chamada por vez.
- Exibição das últimas chamadas e da quantidade de pessoas aguardando.
- Sincronização das filas entre computadores, celulares, tablets e a TV.
- Histórico por dia e situação, com etapas e exportação em CSV.
- Encerramento diário preservando o histórico e abertura do próximo dia com numeração em 001.

O sistema registra o código da senha, o nome quando informado, o setor, o horário e o local de atendimento.

## Agendamento de consultas

No painel protegido por PIN, informe seu guichê e abra **Agenda de consultas**. Cadastre o nome da pessoa, setor, sala/guichê da consulta, data, horário e duração (15, 20, 30, 45 ou 60 minutos). O guichê de cadastro é registrado automaticamente a partir da seleção no painel; ele pode ser diferente da sala onde ocorrerá a consulta. O sistema atual usa um PIN compartilhado: a identificação do guichê não cria contas nem restringe a agenda a um funcionário.

- Horários seguem Brasília (`America/Sao_Paulo`). Datas e horários passados são recusados; reservas sobrepostas na mesma sala são bloqueadas, inclusive se vierem de dois guichês ao mesmo tempo.
- Consulte por dia e situação, ou marque **Somente consultas cadastradas pelo meu guichê**. Os registros mostram quem cadastrou e quem fez alterações.
- **Reagendar** altera setor, sala, data, horário e duração, mantendo as etapas anteriores. **Cancelar** preserva o cadastro. **Marcar ausente** só é aceito após o horário marcado, com validação no servidor.
- Agendar ainda não gera uma senha. No dia da consulta, com o atendimento aberto, **Confirmar chegada** cria a senha ao final da fila do setor. A agenda passa a indicar chegada confirmada; a evolução clínica não é registrada nela, e as situações operacionais da senha seguem no painel e no histórico de atendimento.
- Confirmações simultâneas ou repetidas retornam a mesma senha. A impressão automática segue a configuração local; uma confirmação já realizada não dispara outra impressão automática. Use **Imprimir senha** na agenda para segunda via ou recuperação de uma falha.
- Agendamentos podem ser criados com o dia encerrado. A abertura de outro dia preserva a agenda, inclusive consultas futuras e os registros de cancelamentos e reagendamentos.

O nome é obrigatório para agendar. CPF, telefone e informações clínicas não são solicitados. A agenda é retornada apenas para requisições autenticadas, filtrada pela data selecionada; não aparece no cadastro público ou na TV. Após a chegada e a chamada, o nome segue a exibição normal do sistema de senhas.

## Cadastro de setores e operação dos guichês

Em **Cadastro de setores e senhas**, informe o nome e um prefixo de 1 a 3 letras (ex.: Psicologia, `PS`). O sistema impede nomes e prefixos repetidos. O cadastro exige o PIN do painel e pode ser feito também com o dia encerrado, para preparar o próximo atendimento.

Cada setor possui sua própria sequência (`PS001`, `PS002`…), fila, impressão e histórico. Use **Gerar senha** na linha do setor para abrir o cadastro já selecionado. Na tela de cadastro, **Atualizar setores** carrega novos setores sem apagar o nome digitado. Os setores são preservados ao abrir um novo dia; apenas a numeração volta a 001. O cadastro do setor não emite senhas por conta própria.

No painel, informe um nome para o guichê/sala deste computador e selecione o setor. O nome fica salvo neste navegador. Nomes iguais (sem diferenciar acentos e maiúsculas) representam o mesmo guichê; use nomes diferentes para salas diferentes.

1. **Chamar próxima** ou **Chamar senha específica** ocupa apenas o guichê escolhido.
2. **Rechamar** gera um novo anúncio da mesma senha.
3. **Iniciar atendimento** registra o início; **Concluir** registra o término e libera o guichê.
4. **Marcar ausente** libera o guichê quando a pessoa chamada não compareceu. No histórico do dia, **Retornar à fila** coloca a mesma senha no final da fila.
5. **Cancelar senha** mantém o registro com a situação cancelada. Senhas aguardando podem ser canceladas na lista do setor.

Um guichê ocupado não pode chamar outra senha. As alterações verificam o dia e a identidade da senha no servidor, evitando que uma tela antiga conclua outra pessoa. Gravações simultâneas usam a verificação de versão do armazenamento para não retirar a mesma senha duas vezes.

## Encerramento e histórico diário

As datas seguem `America/Sao_Paulo`. Use **Encerrar dia e salvar histórico** após concluir, marcar ausente ou cancelar todas as senhas pendentes. Não há exclusão automática de filas na virada da noite: um dia anterior aberto precisa ser resolvido antes de começar o próximo.

- **Reabrir dia de hoje** mantém registros e numeração quando o encerramento ocorreu antes da hora.
- **Abrir atendimento de hoje**, em uma data posterior, inicia a numeração em 001 e mantém o histórico anterior disponível.
- Se o dia estiver encerrado ou for de uma data anterior, novas emissões ficam bloqueadas até a abertura pela recepção.
- O histórico permite escolher o dia, filtrar situações, abrir as etapas de uma senha e exportar a seleção em CSV.

Cada encerramento salva uma cópia imutável no Netlify Blobs antes de atualizar o índice dos dias. Se a gravação falhar, o encerramento não é confirmado. O estado ativo contém as senhas e anúncios do dia; os dias anteriores são carregados apenas ao consultar o histórico. A antiga ação de apagar todo o sistema foi desativada.

Na primeira atualização, as filas, a senha atual e os contadores existentes são importados. O histórico antigo é mantido em **Registros anteriores à atualização**, com as situações que a versão antiga efetivamente registrou. Não são inventados horários de conclusão para esses registros. Dados apagados antes desta atualização não podem ser recuperados pelo sistema.

## Fila de anúncios na TV

Abra a TV e clique em **Ativar som**. Cada chamada/rechamada recebe um número sequencial no servidor. A TV busca os eventos após seu último número recebido, inclusive quando várias chamadas ocorrem entre duas consultas, e espera a fala terminar antes da próxima. Há uma pausa breve entre os anúncios e uma área que mantém os guichês ativos visíveis.

Ao abrir/recarregar a TV, ela exibe a situação atual e acompanha os próximos anúncios, sem repetir todo o histórico. Para repetir uma senha já chamada, use **Rechamar**. Durante uma queda de conexão, a TV mostra um aviso e, ao reconectar sem recarregar a página, recupera os anúncios do mesmo dia ainda não recebidos. Uma mudança de dia descarta os anúncios pendentes do dia anterior. Desativar o som mantém a sequência visual; reativar vale para as próximas falas. Falhas da voz são exibidas na tela.

Após publicar esta atualização, recarregue as telas de cadastro, atendente e TV para usar a nova versão em conjunto.

## Verificação

Na pasta do projeto, execute no PowerShell:

```powershell
Get-Content -Raw tests/queue.mjs | node --input-type=module
Get-Content -Raw tests/audio.mjs | node --input-type=module
Get-Content -Raw tests/printer.mjs | node --input-type=module
```

Os testes cobrem transições, guichês concorrentes, ações desatualizadas, importação, falha de arquivamento, consulta autenticada de dias anteriores, paginação e sequência de anúncios, finalização da fala e controles do painel. O armazenamento e a voz são simulados; a validação em duas telas reais, no Netlify e na TV da unidade, continua necessária antes do atendimento.

## Instalação no celular

Após publicar no Netlify (HTTPS), abra o site e toque em **Instalar app**. Em navegadores compatíveis, o botão abre a instalação. No iPhone/iPad, use o Safari: **Compartilhar → Adicionar à Tela de Início → Adicionar**.

O app abre na página inicial e usa a imagem de `assets/logo.png` nos ícones publicados em `public/assets` (180, 192 e 512 pixels). Ao trocar a logo, gere novamente esses ícones. Um app já instalado pode precisar ser removido e instalado novamente para atualizar o ícone.

O sistema precisa de internet para consultar e alterar filas. O service worker guarda somente a página de aviso de falta de conexão, sem armazenar senhas ou dados de pacientes.

## Impressora térmica no Windows

Abra **Configurar impressora** na página inicial, no painel do atendente ou no cadastro. Configure a bobina de 58 ou 80 mm, margem interna, inclusão do nome e impressão automática. As preferências são locais ao navegador/perfil, sem armazenar os dados da senha.

USB, rede/Wi-Fi e Bluetooth são usados por meio do driver da impressora no Windows. A seleção de conexão no painel apresenta as instruções correspondentes; não conecta nem detecta dispositivos. Bluetooth depende do suporte do modelo e do driver. A impressora deve aparecer em **Impressoras e scanners** e imprimir uma página de teste pelo Windows.

O botão **Imprimir teste** usa um comprovante fictício e não cria senha. Selecione a térmica, papel correspondente, escala de 100%, margens nenhuma e cabeçalhos/rodapés desativados. O comprovante usa preto e branco e altura calculada pelo conteúdo; o tamanho final do papel e o corte dependem das configurações do driver.

### Impressão sem confirmação

1. No painel da impressora, baixe e execute **Configurar impressão** no Windows com Google Chrome instalado.
2. Na janela aberta pelo arquivo, salve as preferências, ative impressão automática e imprima um teste escolhendo a térmica. Esse perfil é exclusivo do atendimento e tem configurações próprias.
3. Feche todas as janelas abertas pelos atalhos antes de trocar de modo.
4. Baixe e execute **Iniciar atendimento**. O Chrome abre com `--kiosk-printing` e o perfil `%LOCALAPPDATA%\SaudeBodo-Impressao`, usando a seleção de impressão salva no teste. Faça uma emissão de conferência na impressora antes de iniciar o uso.
5. Para trocar papel ou impressora, feche o atendimento e abra o atalho de configuração novamente.

Os arquivos `.cmd` são gerados com o endereço do site aberto; baixe-os a partir do site publicado. Não alteram o registro, não instalam drivers e não encerram outros navegadores. Se o site for aberto normalmente ou pelo app instalado, `window.print()` abre a confirmação do navegador. A emissão automática é disparada apenas após a API confirmar a criação da senha. Cancelar ou falhar a impressão não cria outra senha; use **Imprimir** na senha já gerada. O site não recebe confirmação de saída física do papel.

Verificação automatizada no PowerShell, na pasta do projeto: `Get-Content -Raw tests/printer.mjs | node --input-type=module`. O teste verifica preferências, larguras, geração segura de atalhos e reimpressão após falha sem nova emissão. A validação física deve ser feita na térmica instalada.
