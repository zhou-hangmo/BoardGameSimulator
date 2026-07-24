// ============================================================
// BoardGameSimulator — PlayerRow Web Component
// ============================================================

export class PlayerRow extends HTMLElement {
  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    const name = this.getAttribute('name') ?? '';
    const host = this.hasAttribute('host');

    this.className = 'player-row';

    const dot = document.createElement('span');
    dot.className = 'dot green';

    const label = document.createElement('span');
    label.textContent = name + (host ? ' (主持人)' : '');

    this.append(dot, label);
  }
}

customElements.define('player-row', PlayerRow);
