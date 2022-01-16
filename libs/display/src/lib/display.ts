import Frame from "./frame";
import * as ChannelMask from "./channel-mask";
import Layer from "./layer";
import VisibleLayer from "./visible-layer";
import Task, { TaskHandler } from "./task";
import { BlobReader, DataURIReader, InputStream } from "@guacamole-client/io";

export type OnResizeCallback = (width: number, height: number) => void;
export type OnCursorCallback = (canvas: HTMLCanvasElement, x: number, y: number) => void;

/**
 * The Guacamole display. The display does not deal with the Guacamole
 * protocol, and instead implements a set of graphical operations which
 * embody the set of operations present in the protocol. The order operations
 * are executed is guaranteed to be in the same order as their corresponding
 * functions are called.
 */
export default class Display {
  /**
   * The X coordinate of the hotspot of the mouse cursor. The hotspot is
   * the relative location within the image of the mouse cursor at which
   * each click occurs.
   */
  public cursorHotspotX = 0;
  /**
   * The Y coordinate of the hotspot of the mouse cursor. The hotspot is
   * the relative location within the image of the mouse cursor at which
   * each click occurs.
   */
  public cursorHotspotY = 0;
  /**
   * The current X coordinate of the local mouse cursor. This is not
   * necessarily the location of the actual mouse - it refers only to
   * the location of the cursor image within the Guacamole display, as
   * last set by moveCursor().
   */
  public cursorX = 0;

  /**
   * The current X coordinate of the local mouse cursor. This is not
   * necessarily the location of the actual mouse - it refers only to
   * the location of the cursor image within the Guacamole display, as
   * last set by moveCursor().
   */
  public cursorY = 0;

  /**
   * Fired when the default layer (and thus the entire Guacamole display)
   * is resized.
   *
   * @event
   * @param width - The new width of the Guacamole display.
   * @param height - The new height of the Guacamole display.
   */
  public onresize: OnResizeCallback | null = null;
  /**
   * Fired whenever the local cursor image is changed. This can be used to
   * implement special handling of the client-side cursor, or to override
   * the default use of a software cursor layer.
   *
   * @event
   * @param canvas - The cursor image.
   * @param x - The X-coordinate of the cursor hotspot.
   * @param y - The Y-coordinate of the cursor hotspot.
   */
  public oncursor: OnCursorCallback | null = null;
  private displayWidth = 0;
  private displayHeight = 0;
  private displayScale = 1;
  private readonly display: HTMLDivElement;
  private readonly bounds: HTMLDivElement;
  private readonly defaultLayer: VisibleLayer;
  private readonly cursor: VisibleLayer;
  /**
   * The queue of all pending Tasks. Tasks will be run in order, with new
   * tasks added at the end of the queue and old tasks removed from the
   * front of the queue (FIFO). These tasks will eventually be grouped
   * into a Frame.
   * @private
   */
  private tasks: Task[] = [];
  /**
   * The queue of all frames. Each frame is a pairing of an array of tasks
   * and a callback which must be called when the frame is rendered.
   * @private
   */
  private readonly frames: Frame[] = [];

  constructor() {
    // Create display
    this.display = document.createElement("div");
    this.display.setAttribute("class", "guacDisplay");
    this.display.style.position = "relative";
    this.display.style.width = `${this.displayWidth}px`;
    this.display.style.height = `${this.displayHeight}px`;

    // Ensure transformations on display originate at 0,0
    const transform = "0 0";
    this.display.style.transformOrigin = transform;
    // TODO Review this
    // this.display.style.webkitTransformOconstrigin = transform;
    // this.display.style.MozTransformOrigin = transform;
    // this.display.style.OTransformOrigin = transform;
    // this.display.style.msTransformOrigin = transform;

    // Create default layer
    this.defaultLayer = new VisibleLayer(this.displayWidth, this.displayHeight);

    // Create cursor layer
    this.cursor = new VisibleLayer(0, 0);
    this.cursor.setChannelMask(ChannelMask.SRC);

    // Add default layer and cursor to display
    this.display.appendChild(this.defaultLayer.getElement());
    this.display.appendChild(this.cursor.getElement());

    // Create bounding div
    this.bounds = document.createElement("div");
    this.bounds.setAttribute("id", "bounds");
    this.bounds.style.position = "relative";
    this.bounds.style.width = `${this.displayWidth * this.displayScale}px`;
    this.bounds.style.height = `${this.displayHeight * this.displayScale}px`;

    // Add display to bounds
    this.bounds.appendChild(this.display);
  }

  /**
   * Returns the width of this display.
   *
   * @return The width of this display;
   */
  public getWidth(): number {
    return this.displayWidth;
  }

  /**
   * Returns the height of this display.
   *
   * @return The height of this display;
   */
  public getHeight(): number {
    return this.displayHeight;
  }

  /**
   * Returns the default layer of this display. Each Guacamole display always
   * has at least one layer. Other layers can optionally be created within
   * this layer, but the default layer cannot be removed and is the absolute
   * ancestor of all other layers.
   *
   * @return {VisibleLayer} The default layer.
   */
  public getDefaultLayer(): VisibleLayer {
    return this.defaultLayer;
  }

  /**
   * Returns the cursor layer of this display. Each Guacamole display contains
   * a layer for the image of the mouse cursor. This layer is a special case
   * and exists above all other layers, similar to the hardware mouse cursor.
   *
   * @return {VisibleLayer} The cursor layer.
   */
  public getCursorLayer(): VisibleLayer {
    return this.cursor;
  }

  /**
   * Creates a new layer. The new layer will be a direct child of the default
   * layer, but can be moved to be a child of any other layer. Layers returned
   * by this function are visible.
   *
   * @return {VisibleLayer} The newly-created layer.
   */
  public createLayer(): VisibleLayer {
    const layer = new VisibleLayer(this.displayWidth, this.displayHeight);
    layer.move(this.defaultLayer, 0, 0, 0);
    return layer;
  }

  /**
   * Creates a new buffer. Buffers are invisible, off-screen surfaces. They
   * are implemented in the same manner as layers, but do not provide the
   * same nesting semantics.
   *
   * @return {Layer} The newly-created buffer.
   */
  public createBuffer() {
    const buffer = new Layer(0, 0);
    buffer.autosize = true;
    return buffer;
  }

  /**
   * Flush all pending draw tasks, if possible, as a new frame. If the entire
   * frame is not ready, the flush will wait until all required tasks are
   * unblocked.
   *
   * @param callback - The function to call when this frame is
   *                            flushed. This may happen immediately, or
   *                            later when blocked tasks become unblocked.
   */
  public flush(callback: () => void) {
    // Add frame, reset tasks
    this.frames.push(new Frame(callback, this.tasks));
    this.tasks = [];

    // Attempt flush
    this.__flushFrames();
  }

  /**
   * Sets the hotspot and image of the mouse cursor displayed within the
   * Guacamole display.
   *
   * @param hotspotX - The X coordinate of the cursor hotspot.
   * @param hotspotY - The Y coordinate of the cursor hotspot.
   * @param layer - The source layer containing the data which
   *                                should be used as the mouse cursor image.
   * @param srcx - The X coordinate of the upper-left corner of the
   *                      rectangle within the source layer's coordinate
   *                      space to copy data from.
   * @param srcy - The Y coordinate of the upper-left corner of the
   *                      rectangle within the source layer's coordinate
   *                      space to copy data from.
   * @param srcw - The width of the rectangle within the source layer's
   *                      coordinate space to copy data from.
   * @param srch - The height of the rectangle within the source
   *                      layer's coordinate space to copy data from.

   */
  public setCursor(hotspotX: number, hotspotY: number, layer: Layer, srcx: number, srcy: number, srcw: number, srch: number) {
    this.scheduleTask(() => {
      // Set hotspot
      this.cursorHotspotX = hotspotX;
      this.cursorHotspotY = hotspotY;

      // Reset cursor size
      this.cursor.resize(srcw, srch);

      // Draw cursor to cursor layer
      this.cursor.copy(layer, srcx, srcy, srcw, srch, 0, 0);
      this.moveCursor(this.cursorX, this.cursorY);

      // Fire cursor change event
      if (this.oncursor !== null) {
        this.oncursor(this.cursor.toCanvas(), hotspotX, hotspotY);
      }
    });
  }

  /**
   * Sets whether the software-rendered cursor is shown. This cursor differs
   * from the hardware cursor in that it is built into the Display,
   * and relies on its own Guacamole layer to render.
   *
   * @param show - Whether to show the software cursor.
   */
  public showCursor(show = true) {
    const element = this.cursor.getElement();
    const parent = element.parentNode;

    // Remove from DOM if hidden
    if (!show) {
      if (parent) {
        parent.removeChild(element);
      }
    } else if (parent !== this.display) {
      // Otherwise, ensure cursor is child of display
      this.display.appendChild(element);
    }
  }

  /**
   * Sets the location of the local cursor to the given coordinates. For the
   * sake of responsiveness, this function performs its action immediately.
   * Cursor motion is not maintained within atomic frames.
   *
   * @param x - The X coordinate to move the cursor to.
   * @param y - The Y coordinate to move the cursor to.
   */
  public moveCursor(x: number, y: number) {
    // Move cursor layer
    this.cursor.translate(x - this.cursorHotspotX, y - this.cursorHotspotY);

    // Update stored position
    this.cursorX = x;
    this.cursorY = y;
  }

  /**
   * Changes the size of the given Layer to the given width and height.
   * Resizing is only attempted if the new size provided is actually different
   * from the current size.
   *
   * @param layer - The layer to resize.
   * @param width - The new width.
   * @param height - The new height.
   */
  public resize(layer: Layer, width: number, height: number) {
    this.scheduleTask(() => {
      layer.resize(width, height);

      // Resize display if default layer is resized
      if (layer === this.defaultLayer) {
        // Update (set) display size
        this.displayWidth = width;
        this.displayHeight = height;
        this.display.style.width = `${this.displayWidth}px`;
        this.display.style.height = `${this.displayHeight}px`;

        // Update bounds size
        this.bounds.style.width = `${this.displayWidth * this.displayScale}px`;
        this.bounds.style.height = `${this.displayHeight * this.displayScale}px`;

        // Notify of resize
        if (this.onresize !== null) {
          this.onresize(width, height);
        }
      }
    });
  }

  /**
   * Draws the specified image at the given coordinates. The image specified
   * must already be loaded.
   *
   * @param layer - The layer to draw upon.
   * @param x - The destination X coordinate.
   * @param y - The destination Y coordinate.
   * @param image - The image to draw. Note that this not a URL.
   */
  public drawImage(layer: Layer, x: number, y: number, image: CanvasImageSource) {
    this.scheduleTask(() => {
      layer.drawImage(x, y, image);
    });
  }

  /**
   * Draws the image contained within the specified Blob at the given
   * coordinates. The Blob specified must already be populated with image
   * data.
   *
   * @param layer - The layer to draw upon.
   * @param x - The destination X coordinate.
   * @param y - The destination Y coordinate.
   * @param blob - The Blob containing the image data to draw.
   */
  public drawBlob(layer: Layer, x: number, y: number, blob: Blob): void {
    let task: Task;

    // Prefer createImageBitmap() over blob URLs if available
    if (window.createImageBitmap) {
      let bitmap: CanvasImageSource;

      // Draw image once loaded
      task = this.scheduleTask(() => {
        layer.drawImage(x, y, bitmap);
      }, true);

      // Load image from provided blob
      // TODO Review the following lint suppression
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      window.createImageBitmap(blob)
        .then(decoded => {
          bitmap = decoded;
          task.unblock();
        });
    } else {
      // Use blob URLs and the Image object if createImageBitmap() is
      // unavailable
      // Create URL for blob
      const url = URL.createObjectURL(blob);

      // Draw and free blob URL when ready
      task = this.scheduleTask(() => {
        // Draw the image only if it loaded without errors
        if (image.width && image.height) {
          layer.drawImage(x, y, image);
        }

        // Blob URL no longer needed
        URL.revokeObjectURL(url);
      }, true);

      // Load image from URL
      const image = new Image();
      // TODO Review this
      image.onload = task.unblock as () => void;
      image.onerror = task.unblock as () => void;
      image.src = url;
    }
  }

  /**
   * Draws the image within the given stream at the given coordinates. The
   * image will be loaded automatically, and this and any future operations
   * will wait for the image to finish loading. This function will
   * automatically choose an appropriate method for reading and decoding the
   * given image stream, and should be preferred for received streams except
   * where manual decoding of the stream is unavoidable.
   *
   * @param layer - The layer to draw upon.
   * @param x - The destination X coordinate.
   * @param y - The destination Y coordinate.
   * @param stream - The stream along which image data will be received.
   * @param mimetype - The mimetype of the image within the stream.
   */
  public drawStream(layer: Layer, x: number, y: number, stream: InputStream, mimetype: string): void {
    // If createImageBitmap() is available, load the image as a blob so
    // that function can be used
    // @ts-ignore TODO Review this
    if (window.createImageBitmap) {
      const reader = new BlobReader(stream, mimetype);
      reader.onend = () => {
        this.drawBlob(layer, x, y, reader.getBlob());
      };
    } else {
      // Lacking createImageBitmap(), fall back to data URIs and the Image
      // object
      const reader = new DataURIReader(stream, mimetype);
      reader.onend = () => {
        this.draw(layer, x, y, reader.getURI());
      };
    }
  }

  /**
   * Draws the image at the specified URL at the given coordinates. The image
   * will be loaded automatically, and this and any future operations will
   * wait for the image to finish loading.
   *
   * @param layer - The layer to draw upon.
   * @param x - The destination X coordinate.
   * @param y - The destination Y coordinate.
   * @param url - The URL of the image to draw.
   */
  public draw(layer: Layer, x: number, y: number, url: string) {
    const task = this.scheduleTask(() => {
      // Draw the image only if it loaded without errors
      if (image.width && image.height) {
        layer.drawImage(x, y, image);
      }
    }, true);

    const image = new Image();
    image.onload = task.unblock;
    image.onerror = task.unblock;
    image.src = url;
  }

  /**
   * Plays the video at the specified URL within this layer. The video
   * will be loaded automatically, and this and any future operations will
   * wait for the video to finish loading. Future operations will not be
   * executed until the video finishes playing.
   *
   * @param layer - The layer to draw upon.
   * @param mimetype - The mimetype of the video to play.
   * @param duration - The duration of the video in milliseconds.
   * @param url - The URL of the video to play.
   */
  public play(layer: Layer, mimetype: string, duration: number, url: string) {
    // Start loading the video
    const video = document.createElement("video");
    // TODO Review this
    // video.type = mimetype;
    video.src = url;

    // Start copying frames when playing
    video.addEventListener("play", () => {
      function renderCallback() {
        layer.drawImage(0, 0, video);
        if (!video.ended) {
          window.setTimeout(renderCallback, 20);
        }
      }

      renderCallback();
    }, false);

    this.scheduleTask(video.play);
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
   * @param dstLayer - The layer to draw upon.
   * @param x - The destination X coordinate.
   * @param y - The destination Y coordinate.
   * @param transferFunction - The transfer function to use to
   *                                    transfer data from source to
   *                                    destination.
   */
  // TODO Review the following lint suppression
  // eslint-disable-next-line @typescript-eslint/ban-types
  public transfer(srcLayer: Layer, srcx: number, srcy: number, srcw: number, srch: number, dstLayer: Layer, x: number, y: number, transferFunction: Function) {
    this.scheduleTask(() => {
      dstLayer.transfer(srcLayer, srcx, srcy, srcw, srch, x, y, transferFunction);
    });
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
   * @param dstLayer - The layer to draw upon.
   * @param x - The destination X coordinate.
   * @param y - The destination Y coordinate.
   */
  public put(srcLayer: Layer, srcx: number, srcy: number, srcw: number, srch: number, dstLayer: Layer, x: number, y: number) {
    this.scheduleTask(() => {
      dstLayer.put(srcLayer, srcx, srcy, srcw, srch, x, y);
    });
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
   * @param dstLayer - The layer to draw upon.
   * @param x - The destination X coordinate.
   * @param y - The destination Y coordinate.
   */
  public copy(srcLayer: Layer, srcx: number, srcy: number, srcw: number, srch: number, dstLayer: Layer, x: number, y: number) {
    this.scheduleTask(() => {
      dstLayer.copy(srcLayer, srcx, srcy, srcw, srch, x, y);
    });
  }

  /**
   * Starts a new path at the specified point.
   *
   * @param layer - The layer to draw upon.
   * @param x - The X coordinate of the point to draw.
   * @param y - The Y coordinate of the point to draw.
   */
  public moveTo(layer: Layer, x: number, y: number) {
    this.scheduleTask(() => {
      layer.moveTo(x, y);
    });
  }

  /**
   * Add the specified line to the current path.
   *
   * @param layer - The layer to draw upon.
   * @param x - The X coordinate of the endpoint of the line to draw.
   * @param y - The Y coordinate of the endpoint of the line to draw.
   */
  public lineTo(layer: Layer, x: number, y: number) {
    this.scheduleTask(() => {
      layer.lineTo(x, y);
    });
  }

  /**
   * Add the specified arc to the current path.
   *
   * @param layer - The layer to draw upon.
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
  public arc(layer: Layer, x: number, y: number, radius: number, startAngle: number, endAngle: number, negative: boolean) {
    this.scheduleTask(() => {
      layer.arc(x, y, radius, startAngle, endAngle, negative);
    });
  }

  /**
   * Starts a new path at the specified point.
   *
   * @param layer - The layer to draw upon.
   * @param cp1x - The X coordinate of the first control point.
   * @param cp1y - The Y coordinate of the first control point.
   * @param cp2x - The X coordinate of the second control point.
   * @param cp2y - The Y coordinate of the second control point.
   * @param x - The X coordinate of the endpoint of the curve.
   * @param y - The Y coordinate of the endpoint of the curve.
   */
  public curveTo(layer: Layer, cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    this.scheduleTask(() => {
      layer.curveTo(cp1x, cp1y, cp2x, cp2y, x, y);
    });
  }

  /**
   * Closes the current path by connecting the end point with the start
   * point (if any) with a straight line.
   *
   * @param layer - The layer to draw upon.
   */
  public close(layer: Layer) {
    this.scheduleTask(() => {
      layer.close();
    });
  }

  /**
   * Add the specified rectangle to the current path.
   *
   * @param layer - The layer to draw upon.
   * @param x - The X coordinate of the upper-left corner of the
   *                   rectangle to draw.
   * @param y - The Y coordinate of the upper-left corner of the
   *                   rectangle to draw.
   * @param w - The width of the rectangle to draw.
   * @param h - The height of the rectangle to draw.
   */
  public rect(layer: Layer, x: number, y: number, w: number, h: number) {
    this.scheduleTask(() => {
      layer.rect(x, y, w, h);
    });
  }

  /**
   * Clip all future drawing operations by the current path. The current path
   * is implicitly closed. The current path can continue to be reused
   * for other operations (such as fillColor()) but a new path will be started
   * once a path drawing operation (path() or rect()) is used.
   *
   * @param layer - The layer to affect.
   */
  public clip(layer: Layer) {
    this.scheduleTask(() => {
      layer.clip();
    });
  }

  /**
   * Stroke the current path with the specified color. The current path
   * is implicitly closed. The current path can continue to be reused
   * for other operations (such as clip()) but a new path will be started
   * once a path drawing operation (path() or rect()) is used.
   *
   * @param layer - The layer to draw upon.
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
  public strokeColor(layer: Layer, cap: CanvasLineCap, join: CanvasLineJoin, thickness: number, r: number, g: number, b: number, a: number) {
    this.scheduleTask(() => {
      layer.strokeColor(cap, join, thickness, r, g, b, a);
    });
  }

  /**
   * Fills the current path with the specified color. The current path
   * is implicitly closed. The current path can continue to be reused
   * for other operations (such as clip()) but a new path will be started
   * once a path drawing operation (path() or rect()) is used.
   *
   * @param layer - The layer to draw upon.
   * @param r - The red component of the color to fill.
   * @param g - The green component of the color to fill.
   * @param b - The blue component of the color to fill.
   * @param a - The alpha component of the color to fill.
   */
  public fillColor(layer: Layer, r: number, g: number, b: number, a: number) {
    this.scheduleTask(() => {
      layer.fillColor(r, g, b, a);
    });
  }

  /**
   * Stroke the current path with the image within the specified layer. The
   * image data will be tiled infinitely within the stroke. The current path
   * is implicitly closed. The current path can continue to be reused
   * for other operations (such as clip()) but a new path will be started
   * once a path drawing operation (path() or rect()) is used.
   *
   * @param layer - The layer to draw upon.
   * @param cap - The line cap style. Can be "round", "square",
   *              or "butt".
   * @param join - The line join style. Can be "round", "bevel",
   *               or "miter".
   * @param thickness - The line thickness in pixels.
   * @param srcLayer - The layer to use as a repeating pattern
   *                                   within the stroke.
   */
  public strokeLayer(layer: Layer, cap: CanvasLineCap, join: CanvasLineJoin, thickness: number, srcLayer: Layer) {
    this.scheduleTask(() => {
      layer.strokeLayer(cap, join, thickness, srcLayer);
    });
  }

  /**
   * Fills the current path with the image within the specified layer. The
   * image data will be tiled infinitely within the stroke. The current path
   * is implicitly closed. The current path can continue to be reused
   * for other operations (such as clip()) but a new path will be started
   * once a path drawing operation (path() or rect()) is used.
   *
   * @param layer - The layer to draw upon.
   * @param srcLayer - The layer to use as a repeating pattern
   *                                   within the fill.
   */
  public fillLayer(layer: Layer, srcLayer: Layer) {
    this.scheduleTask(() => {
      layer.fillLayer(srcLayer);
    });
  }

  /**
   * Push current layer state onto stack.
   *
   * @param layer - The layer to draw upon.
   */
  public push(layer: Layer) {
    this.scheduleTask(() => {
      layer.push();
    });
  }

  /**
   * Pop layer state off stack.
   *
   * @param layer - The layer to draw upon.
   */
  public pop(layer: Layer) {
    this.scheduleTask(() => {
      layer.pop();
    });
  }

  /**
   * Reset the layer, clearing the stack, the current path, and any transform
   * matrix.
   *
   * @param layer - The layer to draw upon.
   */
  public reset(layer: Layer) {
    this.scheduleTask(() => {
      layer.reset();
    });
  }

  /**
   * Sets the given affine transform (defined with six values from the
   * transform's matrix).
   *
   * @param layer - The layer to modify.
   * @param a - The first value in the affine transform's matrix.
   * @param b - The second value in the affine transform's matrix.
   * @param c - The third value in the affine transform's matrix.
   * @param d - The fourth value in the affine transform's matrix.
   * @param e - The fifth value in the affine transform's matrix.
   * @param f - The sixth value in the affine transform's matrix.
   */
  public setTransform(layer: Layer, a: number, b: number, c: number, d: number, e: number, f: number) {
    this.scheduleTask(() => {
      layer.setTransform(a, b, c, d, e, f);
    });
  }

  /**
   * Applies the given affine transform (defined with six values from the
   * transform's matrix).
   *
   * @param layer - The layer to modify.
   * @param a - The first value in the affine transform's matrix.
   * @param b - The second value in the affine transform's matrix.
   * @param c - The third value in the affine transform's matrix.
   * @param d - The fourth value in the affine transform's matrix.
   * @param e - The fifth value in the affine transform's matrix.
   * @param f - The sixth value in the affine transform's matrix.
   */
  public transform(layer: Layer, a: number, b: number, c: number, d: number, e: number, f: number) {
    this.scheduleTask(() => {
      layer.transform(a, b, c, d, e, f);
    });
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
   * @param layer - The layer to modify.
   * @param mask - The channel mask for future operations on this Layer.
   */
  public setChannelMask(layer: Layer, mask: number) {
    this.scheduleTask(() => {
      layer.setChannelMask(mask);
    });
  }

  /**
   * Sets the miter limit for stroke operations using the miter join. This
   * limit is the maximum ratio of the size of the miter join to the stroke
   * width. If this ratio is exceeded, the miter will not be drawn for that
   * joint of the path.
   *
   * @param layer - The layer to modify.
   * @param limit - The miter limit for stroke operations using the miter join.
   */
  public setMiterLimit(layer: Layer, limit: number) {
    this.scheduleTask(() => {
      layer.setMiterLimit(limit);
    });
  }

  /**
   * Removes the given layer container entirely, such that it is no longer
   * contained within its parent layer, if any.
   *
   * @param {VisibleLayer} layer
   *     The layer being removed from its parent.
   */
  public dispose(layer: VisibleLayer) {
    this.scheduleTask(() => {
      layer.dispose();
    });
  }

  /**
   * Applies the given affine transform (defined with six values from the
   * transform's matrix) to the given layer.
   *
   * @param layer - The layer being distorted.
   * @param a - The first value in the affine transform's matrix.
   * @param b - The second value in the affine transform's matrix.
   * @param c - The third value in the affine transform's matrix.
   * @param d - The fourth value in the affine transform's matrix.
   * @param e - The fifth value in the affine transform's matrix.
   * @param f - The sixth value in the affine transform's matrix.
   */
  public distort(layer: VisibleLayer, a: number, b: number, c: number, d: number, e: number, f: number) {
    this.scheduleTask(() => {
      layer.distort(a, b, c, d, e, f);
    });
  }

  /**
   * Moves the upper-left corner of the given layer to the given X and Y
   * coordinate, sets the Z stacking order, and re-parents the layer
   * to the given parent layer.
   *
   * @param layer - The layer being moved.
   * @param parent - The parent to set.
   * @param x - The X coordinate to move to.
   * @param y - The Y coordinate to move to.
   * @param z - The Z coordinate to move to.
   */
  public move(layer: VisibleLayer, parent: VisibleLayer, x: number, y: number, z: number) {
    this.scheduleTask(() => {
      layer.move(parent, x, y, z);
    });
  }

  /**
   * Sets the opacity of the given layer to the given value, where 255 is
   * fully opaque and 0 is fully transparent.
   *
   * @param layer - The layer whose opacity should be set.
   * @param alpha - The opacity to set.
   */
  public shade(layer: VisibleLayer, alpha: number) {
    this.scheduleTask(() => {
      layer.shade(alpha);
    });
  }

  /**
   * Sets the scale of the client display element such that it renders at
   * a relatively smaller or larger size, without affecting the true
   * resolution of the display.
   *
   * @param scale - The scale to resize to, where 1.0 is normal
   *                       size (1:1 scale).
   */
  public scale(scale: number) {
    const transform = `scale(${scale}, ${scale})`;
    this.display.style.transform = transform;
    // TODO Review this
    // this.display.style.WebkitTransform = transform;
    // this.display.style.MozTransform = transform;
    // this.display.style.OTransform = transform;
    // this.display.style.msTransform = transform;

    this.displayScale = scale;

    // Update bounds size
    this.bounds.style.width = `${this.displayWidth * this.displayScale}px`;
    this.bounds.style.height = `${this.displayHeight * this.displayScale}px`;
  }

  /**
   * Returns the scale of the display.
   *
   * @return The scale of the display.
   */
  public getScale() {
    return this.displayScale;
  }

  /**
   * Returns a canvas element containing the entire display, with all child
   * layers composited within.
   *
   * @return {HTMLCanvasElement} A new canvas element containing a copy of
   *                             the display.
   */
  public flatten() {
    // Get destination canvas
    const canvas = document.createElement("canvas");
    canvas.width = this.defaultLayer.width;
    canvas.height = this.defaultLayer.height;

    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("Canvas context 2d not available");
    }

    // Returns sorted array of children
    function getChildren(layer: VisibleLayer) {
      // Build array of children
      const children: VisibleLayer[] = [];
      // TODO Review the following lint suppression
      // eslint-disable-next-line guard-for-in
      for (const index in layer.children) {
        children.push(layer.children[index]);
      }

      // Sort
      children.sort((a, b) => {
        // Compare based on Z order
        const diff = a.z - b.z;
        if (diff !== 0) {
          return diff;
        }

        // If Z order identical, use document order
        const aElement = a.getElement();
        const bElement = b.getElement();
        const position = bElement.compareDocumentPosition(aElement);

        if (position && Node.DOCUMENT_POSITION_PRECEDING) {
          return -1;
        }

        if (position && Node.DOCUMENT_POSITION_FOLLOWING) {
          return 1;
        }

        // Otherwise, assume same
        return 0;
      });

      // Done
      return children;
    }

    // Draws the contents of the given layer at the given coordinates
    function drawLayer(layer: VisibleLayer, x: number, y: number) {
      if (context === null) {
        throw new Error("Canvas context 2d not available");
      }

      // Draw layer
      if (layer.width > 0 && layer.height > 0) {
        // Save and update alpha
        const initialAlpha = context.globalAlpha;
        context.globalAlpha *= layer.alpha / 255.0;

        // Copy data
        context.drawImage(layer.getCanvas(), x, y);

        // Draw all children
        const children = getChildren(layer);
        for (const child of children) {
          drawLayer(child, x + child.x, y + child.y);
        }

        // Restore alpha
        context.globalAlpha = initialAlpha;
      }
    }

    // Draw default layer and all children
    drawLayer(this.defaultLayer, 0, 0);

    // Return new canvas copy
    return canvas;
  }

  /**
   * Returns the element which contains the Guacamole display.
   *
   * @return The element containing the Guacamole display.
   */
  public getElement(): HTMLDivElement {
    return this.bounds;
  }

  /**
   * Flushes all pending frames.
   * @private
   */
  private __flushFrames() {
    let renderedFrames = 0;

    // Draw all pending frames, if ready
    while (renderedFrames < this.frames.length) {
      const frame = this.frames[renderedFrames];
      if (!frame.isReady()) {
        break;
      }

      frame.flush();
      renderedFrames++;
    }

    // Remove rendered frames from array
    this.frames.splice(0, renderedFrames);
  }

  /**
   * Schedules a task for future execution. The given handler will execute
   * immediately after all previous tasks upon frame flush, unless this
   * task is blocked. If any tasks is blocked, the entire frame will not
   * render (and no tasks within will execute) until all tasks are unblocked.
   *
   * @private
   * @param handler - The function to call when possible, if any.
   * @param blocked - Whether the task should start blocked.
   * @returns  The Task created and added to the queue for future
   *               running.
   */
  private scheduleTask(handler: TaskHandler, blocked = false): Task {
    const task = new Task(handler, blocked, this.__flushFrames.bind(this));
    this.tasks.push(task);
    return task;
  }
}

