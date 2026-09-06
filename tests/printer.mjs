import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Run with: Get-Content -Raw tests/printer.mjs | node --input-type=module
const source = fs.readFileSync('public/printer.js', 'utf8');
const printer = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
let stored = null;
globalThis.localStorage = {getItem: () => stored, setItem: (_key, value) => { stored = value; }};
assert.equal(printer.getPrinterSettings().auto, false);
stored = 'broken json';
assert.equal(printer.getPrinterSettings().width, 58);
printer.savePrinterSettings({width:80, margin:4, auto:true, showName:false, connection:'network'});
assert.deepEqual(printer.getPrinterSettings(), {width:80, margin:4, auto:true, showName:false, configured:true, connection:'network'});
assert.equal(printer.normalizeSettings({margin:-10}).margin, 0);
assert.equal(printer.normalizeSettings({margin:100}).margin, 8);
assert.throws(() => printer.windowsLauncher('https://example.com&calc.exe'));
assert.throws(() => printer.windowsLauncher('https://example.com/%PATH%'));
const launcher = printer.windowsLauncher('https://example.netlify.app', true);
assert.match(launcher, /--kiosk-printing/);
assert.match(launcher, /SaudeBodo-Impressao/);
assert.match(launcher, /https:\/\/example.netlify.app\/retirar.html/);
assert.doesNotMatch(printer.windowsLauncher('https://example.netlify.app'), /--kiosk-printing/);

let lastFrame;
let calls = 0;
let fail = false;
function element(tag) {
  return {tag, children:[], style:{}, append(child) { this.children.push(child); }, getBoundingClientRect: () => ({height:260})};
}
globalThis.document = {
  body: {append() {}},
  createElement(tag) {
    assert.equal(tag, 'iframe');
    const receipt = element('article');
    const head = element('head');
    lastFrame = {
      style:{}, receipt, head, removed:false,
      setAttribute() {}, remove() { this.removed = true; },
      contentDocument: {open() {}, write() {}, close() {}, head, createElement:element, querySelector: () => receipt},
      contentWindow: {addEventListener(_event, callback) { this.afterprint = callback; }, focus() {}, print() { calls++; if (fail) throw new Error('Printer unavailable'); this.afterprint(); }}
    };
    return lastFrame;
  }
};
const ticket = {code:'A001', patientName:'<img src=x onerror=alert(1)>', serviceName:'Consultório Médico', createdAt:'2026-09-06T15:00:00Z'};
await printer.printTicket(ticket, {width:58, margin:3, showName:true});
assert.equal(calls, 1);
assert.ok(lastFrame.removed);
assert.ok(lastFrame.receipt.children.some(child => child.textContent === ticket.patientName));
assert.ok(lastFrame.receipt.children.every(child => !('innerHTML' in child)));
assert.match(lastFrame.head.children[0].textContent, /size:58mm 71mm/);
await printer.printTicket(ticket, {width:80, showName:false}, true);
assert.equal(calls, 2);
assert.ok(!lastFrame.receipt.children.some(child => child.className === 'name'));
assert.ok(lastFrame.receipt.children.some(child => child.textContent.includes('SEM VALIDADE')));
fail = true;
await assert.rejects(printer.printTicket(ticket), /Printer unavailable/);
assert.ok(lastFrame.removed);
fail = false;
await printer.printTicket(ticket);
assert.equal(calls, 4);

// Exercise the real registration handler with a failed print request.
const html = fs.readFileSync('public/retirar.html', 'utf8');
const code = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;$/gm, '');
const ids = new Map();
const get = id => {
  if (!ids.has(id)) ids.set(id, {value:'', hidden:false, disabled:false, textContent:'', focus() {}, reset() {}, reportValidity: () => true, replaceChildren() {}, add() {}});
  return ids.get(id);
};
let issued = 0;
let attempts = 0;
const messages = [];
const context = vm.createContext({
  document:{getElementById:get},
  window:{addEventListener() {}, scrollTo() {}},
  Option:function() {},
  getPrinterSettings: () => ({configured:true, auto:true, width:58}),
  getState: async () => ({services:[{id:'medical', name:'Consultório Médico'}]}),
  postAction: async action => { assert.equal(action, 'take'); issued++; return {ticket}; },
  printTicket: async value => { assert.equal(value, ticket); attempts++; if (attempts === 1) throw new Error('Printer unavailable'); },
  toast:message => messages.push(message),
  Date
});
vm.runInContext(code, context);
await new Promise(resolve => setImmediate(resolve));
get('service').value = 'medical';
await get('registration').onsubmit({preventDefault() {}});
assert.equal(issued, 1);
assert.equal(attempts, 1);
assert.equal(get('result').hidden, false);
assert.equal(get('tcode').textContent, 'A001');
assert.match(messages[0], /Senha já gerada/);
await get('printTicket').onclick();
assert.equal(issued, 1);
assert.equal(attempts, 2);
console.log('OK: preferences, safe Windows launchers, receipt widths, text safety, print recovery and reprint without duplicate tickets.');
