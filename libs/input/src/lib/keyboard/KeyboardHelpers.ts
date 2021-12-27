/* eslint-disable @typescript-eslint/naming-convention,no-bitwise */

/**
 * Map of known JavaScript keycodes which do not map to typable characters
 * to their X11 keysym equivalents.
 * @private
 */
const KEYCODE_KEYSYMS: Record<string, number[] | null> = {
  8: [0xFF08], // Backspace
  9: [0xFF09], // Tab
  12: [0xFF0B, 0xFF0B, 0xFF0B, 0xFFB5], // Clear       / KP 5
  13: [0xFF0D], // Enter
  16: [0xFFE1, 0xFFE1, 0xFFE2], // Shift
  17: [0xFFE3, 0xFFE3, 0xFFE4], // Ctrl
  18: [0xFFE9, 0xFFE9, 0xFE03], // Alt
  19: [0xFF13], // Pause/break
  20: [0xFFE5], // Caps lock
  27: [0xFF1B], // Escape
  32: [0x0020], // Space
  33: [0xFF55, 0xFF55, 0xFF55, 0xFFB9], // Page up     / KP 9
  34: [0xFF56, 0xFF56, 0xFF56, 0xFFB3], // Page down   / KP 3
  35: [0xFF57, 0xFF57, 0xFF57, 0xFFB1], // End         / KP 1
  36: [0xFF50, 0xFF50, 0xFF50, 0xFFB7], // Home        / KP 7
  37: [0xFF51, 0xFF51, 0xFF51, 0xFFB4], // Left arrow  / KP 4
  38: [0xFF52, 0xFF52, 0xFF52, 0xFFB8], // Up arrow    / KP 8
  39: [0xFF53, 0xFF53, 0xFF53, 0xFFB6], // Right arrow / KP 6
  40: [0xFF54, 0xFF54, 0xFF54, 0xFFB2], // Down arrow  / KP 2
  45: [0xFF63, 0xFF63, 0xFF63, 0xFFB0], // Insert      / KP 0
  46: [0xFFFF, 0xFFFF, 0xFFFF, 0xFFAE], // Delete      / KP decimal
  91: [0xFFEB], // Left window key (hyper_l)
  92: [0xFF67], // Right window key (menu key?)
  93: null, // Select key
  96: [0xFFB0], // KP 0
  97: [0xFFB1], // KP 1
  98: [0xFFB2], // KP 2
  99: [0xFFB3], // KP 3
  100: [0xFFB4], // KP 4
  101: [0xFFB5], // KP 5
  102: [0xFFB6], // KP 6
  103: [0xFFB7], // KP 7
  104: [0xFFB8], // KP 8
  105: [0xFFB9], // KP 9
  106: [0xFFAA], // KP multiply
  107: [0xFFAB], // KP add
  109: [0xFFAD], // KP subtract
  110: [0xFFAE], // KP decimal
  111: [0xFFAF], // KP divide
  112: [0xFFBE], // F1
  113: [0xFFBF], // F2
  114: [0xFFC0], // F3
  115: [0xFFC1], // F4
  116: [0xFFC2], // F5
  117: [0xFFC3], // F6
  118: [0xFFC4], // F7
  119: [0xFFC5], // F8
  120: [0xFFC6], // F9
  121: [0xFFC7], // F10
  122: [0xFFC8], // F11
  123: [0xFFC9], // F12
  144: [0xFF7F], // Num lock
  145: [0xFF14], // Scroll lock
  225: [0xFE03], // Altgraph (iso_level3_shift)
};

/**
 * Map of known JavaScript keyidentifiers which do not map to typable
 * characters to their unshifted X11 keysym equivalents.
 * @private
 */
const KEYIDENTIFIER_KEYSYM: Record<string, number[] | null> = {
  Again: [0xFF66],
  AllCandidates: [0xFF3D],
  Alphanumeric: [0xFF30],
  Alt: [0xFFE9, 0xFFE9, 0xFE03],
  Attn: [0xFD0E],
  AltGraph: [0xFE03],
  ArrowDown: [0xFF54],
  ArrowLeft: [0xFF51],
  ArrowRight: [0xFF53],
  ArrowUp: [0xFF52],
  Backspace: [0xFF08],
  CapsLock: [0xFFE5],
  Cancel: [0xFF69],
  Clear: [0xFF0B],
  Convert: [0xFF21],
  Copy: [0xFD15],
  Crsel: [0xFD1C],
  CrSel: [0xFD1C],
  CodeInput: [0xFF37],
  Compose: [0xFF20],
  Control: [0xFFE3, 0xFFE3, 0xFFE4],
  ContextMenu: [0xFF67],
  Delete: [0xFFFF],
  Down: [0xFF54],
  End: [0xFF57],
  Enter: [0xFF0D],
  EraseEof: [0xFD06],
  Escape: [0xFF1B],
  Execute: [0xFF62],
  Exsel: [0xFD1D],
  ExSel: [0xFD1D],
  F1: [0xFFBE],
  F2: [0xFFBF],
  F3: [0xFFC0],
  F4: [0xFFC1],
  F5: [0xFFC2],
  F6: [0xFFC3],
  F7: [0xFFC4],
  F8: [0xFFC5],
  F9: [0xFFC6],
  F10: [0xFFC7],
  F11: [0xFFC8],
  F12: [0xFFC9],
  F13: [0xFFCA],
  F14: [0xFFCB],
  F15: [0xFFCC],
  F16: [0xFFCD],
  F17: [0xFFCE],
  F18: [0xFFCF],
  F19: [0xFFD0],
  F20: [0xFFD1],
  F21: [0xFFD2],
  F22: [0xFFD3],
  F23: [0xFFD4],
  F24: [0xFFD5],
  Find: [0xFF68],
  GroupFirst: [0xFE0C],
  GroupLast: [0xFE0E],
  GroupNext: [0xFE08],
  GroupPrevious: [0xFE0A],
  FullWidth: null,
  HalfWidth: null,
  HangulMode: [0xFF31],
  Hankaku: [0xFF29],
  HanjaMode: [0xFF34],
  Help: [0xFF6A],
  Hiragana: [0xFF25],
  HiraganaKatakana: [0xFF27],
  Home: [0xFF50],
  Hyper: [0xFFED, 0xFFED, 0xFFEE],
  Insert: [0xFF63],
  JapaneseHiragana: [0xFF25],
  JapaneseKatakana: [0xFF26],
  JapaneseRomaji: [0xFF24],
  JunjaMode: [0xFF38],
  KanaMode: [0xFF2D],
  KanjiMode: [0xFF21],
  Katakana: [0xFF26],
  Left: [0xFF51],
  Meta: [0xFFE7, 0xFFE7, 0xFFE8],
  ModeChange: [0xFF7E],
  NumLock: [0xFF7F],
  PageDown: [0xFF56],
  PageUp: [0xFF55],
  Pause: [0xFF13],
  Play: [0xFD16],
  PreviousCandidate: [0xFF3E],
  PrintScreen: [0xFF61],
  Redo: [0xFF66],
  Right: [0xFF53],
  RomanCharacters: null,
  Scroll: [0xFF14],
  Select: [0xFF60],
  Separator: [0xFFAC],
  Shift: [0xFFE1, 0xFFE1, 0xFFE2],
  SingleCandidate: [0xFF3C],
  Super: [0xFFEB, 0xFFEB, 0xFFEC],
  Tab: [0xFF09],
  UIKeyInputDownArrow: [0xFF54],
  UIKeyInputEscape: [0xFF1B],
  UIKeyInputLeftArrow: [0xFF51],
  UIKeyInputRightArrow: [0xFF53],
  UIKeyInputUpArrow: [0xFF52],
  Up: [0xFF52],
  Undo: [0xFF65],
  Win: [0xFFEB],
  Zenkaku: [0xFF28],
  ZenkakuHankaku: [0xFF2A],
};

/**
 * Given an array of keysyms indexed by location, returns the keysym
 * for the given location, or the keysym for the standard location if
 * undefined.
 *
 * @private
 * @param keysyms - An array of keysyms, where the index of the keysym in the
 *                  array is the location value.
 * @param location - The location on the keyboard corresponding to the key
 *                   pressed, as defined at:
 *                   http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
 */
export function getKeysym(keysyms: number[] | null, location: number): number | null {
  if (!keysyms) {
    return null;
  }

  return keysyms[location] ?? keysyms[0];
}

/**
 * Returns true if the given keysym corresponds to a printable character,
 * false otherwise.
 *
 * @param keysym - The keysym to check.
 *
 * @returns true if the given keysym corresponds to a printable character,
 *          false otherwise.
 */
export function isPrintable(keysym: number): boolean {
  // Keysyms with Unicode equivalents are printable
  return (keysym >= 0x00 && keysym <= 0xFF)
    || (keysym & 0xFFFF0000) === 0x01000000;
}

export function keysymFromKeyIdentifier(identifier: string, location: number, shifted = false): number | null {
  if (!identifier) {
    return null;
  }

  let typedCharacter: string;

  // If identifier is U+xxxx, decode Unicode character
  const unicodePrefixLocation = identifier.indexOf('U+');
  if (unicodePrefixLocation >= 0) {
    const hex = identifier.substring(unicodePrefixLocation + 2);
    typedCharacter = String.fromCharCode(parseInt(hex, 16));
  } else if (identifier.length === 1 && location !== 3) {
    // If single character and not keypad, use that as typed character
    typedCharacter = identifier;
  } else {
    // Otherwise, look up corresponding keysym
    return getKeysym(KEYIDENTIFIER_KEYSYM[identifier], location);
  }

  // Alter case if necessary
  if (shifted) {
    typedCharacter = typedCharacter.toUpperCase();
  } else {
    typedCharacter = typedCharacter.toLowerCase();
  }

  // Get codepoint
  const codepoint = typedCharacter.charCodeAt(0);
  return keysymFromCharcode(codepoint);
}

export function isControlCharacter(codepoint: number) {
  return codepoint <= 0x1F || (codepoint >= 0x7F && codepoint <= 0x9F);
}

export function keysymFromCharcode(codepoint: number): number | null {
  // Keysyms for control characters
  if (isControlCharacter(codepoint)) {
    return 0xFF00 | codepoint;
  }

  // Keysyms for ASCII chars
  if (codepoint >= 0x0000 && codepoint <= 0x00FF) {
    return codepoint;
  }

  // Keysyms for Unicode
  if (codepoint >= 0x0100 && codepoint <= 0x10FFFF) {
    return 0x01000000 | codepoint;
  }

  return null;
}

export function keysymFromKeycode(keyCode: number | null, location: number): number | null {
  if (!keyCode) {
    return null;
  }

  return getKeysym(KEYCODE_KEYSYMS[keyCode], location);
}

/**
 * Heuristically detects if the legacy keyIdentifier property of
 * a keydown/keyup event looks incorrectly derived. Chrome, and
 * presumably others, will produce the keyIdentifier by assuming
 * the keyCode is the Unicode codepoint for that key. This is not
 * correct in all cases.
 *
 * @private
 * @param keyCode - The keyCode from a browser keydown/keyup event.
 * @param keyIdentifier - The legacy keyIdentifier from a browser keydown/keyup
 *                        event.
 *
 * @returns true if the keyIdentifier looks sane, false if the keyIdentifier
 *          appears incorrectly derived or is missing entirely.
 */
export function keyIdentifierSane(keyCode: number, keyIdentifier: string): boolean {
  // Missing identifier is not sane
  if (!keyIdentifier) {
    return false;
  }

  // Assume non-Unicode keyIdentifier values are sane
  const unicodePrefixLocation = keyIdentifier.indexOf('U+');
  if (unicodePrefixLocation === -1) {
    return true;
  }

  // If the Unicode codepoint isn't identical to the keyCode,
  // then the identifier is likely correct
  const codepoint = parseInt(keyIdentifier.substring(unicodePrefixLocation + 2), 16);
  if (keyCode !== codepoint) {
    return true;
  }

  // The keyCodes for A-Z and 0-9 are actually identical to their
  // Unicode codepoints
  if ((keyCode >= 65 && keyCode <= 90) || (keyCode >= 48 && keyCode <= 57)) {
    return true;
  }

  // The keyIdentifier does NOT appear sane
  return false;
}
