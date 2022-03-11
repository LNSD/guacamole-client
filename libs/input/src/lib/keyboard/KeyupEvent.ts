import KeyEvent from './KeyEvent';
import { keysymFromKeycode, keysymFromKeyIdentifier } from './KeyboardHelpers';

/**
 * Information related to the pressing of a key, which need not be a key
 * associated with a printable character. The presence or absence of any
 * information within this object is browser-dependent.
 */
export default class KeyupEvent extends KeyEvent {
  /**
   * The JavaScript key code of the key released.
   */
  public keyCode: number;
  /**
   * The legacy DOM3 "keyIdentifier" of the key released, as defined at:
   * http://www.w3.org/TR/2009/WD-DOM-Level-3-Events-20090908/#events-Events-KeyboardEvent
   *
   * @type {String}
   */
  public keyIdentifier: string;
  /**
   * The standard name of the key released, as defined at:
   * http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
   */
  public key: string;
  /**
   * The location on the keyboard corresponding to the key released, as
   * defined at:
   * http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
   */
  public location: number;

  /*
   * @private
   * @constructor
   * @augments Keyboard.KeyEvent
   * @param {Number} keyCode The JavaScript key code of the key released.
   * @param {String} keyIdentifier The legacy DOM3 "keyIdentifier" of the key
   *                               released, as defined at:
   *                               http://www.w3.org/TR/2009/WD-DOM-Level-3-Events-20090908/#events-Events-KeyboardEvent
   * @param {String} key The standard name of the key released, as defined at:
   *                     http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
   * @param {Number} location The location on the keyboard corresponding to
   *                          the key released, as defined at:
   *                          http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
   */
  constructor(
    keyboard: any /* TODO Keyboard */,
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

    // If key is known from keyCode or DOM3 alone, use that
    this.keysym =
      keysymFromKeycode(keyCode, location) ??
      keysymFromKeyIdentifier(key, location); // KeyCode is still more reliable for keyup when dead keys are in use

    // Fall back to the most recently pressed keysym associated with the
    // keyCode if the inferred key doesn't seem to actually be pressed
    if (this.keysym !== null && !keyboard.pressed[this.keysym]) {
      // TODO Review the following lint suppression
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      this.keysym = keyboard.recentKeysym[keyCode] ?? this.keysym;
    }

    // Keyup is as reliable as it will ever be
    this.reliable = true;
  }
}
