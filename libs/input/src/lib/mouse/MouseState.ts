/**
 * Simple container for properties describing the state of a mouse.
 */
export default class MouseState {
  /**
   * The current X position of the mouse pointer.
   */
  public x: number;
  /**
   * The current Y position of the mouse pointer.
   */
  public y: number;
  /**
   * Whether the left mouse button is currently pressed.
   */
  public left: boolean;
  /**
   * Whether the middle mouse button is currently pressed.
   */
  public middle: boolean;
  /**
   * Whether the right mouse button is currently pressed.
   */
  public right: boolean;
  /**
   * Whether the up mouse button is currently pressed. This is the fourth
   * mouse button, associated with upward scrolling of the mouse scroll
   * wheel.
   */
  public up: boolean;
  /**
   * Whether the down mouse button is currently pressed. This is the fifth
   * mouse button, associated with downward scrolling of the mouse scroll
   * wheel.
   */
  public down: boolean;

  /*
   * @constructor
   * @param x - The X position of the mouse pointer in pixels.
   * @param y - The Y position of the mouse pointer in pixels.
   * @param left - Whether the left mouse button is pressed.
   * @param middle - Whether the middle mouse button is pressed.
   * @param right - Whether the right mouse button is pressed.
   * @param up - Whether the up mouse button is pressed (the fourth
   *             button, usually part of a scroll wheel).
   * @param down - Whether the down mouse button is pressed (the fifth
   *               button, usually part of a scroll wheel).
   */
  constructor(x: number, y: number, left: boolean, middle: boolean, right: boolean, up: boolean, down: boolean) {
    this.x = x;
    this.y = y;
    this.left = left;
    this.middle = middle;
    this.right = right;
    this.up = up;
    this.down = down;
  }

  /**
   * Updates the position represented within this state object by the given
   * element and clientX/clientY coordinates (commonly available within event
   * objects). Position is translated from clientX/clientY (relative to
   * viewport) to element-relative coordinates.
   *
   * @param element - The element the coordinates should be relative to.
   * @param clientX - The X coordinate to translate, viewport-relative.
   * @param clientY - The Y coordinate to translate, viewport-relative.
   */
  public fromClientPosition(element: HTMLElement, clientX: number, clientY: number) {
    this.x = clientX - element.offsetLeft;
    this.y = clientY - element.offsetTop;

    // This is all JUST so we can get the mouse position within the element
    let parent: HTMLElement | null = element.offsetParent as HTMLElement;
    while (parent && parent !== document.body) {
      this.x -= parent.offsetLeft - parent.scrollLeft;
      this.y -= parent.offsetTop - parent.scrollTop;

      parent = parent.offsetParent as HTMLElement;
    }

    // Element ultimately depends on positioning within document body,
    // take document scroll into account.
    if (parent) {
      const documentScrollLeft = document.body.scrollLeft || document.documentElement.scrollLeft;
      const documentScrollTop = document.body.scrollTop || document.documentElement.scrollTop;

      this.x -= parent.offsetLeft - documentScrollLeft;
      this.y -= parent.offsetTop - documentScrollTop;
    }
  }
}

