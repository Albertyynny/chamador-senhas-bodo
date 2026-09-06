# Sistema de Senhas — Centro de Saúde de Bodó/RN

Sistema de organização de filas e chamadas para os atendimentos do Centro de Saúde de Bodó/RN.

## Funcionalidades

- Emissão digital de senhas com nome opcional, sem solicitar CPF ou outros dados pessoais.
- Filas separadas para Odontológico, Consultório Médico, Nutricionista, Fisioterapia, Exames Laboratoriais e Enfermaria.
- Painel do atendente protegido por PIN.
- Chamada da próxima senha de cada setor.
- Busca e chamada de uma senha específica.
- Rechamada e finalização do atendimento atual.
- Remoção de senhas da fila.
- Exibição da senha chamada e do local de atendimento na TV.
- Anúncio de voz automático no painel da TV.
- Exibição das últimas chamadas e da quantidade de pessoas aguardando.
- Sincronização das filas entre computadores, celulares, tablets e a TV.
- Histórico de atendimentos com exportação em arquivo CSV.
- Reinicialização das filas e da numeração das senhas.

O sistema registra o código da senha, o nome quando informado, o setor, o horário e o local de atendimento.

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
