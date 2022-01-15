import Pixel from './pixel';

/**
 * Map of all Guacamole binary raster operations to transfer functions.
 * @private
 */
export const DEFAULT_TRANSFER_FUNCTION: Record<number, (src: Pixel, dst: Pixel) => void> = {

  /* BLACK */
  0x0: (src: Pixel, dst: Pixel) => {
    dst.red = 0x00;
    dst.green = 0x00;
    dst.blue = 0x00;
  },

  /* WHITE */
  0xF: (src: Pixel, dst: Pixel) => {
    dst.red = 0xFF;
    dst.green = 0xFF;
    dst.blue = 0xFF;
  },

  /* SRC */
  0x3: (src: Pixel, dst: Pixel) => {
    dst.red = src.red;
    dst.green = src.green;
    dst.blue = src.blue;
    dst.alpha = src.alpha;
  },

  /* DEST (no-op) */
  0x5: (_src: Pixel, _dst: Pixel) => {
    // Do nothing
  },

  /* Invert SRC */
  0xC: (src: Pixel, dst: Pixel) => {
    dst.red = 0xFF & ~src.red;
    dst.green = 0xFF & ~src.green;
    dst.blue = 0xFF & ~src.blue;
    dst.alpha = src.alpha;
  },

  /* Invert DEST */
  0xA: (src: Pixel, dst: Pixel) => {
    dst.red = 0xFF & ~dst.red;
    dst.green = 0xFF & ~dst.green;
    dst.blue = 0xFF & ~dst.blue;
  },

  /* AND */
  0x1: (src: Pixel, dst: Pixel) => {
    dst.red &= src.red;
    dst.green &= src.green;
    dst.blue &= src.blue;
  },

  /* NAND */
  0xE: (src: Pixel, dst: Pixel) => {
    dst.red = 0xFF & ~(src.red & dst.red);
    dst.green = 0xFF & ~(src.green & dst.green);
    dst.blue = 0xFF & ~(src.blue & dst.blue);
  },

  /* OR */
  0x7: (src: Pixel, dst: Pixel) => {
    dst.red |= src.red;
    dst.green |= src.green;
    dst.blue |= src.blue;
  },

  /* NOR */
  0x8: (src: Pixel, dst: Pixel) => {
    dst.red = 0xFF & ~(src.red | dst.red);
    dst.green = 0xFF & ~(src.green | dst.green);
    dst.blue = 0xFF & ~(src.blue | dst.blue);
  },

  /* XOR */
  0x6: (src: Pixel, dst: Pixel) => {
    dst.red ^= src.red;
    dst.green ^= src.green;
    dst.blue ^= src.blue;
  },

  /* XNOR */
  0x9: (src: Pixel, dst: Pixel) => {
    dst.red = 0xFF & ~(src.red ^ dst.red);
    dst.green = 0xFF & ~(src.green ^ dst.green);
    dst.blue = 0xFF & ~(src.blue ^ dst.blue);
  },

  /* AND inverted source */
  0x4: (src: Pixel, dst: Pixel) => {
    dst.red = 0xFF & (~src.red & dst.red);
    dst.green = 0xFF & (~src.green & dst.green);
    dst.blue = 0xFF & (~src.blue & dst.blue);
  },

  /* OR inverted source */
  0xD: (src: Pixel, dst: Pixel) => {
    dst.red = 0xFF & (~src.red | dst.red);
    dst.green = 0xFF & (~src.green | dst.green);
    dst.blue = 0xFF & (~src.blue | dst.blue);
  },

  /* AND inverted destination */
  0x2: (src: Pixel, dst: Pixel) => {
    dst.red = 0xFF & (src.red & ~dst.red);
    dst.green = 0xFF & (src.green & ~dst.green);
    dst.blue = 0xFF & (src.blue & ~dst.blue);
  },

  /* OR inverted destination */
  0xB: (src: Pixel, dst: Pixel) => {
    dst.red = 0xFF & (src.red | ~dst.red);
    dst.green = 0xFF & (src.green | ~dst.green);
    dst.blue = 0xFF & (src.blue | ~dst.blue);
  }
};
/**
 * Translation from Guacamole protocol line caps to Layer line caps.
 * @private
 */
export const LINE_CAP: Record<number, CanvasLineCap> = {
  0: "butt",
  1: "round",
  2: "square"
};
/**
 * Translation from Guacamole protocol line caps to Layer line caps.
 * @private
 */
export const LINE_JOIN: Record<number, CanvasLineJoin> = {
  0: "bevel",
  1: "miter",
  2: "round"
};
