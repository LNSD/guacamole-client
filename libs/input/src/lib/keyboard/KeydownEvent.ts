import KeyEvent from './KeyEvent';
import {
  isPrintable,
  keyIdentifierSane,
  keysymFromKeycode,
  keysymFromKeyIdentifier,
} from './KeyboardHelpers';

/**
 * Information related to the pressing of a key, which need not be a key
 * associated with a printable character. The presence or absence of any
 * information within this object is browser-dependent.
 */
export default class KeydownEvent extends KeyEvent {
  /**
   * The JavaScript key code of the key pressed.
   */
  public keyCode: number;

  /**
   * The legacy DOM3 "keyIdentifier" of the key pressed, as defined at:
   * http://www.w3.org/TR/2009/WD-DOM-Level-3-Events-20090908/#events-Events-KeyboardEvent
   */
  public keyIdentifier: string;

  /**
   * The standard name of the key pressed, as defined at:
   * http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
   */
  public key: string;

  /**
   * The location on the keyboard corresponding to the key pressed, as
   * defined at:
   * http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
   */
  public location: number;

  /**
   * Whether the keyup following this keydown event is known to be
   * reliable. If false, we cannot rely on the keyup event to occur.
   */
  public keyupReliable: boolean;

  /* @private
   * @constructor
   * @augments Keyboard.KeyEvent
   * @param {Number} keyCode The JavaScript key code of the key pressed.
   * @param {String} keyIdentifier The legacy DOM3 "keyIdentifier" of the key
   *                               pressed, as defined at:
   *                               http://www.w3.org/TR/2009/WD-DOM-Level-3-Events-20090908/#events-Events-KeyboardEvent
   * @param {String} key The standard name of the key pressed, as defined at:
   *                     http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
   * @param {Number} location The location on the keyboard corresponding to
   *                          the key pressed, as defined at:
   *                          http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
   */
  constructor(
    keyboard: any /** TODO Keyboard **/,
    keyCode: number,
    keyIdentifier: string,
    key: string,
    location: number,
  ) {
    super();

    this.keyCode = keyCode;
    this.keyIdentifier = keyIdentifier;
    this.key = key;
    this.location = location;

    this.keysym =
      keysymFromKeyIdentifier(key, location) ??
      keysymFromKeycode(keyCode, location);
    this.keyupReliable = !keyboard.quirks.keyupUnreliable;

    // DOM3 and keyCode are reliable sources if the corresponding key is
    // not a printable key
    if (this.keysym && !isPrintable(this.keysym)) {
      this.reliable = true;
    }

    // Use legacy keyIdentifier as a last resort, if it looks sane
    if (!this.keysym && keyIdentifierSane(keyCode, keyIdentifier)) {
      this.keysym = keysymFromKeyIdentifier(
        keyIdentifier,
        location,
        keyboard.modifiers.shift,
      );
    }

    // If a key is pressed while meta is held down, the keyup will
    // never be sent in Chrome (bug #108404)
    if (
      keyboard.modifiers.meta &&
      this.keysym !== 0xffe7 &&
      this.keysym !== 0xffe8
    ) {
      this.keyupReliable = false;
    } else if (
      this.keysym === 0xffe5 &&
      keyboard.quirks.capsLockKeyupUnreliable
    ) {
      // We cannot rely on receiving keyup for Caps Lock on certain platforms
      this.keyupReliable = false;
    }

    // Determine whether default action for Alt+combinations must be prevented
    const preventAlt =
      !keyboard.modifiers.ctrl && !keyboard.quirks.altIsTypableOnly;

    // Determine whether default action for Ctrl+combinations must be prevented
    const preventCtrl = !keyboard.modifiers.alt;

    // We must rely on the (potentially buggy) keyIdentifier if preventing
    // the default action is important
    if (
      (preventCtrl && keyboard.modifiers.ctrl) ||
      (preventAlt && keyboard.modifiers.alt) ||
      keyboard.modifiers.meta ||
      keyboard.modifiers.hyper
    ) {
      this.reliable = true;
    }

    // Record most recently known keysym by associated key code
    keyboard.recentKeysym[keyCode] = this.keysym;
  }
}
