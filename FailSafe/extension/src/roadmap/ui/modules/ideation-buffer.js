// FailSafe Command Center — Ideation Buffer State
// Pure data layer to manage the staging workspace for the 3D Mindmap

const DEFAULT_MAX_HISTORY = 10;

export class IdeationBuffer {
  constructor(maxHistory = DEFAULT_MAX_HISTORY) {
    this.currentText = '';
    this.history = []; // Array of { id, text, timestamp }
    this.maxHistory = Number.isFinite(maxHistory) && maxHistory > 0
      ? maxHistory
      : DEFAULT_MAX_HISTORY;
  }

  appendTranscript(textDelta) {
    if (!textDelta) return;
    const prefix = this.currentText ? ' ' : '';
    this.currentText += prefix + textDelta;
  }

  setText(text) {
    this.currentText = text || '';
  }

  commit() {
    if (!this.currentText.trim()) return { thought: null, dropped: null };

    const thought = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      text: this.currentText.trim(),
      timestamp: new Date().toISOString()
    };

    this.history.unshift(thought);
    let dropped = null;
    if (this.history.length > this.maxHistory) {
      dropped = this.history.pop();
    }

    this.currentText = '';
    return { thought, dropped };
  }

  getHistory() {
    return this.history;
  }
}
