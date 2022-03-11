import {
  DEFAULT_TRANSFER_FUNCTION,
  Display,
  Layer,
  LINE_CAP,
  LINE_JOIN,
  VisibleLayer,
} from '@guacamole-client/display';
import {
  DrawingInstructionHandler,
  Streaming,
} from '@guacamole-client/protocol';

import { InstructionRouter } from '../instruction-router';
import {
  InputStreamHandler,
  InputStreamResponseSender,
  InputStreamsManager,
  registerInputStreamHandlers,
} from '../streams/input';

export interface ImgInstructionHandler {
  handleImgInstruction(
    streamIndex: number,
    layerIndex: number,
    channelMask: number,
    x: number,
    y: number,
    mimetype: string,
  ): void;
}

export interface ImgStreamHandler
  extends ImgInstructionHandler,
    InputStreamHandler {}

export class DisplayManager
  implements ImgStreamHandler, DrawingInstructionHandler
{
  private readonly inputStreams: InputStreamsManager;

  /**
   * All available layers
   *
   * @private
   */
  private readonly layers: Map<number, VisibleLayer> = new Map();

  /**
   * Handlers for all defined layer properties.
   *
   * @private
   */
  // TODO Review the following lint suppression
  // eslint-disable-next-line @typescript-eslint/ban-types
  private readonly layerPropertyHandlers: Record<string, Function> = {
    'miter-limit': (layer: Layer, value: string) => {
      this.display.setMiterLimit(layer, parseFloat(value));
    },
  };

  constructor(readonly display: Display, sender: InputStreamResponseSender) {
    this.inputStreams = new InputStreamsManager(sender);
  }

  /**
   * Returns the layer with the given index, creating it if necessary.
   * Positive indices refer to visible layers, an index of zero refers to
   * the default layer, and negative indices refer to buffers.
   *
   * @param index - The index of the layer to retrieve.
   *
   * @return The layer having the given index.
   */
  getLayer(index: number): VisibleLayer {
    // Get layer, create if necessary
    let layer = this.layers.get(index);
    if (!layer) {
      // Create layer based on index
      if (index === 0) {
        layer = this.display.getDefaultLayer();
      } else if (index > 0) {
        layer = this.display.createLayer();
      } else {
        // TODO Review this
        layer = this.display.createBuffer() as VisibleLayer;
      }

      // Add new layer
      this.layers.set(index, layer);
    }

    return layer;
  }

  showCursor(show: boolean) {
    this.display.showCursor(true);
  }

  moveCursor(x: number, y: number) {
    this.display.moveCursor(x, y);
  }

  flush(callback: () => void) {
    this.display.flush(callback);
  }

  //<editor-fold defaultstate="collapsed" desc="Instruction handlers">

  handleImgInstruction(
    streamIndex: number,
    layerIndex: number,
    channelMask: number,
    x: number,
    y: number,
    mimetype: string,
  ) {
    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);

    // Get layer
    const layer = this.getLayer(layerIndex);

    // Draw received contents once decoded
    this.display.setChannelMask(layer, channelMask);
    this.display.drawStream(layer, x, y, stream, mimetype);
  }

  handleBlobInstruction(streamIndex: number, data: string): void {
    // Get stream
    const stream = this.inputStreams.getStream(streamIndex);
    if (!stream) {
      return;
    }

    // Write data
    if (stream.onblob !== null) {
      stream.onblob(data);
    }
  }

  handleEndInstruction(streamIndex: number): void {
    // Get stream
    const stream = this.inputStreams.getStream(streamIndex);
    if (!stream) {
      return;
    }

    // Signal end of stream if handler defined
    if (stream.onend !== null) {
      stream.onend();
    }

    // Invalidate stream
    this.inputStreams.freeStream(streamIndex);
  }

  handleArcInstruction(
    layerIndex: number,
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    negative: number,
  ) {
    const layer = this.getLayer(layerIndex);
    this.display.arc(layer, x, y, radius, startAngle, endAngle, negative !== 0);
  }

  handleCfillInstruction(
    layerIndex: number,
    channelMask: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) {
    const layer = this.getLayer(layerIndex);
    this.display.setChannelMask(layer, channelMask);
    this.display.fillColor(layer, r, g, b, a);
  }

  handleClipInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.clip(layer);
  }

  handleCloseInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.close(layer);
  }

  handleCopyInstruction(
    srcLayerIndex: number,
    dstLayerIndex: number,
    channelMask: number,
    srcX: number,
    srcY: number,
    srcWidth: number,
    srcHeight: number,
    dstX: number,
    dstY: number,
  ) {
    const srcLayer = this.getLayer(srcLayerIndex);
    const dstLayer = this.getLayer(dstLayerIndex);
    this.display.setChannelMask(dstLayer, channelMask);
    this.display.copy(
      srcLayer,
      srcX,
      srcY,
      srcWidth,
      srcHeight,
      dstLayer,
      dstX,
      dstY,
    );
  }

  handleCstrokeInstruction(
    layerIndex: number,
    channelMask: number,
    cap: CanvasLineCap,
    join: CanvasLineJoin,
    thickness: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) {
    const layer = this.getLayer(layerIndex);
    this.display.setChannelMask(layer, channelMask);
    this.display.strokeColor(layer, cap, join, thickness, r, g, b, a);
  }

  handleCursorInstruction(
    srcLayerIndex: number,
    cursorHotspotX: number,
    cursorHotspotY: number,
    srcX: number,
    srcY: number,
    srcWidth: number,
    srcHeight: number,
  ) {
    const srcLayer = this.getLayer(srcLayerIndex);
    this.display.setCursor(
      cursorHotspotX,
      cursorHotspotY,
      srcLayer,
      srcX,
      srcY,
      srcWidth,
      srcHeight,
    );
  }

  handleCurveInstruction(
    layerIndex: number,
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ) {
    const layer = this.getLayer(layerIndex);
    this.display.curveTo(layer, cp1x, cp1y, cp2x, cp2y, x, y);
  }

  handleDisposeInstruction(layerIndex: number) {
    // If visible layer, remove from parent
    if (layerIndex > 0) {
      // Remove from parent
      const layer = this.getLayer(layerIndex);
      this.display.dispose(layer);

      // Delete reference
      this.layers.delete(layerIndex);
    } else if (layerIndex < 0) {
      // If buffer, just delete reference
      // TODO Review the following lint suppression
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      this.layers.delete(layerIndex);
    }

    // Attempting to dispose the root layer currently has no effect.
  }

  handleDistortInstruction(
    layerIndex: number,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) {
    // Only valid for visible layers (not buffers)
    if (layerIndex < 0) {
      return;
    }

    const layer = this.getLayer(layerIndex);
    this.display.distort(layer, a, b, c, d, e, f);
  }

  handleIdentityInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.setTransform(layer, 1, 0, 0, 1, 0, 0);
  }

  handleJpegInstruction(
    layerIndex: number,
    channelMask: number,
    x: number,
    y: number,
    data: string,
  ) {
    const layer = this.getLayer(layerIndex);
    this.display.setChannelMask(layer, channelMask);
    this.display.draw(layer, x, y, `data:image/jpeg;base64,${data}`);
  }

  handleLfillInstruction(
    layerIndex: number,
    channelMask: number,
    srcLayerIndex: number,
  ) {
    const layer = this.getLayer(layerIndex);
    const srcLayer = this.getLayer(srcLayerIndex);
    this.display.setChannelMask(layer, channelMask);
    this.display.fillLayer(layer, srcLayer);
  }

  handleLineInstruction(layerIndex: number, x: number, y: number) {
    const layer = this.getLayer(layerIndex);
    this.display.lineTo(layer, x, y);
  }

  handleLstrokeInstruction(
    layerIndex: number,
    srcLayerIndex: number,
    channelMask: number,
    cap: CanvasLineCap,
    join: CanvasLineJoin,
    thickness: number,
  ) {
    const layer = this.getLayer(layerIndex);
    const srcLayer = this.getLayer(srcLayerIndex);

    this.display.setChannelMask(layer, channelMask);
    this.display.strokeLayer(layer, cap, join, thickness, srcLayer);
  }

  handleMoveInstruction(
    layerIndex: number,
    parentIndex: number,
    x: number,
    y: number,
    z: number,
  ) {
    // Only valid for non-default layers
    if (layerIndex <= 0 || parentIndex < 0) {
      return;
    }

    const layer = this.getLayer(layerIndex);
    const parent = this.getLayer(parentIndex);
    this.display.move(layer, parent, x, y, z);
  }

  handlePngInstruction(
    layerIndex: number,
    channelMask: number,
    x: number,
    y: number,
    data: string,
  ) {
    const layer = this.getLayer(layerIndex);
    this.display.setChannelMask(layer, channelMask);
    this.display.draw(layer, x, y, `data:image/png;base64,${data}`);
  }

  handlePopInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.pop(layer);
  }

  handlePushInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.push(layer);
  }

  handleRectInstruction(
    layerIndex: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const layer = this.getLayer(layerIndex);
    this.display.rect(layer, x, y, w, h);
  }

  handleResetInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.reset(layer);
  }

  handleSetInstruction(layerIndex: number, name: string, value: string) {
    const layer = this.getLayer(layerIndex);

    // Call property handler if defined
    const handler = this.layerPropertyHandlers.get(name);
    if (handler) {
      handler(layer, value);
    }
  }

  handleShadeInstruction(layerIndex: number, a: number) {
    // Only valid for visible layers (not buffers)
    if (layerIndex < 0) {
      return;
    }

    const layer = this.getLayer(layerIndex);
    this.display.shade(layer, a);
  }

  handleSizeInstruction(layerIndex: number, width: number, height: number) {
    const layer = this.getLayer(layerIndex);
    this.display.resize(layer, width, height);
  }

  handleStartInstruction(layerIndex: number, x: number, y: number) {
    const layer = this.getLayer(layerIndex);
    this.display.moveTo(layer, x, y);
  }

  handleTransferInstruction(
    srcLayerIndex: number,
    dstLayerIndex: number,
    functionIndex: number,
    srcX: number,
    srcY: number,
    srcWidth: number,
    srcHeight: number,
    dstX: number,
    dstY: number,
  ) {
    const srcLayer = this.getLayer(srcLayerIndex);
    const dstLayer = this.getLayer(dstLayerIndex);

    /* SRC */
    if (functionIndex === 0x3) {
      this.display.put(
        srcLayer,
        srcX,
        srcY,
        srcWidth,
        srcHeight,
        dstLayer,
        dstX,
        dstY,
      );
    } else if (functionIndex !== 0x5) {
      /* Anything else that isn't a NO-OP */
      this.display.transfer(
        srcLayer,
        srcX,
        srcY,
        srcWidth,
        srcHeight,
        dstLayer,
        dstX,
        dstY,
        DEFAULT_TRANSFER_FUNCTION[functionIndex],
      );
    }
  }

  handleTransformInstruction(
    layerIndex: number,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) {
    const layer = this.getLayer(layerIndex);
    this.display.transform(layer, a, b, c, d, e, f);
  }

  //</editor-fold>
}

function registerDrawingInstructionHandlers(
  router: InstructionRouter,
  handler: DrawingInstructionHandler,
) {
  router.addInstructionHandler('arc', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);
    const x = parseInt(params[1], 10);
    const y = parseInt(params[2], 10);
    const radius = parseInt(params[3], 10);
    const startAngle = parseFloat(params[4]);
    const endAngle = parseFloat(params[5]);
    const negative = parseInt(params[6], 10);

    handler.handleArcInstruction(
      layerIndex,
      x,
      y,
      radius,
      startAngle,
      endAngle,
      negative,
    );
  });
  router.addInstructionHandler('cfill', (params: string[]) => {
    const channelMask = parseInt(params[0], 10);
    const layerIndex = parseInt(params[1], 10);
    const r = parseInt(params[2], 10);
    const g = parseInt(params[3], 10);
    const b = parseInt(params[4], 10);
    const a = parseInt(params[5], 10);

    handler.handleCfillInstruction(layerIndex, channelMask, r, g, b, a);
  });
  router.addInstructionHandler('clip', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);

    handler.handleClipInstruction(layerIndex);
  });
  router.addInstructionHandler('close', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);

    handler.handleCloseInstruction(layerIndex);
  });
  router.addInstructionHandler('copy', (params: string[]) => {
    const srcLayerIndex = parseInt(params[0], 10);
    const srcX = parseInt(params[1], 10);
    const srcY = parseInt(params[2], 10);
    const srcWidth = parseInt(params[3], 10);
    const srcHeight = parseInt(params[4], 10);
    const channelMask = parseInt(params[5], 10);
    const dstLayerIndex = parseInt(params[6], 10);
    const dstX = parseInt(params[7], 10);
    const dstY = parseInt(params[8], 10);

    handler.handleCopyInstruction(
      srcLayerIndex,
      dstLayerIndex,
      channelMask,
      srcX,
      srcY,
      srcWidth,
      srcHeight,
      dstX,
      dstY,
    );
  });
  router.addInstructionHandler('cstroke', (params: string[]) => {
    const channelMask = parseInt(params[0], 10);
    const layerIndex = parseInt(params[1], 10);
    const cap = LINE_CAP[parseInt(params[2], 10)];
    const join = LINE_JOIN[parseInt(params[3], 10)];
    const thickness = parseInt(params[4], 10);
    const r = parseInt(params[5], 10);
    const g = parseInt(params[6], 10);
    const b = parseInt(params[7], 10);
    const a = parseInt(params[8], 10);

    handler.handleCstrokeInstruction(
      layerIndex,
      channelMask,
      cap,
      join,
      thickness,
      r,
      g,
      b,
      a,
    );
  });
  router.addInstructionHandler('cursor', (params: string[]) => {
    const cursorHotspotX = parseInt(params[0], 10);
    const cursorHotspotY = parseInt(params[1], 10);
    const srcLayerIndex = parseInt(params[2], 10);
    const srcX = parseInt(params[3], 10);
    const srcY = parseInt(params[4], 10);
    const srcWidth = parseInt(params[5], 10);
    const srcHeight = parseInt(params[6], 10);

    handler.handleCursorInstruction(
      srcLayerIndex,
      cursorHotspotX,
      cursorHotspotY,
      srcX,
      srcY,
      srcWidth,
      srcHeight,
    );
  });
  router.addInstructionHandler('curve', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);
    const cp1x = parseInt(params[1], 10);
    const cp1y = parseInt(params[2], 10);
    const cp2x = parseInt(params[3], 10);
    const cp2y = parseInt(params[4], 10);
    const x = parseInt(params[5], 10);
    const y = parseInt(params[6], 10);

    handler.handleCurveInstruction(layerIndex, cp1x, cp1y, cp2x, cp2y, x, y);
  });
  router.addInstructionHandler('dispose', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);

    handler.handleDisposeInstruction(layerIndex);
  });
  router.addInstructionHandler('distort', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);
    const a = parseFloat(params[1]);
    const b = parseFloat(params[2]);
    const c = parseFloat(params[3]);
    const d = parseFloat(params[4]);
    const e = parseFloat(params[5]);
    const f = parseFloat(params[6]);

    handler.handleDistortInstruction(layerIndex, a, b, c, d, e, f);
  });
  router.addInstructionHandler('identity', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);

    handler.handleIdentityInstruction(layerIndex);
  });
  router.addInstructionHandler('jpeg', (params: string[]) => {
    const channelMask = parseInt(params[0], 10);
    const layerIndex = parseInt(params[1], 10);
    const x = parseInt(params[2], 10);
    const y = parseInt(params[3], 10);
    const data = params[4];

    handler.handleJpegInstruction(layerIndex, channelMask, x, y, data);
  });
  router.addInstructionHandler('lfill', (params: string[]) => {
    const channelMask = parseInt(params[0], 10);
    const layerIndex = parseInt(params[1], 10);
    const srcLayerIndex = parseInt(params[2], 10);

    handler.handleLfillInstruction(layerIndex, channelMask, srcLayerIndex);
  });
  router.addInstructionHandler('line', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);
    const x = parseInt(params[1], 10);
    const y = parseInt(params[2], 10);

    handler.handleLineInstruction(layerIndex, x, y);
  });
  router.addInstructionHandler('lstroke', (params: string[]) => {
    const channelMask = parseInt(params[0], 10);
    const layerIndex = parseInt(params[1], 10);
    const capIndex = parseInt(params[2], 10);
    const joinIndex = parseInt(params[3], 10);
    const thickness = parseInt(params[4], 10);
    const srcLayerIndex = parseInt(params[5], 10);

    const cap = LINE_CAP[capIndex];
    const join = LINE_JOIN[joinIndex];

    handler.handleLstrokeInstruction(
      layerIndex,
      srcLayerIndex,
      channelMask,
      cap,
      join,
      thickness,
    );
  });
  router.addInstructionHandler('move', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);
    const parentIndex = parseInt(params[1], 10);
    const x = parseInt(params[2], 10);
    const y = parseInt(params[3], 10);
    const z = parseInt(params[4], 10);

    handler.handleMoveInstruction(layerIndex, parentIndex, x, y, z);
  });
  router.addInstructionHandler('png', (params: string[]) => {
    const channelMask = parseInt(params[0], 10);
    const layerIndex = parseInt(params[1], 10);
    const x = parseInt(params[2], 10);
    const y = parseInt(params[3], 10);
    const data = params[4];

    handler.handlePngInstruction(layerIndex, channelMask, x, y, data);
  });
  router.addInstructionHandler('pop', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);

    handler.handlePopInstruction(layerIndex);
  });
  router.addInstructionHandler('push', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);

    handler.handlePushInstruction(layerIndex);
  });
  router.addInstructionHandler('rect', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);
    const x = parseInt(params[1], 10);
    const y = parseInt(params[2], 10);
    const w = parseInt(params[3], 10);
    const h = parseInt(params[4], 10);

    handler.handleRectInstruction(layerIndex, x, y, w, h);
  });
  router.addInstructionHandler('reset', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);

    handler.handleResetInstruction(layerIndex);
  });
  router.addInstructionHandler('set', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);
    const name = params[1];
    const value = params[2];

    handler.handleSetInstruction(layerIndex, name, value);
  });
  router.addInstructionHandler('shade', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);
    const a = parseInt(params[1], 10);

    handler.handleShadeInstruction(layerIndex, a);
  });
  router.addInstructionHandler('size', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);
    const width = parseInt(params[1], 10);
    const height = parseInt(params[2], 10);

    handler.handleSizeInstruction(layerIndex, width, height);
  });
  router.addInstructionHandler('start', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);
    const x = parseInt(params[1], 10);
    const y = parseInt(params[2], 10);

    handler.handleStartInstruction(layerIndex, x, y);
  });
  router.addInstructionHandler('transfer', (params: string[]) => {
    const srcLayerIndex = parseInt(params[0], 10);
    const srcX = parseInt(params[1], 10);
    const srcY = parseInt(params[2], 10);
    const srcWidth = parseInt(params[3], 10);
    const srcHeight = parseInt(params[4], 10);
    const functionIndex = parseInt(params[5], 10);
    const dstLayerIndex = parseInt(params[6], 10);
    const dstX = parseInt(params[7], 10);
    const dstY = parseInt(params[8], 10);

    handler.handleTransferInstruction(
      srcLayerIndex,
      dstLayerIndex,
      functionIndex,
      srcX,
      srcY,
      srcWidth,
      srcHeight,
      dstX,
      dstY,
    );
  });
  router.addInstructionHandler('transform', (params: string[]) => {
    const layerIndex = parseInt(params[0], 10);
    const a = parseFloat(params[1]);
    const b = parseFloat(params[2]);
    const c = parseFloat(params[3]);
    const d = parseFloat(params[4]);
    const e = parseFloat(params[5]);
    const f = parseFloat(params[6]);

    handler.handleTransformInstruction(layerIndex, a, b, c, d, e, f);
  });
}

function registerImgStreamHandlers(
  router: InstructionRouter,
  handler: ImgStreamHandler,
) {
  router.addInstructionHandler(
    Streaming.img.opcode,
    Streaming.img.parser(
      handler.handleImgInstruction.bind(handler), // TODO: Review this bind()
    ),
  );
  registerInputStreamHandlers(router, handler);
}

export function registerInstructionHandlers(
  router: InstructionRouter,
  handler: ImgStreamHandler & DrawingInstructionHandler,
) {
  registerImgStreamHandlers(router, handler);
  registerDrawingInstructionHandlers(router, handler);
}
