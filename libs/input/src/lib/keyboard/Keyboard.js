/* eslint-disable no-bitwise */
/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import KeyboardModifierState from './KeyboardModifierState';
import {keysymFromCharcode} from './KeyboardHelpers';
import KeydownEvent from './KeydownEvent';
import KeypressEvent from './KeypressEvent';
import KeyupEvent from './KeyupEvent';

/**
 * All keysyms which should not repeat when held down.
 * @private
 */
const NO_REPEAT = {
  0xFE03: true, // ISO Level 3 Shift (AltGr)
  0xFFE1: true, // Left shift
  0xFFE2: true, // Right shift
  0xFFE3: true, // Left ctrl
  0xFFE4: true, // Right ctrl
  0xFFE5: true, // Caps Lock
  0xFFE7: true, // Left meta
  0xFFE8: true, // Right meta
  0xFFE9: true, // Left alt
  0xFFEA: true, // Right alt
  0xFFEB: true, // Left hyper
  0xFFEC: true, // Right hyper
};

/**
 * Provides cross-browser and cross-keyboard keyboard for a specific element.
 * Browser and keyboard layout variation is abstracted away, providing events
 * which represent keys as their corresponding X11 keysym.
 *
 * @constructor
 * @param {Element|Document} [element]
 *    The Element to use to provide keyboard events. If omitted, at least one
 *    Element must be manually provided through the listenTo() function for
 *    the Keyboard instance to have any effect.
 */
const Keyboard = function (element) {
  /**
   * Reference to this Keyboard.
   * @private
   */
  const keyboard = this;

  /**
   * An integer value which uniquely identifies this Keyboard
   * instance with respect to other Keyboard instances.
   *
   * @private
   * @type {Number}
   */
  const guacKeyboardID = Keyboard._nextId++;

  /**
   * The name of the property which is added to event objects via markEvent()
   * to note that they have already been handled by this Keyboard.
   *
   * @private
   * @constant
   * @type {String}
   */
  const EVENT_MARKER = '_GUAC_KEYBOARD_HANDLED_BY_' + guacKeyboardID;

  /**
   * Fired whenever the user presses a key with the element associated
   * with this Keyboard in focus.
   *
   * @event
   * @param {Number} keysym The keysym of the key being pressed.
   * @return {Boolean} true if the key event should be allowed through to the
   *                   browser, false otherwise.
   */
  this.onkeydown = null;

  /**
   * Fired whenever the user releases a key with the element associated
   * with this Keyboard in focus.
   *
   * @event
   * @param {Number} keysym The keysym of the key being released.
   */
  this.onkeyup = null;

  /**
   * Set of known platform-specific or browser-specific quirks which must be
   * accounted for to properly interpret key events, even if the only way to
   * reliably detect that quirk is to platform/browser-sniff.
   *
   * @private
   * @type {Object.<String, Boolean>}
   */
  this.quirks = {

    /**
     * Whether keyup events are universally unreliable.
     *
     * @type {Boolean}
     */
    keyupUnreliable: false,

    /**
     * Whether the Alt key is actually a modifier for typable keys and is
     * thus never used for keyboard shortcuts.
     *
     * @type {Boolean}
     */
    altIsTypableOnly: false,

    /**
     * Whether we can rely on receiving a keyup event for the Caps Lock
     * key.
     *
     * @type {Boolean}
     */
    capsLockKeyupUnreliable: false,

  };

  // Set quirk flags depending on platform/browser, if such information is
  // available
  if (navigator && navigator.platform) {
    // All keyup events are unreliable on iOS (sadly)
    if (navigator.platform.match(/ipad|iphone|ipod/i)) {
      keyboard.quirks.keyupUnreliable = true;
    } else if (navigator.platform.match(/^mac/i)) {
      // The Alt key on Mac is never used for keyboard shortcuts, and the
      // Caps Lock key never dispatches keyup events
      keyboard.quirks.altIsTypableOnly = true;
      keyboard.quirks.capsLockKeyupUnreliable = true;
    }
  }

  /**
   * An array of recorded events, which can be instances of the private
   * KeydownEvent, KeypressEvent, and KeyupEvent classes.
   *
   * @private
   * @type {KeyEvent[]}
   */
  let eventLog = [];

  /**
   * All modifiers and their states.
   */
  this.modifiers = new KeyboardModifierState();

  /**
   * The state of every key, indexed by keysym. If a particular key is
   * pressed, the value of pressed for that keysym will be true. If a key
   * is not currently pressed, it will not be defined.
   */
  this.pressed = {};

  /**
   * The state of every key, indexed by keysym, for strictly those keys whose
   * status has been indirectly determined thorugh observation of other key
   * events. If a particular key is implicitly pressed, the value of
   * implicitlyPressed for that keysym will be true. If a key
   * is not currently implicitly pressed (the key is not pressed OR the state
   * of the key is explicitly known), it will not be defined.
   *
   * @private
   * @tyle {Object.<Number, Boolean>}
   */
  const implicitlyPressed = {};

  /**
   * The last result of calling the onkeydown handler for each key, indexed
   * by keysym. This is used to prevent/allow default actions for key events,
   * even when the onkeydown handler cannot be called again because the key
   * is (theoretically) still pressed.
   *
   * @private
   */
  const lastKeydownResult = {};

  /**
   * The keysym most recently associated with a given keycode when keydown
   * fired. This object maps keycodes to keysyms.
   *
   * @private
   * @type {Object.<Number, Number>}
   */
  this.recentKeysym = {};

  /**
   * Timeout before key repeat starts.
   * @private
   */
  let keyRepeatTimeout = null;

  /**
   * Interval which presses and releases the last key pressed while that
   * key is still being held down.
   * @private
   */
  let keyRepeatInterval = null;

  /**
   * Marks a key as pressed, firing the keydown event if registered. Key
   * repeat for the pressed key will start after a delay if that key is
   * not a modifier. The return value of this function depends on the
   * return value of the keydown event handler, if any.
   *
   * @param {Number} keysym The keysym of the key to press.
   * @return {Boolean} true if event should NOT be canceled, false otherwise.
   */
  this.press = function (keysym) {
    // Don't bother with pressing the key if the key is unknown
    if (keysym === null) {
      return;
    }

    // Only press if released
    if (!keyboard.pressed[keysym]) {
      // Mark key as pressed
      keyboard.pressed[keysym] = true;

      // Send key event
      if (keyboard.onkeydown) {
        const result = keyboard.onkeydown(keysym);
        lastKeydownResult[keysym] = result;

        // Stop any current repeat
        window.clearTimeout(keyRepeatTimeout);
        window.clearInterval(keyRepeatInterval);

        // Repeat after a delay as long as pressed
        if (!NO_REPEAT[keysym]) {
          keyRepeatTimeout = window.setTimeout(() => {
            keyRepeatInterval = window.setInterval(() => {
              keyboard.onkeyup(keysym);
              keyboard.onkeydown(keysym);
            }, 50);
          }, 500);
        }

        return result;
      }
    }

    // Return the last keydown result by default, resort to false if unknown
    return lastKeydownResult[keysym] || false;
  };

  /**
   * Marks a key as released, firing the keyup event if registered.
   *
   * @param {Number} keysym The keysym of the key to release.
   */
  this.release = function (keysym) {
    // Only release if pressed
    if (keyboard.pressed[keysym]) {
      // Mark key as released
      delete keyboard.pressed[keysym];
      delete implicitlyPressed[keysym];

      // Stop repeat
      window.clearTimeout(keyRepeatTimeout);
      window.clearInterval(keyRepeatInterval);

      // Send key event
      if (keysym !== null && keyboard.onkeyup) {
        keyboard.onkeyup(keysym);
      }
    }
  };

  /**
   * Presses and releases the keys necessary to type the given string of
   * text.
   *
   * @param {String} str
   *     The string to type.
   */
  this.type = function (str) {
    // Press/release the key corresponding to each character in the string
    for (let i = 0; i < str.length; i++) {
      // Determine keysym of current character
      const codepoint = str.codePointAt ? str.codePointAt(i) : str.charCodeAt(i);
      const keysym = keysymFromCharcode(codepoint);

      // Press and release key for current character
      keyboard.press(keysym);
      keyboard.release(keysym);
    }
  };

  /**
   * Resets the state of this keyboard, releasing all keys, and firing keyup
   * events for each released key.
   */
  this.reset = function () {
    // Release all pressed keys
    for (const keysym in keyboard.pressed) {
      keyboard.release(parseInt(keysym, 10));
    }

    // Clear event log
    eventLog = [];
  };

  /**
   * Given the remote and local state of a particular key, resynchronizes the
   * remote state of that key with the local state through pressing or
   * releasing keysyms.
   *
   * @private
   * @param {Boolean} remoteState
   *     Whether the key is currently pressed remotely.
   *
   * @param {Boolean} localState
   *     Whether the key is currently pressed remotely locally. If the state
   *     of the key is not known, this may be undefined.
   *
   * @param {Number[]} keysyms
   *     The keysyms which represent the key being updated.
   *
   * @param {KeyEvent} keyEvent
   *     Guacamole's current best interpretation of the key event being
   *     processed.
   */
  const updateModifierState = function (remoteState, localState, keysyms, keyEvent) {
    let i;

    // Do not trust changes in modifier state for events directly involving
    // that modifier: (1) the flag may erroneously be cleared despite
    // another version of the same key still being held and (2) the change
    // in flag may be due to the current event being processed, thus
    // updating things here is at best redundant and at worst incorrect
    if (keysyms.indexOf(keyEvent.keysym) !== -1) {
      return;
    }

    // Release all related keys if modifier is implicitly released
    if (remoteState && localState === false) {
      for (i = 0; i < keysyms.length; i++) {
        keyboard.release(keysyms[i]);
      }
    } else if (!remoteState && localState) {
      // Press if modifier is implicitly pressed
      // Verify that modifier flag isn't already pressed or already set
      // due to another version of the same key being held down
      for (i = 0; i < keysyms.length; i++) {
        if (keyboard.pressed[keysyms[i]]) {
          return;
        }
      }

      // Mark as implicitly pressed only if there is other information
      // within the key event relating to a different key. Some
      // platforms, such as iOS, will send essentially empty key events
      // for modifier keys, using only the modifier flags to signal the
      // identity of the key.
      const keysym = keysyms[0];
      if (keyEvent.keysym) {
        implicitlyPressed[keysym] = true;
      }

      keyboard.press(keysym);
    }
  };

  /**
   * Given a keyboard event, updates the local modifier state and remote
   * key state based on the modifier flags within the event. This function
   * pays no attention to keycodes.
   *
   * @private
   * @param {KeyboardEvent} e
   *     The keyboard event containing the flags to update.
   *
   * @param {KeyEvent} keyEvent
   *     Guacamole's current best interpretation of the key event being
   *     processed.
   */
  const syncModifierStates = function (e, keyEvent) {
    // Get state
    const state = KeyboardModifierState.fromKeyboardEvent(e);

    // Resync state of alt
    updateModifierState(keyboard.modifiers.alt, state.alt, [
      0xFFE9, // Left alt
      0xFFEA, // Right alt
      0xFE03, // AltGr
    ], keyEvent);

    // Resync state of shift
    updateModifierState(keyboard.modifiers.shift, state.shift, [
      0xFFE1, // Left shift
      0xFFE2, // Right shift
    ], keyEvent);

    // Resync state of ctrl
    updateModifierState(keyboard.modifiers.ctrl, state.ctrl, [
      0xFFE3, // Left ctrl
      0xFFE4, // Right ctrl
    ], keyEvent);

    // Resync state of meta
    updateModifierState(keyboard.modifiers.meta, state.meta, [
      0xFFE7, // Left meta
      0xFFE8, // Right meta
    ], keyEvent);

    // Resync state of hyper
    updateModifierState(keyboard.modifiers.hyper, state.hyper, [
      0xFFEB, // Left hyper
      0xFFEC, // Right hyper
    ], keyEvent);

    // Update state
    keyboard.modifiers = state;
  };

  /**
   * Returns whether all currently pressed keys were implicitly pressed. A
   * key is implicitly pressed if its status was inferred indirectly from
   * inspection of other key events.
   *
   * @private
   * @returns {Boolean}
   *     true if all currently pressed keys were implicitly pressed, false
   *     otherwise.
   */
  const isStateImplicit = function () {
    for (const keysym in keyboard.pressed) {
      if (!implicitlyPressed[keysym]) {
        return false;
      }
    }

    return true;
  };

  /**
   * Reads through the event log, removing events from the head of the log
   * when the corresponding true key presses are known (or as known as they
   * can be).
   *
   * @private
   * @return {Boolean} Whether the default action of the latest event should
   *                   be prevented.
   */
  function interpretEvents() {
    // Do not prevent default if no event could be interpreted
    let handledEvent = interpretEvent();
    if (!handledEvent) {
      return false;
    }

    // Interpret as much as possible
    let lastEvent;
    do {
      lastEvent = handledEvent;
      handledEvent = interpretEvent();
    } while (handledEvent !== null);

    // Reset keyboard state if we cannot expect to receive any further
    // keyup events
    if (isStateImplicit()) {
      keyboard.reset();
    }

    return lastEvent.defaultPrevented;
  }

  /**
   * Releases Ctrl+Alt, if both are currently pressed and the given keysym
   * looks like a key that may require AltGr.
   *
   * @private
   * @param {Number} keysym The key that was just pressed.
   */
  const releaseSimulatedAltgr = function (keysym) {
    // Both Ctrl+Alt must be pressed if simulated AltGr is in use
    if (!keyboard.modifiers.ctrl || !keyboard.modifiers.alt) {
      return;
    }

    // Assume [A-Z] never require AltGr
    if (keysym >= 0x0041 && keysym <= 0x005A) {
      return;
    }

    // Assume [a-z] never require AltGr
    if (keysym >= 0x0061 && keysym <= 0x007A) {
      return;
    }

    // Release Ctrl+Alt if the keysym is printable
    if (keysym <= 0xFF || (keysym & 0xFF000000) === 0x01000000) {
      keyboard.release(0xFFE3); // Left ctrl
      keyboard.release(0xFFE4); // Right ctrl
      keyboard.release(0xFFE9); // Left alt
      keyboard.release(0xFFEA); // Right alt
    }
  };

  /**
   * Reads through the event log, interpreting the first event, if possible,
   * and returning that event. If no events can be interpreted, due to a
   * total lack of events or the need for more events, null is returned. Any
   * interpreted events are automatically removed from the log.
   *
   * @private
   * @return {KeyEvent}
   *     The first key event in the log, if it can be interpreted, or null
   *     otherwise.
   */
  const interpretEvent = function () {
    // Peek at first event in log
    const first = eventLog[0];
    if (!first) {
      return null;
    }

    // Keydown event
    if (first instanceof KeydownEvent) {
      let keysym = null;
      let acceptedEvents = [];

      // If event itself is reliable, no need to wait for other events
      if (first.reliable) {
        keysym = first.keysym;
        acceptedEvents = eventLog.splice(0, 1);
      } else if (eventLog[1] instanceof KeypressEvent) {
        // If keydown is immediately followed by a keypress, use the indicated character
        keysym = eventLog[1].keysym;
        acceptedEvents = eventLog.splice(0, 2);
      } else if (eventLog[1]) {
        // If keydown is immediately followed by anything else, then no
        // keypress can possibly occur to clarify this event, and we must
        // handle it now
        keysym = first.keysym;
        acceptedEvents = eventLog.splice(0, 1);
      }

      // Fire a key press if valid events were found
      if (acceptedEvents.length > 0) {
        if (keysym) {
          // Fire event
          releaseSimulatedAltgr(keysym);
          const defaultPrevented = !keyboard.press(keysym);
          keyboard.recentKeysym[first.keyCode] = keysym;

          // Release the key now if we cannot rely on the associated
          // keyup event
          if (!first.keyupReliable) {
            keyboard.release(keysym);
          }

          // Record whether default was prevented
          for (let i = 0; i < acceptedEvents.length; i++) {
            acceptedEvents[i].defaultPrevented = defaultPrevented;
          }
        }

        return first;
      }
    } else if (first instanceof KeyupEvent && !keyboard.quirks.keyupUnreliable) {
      // Keyup event
      // Release specific key if known
      const {keysym} = first;
      if (keysym) {
        keyboard.release(keysym);
        delete keyboard.recentKeysym[first.keyCode];
        first.defaultPrevented = true;
      } else {
        // Otherwise, fall back to releasing all keys
        keyboard.reset();
        return first;
      }

      return eventLog.shift();
    } else {
      // Ignore any other type of event (keypress by itself is invalid, and
      // unreliable keyup events should simply be dumped)
      return eventLog.shift();
    }

    // No event interpreted
    return null;
  };

  /**
   * Returns the keyboard location of the key associated with the given
   * keyboard event. The location differentiates key events which otherwise
   * have the same keycode, such as left shift vs. right shift.
   *
   * @private
   * @param {KeyboardEvent} e
   *     A JavaScript keyboard event, as received through the DOM via a
   *     "keydown", "keyup", or "keypress" handler.
   *
   * @returns {Number}
   *     The location of the key event on the keyboard, as defined at:
   *     http://www.w3.org/TR/DOM-Level-3-Events/#events-KeyboardEvent
   */
  const getEventLocation = function (e) {
    // Use standard location, if possible
    if ('location' in e) {
      return e.location;
    }

    // Failing that, attempt to use deprecated keyLocation
    if ('keyLocation' in e) {
      return e.keyLocation;
    }

    // If no location is available, assume left side
    return 0;
  };

  /**
   * Attempts to mark the given Event as having been handled by this
   * Keyboard. If the Event has already been marked as handled,
   * false is returned.
   *
   * @param {Event} e
   *     The Event to mark.
   *
   * @returns {Boolean}
   *     true if the given Event was successfully marked, false if the given
   *     Event was already marked.
   */
  const markEvent = function (e) {
    // Fail if event is already marked
    if (e[EVENT_MARKER]) {
      return false;
    }

    // Mark event otherwise
    e[EVENT_MARKER] = true;
    return true;
  };

  /**
   * Attaches event listeners to the given Element, automatically translating
   * received key, input, and composition events into simple keydown/keyup
   * events signalled through this Keyboard's onkeydown and
   * onkeyup handlers.
   *
   * @param {Element|Document} element
   *     The Element to attach event listeners to for the sake of handling
   *     key or input events.
   */
  this.listenTo = function (element) {
    // When key pressed
    element.addEventListener('keydown', e => {
      // Only intercept if handler set
      if (!keyboard.onkeydown) {
        return;
      }

      // Ignore events which have already been handled
      if (!markEvent(e)) {
        return;
      }

      let keyCode;
      if (window.event) {
        keyCode = window.event.keyCode;
      } else if (e.which) {
        keyCode = e.which;
      }

      // Fix modifier states
      const keydownEvent = new KeydownEvent(keyboard, keyCode, e.keyIdentifier, e.key, getEventLocation(e));
      syncModifierStates(e, keydownEvent);

      // Ignore (but do not prevent) the "composition" keycode sent by some
      // browsers when an IME is in use (see: http://lists.w3.org/Archives/Public/www-dom/2010JulSep/att-0182/keyCode-spec.html)
      if (keyCode === 229) {
        return;
      }

      // Log event
      eventLog.push(keydownEvent);

      // Interpret as many events as possible, prevent default if indicated
      if (interpretEvents()) {
        e.preventDefault();
      }
    }, true);

    // When key pressed
    element.addEventListener('keypress', e => {
      // Only intercept if handler set
      if (!keyboard.onkeydown && !keyboard.onkeyup) {
        return;
      }

      // Ignore events which have already been handled
      if (!markEvent(e)) {
        return;
      }

      let charCode;
      if (window.event) {
        charCode = window.event.keyCode;
      } else if (e.which) {
        charCode = e.which;
      }

      // Fix modifier states
      const keypressEvent = new KeypressEvent(charCode);
      syncModifierStates(e, keypressEvent);

      // Log event
      eventLog.push(keypressEvent);

      // Interpret as many events as possible, prevent default if indicated
      if (interpretEvents()) {
        e.preventDefault();
      }
    }, true);

    // When key released
    element.addEventListener('keyup', e => {
      // Only intercept if handler set
      if (!keyboard.onkeyup) {
        return;
      }

      // Ignore events which have already been handled
      if (!markEvent(e)) {
        return;
      }

      e.preventDefault();

      let keyCode;
      if (window.event) {
        keyCode = window.event.keyCode;
      } else if (e.which) {
        keyCode = e.which;
      }

      // Fix modifier states
      const keyupEvent = new KeyupEvent(keyboard, keyCode, e.keyIdentifier, e.key, getEventLocation(e));
      syncModifierStates(e, keyupEvent);

      // Log event, call for interpretation
      eventLog.push(keyupEvent);
      interpretEvents();
    }, true);

    /**
     * Handles the given "input" event, typing the data within the input text.
     * If the event is complete (text is provided), handling of "compositionend"
     * events is suspended, as such events may conflict with input events.
     *
     * @private
     * @param {InputEvent} e
     *     The "input" event to handle.
     */
    const handleInput = function (e) {
      // Only intercept if handler set
      if (!keyboard.onkeydown && !keyboard.onkeyup) {
        return;
      }

      // Ignore events which have already been handled
      if (!markEvent(e)) {
        return;
      }

      // Type all content written
      if (e.data && !e.isComposing) {
        element.removeEventListener('compositionend', handleComposition, false);
        keyboard.type(e.data);
      }
    };

    /**
     * Handles the given "compositionend" event, typing the data within the
     * composed text. If the event is complete (composed text is provided),
     * handling of "input" events is suspended, as such events may conflict
     * with composition events.
     *
     * @private
     * @param {CompositionEvent} e
     *     The "compositionend" event to handle.
     */
    const handleComposition = function (e) {
      // Only intercept if handler set
      if (!keyboard.onkeydown && !keyboard.onkeyup) {
        return;
      }

      // Ignore events which have already been handled
      if (!markEvent(e)) {
        return;
      }

      // Type all content written
      if (e.data) {
        element.removeEventListener('input', handleInput, false);
        keyboard.type(e.data);
      }
    };

    // Automatically type text entered into the wrapped field
    element.addEventListener('input', handleInput, false);
    element.addEventListener('compositionend', handleComposition, false);
  };

  // Listen to given element, if any
  if (element) {
    keyboard.listenTo(element);
  }
};

/**
 * The unique numerical identifier to assign to the next Keyboard
 * instance.
 *
 * @private
 * @type {Number}
 */
Keyboard._nextId = 0;

export default Keyboard;
