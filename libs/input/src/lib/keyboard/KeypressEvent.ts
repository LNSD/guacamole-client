import KeyEvent from './KeyEvent';
import {keysymFromCharcode} from './KeyboardHelpers';

/**
 * Information related to the pressing of a key, which MUST be
 * associated with a printable character. The presence or absence of any
 * information within this object is browser-dependent.
 */
export default class KeypressEvent extends KeyEvent {
  /**
     * The Unicode codepoint of the character that would be typed by the
     * key pressed.
     */
  public charCode: number;

  /*
   * @private
   * @constructor
   * @augments Keyboard.KeyEvent
   * @param {Number} charCode The Unicode codepoint of the character that
   *                          would be typed by the key pressed.
   */
  constructor(charCode: number) {
    super();
    this.charCode = charCode;

    // Pull keysym from char code
    this.keysym = keysymFromCharcode(charCode);

    // Keypress is always reliable
    this.reliable = true;
  }
}
