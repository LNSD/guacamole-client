/* eslint-disable @typescript-eslint/naming-convention */
/**
 * A key event having a corresponding timestamp. This event is non-specific.
 * Its subclasses should be used instead when recording specific key
 * events.
 *
 * @private
 */
export default abstract class KeyEvent {
  /**
   * An arbitrary timestamp in milliseconds, indicating this event's
   * position in time relative to other events.
   */
  public timestamp = new Date().getTime();

  /**
   * Whether the default action of this key event should be prevented.
   */
  public defaultPrevented = false;

  /**
   * The keysym of the key associated with this key event, as determined
   * by a best-effort guess using available event properties and keyboard
   * state.
   */
  public keysym: number | null = null;

  /**
   * Whether the keysym value of this key event is known to be reliable.
   * If false, the keysym may still be valid, but it's only a best guess,
   * and future key events may be a better source of information.
   */
  public reliable = false;

  /**
   * Returns the number of milliseconds elapsed since this event was
   * received.
   *
   * @return  The number of milliseconds elapsed since this
   *          event was received.
   */
  public getAge(): number {
    return new Date().getTime() - this.timestamp;
  }
}
