/**
 * Represents a single pixel of image data. All components have a minimum value
 * of 0 and a maximum value of 255.
 */
export default class Pixel {
  /**
   * The red component of this pixel, where 0 is the minimum value,
   * and 255 is the maximum.
   */
  public red: number;
  /**
   * The green component of this pixel, where 0 is the minimum value,
   * and 255 is the maximum.
   */
  public green: number;
  /**
   * The blue component of this pixel, where 0 is the minimum value,
   * and 255 is the maximum.
   */
  public blue: number;
  /**
   * The alpha component of this pixel, where 0 is the minimum value,
   * and 255 is the maximum.
   */
  public alpha: number;

  /* @constructor
   *
   * @param r - The red component of this pixel.
   * @param g - The green component of this pixel.
   * @param b - The blue component of this pixel.
   * @param a - The alpha component of this pixel.
   */
  constructor(r: number, g: number, b: number, a: number) {
    this.red = r;
    this.green = g;
    this.blue = b;
    this.alpha = a;
  }
}
