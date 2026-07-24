// ============================================================
// BoardGameSimulator — BaseView 基类
// ============================================================
import { bus } from '../utils/EventBus';

export abstract class BaseView {
  protected el: HTMLElement;
  protected parent: HTMLElement;

  constructor(parent: HTMLElement) {
    this.parent = parent;
    this.el = this.createEl();
  }

  /** 获取根元素，未创建时自动调用 createEl */
  get root(): HTMLElement {
    return this.el;
  }

  /** 子类实现：创建并返回根 DOM 元素 */
  protected abstract createEl(): HTMLElement;

  /** 将视图挂载到父容器 */
  mount(): void {
    this.parent.innerHTML = '';
    this.parent.appendChild(this.el);
    this.afterMount();
  }

  /** 挂载后的回调 */
  protected afterMount(): void {}

  /** 销毁视图，清理事件 */
  destroy(): void {
    this.el.remove();
  }

  /** 触发事件总线 */
  protected emit(name: string, ...args: any[]): void {
    bus.emit(name, ...args);
  }

  /** 显示 toast */
  protected toast(msg: string): void {
    bus.emit('app:toast', msg);
  }
}
