import { Instruction } from "./instruction";

/**
 * Sends the specified key press or release event.
 *
 * @param keysym - The X11 keysym of the key being pressed or released.
 * @param pressed - 0 if the key is not pressed, 1 if the key is pressed.
 */
export const key = (keysym: string, pressed: boolean): Instruction => ['key', keysym, pressed ? 1 : 0];

/**
 * Sends the specified mouse movement or button press or release event (or combination thereof).
 *
 * @param x - The current X coordinate of the mouse pointer.
 * @param y - The current Y coordinate of the mouse pointer.
 * @param mask - The button mask, representing the pressed or released status of each mouse button.
 */
export const mouse = (x: number, y: number, mask: string): Instruction => ['mouse', x, y, mask];

/**
 * Specifies that the client's optimal screen size has changed from what was specified during the
 * handshake, or from previously-sent "size" instructions.
 *
 * @param width - The new, optimal screen width.
 * @param height - The new, optimal screen height.
 */
export const size = (width: number, height: number): Instruction => ['size', width, height];
