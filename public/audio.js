// A short two-note chime, followed by the spoken announcement.
let context;
let generation = 0;
let voiceTimer;
const tones = new Set();

export function stopAnnouncement() {
  generation++;
  clearTimeout(voiceTimer);
  for (const tone of tones) {
    try { tone.stop(); } catch {}
  }
  tones.clear();
  window.speechSynthesis?.cancel();
}

export async function announce(text) {
  stopAnnouncement();
  const current = generation;
  let delay = 0;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      context ||= new AudioContext();
      if (context.state === 'suspended') {
        await Promise.race([context.resume(), new Promise(resolve => setTimeout(resolve, 400))]);
      }
      if (current !== generation) return;
      if (context.state === 'running') {
        const start = context.currentTime + 0.02;
        [659.25, 880].forEach((frequency, index) => {
          const tone = context.createOscillator();
          const volume = context.createGain();
          const at = start + index * 0.23;
          tone.type = 'sine';
          tone.frequency.value = frequency;
          volume.gain.setValueAtTime(0, at);
          volume.gain.linearRampToValueAtTime(0.18, at + 0.025);
          volume.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
          tone.connect(volume);
          volume.connect(context.destination);
          tones.add(tone);
          tone.onended = () => { tones.delete(tone); tone.disconnect(); volume.disconnect(); };
          tone.start(at);
          tone.stop(at + 0.32);
        });
        delay = 700;
      }
    }
  } catch (error) {
    console.warn('Não foi possível tocar o aviso sonoro.', error);
  }
  if (current !== generation) return;
  voiceTimer = setTimeout(() => {
    if (current !== generation || !window.speechSynthesis) return;
    const voice = new SpeechSynthesisUtterance(text);
    voice.lang = 'pt-BR';
    voice.rate = 0.88;
    voice.pitch = 1;
    window.speechSynthesis.speak(voice);
  }, delay);
}
