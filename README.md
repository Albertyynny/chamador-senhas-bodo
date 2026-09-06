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
