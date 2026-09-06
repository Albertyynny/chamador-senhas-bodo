let context;
let generation = 0;
let settle;
const tones = new Set();
export async function unlockAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  context ||= new AudioContext();
  if (context.state === 'suspended') await Promise.race([context.resume(),new Promise(resolve => setTimeout(resolve,400))]);
}
export function stopAnnouncement() {
  generation++;
  if (settle) settle({cancelled:true});
  for (const tone of tones) { try { tone.stop(); } catch {} }
  tones.clear();
  window.speechSynthesis?.cancel();
}
export async function announce(text) {
  stopAnnouncement();
  const current = generation;
  let delay = 0;
  try {
    await unlockAudio();
    if (current !== generation) return {cancelled:true};
    if (context?.state === 'running') {
      const start = context.currentTime + 0.02;
      [659.25,880].forEach((frequency,index) => {
        const tone = context.createOscillator(), volume = context.createGain();
        const at = start + index * 0.23;
        tone.type = 'sine'; tone.frequency.value = frequency;
        volume.gain.setValueAtTime(0,at);
        volume.gain.linearRampToValueAtTime(0.18,at + 0.025);
        volume.gain.exponentialRampToValueAtTime(0.001,at + 0.3);
        tone.connect(volume); volume.connect(context.destination); tones.add(tone);
        tone.onended = () => { tones.delete(tone); tone.disconnect(); volume.disconnect(); };
        tone.start(at); tone.stop(at + 0.32);
      });
      delay = 700;
    }
  } catch (error) { console.warn('Aviso sonoro indisponível.',error); }
  if (current !== generation) return {cancelled:true};
  return new Promise(resolve => {
    let timer, watchdog;
    const finish = result => {
      clearTimeout(timer); clearTimeout(watchdog);
      if (settle === finish) settle = null;
      resolve(result);
    };
    settle = finish;
    timer = setTimeout(() => {
      if (current !== generation) return finish({cancelled:true});
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return finish({error:'Voz indisponível neste navegador.'});
      try {
        const voice = new window.SpeechSynthesisUtterance(text);
        voice.lang = 'pt-BR'; voice.rate = 0.88; voice.pitch = 1;
        voice.onend = () => finish({spoken:true});
        voice.onerror = () => finish({error:'Não foi possível falar a chamada. Verifique o som e rechame no painel.'});
        watchdog = setTimeout(() => {
          finish({error:'A voz não respondeu. Verifique o som e rechame no painel.'});
          window.speechSynthesis.cancel();
        },45000);
        window.speechSynthesis.speak(voice);
      } catch { finish({error:'Não foi possível iniciar a voz.'}); }
    },delay);
  });
}
