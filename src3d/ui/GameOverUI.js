// Game Over overlay (Batch 9) — the 3D take on the 2D UIScene
// showGameOverScreen: dark full-screen fade, red GAME OVER title,
// "Phillis has fainted!", and a green TRY AGAIN button. The 2D button
// restarted MainScene + UIScene from scratch; with no save system yet
// (Batch 11), a full page reload is the same fresh start.

export class GameOverUI {
  constructor(state) {
    this.overlay = document.getElementById('gameover-overlay');
    this.overlay
      .querySelector('#gameover-restart')
      .addEventListener('click', () => location.reload());
    state.on('gameOver', () => this.show());
  }

  show() {
    // Close every open menu (2D closeAllMenus) so only the overlay remains.
    document
      .querySelectorAll('.overlay-panel.open, #backpack-panel.open')
      .forEach((el) => el.classList.remove('open'));
    this.overlay.classList.add('open');
  }
}
