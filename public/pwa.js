(() => {
  let installPrompt;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const isInstalled = () => standalone.matches || navigator.standalone === true;
  const section = document.createElement('section');
  section.className = 'install-app no-print';
  section.setAttribute('aria-label', 'Instalar aplicativo');
  section.innerHTML = `<img src="/assets/icon-192.png" width="48" height="48" alt="">
    <div><strong>Tenha o Saúde Bodó no celular</strong><p>Acesse direto pela Tela de Início.</p></div>
    <button type="button" class="btn btn-primary">Instalar app</button>
    <p class="install-help" role="status" hidden></p>`;
  const button = section.querySelector('button');
  const help = section.querySelector('.install-help');
  const update = () => { section.hidden = isInstalled(); };
  update();
  const main = document.querySelector('main');
  if (main) main.append(section);
  standalone.addEventListener('change', update);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    update();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    section.hidden = true;
  });
  button.addEventListener('click', async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      button.disabled = true;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted') section.hidden = true;
      } catch {
        help.textContent = 'Abra o menu do navegador e procure “Instalar app” ou “Adicionar à Tela de Início”.';
        help.hidden = false;
      } finally {
        button.disabled = false;
      }
      return;
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    help.textContent = ios
      ? 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”. Confirme em “Adicionar”. Se a opção não aparecer, abra este site no Safari.'
      : 'No menu do navegador (⋮), procure “Instalar app” ou “Adicionar à Tela de Início”. Se a opção não aparecer, abra este site no Chrome ou Edge. Se já estiver instalado, use o ícone na Tela de Início.';
    help.hidden = false;
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('Não foi possível preparar a instalação do app.', error);
    });
  }
})();
