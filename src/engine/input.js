// Keyboard state tracker. Reads are by physical key code. Held keys are
// queried with isDown(); one-shot actions use consumePress() so a single
// keypress triggers a single action regardless of key-repeat.

const TRACKED = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight',
  'KeyE', 'Slash', 'Space', 'KeyQ', 'KeyH', 'KeyR', 'KeyG', 'KeyF', 'KeyI', 'KeyP', 'KeyZ', 'KeyJ',
  'KeyK', 'KeyC', 'KeyM', 'KeyV', 'KeyN', 'KeyB', 'BracketRight',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
]);

const POCKET_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

export class Input {
  // mouseTarget defaults to the same target as the keyboard, but the caller
  // should pass the canvas specifically so clicks on HTML overlays (the help
  // modal, its buttons) don't register as an in-game action.
  constructor(target = window, mouseTarget = target) {
    this.down = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mousePressed = false;   // one-shot left-down (in-world use / slot click)
    this.mouseHeld = false;      // true while the left button is down (drag)
    this.upAt = null;            // one-shot left-up position (drag release)
    this.rightAt = null;         // one-shot right-click position (inspect)
    this.wheel = 0;              // accumulated wheel delta since last read
    target.addEventListener('keydown', (e) => {
      // Typing into an HTML control (the help modal's name field, etc.) must
      // never be swallowed as a game shortcut — this used to block the
      // letter H outright (preventDefault) while also toggling the help
      // panel shut mid-type, since H is one of the tracked keys.
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (TRACKED.has(e.code)) {
        if (!e.repeat && !this.down.has(e.code)) {
          this.pressed.add(e.code);
          // N alone opens the notepad; only Ctrl/Cmd+N starts a new game
          // (which wipes the run) — split here so a bare N can never trigger
          // the destructive action by accident.
          if (e.code === 'KeyN') this._keyNCtrl = e.ctrlKey || e.metaKey;
        }
        this.down.add(e.code);
        e.preventDefault();
      }
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    target.addEventListener('blur', () => {
      this.down.clear();
      this.pressed.clear();
      this.mousePressed = false;
      this.mouseHeld = false;
    });
    mouseTarget.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    mouseTarget.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mousePressed = true;
      this.mouseHeld = true;
      e.preventDefault();
    });
    mouseTarget.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this.mouseHeld = false;
      this.upAt = { x: e.clientX, y: e.clientY };
    });
    mouseTarget.addEventListener('contextmenu', (e) => {
      this.rightAt = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    mouseTarget.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  isDown(code) {
    return this.down.has(code);
  }

  // True once per physical keypress, then cleared.
  consumePress(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  // Screen-space movement intent from WASD/arrows: each axis in [-1, 1].
  moveIntent() {
    let dx = 0, dy = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) dx -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) dx += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) dy -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) dy += 1;
    return { dx, dy };
  }

  sprinting() {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  usePressed() {
    if (this.consumePress('KeyE') || this.consumePress('Slash')) return true;
    if (this.mousePressed) {
      this.mousePressed = false;
      return true;
    }
    return false;
  }

  // Raw client-space mouse position, for converting to world space.
  mousePos() {
    return { x: this.mouseX, y: this.mouseY };
  }

  // A pending left-click position without consuming it (so the UI can claim
  // clicks on dashboard slots before they reach the in-world "use" action).
  clickPos() {
    return this.mousePressed ? { x: this.mouseX, y: this.mouseY } : null;
  }

  consumeClick() {
    this.mousePressed = false;
  }

  // One-shot left-button release position (for drag-and-drop drops).
  consumeUp() {
    const u = this.upAt;
    this.upAt = null;
    return u;
  }

  // One-shot right-click position (for tile inspection).
  consumeRight() {
    const r = this.rightAt;
    this.rightAt = null;
    return r;
  }

  // Accumulated wheel delta since last read (positive = scroll down).
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  jumpPressed() {
    return this.consumePress('Space');
  }

  eatPressed() {
    return this.consumePress('KeyQ');
  }

  readPressed() {
    return this.consumePress('KeyR');
  }

  // Which pocket slot (0-3) was just picked, or -1 if none this frame.
  pocketSelectPressed() {
    for (let i = 0; i < POCKET_KEYS.length; i++) {
      if (this.consumePress(POCKET_KEYS[i])) return i;
    }
    return -1;
  }

  swapPressed() {
    return this.consumePress('KeyG');
  }

  dropPressed() {
    return this.consumePress('KeyF');
  }

  backpackWeaponSelectPressed() {
    return this.consumePress('Digit5');
  }

  inventoryPressed() {
    return this.consumePress('KeyI');
  }

  // Moved off P (v0.56) so P can pause the game instead; M was reserved for
  // a not-yet-built phone feature and was otherwise unused.
  musicTogglePressed() {
    return this.consumePress('KeyM');
  }

  pausePressed() {
    return this.consumePress('KeyP');
  }

  sleepPressed() {
    return this.consumePress('KeyB');
  }

  zoomTogglePressed() {
    return this.consumePress('KeyZ');
  }

  // Lore Archive / journal screen (J). Owned by the lore module.
  archivePressed() {
    return this.consumePress('KeyJ');
  }

  skillsPressed() {
    return this.consumePress('KeyK');
  }

  craftPressed() {
    return this.consumePress('KeyC');
  }

  phonePressed() {
    return this.consumePress('KeyM');
  }

  weaponChartPressed() {
    return this.consumePress('KeyV');
  }

  // Show/hide the corner minimap ( ] ).
  minimapTogglePressed() {
    return this.consumePress('BracketRight');
  }

  // Ctrl/Cmd+N only — a bare N is notesPressed() below, so a stray tap can
  // never wipe the run.
  newGamePressed() {
    if (this.pressed.has('KeyN') && this._keyNCtrl) {
      this.pressed.delete('KeyN');
      return true;
    }
    return false;
  }

  // Bare N opens the notepad directly, no terminal needed.
  notesPressed() {
    if (this.pressed.has('KeyN') && !this._keyNCtrl) {
      this.pressed.delete('KeyN');
      return true;
    }
    return false;
  }
}
