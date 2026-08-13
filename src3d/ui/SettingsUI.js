// Settings overlay (Batch 11) — the small ⚙️ panel that gives the save system
// and the audio system a visible surface: sound/music toggles, a manual save,
// and "New Game". Like every other UI class here it is a pure view: it calls
// into AudioManager / the save callbacks and never touches game state itself.

export class SettingsUI {
  /**
   * @param {object} opts
   * @param {AudioManager} opts.audio
   * @param {() => boolean} opts.onSaveNow   returns true if the write succeeded
   * @param {() => void} opts.onNewGame      wipe the save and restart
   */
  constructor({ audio, onSaveNow, onNewGame }) {
    this.audio = audio;
    this.onSaveNow = onSaveNow;
    this.onNewGame = onNewGame;

    this.btn = document.getElementById('settings-btn');
    this.panel = document.getElementById('settings-panel');
    this.soundBtn = document.getElementById('toggle-sound');
    this.musicBtn = document.getElementById('toggle-music');
    this.note = document.getElementById('save-note');
    this.toast = document.getElementById('save-toast');
    this._toastTimer = null;

    this.btn.addEventListener('click', () => {
      const open = this.panel.classList.toggle('open');
      // One panel at a time — the backpack sits in the same corner.
      if (open) document.getElementById('backpack-panel').classList.remove('open');
      this.render();
    });
    document.getElementById('settings-close').addEventListener('click', () => {
      this.panel.classList.remove('open');
    });

    this.soundBtn.addEventListener('click', () => {
      audio.setSound(!audio.sound);
      audio.sfx('click'); // silent when turning it off, audible when turning on
      this.render();
    });
    this.musicBtn.addEventListener('click', () => {
      audio.setMusic(!audio.music);
      this.render();
    });

    document.getElementById('save-now').addEventListener('click', () => {
      this.showSaved(this.onSaveNow() ? 'saved' : 'failed');
    });

    document.getElementById('new-game').addEventListener('click', () => {
      // Destructive and irreversible — always confirm.
      if (window.confirm('Start a new game? Your island, dragons and cards will be lost.')) {
        this.onNewGame();
      }
    });

    this.render();
  }

  render() {
    const set = (btn, on) => {
      btn.textContent = on ? 'ON' : 'OFF';
      btn.classList.toggle('off', !on);
    };
    set(this.soundBtn, this.audio.sound);
    set(this.musicBtn, this.audio.music);
  }

  /** Bottom-center "💾 Saved" confirmation, also used by the autosave tick. */
  showSaved(result = 'saved') {
    this.toast.textContent = result === 'saved' ? '💾 Saved' : '⚠️ Could not save';
    this.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('show'), 1200);
  }

  /** Footer line under the buttons: when the run was last written to disk. */
  setSaveNote(text) {
    this.note.textContent = text;
  }
}
