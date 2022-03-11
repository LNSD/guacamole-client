import { createInstruction } from './instruction';

const KEY_OPCODE = 'key';
const MOUSE_OPCODE = 'mouse';
const SIZE_OPCODE = 'size';

/**
 * Sends the specified key press or release event.
 *
 * @param keysym - The X11 keysym of the key being pressed or released.
 * @param pressed - 0 if the key is not pressed, 1 if the key is pressed.
 */
export type KeyHandler = (keysym: number, pressed: boolean) => void;

export const key = createInstruction<KeyHandler>(
  KEY_OPCODE,
  (keysym: number, pressed: boolean) => [keysym, pressed ? 1 : 0],
  (handler: KeyHandler) => (params) => {
    const keysym = parseInt(params[0], 10);
    const pressed = Boolean(params[1]);

    handler(keysym, pressed);
  },
);

/**
 * Sends the specified mouse movement or button press or release event (or combination thereof).
 *
 * @param x - The current X coordinate of the mouse pointer.
 * @param y - The current Y coordinate of the mouse pointer.
 * @param mask - The button mask, representing the pressed or released status of each mouse button.
 */
export type MouseHandler = (x: number, y: number, mask: number) => void;

export const mouse = createInstruction<MouseHandler>(
  MOUSE_OPCODE,
  (x: number, y: number, mask: number) => [x, y, mask],
  (handler: MouseHandler) => (params) => {
    const x = parseInt(params[0], 10);
    const y = parseInt(params[1], 10);
    const mask = parseInt(params[1], 10);

    handler(x, y, mask);
  },
);

/**
 * Specifies that the client's optimal screen size has changed from what was specified during the
 * handshake, or from previously-sent "size" instructions.
 *
 * @param width - The new, optimal screen width.
 * @param height - The new, optimal screen height.
 */
export type SizeHandler = (width: number, height: number) => void;

export const size = createInstruction<SizeHandler>(
  SIZE_OPCODE,
  (width: number, height: number) => [width, height],
  (handler: SizeHandler) => (params) => {
    const width = parseInt(params[0], 10);
    const height = parseInt(params[1], 10);

    handler(width, height);
  },
);
