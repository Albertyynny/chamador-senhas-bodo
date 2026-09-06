// A cursor tracks server events, rather than only the most recent call.
export class AnnouncementQueue {
  constructor(play, onError = () => {}, onIdle = () => {}) {
    this.play = play; this.onError = onError; this.onIdle = onIdle;
    this.pending = []; this.running = false; this.cursor = 0; this.generation = 0;
  }
  reset(cursor = 0) {
    this.generation++; this.pending = []; this.cursor = cursor;
  }
  enqueue(calls) {
    for (const call of calls.slice().sort((a,b) => a.seq - b.seq)) {
      if (call.seq <= this.cursor) continue;
      this.cursor = call.seq;
      this.pending.push(call);
    }
    this.drain();
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const generation = this.generation;
        const call = this.pending.shift();
        try { await this.play(call); }
        catch (error) { if (generation === this.generation) this.onError(error); }
      }
    } finally { this.running = false; this.onIdle(); }
  }
}
