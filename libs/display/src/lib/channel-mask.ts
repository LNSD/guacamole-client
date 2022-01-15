/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Channel mask for the composite operation "rout".
 */
export const ROUT = 0x2;
/**
 * Channel mask for the composite operation "atop".
 */
export const ATOP = 0x6;
/**
 * Channel mask for the composite operation "xor".
 */
export const XOR = 0xA;
/**
 * Channel mask for the composite operation "rover".
 */
export const ROVER = 0xB;

/**
 * Channel mask for the composite operation "over".
 */
export const OVER = 0xE;

/**
 * Channel mask for the composite operation "plus".
 */
export const PLUS = 0xF;

/**
 * Channel mask for the composite operation "rin".
 * Beware that WebKit-based browsers may leave the contents of the destination
 * layer where the source layer is transparent, despite the definition of this
 * operation.
 */
export const RIN = 0x1;

/**
 * Channel mask for the composite operation "in".
 * Beware that WebKit-based browsers may leave the contents of the destination
 * layer where the source layer is transparent, despite the definition of this
 * operation.
 */
export const IN = 0x4;

/**
 * Channel mask for the composite operation "out".
 * Beware that WebKit-based browsers may leave the contents of the destination
 * layer where the source layer is transparent, despite the definition of this
 * operation.
 */
export const OUT = 0x8;

/**
 * Channel mask for the composite operation "ratop".
 * Beware that WebKit-based browsers may leave the contents of the destination
 * layer where the source layer is transparent, despite the definition of this
 * operation.
 */
export const RATOP = 0x9;

/**
 * Channel mask for the composite operation "src".
 * Beware that WebKit-based browsers may leave the contents of the destination
 * layer where the source layer is transparent, despite the definition of this
 * operation.
 */
export const SRC = 0xC;
