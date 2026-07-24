// ============================================================
// BoardGameSimulator — GameCard Web Component
// ============================================================

export class GameCard extends HTMLElement {
  static observedAttributes = ['suit', 'rank', 'name', 'selected', 'card-id'];

  get isSelected(): boolean {
    return this.hasAttribute('selected');
  }

  connectedCallback(): void {
    this.render();
    this.addEventListener('pointerdown', this.#onPointerDown);
  }

  disconnectedCallback(): void {
    this.removeEventListener('pointerdown', this.#onPointerDown);
  }

  attributeChangedCallback(name: string, _old: string | null, val: string | null): void {
    if (name === 'selected') {
      this.classList.toggle('sel', val === 'true');
    }
  }

  #onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.classList.toggle('sel');
  };

  private render(): void {
    const suit = this.getAttribute('suit') ?? '';
    const name = this.getAttribute('name') ?? '';
    const id = this.getAttribute('card-id') ?? '';

    this.className = 'card-hand';
    this.setAttribute('data-suit', suit);
    this.setAttribute('data-card-id', id);
    this.textContent = name;
  }
}

customElements.define('game-card', GameCard);
