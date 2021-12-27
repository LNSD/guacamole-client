/**
 * The state of all supported keyboard modifiers.
 */
export default class KeyboardModifierState {
  /**
   * Returns the modifier state applicable to the keyboard event given.
   *
   * @param e - The keyboard event to read.
   *
   * @returns The current state of keyboard modifiers.
   */
  public static fromKeyboardEvent(e: KeyboardEvent): KeyboardModifierState {
    const state = new KeyboardModifierState();

    // Assign states from old flags
    state.shift = e.shiftKey;
    state.ctrl = e.ctrlKey;
    state.alt = e.altKey;
    state.meta = e.metaKey;

    // Use DOM3 getModifierState() for others
    if (e.getModifierState) {
      state.hyper = e.getModifierState('OS')
        || e.getModifierState('Super')
        || e.getModifierState('Hyper')
        || e.getModifierState('Win');
    }

    return state;
  }

  /**
   * Whether shift is currently pressed.
   */
  public shift = false;
  /**
   * Whether ctrl is currently pressed.
   */
  public ctrl = false;
  /**
   * Whether alt is currently pressed.
   */
  public alt = false;
  /**
   * Whether meta (apple key) is currently pressed.
   */
  public meta = false;

  /**
   * Whether hyper (windows key) is currently pressed.
   */
  public hyper = false;
}
