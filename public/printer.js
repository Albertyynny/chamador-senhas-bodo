const KEY = 'saudeBodoPrinter';
export function normalizeSettings(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return {
    width: Number(value.width) === 80 ? 80 : 58,
    margin: Number.isFinite(Number(value.margin)) ? Math.min(8, Math.max(0, Number(value.margin))) : 3,
    auto: value.auto === true,
    showName: value.showName !== false,
    configured: value.configured === true,
    connection: ['usb', 'network', 'bluetooth'].includes(value.connection) ? value.connection : 'usb'
  };
}
export function getPrinterSettings() {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return normalizeSettings(); }
}
export function savePrinterSettings(value) {
  const settings = normalizeSettings({...value, configured: true});
  localStorage.setItem(KEY, JSON.stringify(settings));
  return settings;
}

let printing = false;
export async function printTicket(ticket, settings = getPrinterSettings(), test = false) {
  if (printing) throw new Error('Há uma impressão em andamento. Feche a janela de impressão antes de tentar novamente.');
  if (!ticket?.code) throw new Error('Gere uma senha antes de imprimir.');
  printing = true;
  let frame;
  let cleanupTimer;
  try {
    settings = normalizeSettings(settings);
    frame = document.createElement('iframe');
    frame.title = 'Comprovante para impressão';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0';
    document.body.append(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Senha de atendimento</title></head><body><article></article></body></html>');
    doc.close();
    const style = doc.createElement('style');
    style.textContent = `@page{size:auto;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:black}article{width:${settings.width}mm;padding:${settings.margin}mm;font:12px/1.35 Arial,sans-serif;text-align:center;overflow-wrap:anywhere}h1{font-size:14px;margin:0 0 8px}.code{font-size:42px;font-weight:900;line-height:1.15;margin:8px 0}.name{font-size:14px;font-weight:bold}.service{font-size:14px;font-weight:bold}p{margin:6px 0}.rule{border-top:1px dashed black;margin:10px 0}small{font-size:11px}article{break-inside:avoid}`;
    doc.head.append(style);
    const receipt = doc.querySelector('article');
    const add = (tag, text, className = '') => {
      const element = doc.createElement(tag);
      element.textContent = text;
      element.className = className;
      receipt.append(element);
    };
    add('h1', 'Centro de Saúde de Bodó/RN');
    if (test) add('p', 'TESTE DE IMPRESSÃO — SEM VALIDADE');
    add('div', '', 'rule');
    add('small', 'SUA SENHA');
    add('div', ticket.code, 'code');
    if (settings.showName && ticket.patientName) add('p', ticket.patientName, 'name');
    add('p', ticket.serviceName, 'service');
    add('p', new Date(ticket.createdAt).toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'}));
    add('div', '', 'rule');
    add('p', 'Aguarde a chamada no painel de atendimento.');
    // Keep the frame alive after print() returns: some browsers print asynchronously.
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(cleanupTimer);
      frame.remove(); printing = false;
    };
    frame.contentWindow.addEventListener('afterprint', cleanup, {once:true});
    await new Promise(resolve => setTimeout(resolve, 100));
    const height = Math.ceil(receipt.getBoundingClientRect().height * 25.4 / 96) + 2;
    style.textContent += `@page{size:${settings.width}mm ${Math.max(60, height)}mm;margin:0}`;
    cleanupTimer = setTimeout(cleanup, 120000);
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch (error) {
    clearTimeout(cleanupTimer);
    frame?.remove();
    printing = false;
    throw error;
  }
}

export function windowsLauncher(origin, silent = false) {
  if (!/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)) throw new Error('Abra o site publicado para baixar o atalho.');
  const page = silent ? 'retirar.html' : 'impressora.html';
  return [
    '@echo off',
    'setlocal',
    'set "ticketChrome=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%ticketChrome%" set "ticketChrome=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%ticketChrome%" set "ticketChrome=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%ticketChrome%" (',
    '  echo Instale o Google Chrome para usar este atalho.',
    '  pause',
    '  exit /b 1',
    ')',
    'echo Feche antes as outras janelas do Saude Bodo abertas por estes atalhos.',
    `start "" "%ticketChrome%" --user-data-dir="%LOCALAPPDATA%\\SaudeBodo-Impressao" --no-first-run${silent ? ' --kiosk-printing' : ''} --app="${origin}/${page}"`,
    'endlocal', ''
  ].join('\r\n');
}
