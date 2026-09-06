import assert from 'node:assert/strict';
import fs from 'node:fs';
const voices = [];
globalThis.window = {
  speechSynthesis:{cancel() {},speak(voice) { voices.push(voice); }},
  SpeechSynthesisUtterance:class { constructor(text) { this.text = text; } }
};
const source = fs.readFileSync('public/audio.js','utf8');
const {announce,stopAnnouncement} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const tick = () => new Promise(resolve => setTimeout(resolve,10));
let complete = false;
const first = announce('Primeira chamada').then(result => { complete = true; return result; });
await tick();
assert.equal(voices.length,1);
assert.equal(complete,false,'The playback promise must wait for the speech end event.');
voices[0].onend();
assert.deepEqual(await first,{spoken:true});
const second = announce('Segunda chamada');
await tick();
voices[1].onerror();
assert.ok((await second).error);
const third = announce('Chamada cancelada');
await tick(); stopAnnouncement();
assert.deepEqual(await third,{cancelled:true});
window.speechSynthesis = null;
assert.ok((await announce('Sem síntese de voz')).error);
console.log('OK: speech completes on end, errors release the queue, muting cancels playback, missing voice is reported.');
