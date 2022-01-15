import Pixel from './pixel';

/**
 * The number of pixels the width or height of a layer must change before
 * the underlying canvas is resized. The underlying canvas will be kept at
 * dimensions which are integer multiples of this factor.
 */
const CANVAS_SIZE_FACTOR = 64;

/**
 * Map of all Guacamole channel masks to HTML5 canvas composite operation
 * names. Not all channel mask combinations are currently implemented.
 */
const compositeOperation: Record<number, string> = {
  /* 0x0 NOT IMPLEMENTED */
  0x1: 'destination-in',
  0x2: 'destination-out',
  /* 0x3 NOT IMPLEMENTED */
  0x4: 'source-in',
  /* 0x5 NOT IMPLEMENTED */
  0x6: 'source-atop',
  /* 0x7 NOT IMPLEMENTED */
  0x8: 'source-out',
  0x9: 'destination-atop',
  0xA: 'xor',
  0xB: 'destination-over',
  0xC: 'copy',
  /* 0xD NOT IMPLEMENTED */
  0xE: 'source-over',
  0xF: 'lighter',
};

/**
 * Abstract ordered drawing surface. Each Layer contains a canvas element and
 * provides simple drawing instructions for drawing to that canvas element,
 * however unlike the canvas element itself, drawing operations on a Layer are
 * guaranteed to run in order, even if such an operation must wait for an image
 * to load before completing.
 */
export default class Layer {
  /**
   * Set to true if this Layer should resize itself to accommodate the
   * dimensions of any drawing operation, and false (the default) otherwise.
   *
   * Note that setting this property takes effect immediately, and thus may
   * take effect on operations that were started in the past but have not
   * yet completed. If you wish the setting of this flag to only modify
   * future operations, you will need to make the setting of this flag an
   * operation with sync().
   *
   * @example
   * // Set autosize to true for all future operations
   * layer.sync(function() {
   *     layer.autosize = true;
   * });
   *
   * @default false
   */
  public autosize = false;

  /**
   * The current width of this layer.
   */
  public width: number;

  /**
   * The current height of this layer.
   */
  public height: number;

  /**
   * The canvas element backing this Layer.
   * @private
   */
  private readonly canvas: HTMLCanvasElement;

  /**
   * The 2D display context of the canvas element backing this Layer.
   * @private
   */
  private context: CanvasRenderingContext2D;

  /**
   * Whether the layer has not yet been drawn to. Once any draw operation
   * which affects the underlying canvas is invoked, this flag will be set to
   * false.
   *
   * @private
   */
  private empty = true;

  /**
   * Whether a new path should be started with the next path drawing
   * operations.
   * @private
   */
  private pathClosed = true;

  /**
   * The number of states on the state stack.
   *
   * Note that there will ALWAYS be one element on the stack, but that
   * element is not exposed. It is only used to reset the layer to its
   * initial state.
   *
   * @private
   */
  private stackSize = 0;

  /* @constructor
   *
   * @param width - The width of the Layer, in pixels. The canvas element
   *                       backing this Layer will be given this width.
   *
   * @param height - The height of the Layer, in pixels. The canvas element
   *                        backing this Layer will be given this height.
   */
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('2d');
    if (context === null) {
      throw new Error('Canvas context 2d not available');
    }

    this.context = context;
    this.context.save();

    // Initialize canvas dimensions
    this.__resize(width, height);

    // Explicitly render canvas below other elements in the layer (such as
    // child layers). Chrome and others may fail to render layers properly
    // without this.
    this.canvas.style.zIndex = '-1';
  }

  /**
   * Returns the canvas element backing this Layer. Note that the dimensions
   * of the canvas may not exactly match those of the Layer, as resizing a
   * canvas while maintaining its state is an expensive operation.
   *
   * @returns {HTMLCanvasElement}
   *     The canvas element backing this Layer.
   */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Returns a new canvas element containing the same image as this Layer.
   * Unlike getCanvas(), the canvas element returned is guaranteed to have
   * the exact same dimensions as the Layer.
   *
   * @returns {HTMLCanvasElement}
   *     A new canvas element containing a copy of the image content this
   *     Layer.
   */
  public toCanvas(): HTMLCanvasElement {
    // Create new canvas having same dimensions
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;

    // Copy image contents to new canvas
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('Canvas context 2d not available');
    }

    context.drawImage(this.getCanvas(), 0, 0);

    return canvas;
  }

  /**
   * Changes the size of this Layer to the given width and height. Resizing
   * is only attempted if the new size provided is actually different from
   * the current size.
   *
   * @param newWidth - The new width to assign to this Layer.
   * @param newHeight - The new height to assign to this Layer.
   */
  public resize(newWidth: number, newHeight: number) {
    if (newWidth !== this.width || newHeight !== this.height) {
      this.__resize(newWidth, newHeight);
    }
  }

  /**
   * Draws the specified image at the given coordinates. The image specified
   * must already be loaded.
   *
   * @param x - The destination X coordinate.
   * @param y - The destination Y coordinate.
   * @param image -  The image to draw. Note that this is not a URL.
   */
  public drawImage(x: number, y: number, image: CanvasImageSource) {
    if (this.autosize) {
      // TODO Review the following TS error suppression
      // @ts-ignore TS2345: Argument of type 'number | SVGAnimatedLength' is not assignable to parameter of type 'number'.
      this.__fitRect(x, y, image.width, image.height);
    }

    this.context.drawImage(image, x, y);
    this.empty = false;
  }

  /**
   * Transfer a rectangle of image data from one Layer to this Layer using the
   * specified transfer function.
   *
   * @param srcLayer - The Layer to copy image data from.
   * @param srcx - The X coordinate of the upper-left corner of the
   *                      rectangle within the source Layer's coordinate
   *                      space to copy data from.
   * @param srcy - The Y coordinate of the upper-left corner of the
   *                      rectangle within the source Layer's coordinate
   *                      space to copy data from.
   * @param srcw - The width of the rectangle within the source Layer's
   *                      coordinate space to copy data from.
   * @param srch - The height of the rectangle within the source
   *                      Layer's coordinate space to copy data from.
   * @param x - The destination X coordinate.
   * @param y - The destination Y coordinate.
   * @param transferFunction - The transfer function to use to
   *                                    transfer data from source to
   *                                    destination.
   */
  // TODO Review the following lint suppression
  // eslint-disable-next-line @typescript-eslint/ban-types
  public transfer(srcLayer: Layer, srcx: number, srcy: number, srcw: number, srch: number, x: number, y: number, transferFunction: Function) {
    const srcCanvas = srcLayer.getCanvas();

    // If entire rectangle outside source canvas, stop
    if (srcx >= srcCanvas.width || srcy >= srcCanvas.height) {
      return;
    }

    // Otherwise, clip rectangle to area
    if (srcx + srcw > srcCanvas.width) {
      srcw = srcCanvas.width - srcx;
    }

    if (srcy + srch > srcCanvas.height) {
      srch = srcCanvas.height - srcy;
    }

    // Stop if nothing to draw.
    if (srcw === 0 || srch === 0) {
      return;
    }

    if (this.autosize) {
      this.__fitRect(x, y, srcw, srch);
    }

    // Get source canvas context
    const srcCanvasContext = srcCanvas.getContext('2d');
    if (srcCanvasContext === null) {
      throw new Error('Canvas context 2d not available');
    }

    // Get image data from src and dst
    const src = srcCanvasContext.getImageData(srcx, srcy, srcw, srch);
    const dst = this.context.getImageData(x, y, srcw, srch);

    // Apply transfer for each pixel
    for (let i = 0; i < srcw * srch * 4; i += 4) {
      // Get source pixel environment
      const srcPixel = new Pixel(
        src.data[i],
        src.data[i + 1],
        src.data[i + 2],
        src.data[i + 3],
      );

      // Get destination pixel environment
      const dstPixel = new Pixel(
        dst.data[i],
        dst.data[i + 1],
        dst.data[i + 2],
        dst.data[i + 3],
      );

      // Apply transfer function
      transferFunction(srcPixel, dstPixel);

      // Save pixel data
      dst.data[i] = dstPixel.red;
      dst.data[i + 1] = dstPixel.green;
      dst.data[i + 2] = dstPixel.blue;
      dst.data[i + 3] = dstPixel.alpha;
    }

    // Draw image data
    this.context.putImageData(dst, x, y);
    this.empty = false;
  }

  /**
   * Put a rectangle of image data from one Layer to this Layer directly
   * without performing any alpha blending. Simply copy the data.
   *
   * @param srcLayer - The Layer to copy image data from.
   * @param srcx - The X coordinate of the upper-left corner of the
   *                      rectangle within the source Layer's coordinate
   *                      space to copy data from.
   * @param srcy - The Y coordinate of the upper-left corner of the
   *                      rectangle within the source Layer's coordinate
   *                      space to copy data from.
   * @param srcw - The width of the rectangle within the source Layer's
   *                      coordinate space to copy data from.
   * @param srch - The height of the rectangle within the source
   *                      Layer's coordinate space to copy data from.
   * @param x - The destination X coordinate.
   * @param y - The destination Y coordinate.
   */
  public put(srcLayer: Layer, srcx: number, srcy: number, srcw: number, srch: number, x: number, y: number) {
    const srcCanvas = srcLayer.getCanvas();

    // If entire rectangle outside source canvas, stop
    if (srcx >= srcCanvas.width || srcy >= srcCanvas.height) {
      return;
    }

    // Otherwise, clip rectangle to area
    if (srcx + srcw > srcCanvas.width) {
      srcw = srcCanvas.width - srcx;
    }

    if (srcy + srch > srcCanvas.height) {
      srch = srcCanvas.height - srcy;
    }

    // Stop if nothing to draw.
    if (srcw === 0 || srch === 0) {
      return;
    }

    if (this.autosize) {
      this.__fitRect(x, y, srcw, srch);
    }

    // Get source canvas context
    const srcCanvasContext = srcCanvas.getContext('2d');
    if (srcCanvasContext === null) {
      throw new Error('Canvas context 2d not available');
    }

    // Get image data from src and dst
    const src = srcCanvasContext.getImageData(srcx, srcy, srcw, srch);
    this.context.putImageData(src, x, y);
    this.empty = false;
  }

  /**
   * Copy a rectangle of image data from one Layer to this Layer. This
   * operation will copy exactly the image data that will be drawn once all
   * operations of the source Layer that were pending at the time this
   * function was called are complete. This operation will not alter the
   * size of the source Layer even if its autosize property is set to true.
   *
   * @param srcLayer - The Layer to copy image data from.
   * @param srcx - The X coordinate of the upper-left corner of the
   *                      rectangle within the source Layer's coordinate
   *                      space to copy data from.
   * @param srcy - The Y coordinate of the upper-left corner of the
   *                      rectangle within the source Layer's coordinate
   *                      space to copy data from.
   * @param srcw - The width of the rectangle within the source Layer's
   *                      coordinate space to copy data from.
   * @param srch - The height of the rectangle within the source
   *                      Layer's coordinate space to copy data from.
   * @param x - The destination X coordinate.
   * @param y - The destination Y coordinate.
   */
  public copy(srcLayer: Layer, srcx: number, srcy: number, srcw: number, srch: number, x: number, y: number) {
    const srcCanvas = srcLayer.getCanvas();

    // If entire rectangle outside source canvas, stop
    if (srcx >= srcCanvas.width || srcy >= srcCanvas.height) {
      return;
    }

    // Otherwise, clip rectangle to area
    if (srcx + srcw > srcCanvas.width) {
      srcw = srcCanvas.width - srcx;
    }

    if (srcy + srch > srcCanvas.height) {
      srch = srcCanvas.height - srcy;
    }

    // Stop if nothing to draw.
    if (srcw === 0 || srch === 0) {
      return;
    }

    if (this.autosize) {
      this.__fitRect(x, y, srcw, srch);
    }

    this.context.drawImage(srcCanvas, srcx, srcy, srcw, srch, x, y, srcw, srch);
    this.empty = false;
  }

  /**
   * Starts a new path at the specified point.
   *
   * @param x - The X coordinate of the point to draw.
   * @param y - The Y coordinate of the point to draw.
   */
  public moveTo(x: number, y: number) {
    // Start a new path if current path is closed
    if (this.pathClosed) {
      this.context.beginPath();
      this.pathClosed = false;
    }

    if (this.autosize) {
      this.__fitRect(x, y, 0, 0);
    }

    this.context.moveTo(x, y);
  }

  /**
   * Add the specified line to the current path.
   *
   * @param x - The X coordinate of the endpoint of the line to draw.
   * @param y - The Y coordinate of the endpoint of the line to draw.
   */
  public lineTo(x: number, y: number) {
    // Start a new path if current path is closed
    if (this.pathClosed) {
      this.context.beginPath();
      this.pathClosed = false;
    }

    if (this.autosize) {
      this.__fitRect(x, y, 0, 0);
    }

    this.context.lineTo(x, y);
  }

  /**
   * Add the specified arc to the current path.
   *
   * @param x - The X coordinate of the center of the circle which
   *                   will contain the arc.
   * @param y - The Y coordinate of the center of the circle which
   *                   will contain the arc.
   * @param radius - The radius of the circle.
   * @param startAngle - The starting angle of the arc, in radians.
   * @param endAngle - The ending angle of the arc, in radians.
   * @param negative - Whether the arc should be drawn in order of
   *                           decreasing angle.
   */
  public arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, negative: boolean) {
    // Start a new path if current path is closed
    if (this.pathClosed) {
      this.context.beginPath();
      this.pathClosed = false;
    }

    if (this.autosize) {
      this.__fitRect(x, y, 0, 0);
    }

    this.context.arc(x, y, radius, startAngle, endAngle, negative);
  }

  /**
   * Starts a new path at the specified point.
   *
   * @param cp1x - The X coordinate of the first control point.
   * @param cp1y - The Y coordinate of the first control point.
   * @param cp2x - The X coordinate of the second control point.
   * @param cp2y - The Y coordinate of the second control point.
   * @param x - The X coordinate of the endpoint of the curve.
   * @param y - The Y coordinate of the endpoint of the curve.
   */
  public curveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    // Start a new path if current path is closed
    if (this.pathClosed) {
      this.context.beginPath();
      this.pathClosed = false;
    }

    if (this.autosize) {
      this.__fitRect(x, y, 0, 0);
    }

    this.context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
  }

  /**
   * Closes the current path by connecting the end point with the start
   * point (if any) with a straight line.
   */
  public close() {
    this.context.closePath();
    this.pathClosed = true;
  }

  /**
   * Add the specified rectangle to the current path.
   *
   * @param x - The X coordinate of the upper-left corner of the
   *                   rectangle to draw.
   * @param y - The Y coordinate of the upper-left corner of the
   *                   rectangle to draw.
   * @param w - The width of the rectangle to draw.
   * @param h - The height of the rectangle to draw.
   */
  public rect(x: number, y: number, w: number, h: number) {
    // Start a new path if current path is closed
    if (this.pathClosed) {
      this.context.beginPath();
      this.pathClosed = false;
    }

    if (this.autosize) {
      this.__fitRect(x, y, w, h);
    }

    this.context.rect(x, y, w, h);
  }

  /**
   * Clip all future drawing operations by the current path. The current path
   * is implicitly closed. The current path can continue to be reused
   * for other operations (such as fillColor()) but a new path will be started
   * once a path drawing operation (path() or rect()) is used.
   */
  public clip() {
    // Set new clipping region
    this.context.clip();

    // Path now implicitly closed
    this.pathClosed = true;
  }

  /**
   * Stroke the current path with the specified color. The current path
   * is implicitly closed. The current path can continue to be reused
   * for other operations (such as clip()) but a new path will be started
   * once a path drawing operation (path() or rect()) is used.
   *
   * @param cap - The line cap style. Can be "round", "square",
   *                     or "butt".
   * @param join - The line join style. Can be "round", "bevel",
   *                      or "miter".
   * @param thickness - The line thickness in pixels.
   * @param r - The red component of the color to fill.
   * @param g - The green component of the color to fill.
   * @param b - The blue component of the color to fill.
   * @param a - The alpha component of the color to fill.
   */
  public strokeColor(cap: CanvasLineCap, join: CanvasLineJoin, thickness: number, r: number, g: number, b: number, a: number) {
    // Stroke with color
    this.context.lineCap = cap;
    this.context.lineJoin = join;
    this.context.lineWidth = thickness;
    this.context.strokeStyle = `rgba(${r},${g},${b},${a / 255.0})`;
    this.context.stroke();
    this.empty = false;

    // Path now implicitly closed
    this.pathClosed = true;
  }

  /**
   * Fills the current path with the specified color. The current path
   * is implicitly closed. The current path can continue to be reused
   * for other operations (such as clip()) but a new path will be started
   * once a path drawing operation (path() or rect()) is used.
   *
   * @param r - The red component of the color to fill.
   * @param g - The green component of the color to fill.
   * @param b - The blue component of the color to fill.
   * @param a - The alpha component of the color to fill.
   */
  public fillColor(r: number, g: number, b: number, a: number) {
    // Fill with color
    this.context.fillStyle = `rgba(${r},${g},${b},${a / 255.0})`;
    this.context.fill();
    this.empty = false;

    // Path now implicitly closed
    this.pathClosed = true;
  }

  /**
   * Stroke the current path with the image within the specified layer. The
   * image data will be tiled infinitely within the stroke. The current path
   * is implicitly closed. The current path can continue to be reused
   * for other operations (such as clip()) but a new path will be started
   * once a path drawing operation (path() or rect()) is used.
   *
   * @param cap - The line cap style. Can be "round", "square",
   *                     or "butt".
   * @param join - The line join style. Can be "round", "bevel",
   *                      or "miter".
   * @param thickness - The line thickness in pixels.
   * @param srcLayer - The layer to use as a repeating pattern
   *                                   within the stroke.
   */
  public strokeLayer(cap: CanvasLineCap, join: CanvasLineJoin, thickness: number, srcLayer: Layer) {
    // Stroke with image data
    this.context.lineCap = cap;
    this.context.lineJoin = join;
    this.context.lineWidth = thickness;
    // @ts-ignore TODO Review: Expected CanvasPattern, but null is also possible
    this.context.strokeStyle = this.context.createPattern(srcLayer.getCanvas(), 'repeat');
    this.context.stroke();
    this.empty = false;

    // Path now implicitly closed
    this.pathClosed = true;
  }

  /**
   * Fills the current path with the image within the specified layer. The
   * image data will be tiled infinitely within the stroke. The current path
   * is implicitly closed. The current path can continue to be reused
   * for other operations (such as clip()) but a new path will be started
   * once a path drawing operation (path() or rect()) is used.
   *
   * @param srcLayer - The layer to use as a repeating pattern
   *                                   within the fill.
   */
  public fillLayer(srcLayer: Layer) {
    // Fill with image data
    // @ts-ignore TODO Review: Expected CanvasPattern, but null is also possible
    this.context.fillStyle = this.context.createPattern(srcLayer.getCanvas(), 'repeat');
    this.context.fill();
    this.empty = false;

    // Path now implicitly closed
    this.pathClosed = true;
  }

  /**
   * Push current layer state onto stack.
   */
  public push() {
    // Save current state onto stack
    this.context.save();
    this.stackSize++;
  }

  /**
   * Pop layer state off stack.
   */
  public pop() {
    // Restore current state from stack
    if (this.stackSize > 0) {
      this.context.restore();
      this.stackSize--;
    }
  }

  /**
   * Reset the layer, clearing the stack, the current path, and any transform
   * matrix.
   */
  public reset() {
    // Clear stack
    while (this.stackSize > 0) {
      this.context.restore();
      this.stackSize--;
    }

    // Restore to initial state
    this.context.restore();
    this.context.save();

    // Clear path
    this.context.beginPath();
    this.pathClosed = false;
  }

  /**
   * Sets the given affine transform (defined with six values from the
   * transform's matrix).
   *
   * @param a - The first value in the affine transform's matrix.
   * @param b - The second value in the affine transform's matrix.
   * @param c - The third value in the affine transform's matrix.
   * @param d - The fourth value in the affine transform's matrix.
   * @param e - The fifth value in the affine transform's matrix.
   * @param f - The sixth value in the affine transform's matrix.
   */
  public setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.context.setTransform(a, b, c, d, e, f /* 0, 0, 1 */);
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
  public transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.context.transform(a, b, c, d, e, f /* 0, 0, 1 */);
  }

  /**
   * Sets the channel mask for future operations on this Layer.
   *
   * The channel mask is a Guacamole-specific compositing operation identifier
   * with a single bit representing each of four channels (in order): source
   * image where destination transparent, source where destination opaque,
   * destination where source transparent, and destination where source
   * opaque.
   *
   * @param mask - The channel mask for future operations on this
   *                      Layer.
   */
  public setChannelMask(mask: number) {
    this.context.globalCompositeOperation = compositeOperation[mask];
  }

  /**
   * Sets the miter limit for stroke operations using the miter join. This
   * limit is the maximum ratio of the size of the miter join to the stroke
   * width. If this ratio is exceeded, the miter will not be drawn for that
   * joint of the path.
   *
   * @param limit - The miter limit for stroke operations using the
   *                       miter join.
   */
  public setMiterLimit(limit: number) {
    this.context.miterLimit = limit;
  }

  /**
   * Resizes the canvas element backing this Layer. This function should only
   * be used internally.
   *
   * @private
   * @param newWidth - The new width to assign to this Layer.
   * @param newHeight - The new height to assign to this Layer.
   */
  private __resize(newWidth = 0, newHeight = 0) {
    // Calculate new dimensions of internal canvas
    const canvasWidth = Math.ceil(newWidth / CANVAS_SIZE_FACTOR) * CANVAS_SIZE_FACTOR;
    const canvasHeight = Math.ceil(newHeight / CANVAS_SIZE_FACTOR) * CANVAS_SIZE_FACTOR;

    // Resize only if canvas dimensions are actually changing
    if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
      // Copy old data only if relevant and non-empty
      let oldData: HTMLCanvasElement | null = null;
      if (!this.empty && this.canvas.width !== 0 && this.canvas.height !== 0) {
        // Create canvas and context for holding old data
        oldData = document.createElement('canvas');
        oldData.width = Math.min(this.width, newWidth);
        oldData.height = Math.min(this.height, newHeight);

        const oldDataContext = oldData.getContext('2d');
        if (oldDataContext === null) {
          throw new Error('Canvas context 2d not available');
        }

        // Copy image data from current
        oldDataContext.drawImage(this.canvas,
          0,
          0,
          oldData.width,
          oldData.height,
          0,
          0,
          oldData.width,
          oldData.height);
      }

      // Preserve composite operation
      const oldCompositeOperation = this.context.globalCompositeOperation;

      // Resize canvas
      this.canvas.width = canvasWidth;
      this.canvas.height = canvasHeight;

      // Redraw old data, if any
      if (oldData) {
        this.context?.drawImage(oldData,
          0,
          0,
          oldData.width,
          oldData.height,
          0,
          0,
          oldData.width,
          oldData.height);
      }

      // Restore composite operation
      this.context.globalCompositeOperation = oldCompositeOperation;

      // Acknowledge reset of stack (happens on resize of canvas)
      this.stackSize = 0;
      this.context.save();
    } else {
      // If the canvas size is not changing, manually force state reset
      this.reset();
    }

    // Assign new layer dimensions
    this.width = newWidth;
    this.height = newHeight;
  }

  /**
   * Given the X and Y coordinates of the upper-left corner of a rectangle
   * and the rectangle's width and height, resize the backing canvas element
   * as necessary to ensure that the rectangle fits within the canvas
   * element's coordinate space. This function will only make the canvas
   * larger. If the rectangle already fits within the canvas element's
   * coordinate space, the canvas is left unchanged.
   *
   * @private
   * @param x - The X coordinate of the upper-left corner of the
   *                   rectangle to fit.
   * @param y - The Y coordinate of the upper-left corner of the
   *                   rectangle to fit.
   * @param w - The width of the the rectangle to fit.
   * @param h - The height of the the rectangle to fit.
   */
  private __fitRect(x: number, y: number, w: number, h: number) {
    // Calculate bounds
    const opBoundX = w + x;
    const opBoundY = h + y;

    // Determine max width
    let resizeWidth;
    if (opBoundX > this.width) {
      resizeWidth = opBoundX;
    } else {
      resizeWidth = this.width;
    }

    // Determine max height
    let resizeHeight;
    if (opBoundY > this.height) {
      resizeHeight = opBoundY;
    } else {
      resizeHeight = this.height;
    }

    // Resize if necessary
    this.resize(resizeWidth, resizeHeight);
  }
}
