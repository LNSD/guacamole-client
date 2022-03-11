import Layer from './layer';

/**
 * Simple container for Layer, allowing layers to be easily
 * repositioned and nested. This allows certain operations to be accelerated
 * through DOM manipulation, rather than raster operations.
 */
export default class VisibleLayer extends Layer {
  /**
   * The next identifier to be assigned to the layer container. This identifier
   * uniquely identifies each VisibleLayer, but is unrelated to the index of
   * the layer, which exists at the protocol/client level only.
   *
   * @private
   */
  protected static __nextId = 0;
  /**
   * The opacity of the layer container, where 255 is fully opaque and 0 is
   * fully transparent.
   */
  public alpha = 0xff;
  /**
   * X coordinate of the upper-left corner of this layer container within
   * its parent, in pixels.
   */
  public x = 0;
  /**
   * Y coordinate of the upper-left corner of this layer container within
   * its parent, in pixels.
   */
  public y = 0;
  /**
   * Z stacking order of this layer relative to other sibling layers.
   */
  public z = 0;
  /**
   * The affine transformation applied to this layer container. Each element
   * corresponds to a value from the transformation matrix, with the first
   * three values being the first row, and the last three values being the
   * second row. There are six values total.
   */
  public matrix = [1, 0, 0, 1, 0, 0];

  /**
   * The parent layer container of this layer, if any.
   * @type {Display.VisibleLayer}
   */
  public parent: VisibleLayer | null = null;

  /**
   * Set of all children of this layer, indexed by layer index. This object
   * will have one property per child.
   */
  public children: Record<number, VisibleLayer> = {};

  private readonly div: HTMLDivElement;

  /**
   * Identifier which uniquely identifies this layer. This is COMPLETELY
   * UNRELATED to the index of the underlying layer, which is specific
   * to the Guacamole protocol, and not relevant at this level.
   *
   * @private
   */
  private readonly __uniqueId: number;

  /**
   * The translation component of this layer's transform.
   * @private
   */
  private translateTransform = 'translate(0px, 0px)'; // (0, 0)

  /**
   * The arbitrary matrix component of this layer's transform.
   * @private
   */
  private matrixTransform = 'matrix(1, 0, 0, 1, 0, 0)'; // Identity

  /*
   * @constructor
   * @augments Layer
   * @param width - The width of the Layer, in pixels. The canvas element
   *                backing this Layer will be given this width.
   * @param height - The height of the Layer, in pixels. The canvas element
   *                 backing this Layer will be given this height.
   */
  constructor(width: number, height: number) {
    super(width, height);

    this.__uniqueId = VisibleLayer.__nextId++;

    // Set layer position
    const canvas = this.getCanvas();
    canvas.style.position = 'absolute';
    canvas.style.left = '0px';
    canvas.style.top = '0px';

    // Create div with given size
    this.div = document.createElement('div');
    this.div.setAttribute('class', 'VisibleLayer');
    this.div.appendChild(canvas);
    this.div.style.width = `${width}px`;
    this.div.style.height = `${height}px`;
    this.div.style.position = 'absolute';
    this.div.style.left = '0px';
    this.div.style.top = '0px';
    this.div.style.overflow = 'hidden';
  }

  public resize(width: number, height: number) {
    // Resize containing div
    this.div.style.width = `${width}px`;
    this.div.style.height = `${height}px`;

    super.resize(width, height);
  }

  /**
   * Returns the element containing the canvas and any other elements
   * associated with this layer.
   *
   * @returns The element containing this layer's canvas.
   */
  public getElement(): Element {
    return this.div;
  }

  /**
   * Moves the upper-left corner of this layer to the given X and Y
   * coordinate.
   *
   * @param x - The X coordinate to move to.
   * @param y - The Y coordinate to move to.
   */
  public translate(x: number, y: number) {
    this.x = x;
    this.y = y;

    // Generate translation
    this.translateTransform = `translate(${x}px, ${y}px)`;

    // Set layer transform
    const transform = this.translateTransform + ' ' + this.matrixTransform;
    this.div.style.transform = transform;
    // TODO Review this
    // this.div.style.WebkitTransform = transform;
    // this.div.style.MozTransform = transform;
    // this.div.style.OTransform = transform;
    // this.div.style.msTransform = transform;
  }

  /**
   * Moves the upper-left corner of this VisibleLayer to the given X and Y
   * coordinate, sets the Z stacking order, and reparents this VisibleLayer
   * to the given VisibleLayer.
   *
   * @param parent - The parent to set.
   * @param x - The X coordinate to move to.
   * @param y - The Y coordinate to move to.
   * @param z - The Z coordinate to move to.
   */
  public move(parent: VisibleLayer, x: number, y: number, z: number) {
    // Set parent if necessary
    if (this.parent !== parent) {
      // Maintain relationship
      if (this.parent) {
        // TODO Review the following lint suppression
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.parent.children[this.__uniqueId];
      }

      this.parent = parent;
      this.children[this.__uniqueId] = this;

      // Reparent element
      const parentElement = parent.getElement();
      parentElement.appendChild(this.div);
    }

    // Set location
    this.translate(x, y);
    this.z = z;
    this.div.style.zIndex = String(z);
  }

  /**
   * Sets the opacity of this layer to the given value, where 255 is fully
   * opaque and 0 is fully transparent.
   *
   * @param a - The opacity to set.
   */
  public shade(a: number) {
    this.alpha = a;
    this.div.style.opacity = String(a / 255.0);
  }

  /**
   * Removes this layer container entirely, such that it is no longer
   * contained within its parent layer, if any.
   */
  dispose() {
    // Remove from parent container
    if (this.parent) {
      // TODO Review the following lint suppression
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.parent.children[this.__uniqueId];
      this.parent = null;
    }

    // Remove from parent element
    if (this.div.parentNode) {
      this.div.parentNode.removeChild(this.div);
    }
  }

  /**
   * Applies the given affine transform (defined with six values from the
   * transform's matrix).
   *
   * @param a - The first value in the affine transform's matrix.
   * @param b - The second value in the affine transform's matrix.
   * @param c - The third value in the affine transform's matrix.
   * @param d - The fourth value in the affine transform's matrix.
   * @param e - The fifth value in the affine transform's matrix.
   * @param f - The sixth value in the affine transform's matrix.
   */
  public distort(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) {
    // Store matrix
    this.matrix = [a, b, c, d, e, f];

    // Generate matrix transformation
    /*
     * A c e
     * b d f
     * 0 0 1
     */
    this.matrixTransform = `matrix(${a},${b},${c},${d},${e},${f})`;

    // Set layer transform
    const transform = this.translateTransform + ' ' + this.matrixTransform;
    this.div.style.transform = transform;
    // TODO Review this
    // this.div.style.WebkitTransform = transform;
    // this.div.style.MozTransform = transform;
    // this.div.style.OTransform = transform;
    // this.div.style.msTransform = transform;
  }
}
