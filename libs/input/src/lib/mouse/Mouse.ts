/* eslint-disable @typescript-eslint/naming-convention */
import MouseState from './MouseState';

export type OnMouseCallback = (state: MouseState) => void;
export type OnMouseOutCallback = () => void;

/**
 * The number of pixels to scroll per line.
 */
const PIXELS_PER_LINE = 18;

/**
 * The number of pixels to scroll per page.
 */
const PIXELS_PER_PAGE = PIXELS_PER_LINE * 16;

/**
 * Whether the browser supports CSS3 cursor styling, including hotspot
 * coordinates.
 *
 * @private
 */
const CSS3_CURSOR_SUPPORTED = (function () {
  const div = document.createElement('div');

  // If no cursor property at all, then no support
  if (!('cursor' in div.style)) {
    return false;
  }

  try {
    // Apply simple 1x1 PNG
    div.style.cursor =
      'url(data:image/png;base64,' +
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' +
      'AQMAAAAl21bKAAAAA1BMVEX///+nxBvI' +
      'AAAACklEQVQI12NgAAAAAgAB4iG8MwAA' +
      'AABJRU5ErkJggg==) 0 0, auto';
  } catch (_: unknown) {
    return false;
  }

  // Verify cursor property is set to URL with hotspot
  return /\burl\([^()]*\)\s+0\s+0\b/.test(div.style.cursor || '');
})();

/**
 * Provides cross-browser mouse events for a given element. The events of
 * the given element are automatically populated with handlers that translate
 * mouse events into a non-browser-specific event provided by the
 * Mouse instance.
 */
export default class Mouse {
  private static cancelEvent(e: Event) {
    e.stopPropagation();
    if (e.preventDefault) {
      e.preventDefault();
    }

    e.returnValue = false;
  }

  /**
   * The number of mousemove events to require before re-enabling mouse
   * event handling after receiving a touch event.
   */
  public touchMouseThreshold = 3;

  /**
   * The minimum amount of pixels scrolled required for a single scroll button
   * click.
   */
  public scrollThreshold = 53;

  /**
   * The current mouse state. The properties of this state are updated when
   * mouse events fire. This state object is also passed in as a parameter to
   * the handler of any mouse events.
   */
  public currentState = new MouseState(0, 0, false, false, false, false, false);

  /**
   * Fired whenever the user presses a mouse button down over the element
   * associated with this Mouse.
   *
   * @event
   * @param state - The current mouse state.
   */
  public onmousedown: OnMouseCallback | null = null;

  /**
   * Fired whenever the user releases a mouse button down over the element
   * associated with this Mouse.
   *
   * @event
   * @param state - The current mouse state.
   */
  public onmouseup: OnMouseCallback | null = null;

  /**
   * Fired whenever the user moves the mouse over the element associated with
   * this Mouse.
   *
   * @event
   * @param state - The current mouse state.
   */
  public onmousemove: OnMouseCallback | null = null;

  /**
   * Fired whenever the mouse leaves the boundaries of the element associated
   * with this Mouse.
   *
   * @event
   */
  public onmouseout: OnMouseOutCallback | null = null;

  /**
   * Counter of mouse events to ignore. This decremented by mousemove, and
   * while non-zero, mouse events will have no effect.
   * @private
   */
  private ignoreMouse = 0;

  /**
   * Cumulative scroll delta amount. This value is accumulated through scroll
   * events and results in scroll button clicks if it exceeds a certain
   * threshold.
   *
   * @private
   */
  private scrollDelta = 0;

  /*
   * @constructor
   * @param {Element} element The Element to use to provide mouse events.
   */
  constructor(private readonly element: HTMLElement) {
    // Block context menu so right-click gets sent properly
    element.addEventListener(
      'contextmenu',
      (e) => {
        Mouse.cancelEvent(e);
      },
      false,
    );

    element.addEventListener(
      'mousemove',
      (e) => {
        Mouse.cancelEvent(e);

        // If ignoring events, decrement counter
        if (this.ignoreMouse) {
          this.ignoreMouse--;
          return;
        }

        this.currentState.fromClientPosition(element, e.clientX, e.clientY);

        if (this.onmousemove) {
          this.onmousemove(this.currentState);
        }
      },
      false,
    );

    element.addEventListener(
      'mousedown',
      (e) => {
        Mouse.cancelEvent(e);

        // Do not handle if ignoring events
        if (this.ignoreMouse) {
          return;
        }

        // eslint-disable-next-line default-case
        switch (e.button) {
          case 0:
            this.currentState.left = true;
            break;
          case 1:
            this.currentState.middle = true;
            break;
          case 2:
            this.currentState.right = true;
            break;
        }

        if (this.onmousedown) {
          this.onmousedown(this.currentState);
        }
      },
      false,
    );

    element.addEventListener(
      'mouseup',
      (e: MouseEvent) => {
        Mouse.cancelEvent(e);

        // Do not handle if ignoring events
        if (this.ignoreMouse) {
          return;
        }

        // eslint-disable-next-line default-case
        switch (e.button) {
          case 0:
            this.currentState.left = false;
            break;
          case 1:
            this.currentState.middle = false;
            break;
          case 2:
            this.currentState.right = false;
            break;
        }

        if (this.onmouseup) {
          this.onmouseup(this.currentState);
        }
      },
      false,
    );

    element.addEventListener(
      'mouseout',
      (e: MouseEvent) => {
        // TODO Review this
        // // Get parent of the element the mouse pointer is leaving
        // if (!e) {
        //   e = window.event;
        // }

        // Check that mouseout is due to actually LEAVING the element
        let target: HTMLElement = e.relatedTarget as HTMLElement;
        while (target) {
          if (target === element) {
            return;
          }

          target = target.parentNode as HTMLElement;
        }

        Mouse.cancelEvent(e);

        // Release all buttons
        if (
          this.currentState.left ||
          this.currentState.middle ||
          this.currentState.right
        ) {
          this.currentState.left = false;
          this.currentState.middle = false;
          this.currentState.right = false;

          if (this.onmouseup) {
            this.onmouseup(this.currentState);
          }
        }

        // Fire onmouseout event
        if (this.onmouseout) {
          this.onmouseout();
        }
      },
      false,
    );

    // Override selection on mouse event element.
    element.addEventListener(
      'selectstart',
      (e) => {
        Mouse.cancelEvent(e);
      },
      false,
    );

    element.addEventListener('touchmove', this.ignorePendingMouseEvents, false);
    element.addEventListener(
      'touchstart',
      this.ignorePendingMouseEvents,
      false,
    );
    element.addEventListener('touchend', this.ignorePendingMouseEvents, false);

    // Scroll wheel support
    element.addEventListener('DOMMouseScroll', this.mousewheelHandler, false);
    element.addEventListener('mousewheel', this.mousewheelHandler, false);
    element.addEventListener('wheel', this.mousewheelHandler, false);
  }

  /**
   * Changes the local mouse cursor to the given canvas, having the given
   * hotspot coordinates. This affects styling of the element backing this
   * Mouse only, and may fail depending on browser support for
   * setting the mouse cursor.
   *
   * If setting the local cursor is desired, it is up to the implementation
   * to do something else, such as use the software cursor built into
   * Display, if the local cursor cannot be set.
   *
   * @param canvas - The cursor image.
   * @param x - The X-coordinate of the cursor hotspot.
   * @param y - The Y-coordinate of the cursor hotspot.
   * @return true if the cursor was successfully set, false if the
   *         cursor could not be set for any reason.
   */
  public setCursor(canvas: HTMLCanvasElement, x: number, y: number): boolean {
    // Attempt to set via CSS3 cursor styling
    if (CSS3_CURSOR_SUPPORTED) {
      const dataURL = canvas.toDataURL('image/png');
      this.element.style.cursor = `url(${dataURL}) ${x} ${y}, auto`;
      return true;
    }

    // Otherwise, setting cursor failed
    return false;
  }

  // Ignore all pending mouse events when touch events are the apparent source
  private readonly ignorePendingMouseEvents = () => {
    this.ignoreMouse = this.touchMouseThreshold;
  };

  // Scroll wheel support
  private readonly mousewheelHandler = (e: any) => {
    // Determine approximate scroll amount (in pixels)
    let delta = Number(e.deltaY || -e.wheelDeltaY || -e.wheelDelta);

    // If successfully retrieved scroll amount, convert to pixels if not
    // already in pixels
    if (delta) {
      // Convert to pixels if delta was lines
      if (e.deltaMode === 1) {
        delta = e.deltaY * PIXELS_PER_LINE;
      } else if (e.deltaMode === 2) {
        // Convert to pixels if delta was pages
        delta = e.deltaY * PIXELS_PER_PAGE;
      }
    } else {
      // Otherwise, assume legacy mousewheel event and line scrolling
      delta = e.detail * PIXELS_PER_LINE;
    }

    // Update overall delta
    this.scrollDelta += delta;

    // Up
    if (this.scrollDelta <= -this.scrollThreshold) {
      // Repeatedly click the up button until insufficient delta remains
      do {
        if (this.onmousedown) {
          this.currentState.up = true;
          this.onmousedown(this.currentState);
        }

        if (this.onmouseup) {
          this.currentState.up = false;
          this.onmouseup(this.currentState);
        }

        this.scrollDelta += this.scrollThreshold;
      } while (this.scrollDelta <= -this.scrollThreshold);

      // Reset delta
      this.scrollDelta = 0;
    }

    // Down
    if (this.scrollDelta >= this.scrollThreshold) {
      // Repeatedly click the down button until insufficient delta remains
      do {
        if (this.onmousedown) {
          this.currentState.down = true;
          this.onmousedown(this.currentState);
        }

        if (this.onmouseup) {
          this.currentState.down = false;
          this.onmouseup(this.currentState);
        }

        this.scrollDelta -= this.scrollThreshold;
      } while (this.scrollDelta >= this.scrollThreshold);

      // Reset delta
      this.scrollDelta = 0;
    }

    Mouse.cancelEvent(e);
  };
}
