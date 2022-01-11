// TODO https://guacamole.apache.org/doc/gug/protocol-reference.html#drawing-instructions

export interface DrawingInstructionHandlers {
  handleUndefineInstruction(objectIndex: number): void;

  handleArcInstruction(layerIndex: number, x: number, y: number, radius: number, startAngle: number, endAngle: number, negative: number): void;

  handleCfillInstruction(layerIndex: number, channelMask: number, r: number, g: number, b: number, a: number): void;

  handleClipInstruction(layerIndex: number): void;

  handleCloseInstruction(layerIndex: number): void;

  handleCopyInstruction(srcLayerIndex: number, dstLayerIndex: number, channelMask: number, srcX: number, srcY: number, srcWidth: number, srcHeight: number, dstX: number, dstY: number): void;

  handleCstrokeInstruction(layerIndex: number, channelMask: number, cap: CanvasLineCap, join: CanvasLineJoin, thickness: number, r: number, g: number, b: number, a: number): void;

  handleCursorInstruction(srcLayerIndex: number, cursorHotspotX: number, cursorHotspotY: number, srcX: number, srcY: number, srcWidth: number, srcHeight: number): void;

  handleCurveInstruction(layerIndex: number, cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;

  handleDisposeInstruction(layerIndex: number): void;

  handleDistortInstruction(layerIndex: number, a: number, b: number, c: number, d: number, e: number, f: number): void;

  handleIdentityInstruction(layerIndex: number): void;

  handleJpegInstruction(layerIndex: number, channelMask: number, x: number, y: number, data: string): void;

  handleLfillInstruction(layerIndex: number, channelMask: number, srcLayerIndex: number): void;

  handleLineInstruction(layerIndex: number, x: number, y: number): void;

  handleLstrokeInstruction(layerIndex: number, srcLayerIndex: number, channelMask: number, cap: CanvasLineCap, join: CanvasLineJoin, thickness: number): void;

  handleMouseInstruction(x: number, y: number): void;

  handleMoveInstruction(layerIndex: number, parentIndex: number, x: number, y: number, z: number): void;

  handlePngInstruction(layerIndex: number, channelMask: number, x: number, y: number, data: string): void;

  handlePopInstruction(layerIndex: number): void;

  handlePushInstruction(layerIndex: number): void;

  handleRectInstruction(layerIndex: number, x: number, y: number, w: number, h: number): void;

  handleResetInstruction(layerIndex: number): void;

  handleSetInstruction(layerIndex: number, name: string, value: string): void;

  handleShadeInstruction(layerIndex: number, a: number): void;

  handleSizeInstruction(layerIndex: number, width: number, height: number): void;

  handleStartInstruction(layerIndex: number, x: number, y: number): void;

  handleTransferInstruction(srcLayerIndex: number, dstLayerIndex: number, functionIndex: number, srcX: number, srcY: number, srcWidth: number, srcHeight: number, dstX: number, dstY: number): void;
}

