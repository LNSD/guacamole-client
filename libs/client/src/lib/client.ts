import {
  DEFAULT_TRANSFER_FUNCTION,
  Display,
  Layer,
  LINE_CAP,
  LINE_JOIN,
  VisibleLayer
} from './display';
import { Status, StatusCode } from './Status';
import { GuacamoleObject } from './GuacamoleObject';
import { OutputStream, StreamError } from '@guacamole-client/io';
import { AudioPlayer, getAudioPlayerInstance, VideoPlayer } from '@guacamole-client/media';
import {
  ClientControl,
  ClientEvents,
  Decoder,
  ObjectInstruction,
  ServerControl,
  Streaming
} from '@guacamole-client/protocol';
import { Tunnel } from '@guacamole-client/tunnel';
import { State } from './state';
import { MouseState } from '@guacamole-client/input';
import { InputStreamHandlers, InputStreamsManager } from './streams-manager/input';
import { OutputStreamHandlers, OutputStreamsManager } from './streams-manager/output';
import {
  ClientEventMap,
  ClientEventTarget,
  ClientEventTargetMap,
} from './client-events';
import { InstructionRouter } from './instruction-router';

const PING_INTERVAL = 5000;

/**
 * Guacamole protocol client. Given a {@link Tunnel},
 * automatically handles incoming and outgoing Guacamole instructions via the
 * provided tunnel, updating its display using one or more canvas elements.
 */
export class Client implements InputStreamHandlers, OutputStreamHandlers, ClientEventTarget {

  private currentState: State = State.IDLE;

  private currentTimestamp = 0;
  private pingIntervalHandler?: number;

  private readonly events: ClientEventTargetMap = new ClientEventTargetMap();

  private readonly inputStreams: InputStreamsManager;
  private readonly outputStreams: OutputStreamsManager;

  /**
   * The underlying Guacamole display.
   *
   * @private
   */
  private readonly display: Display;

  /**
   * All available layers and buffers
   *
   * @private
   */
  private readonly layers: Map<number, VisibleLayer> = new Map();

  /**
   * All audio players currently in use by the client. Initially, this will
   * be empty, but audio players may be allocated by the server upon request.
   *
   * @private
   */
  private readonly audioPlayers: Map<number, AudioPlayer> = new Map();
  /**
   * All video players currently in use by the client. Initially, this will
   * be empty, but video players may be allocated by the server upon request.
   *
   * @private
   */
  private readonly videoPlayers: Map<number, VideoPlayer> = new Map();

  private readonly decoders: Map<number, Decoder> = new Map();

  /**
   * All current objects. The index of each object is dictated by the
   * Guacamole server.
   *
   * @private
   */
  private readonly objects: Map<number, GuacamoleObject> = new Map();

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
    }
  };

  private readonly instructionRouter: InstructionRouter;

  /**
   * @constructor
   *
   * @param tunnel - The tunnel to use to send and receive Guacamole instructions.
   */
  constructor(private readonly tunnel: Tunnel) {
    this.instructionRouter = new InstructionRouter();
    this.registerInstructionRoutes();

    this.outputStreams = new OutputStreamsManager(this);
    this.inputStreams = new InputStreamsManager(this);

    this.display = new Display();

    this.tunnel.oninstruction = (opcode, params) => {
      this.instructionRouter.dispatchInstruction(opcode, params);
    };
    this.tunnel.onerror = (error) => {
      const listener = this.events.getEventListener('onerror');
      if (listener) {
        listener(new Status(StatusCode.fromTunnelError(error)));
      }
    };
  }

  addEventListener<K extends keyof ClientEventMap>(type: K, listener: ClientEventMap[K]): void {
    this.events.addEventListener(type, listener);
  }

  removeEventListener<K extends keyof ClientEventMap>(type: K): void {
    this.events.removeEventListener(type);
  }

  public isConnected(): boolean {
    return this.currentState === State.CONNECTED || this.currentState === State.WAITING;
  }

  /**
   * Connects the underlying tunnel of this Client, passing the
   * given arbitrary data to the tunnel during the connection process.
   *
   * @param data - Arbitrary connection data to be sent to the underlying
   *               tunnel during the connection process.
   * @throws {Status} If an error occurs during connection.
   */
  public connect(data?: string) {
    this.setState(State.CONNECTING);

    try {
      this.tunnel.connect(data);
    } catch (err: unknown) {
      this.setState(State.IDLE);
      throw err;
    }

    // Ping every 5 seconds (ensure connection alive)
    this.pingIntervalHandler = window.setInterval(() => {
      this.tunnel.sendMessage(...ClientControl.nop());
    }, PING_INTERVAL);

    this.setState(State.WAITING);
  }

  /**
   * Sends a disconnect instruction to the server and closes the tunnel.
   */
  public disconnect() {
    // Only attempt disconnection not disconnected.
    if (this.currentState !== State.DISCONNECTED && this.currentState !== State.DISCONNECTING) {
      this.setState(State.DISCONNECTING);

      // Stop ping
      if (this.pingIntervalHandler) {
        window.clearInterval(this.pingIntervalHandler);
      }

      // Send disconnect message and disconnect
      this.tunnel.sendMessage(...ClientControl.disconnect());
      this.tunnel.disconnect();
      this.setState(State.DISCONNECTED);
    }
  }

  /**
   * Returns the underlying display of this Client. The display
   * contains an Element which can be added to the DOM, causing the
   * display to become visible.
   *
   * @return The underlying display of this Client.
   */
  public getDisplay(): Display {
    return this.display;
  }

  /**
   * Sends the current size of the screen.
   *
   * @param width - The width of the screen.
   * @param height - The height of the screen.
   */
  public sendSize(width: number, height: number) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }

    this.tunnel.sendMessage(...ClientEvents.size(width, height));
  }

  /**
   * Sends a key event having the given properties as if the user
   * pressed or released a key.
   *
   * @param pressed - Whether the key is pressed (true) or released (false).
   * @param keysym - The keysym of the key being pressed or released.
   */
  public sendKeyEvent(pressed: boolean, keysym: number) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }

    this.tunnel.sendMessage(...ClientEvents.key(keysym, pressed));
  }

  /**
   * Sends a mouse event having the properties provided by the given mouse
   * state.
   *
   * @param mouseState - The state of the mouse to send in the mouse event.
   */
  public sendMouseState(mouseState: MouseState) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }

    // Update client-side cursor
    this.display.moveCursor(
      Math.floor(mouseState.x),
      Math.floor(mouseState.y)
    );

    // Build mask
    let buttonMask = 0;
    if (mouseState.left) {
      buttonMask |= 1;
    }

    if (mouseState.middle) {
      buttonMask |= 2;
    }

    if (mouseState.right) {
      buttonMask |= 4;
    }

    if (mouseState.up) {
      buttonMask |= 8;
    }

    if (mouseState.down) {
      buttonMask |= 16;
    }

    // Send message
    this.tunnel.sendMessage(...ClientEvents.mouse(Math.floor(mouseState.x), Math.floor(mouseState.y), buttonMask));
  }

  /**
   * Opens a new audio stream for writing, where audio data having the give
   * mimetype will be sent along the returned stream. The instruction
   * necessary to create this stream will automatically be sent.
   *
   * @param mimetype - The mimetype of the audio data that will be sent along
   *                   the returned stream.
   *
   * @return The created audio stream.
   */
  public createAudioStream(mimetype: string): OutputStream {
    // Allocate and associate stream with audio metadata
    const stream = this.outputStreams.createStream();
    this.tunnel.sendMessage(...Streaming.audio(stream.index, mimetype));
    return stream;
  }

  /**
   * Opens a new file for writing, having the given index, mimetype and
   * filename. The instruction necessary to create this stream will
   * automatically be sent.
   *
   * @param mimetype - The mimetype of the file being sent.
   * @param filename - The filename of the file being sent.
   *
   * @return The created file stream.
   */
  public createFileStream(mimetype: string, filename: string): OutputStream {
    // Allocate and associate stream with file metadata
    const stream = this.outputStreams.createStream();
    this.tunnel.sendMessage(...Streaming.file(stream.index, mimetype, filename));
    return stream;
  }

  /**
   * Opens a new pipe for writing, having the given name and mimetype. The
   * instruction necessary to create this stream will automatically be sent.
   *
   * @param mimetype - The mimetype of the data being sent.
   * @param name - The name of the pipe.
   *
   * @return The created file stream.
   */
  public createPipeStream(mimetype: string, name: string): OutputStream {
    // Allocate and associate stream with pipe metadata
    const stream = this.outputStreams.createStream();
    this.tunnel.sendMessage(...Streaming.pipe(stream.index, mimetype, name));
    return stream;
  }

  /**
   * Opens a new clipboard object for writing, having the given mimetype. The
   * instruction necessary to create this stream will automatically be sent.
   *
   * @param mimetype - The mimetype of the data being sent.
   *
   * @return The created file stream.
   */
  public createClipboardStream(mimetype: string): OutputStream {
    // Allocate and associate stream with clipboard metadata
    const stream = this.outputStreams.createStream();
    this.tunnel.sendMessage(...Streaming.clipboard(stream.index, mimetype));
    return stream;
  }

  /**
   * Opens a new argument value stream for writing, having the given
   * parameter name and mimetype, requesting that the connection parameter
   * with the given name be updated to the value described by the contents
   * of the following stream. The instruction necessary to create this stream
   * will automatically be sent.
   *
   * @param mimetype - The mimetype of the data being sent.
   * @param name - The name of the connection parameter to attempt to update.
   *
   * @return The created argument value stream.
   */
  public createArgumentValueStream(mimetype: string, name: string): OutputStream {
    // Allocate and associate stream with argument value metadata
    const stream = this.outputStreams.createStream();
    this.tunnel.sendMessage(...Streaming.argv(stream.index, mimetype, name));
    return stream;
  }

  /**
   * Creates a new output stream associated with the given object and having
   * the given mimetype and name. The legality of a mimetype and name is
   * dictated by the object itself. The instruction necessary to create this
   * stream will automatically be sent.
   *
   * @param index - The index of the object for which the output stream is
   *                being created.
   * @param mimetype - The mimetype of the data which will be sent to the
   *                   output stream.
   * @param name - The defined name of an output stream within the given object.
   *
   * @returns An output stream which will write blobs to the named output stream
   *          of the given object.
   */
  public createObjectOutputStream(index: number, mimetype: string, name: string): OutputStream {
    // Allocate and associate stream with object metadata
    const stream = this.outputStreams.createStream();
    this.tunnel.sendMessage(...ObjectInstruction.put(index, stream.index, mimetype, name));
    return stream;
  }

  /**
   * Requests read access to the input stream having the given name. If
   * successful, a new input stream will be created.
   *
   * @param index - The index of the object from which the input stream is
   *                being requested.
   * @param name - The name of the input stream to request.
   */
  public requestObjectInputStream(index: number, name: string) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }

    this.tunnel.sendMessage(...ObjectInstruction.get(index, name));
  }

  /**
   * Acknowledge receipt of a blob on the stream with the given index.
   *
   * @param index - The index of the stream associated with the received blob.
   * @param error - A human-readable message describing the error or status.
   *                The error code, if any, or 0 for success.
   */
  public sendAck(index: number, error?: StreamError) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }

    const message = error?.message ?? 'OK';
    const code = error?.code ?? StatusCode.SUCCESS;

    this.tunnel.sendMessage(...Streaming.ack(index, message, code));
  }

  /**
   * Given the index of a file, writes a blob of data to that file.
   *
   * @param index - The index of the file to write to.
   * @param data - Base64-encoded data to write to the file.
   */
  public sendBlob(index: number, data: string) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }

    this.tunnel.sendMessage(...Streaming.blob(index, data));
  }

  /**
   * Marks a currently-open stream as complete. The other end of the
   * Guacamole connection will be notified via an "end" instruction that the
   * stream is closed, and the index will be made available for reuse in
   * future streams.
   *
   * @param index - The index of the stream to end.
   */
  public sendEnd(index: number) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }

    // Explicitly close stream by sending "end" instruction
    this.tunnel.sendMessage(...Streaming.end(index));

    // Free associated index and stream if they exist
    this.outputStreams.freeStream(index);
  }

  /**
   * Returns the index passed to getLayer() when the given layer was created.
   * Positive indices refer to visible layers, an index of zero refers to the
   * default layer, and negative indices refer to buffers.
   *
   * @param layer - The layer whose index should be determined.
   * @returns The index of the given layer, or null if no such layer is associated
   *          with this client.
   */
  public getLayerIndex(layer: VisibleLayer | Layer | null): number | null {
    // Avoid searching if there clearly is no such layer
    if (!layer) {
      return null;
    }

    // Search through each layer, returning the index of the given layer
    // once found
    for (const [key, layer2] of this.layers) {
      if (layer === layer2) {
        return key;
      }
    }

    // Otherwise, no such index
    return null;
  }

  private handleBodyInstruction(objectIndex: number, streamIndex: number, mimetype: string, name: string) {
    const object = this.objects.get(objectIndex);

    // Create stream only if handler is defined
    if (!object?.onbody) {
      this.sendAck(streamIndex, new StreamError('Receipt of body unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    const stream = this.inputStreams.createStream(streamIndex);
    object.onbody(stream, mimetype, name);
  }

  private handleDisconnectInstruction() {
    // Explicitly tear down connection
    this.disconnect();
  }

  private handleErrorInstruction(code: number, reason: string) {
    // Call listener if set
    const listener = this.events.getEventListener('onerror');
    if (listener) {
      listener(new Status(code, reason));
    }

    this.disconnect();
  }

  //<editor-fold defaultstate="collapsed" desc="InputStreamHandler">

  private handleNameInstruction(name: string) {
    const listener = this.events.getEventListener('onname');
    if (listener) {
      listener(name);
    }
  }

  private handleNestInstruction(parserIndex: number, packet: string) {
    const parser = this.getParser(parserIndex);
    parser.receive(packet);
  }

  private handleRequiredInstruction(parameters: string[]) {
    const listener = this.events.getEventListener('onrequired');
    if (listener) {
      listener(parameters);
    }
  }

  private handleSyncInstruction(timestamp: number) {
    // Flush display, send sync when done
    this.display.flush(() => {
      // Synchronize all audio players
      for (const [_, audioPlayer] of this.audioPlayers) {
        if (audioPlayer) {
          audioPlayer.sync();
        }
      }

      // Send sync response to server
      if (timestamp !== this.currentTimestamp) {
        this.tunnel.sendMessage(...ClientControl.sync(timestamp));
        this.currentTimestamp = timestamp;
      }
    });

    // If received first update, no longer waiting.
    if (this.currentState === State.WAITING) {
      this.setState(State.CONNECTED);
    }

    // Call sync handler if defined
    const listener = this.events.getEventListener('onsync');
    if (listener) {
      listener(timestamp);
    }
  }

  private handleArgvInstruction(streamIndex: number, mimetype: string, name: string) {
    const listener = this.events.getEventListener('onargv');
    if (!listener) {
      this.sendAck(streamIndex, new StreamError('Receiving argument values unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);
    listener(stream, mimetype, name);
  }

  private handleImgInstruction(streamIndex: number, layerIndex: number, channelMask: number, x: number, y: number, mimetype: string) {
    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);

    // Get layer
    const layer = this.getLayer(layerIndex);

    // Draw received contents once decoded
    this.display.setChannelMask(layer, channelMask);
    this.display.drawStream(layer, x, y, stream, mimetype);
  }

  private handleAudioInstruction(streamIndex: number, mimetype: string) {
    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);

    // Get player instance via callback
    let audioPlayer: AudioPlayer | null = null;

    const listener = this.events.getEventListener('onaudio');
    if (listener) {
      audioPlayer = listener(stream, mimetype);
    }

    // If unsuccessful, try to use a default implementation
    if (!audioPlayer) {
      audioPlayer = getAudioPlayerInstance(stream, mimetype);
    }

    if (!audioPlayer) {
      // Mimetype must be unsupported
      this.sendAck(streamIndex, new StreamError('BAD TYPE', StatusCode.CLIENT_BAD_TYPE));
      return;
    }

    // If we have successfully retrieved an audio player, send success response
    this.audioPlayers.set(streamIndex, audioPlayer);
    this.sendAck(streamIndex);
  }

  private handleVideoInstruction(streamIndex: number, layerIndex: number, mimetype: string) {
    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);

    // Get layer
    const layer = this.getLayer(layerIndex);

    // Get player instance via callback
    let videoPlayer: VideoPlayer | null = null;

    const listener = this.events.getEventListener('onvideo');
    if (listener) {
      videoPlayer = listener(stream, layer, mimetype);
    }

    // If unsuccessful, try to use a default implementation
    if (!videoPlayer) {
      videoPlayer = VideoPlayer.getInstance(stream, layer, mimetype);
    }

    if (!videoPlayer) {
      // Mimetype must be unsupported
      this.sendAck(streamIndex, new StreamError('BAD TYPE', StatusCode.CLIENT_BAD_TYPE));
      return;
    }

    // If we have successfully retrieved a video player, send success response
    this.videoPlayers.set(streamIndex, videoPlayer);
    this.sendAck(streamIndex);
  }

  private handleClipboardInstruction(streamIndex: number, mimetype: string) {
    const listener = this.events.getEventListener('onclipboard');
    if (!listener) {
      this.sendAck(streamIndex, new StreamError('Clipboard unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    const stream = this.inputStreams.createStream(streamIndex);
    listener(stream, mimetype);
  }

  private handleFileInstruction(streamIndex: number, mimetype: string, filename: string) {
    const listener = this.events.getEventListener('onfile');
    if (!listener) {
      this.sendAck(streamIndex, new StreamError('File transfer unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    const stream = this.inputStreams.createStream(streamIndex);
    listener(stream, mimetype, filename);
  }

  //<editor-fold defaultstate="collapsed" desc="OutputStreamHandler">
  //</editor-fold>

  private handleBlobInstruction(streamIndex: number, data: string) {
    // Get stream
    const stream = this.inputStreams.getStream(streamIndex);

    // Write data
    if (stream?.onblob) {
      stream.onblob(data);
    }
  }

  private handleEndInstruction(streamIndex: number) {
    // Get stream
    const stream = this.inputStreams.getStream(streamIndex);
    if (stream) {
      // Signal end of stream if handler defined
      if (stream.onend) {
        stream.onend();
      }

      // Invalidate stream
      this.inputStreams.freeStream(streamIndex);
    }
  }

  private handlePipeInstruction(streamIndex: number, mimetype: string, name: string) {
    const listener = this.events.getEventListener('onpipe');
    if (!listener) {
      this.sendAck(streamIndex, new StreamError('Named pipes unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);
    listener(stream, mimetype, name);
  }

  //</editor-fold>
  //<editor-fold defaultstate="collapsed" desc="ObjectHandler">

  private handleAckInstruction(streamIndex: number, message: string, code: number) {
    // Get stream
    const stream = this.outputStreams.getStream(streamIndex);
    if (!stream) {
      return;
    }

    // Signal ack if handler defined
    if (stream.onack) {
      let error = undefined;
      if (code >= 0x0100) {
        error = new StreamError(message, code);
      }

      stream.onack(error);
    }

    // If code is an error, invalidate stream if not already
    // invalidated by onack handler
    if (code >= 0x0100) {
      this.outputStreams.freeStream(streamIndex);
    }
  }

  private handleFilesystemInstruction(objectIndex: number, name: string) {
    const listener = this.events.getEventListener('onfilesystem');
    if (!listener) {
      // If unsupported, simply ignore the availability of the filesystem
      return;
    }

    // Create object, if supported
    const object = new GuacamoleObject(this, objectIndex);

    this.objects.set(objectIndex, object);
    listener(object, name);
  }

  //</editor-fold>
  //<editor-fold defaultstate="collapsed" desc="DisplayHandler">

  private handleUndefineInstruction(objectIndex: number) {
    // Get object
    const object = this.objects.get(objectIndex);

    // Signal end of object definition
    if (object?.onundefine) {
      object.onundefine();
    }
  }

  private handleArcInstruction(layerIndex: number, x: number, y: number, radius: number, startAngle: number, endAngle: number, negative: number) {
    const layer = this.getLayer(layerIndex);
    this.display.arc(layer, x, y, radius, startAngle, endAngle, negative !== 0);
  }

  private handleCfillInstruction(layerIndex: number, channelMask: number, r: number, g: number, b: number, a: number) {
    const layer = this.getLayer(layerIndex);
    this.display.setChannelMask(layer, channelMask);
    this.display.fillColor(layer, r, g, b, a);
  }

  private handleClipInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.clip(layer);
  }

  private handleCloseInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.close(layer);
  }

  private handleCopyInstruction(srcLayerIndex: number, dstLayerIndex: number, channelMask: number, srcX: number, srcY: number, srcWidth: number, srcHeight: number, dstX: number, dstY: number) {
    const srcLayer = this.getLayer(srcLayerIndex);
    const dstLayer = this.getLayer(dstLayerIndex);
    this.display.setChannelMask(dstLayer, channelMask);
    this.display.copy(srcLayer, srcX, srcY, srcWidth, srcHeight, dstLayer, dstX, dstY);
  }

  private handleCstrokeInstruction(layerIndex: number, channelMask: number, cap: CanvasLineCap, join: CanvasLineJoin, thickness: number, r: number, g: number, b: number, a: number) {
    const layer = this.getLayer(layerIndex);
    this.display.setChannelMask(layer, channelMask);
    this.display.strokeColor(layer, cap, join, thickness, r, g, b, a);
  }

  private handleCursorInstruction(srcLayerIndex: number, cursorHotspotX: number, cursorHotspotY: number, srcX: number, srcY: number, srcWidth: number, srcHeight: number) {
    const srcLayer = this.getLayer(srcLayerIndex);
    this.display.setCursor(cursorHotspotX, cursorHotspotY, srcLayer, srcX, srcY, srcWidth, srcHeight);
  }

  private handleCurveInstruction(layerIndex: number, cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    const layer = this.getLayer(layerIndex);
    this.display.curveTo(layer, cp1x, cp1y, cp2x, cp2y, x, y);
  }

  private handleDisposeInstruction(layerIndex: number) {
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

  private handleDistortInstruction(layerIndex: number, a: number, b: number, c: number, d: number, e: number, f: number) {
    // Only valid for visible layers (not buffers)
    if (layerIndex < 0) {
      return;
    }

    const layer = this.getLayer(layerIndex);
    this.display.distort(layer, a, b, c, d, e, f);
  }

  private handleIdentityInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.setTransform(layer, 1, 0, 0, 1, 0, 0);
  }

  private handleJpegInstruction(layerIndex: number, channelMask: number, x: number, y: number, data: string) {
    const layer = this.getLayer(layerIndex);
    this.display.setChannelMask(layer, channelMask);
    this.display.draw(layer, x, y, `data:image/jpeg;base64,${data}`);
  }

  private handleLfillInstruction(layerIndex: number, channelMask: number, srcLayerIndex: number) {
    const layer = this.getLayer(layerIndex);
    const srcLayer = this.getLayer(srcLayerIndex);
    this.display.setChannelMask(layer, channelMask);
    this.display.fillLayer(layer, srcLayer);
  }

  private handleLineInstruction(layerIndex: number, x: number, y: number) {
    const layer = this.getLayer(layerIndex);
    this.display.lineTo(layer, x, y);
  }

  private handleLstrokeInstruction(layerIndex: number, srcLayerIndex: number, channelMask: number, cap: CanvasLineCap, join: CanvasLineJoin, thickness: number) {
    const layer = this.getLayer(layerIndex);
    const srcLayer = this.getLayer(srcLayerIndex);

    this.display.setChannelMask(layer, channelMask);
    this.display.strokeLayer(layer, cap, join, thickness, srcLayer);
  }

  private handleMouseInstruction(x: number, y: number) {
    // Display and move software cursor to received coordinates
    this.display.showCursor(true);
    this.display.moveCursor(x, y);
  }

  private handleMoveInstruction(layerIndex: number, parentIndex: number, x: number, y: number, z: number) {
    // Only valid for non-default layers
    if (layerIndex <= 0 || parentIndex < 0) {
      return;
    }

    const layer = this.getLayer(layerIndex);
    const parent = this.getLayer(parentIndex);
    this.display.move(layer, parent, x, y, z);
  }

  private handlePngInstruction(layerIndex: number, channelMask: number, x: number, y: number, data: string) {
    const layer = this.getLayer(layerIndex);
    this.display.setChannelMask(layer, channelMask);
    this.display.draw(layer, x, y, `data:image/png;base64,${data}`);
  }

  private handlePopInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.pop(layer);
  }

  private handlePushInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.push(layer);
  }

  private handleRectInstruction(layerIndex: number, x: number, y: number, w: number, h: number) {
    const layer = this.getLayer(layerIndex);
    this.display.rect(layer, x, y, w, h);
  }

  private handleResetInstruction(layerIndex: number) {
    const layer = this.getLayer(layerIndex);
    this.display.reset(layer);
  }

  private handleSetInstruction(layerIndex: number, name: string, value: string) {
    const layer = this.getLayer(layerIndex);

    // Call property handler if defined
    const handler = this.layerPropertyHandlers.get(name);
    if (handler) {
      handler(layer, value);
    }
  }

  private handleShadeInstruction(layerIndex: number, a: number) {
    // Only valid for visible layers (not buffers)
    if (layerIndex < 0) {
      return;
    }

    const layer = this.getLayer(layerIndex);
    this.display.shade(layer, a);
  }

  private handleSizeInstruction(layerIndex: number, width: number, height: number) {
    const layer = this.getLayer(layerIndex);
    this.display.resize(layer, width, height);
  }

  private handleStartInstruction(layerIndex: number, x: number, y: number) {
    const layer = this.getLayer(layerIndex);
    this.display.moveTo(layer, x, y);
  }

  private handleTransferInstruction(srcLayerIndex: number, dstLayerIndex: number, functionIndex: number, srcX: number, srcY: number, srcWidth: number, srcHeight: number, dstX: number, dstY: number) {
    const srcLayer = this.getLayer(srcLayerIndex);
    const dstLayer = this.getLayer(dstLayerIndex);

    /* SRC */
    if (functionIndex === 0x3) {
      this.display.put(srcLayer, srcX, srcY, srcWidth, srcHeight, dstLayer, dstX, dstY);
    } else if (functionIndex !== 0x5) {
      /* Anything else that isn't a NO-OP */
      this.display.transfer(srcLayer, srcX, srcY, srcWidth, srcHeight, dstLayer, dstX, dstY, DEFAULT_TRANSFER_FUNCTION[functionIndex]);
    }
  }

  //</editor-fold>

  private handleTransformInstruction(layerIndex: number, a: number, b: number, c: number, d: number, e: number, f: number) {
    const layer = this.getLayer(layerIndex);
    this.display.transform(layer, a, b, c, d, e, f);
  }

  private setState(state: State) {
    if (this.currentState === state) {
      return;
    }

    this.currentState = state;

    const listener = this.events.getEventListener('onstatechange');
    if (listener) {
      listener(state);
    }
  }

  /**
   * Returns the layer with the given index, creating it if necessary.
   * Positive indices refer to visible layers, an index of zero refers to
   * the default layer, and negative indices refer to buffers.
   *
   * @private
   * @param index - The index of the layer to retrieve.
   *
   * @return The layer having the given index.
   */
  private getLayer(index: number): VisibleLayer {
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

  private getParser(index: number) {
    let decoder = this.decoders.get(index);

    // If parser not yet created, create it, and tie to the
    // oninstruction handler of the tunnel.
    if (decoder === undefined) {
      decoder = new Decoder();
      this.decoders.set(index, decoder);
      decoder.oninstruction = this.tunnel.oninstruction;
    }

    return decoder;
  }

  /**
   * Register all instruction handlers for the opcodes receivable by a Guacamole protocol client.
   *
   * @private
   */
  private registerInstructionRoutes() {
    this.registerStreamingInstructionRoutes(this.instructionRouter);
    this.registerObjectInstructionRoutes(this.instructionRouter);
    this.registerClientControlInstructionRoutes(this.instructionRouter);
    this.registerServerControlInstructionHandlers(this.instructionRouter);
    this.registerDrawingInstructionHandlers(this.instructionRouter);

    // TODO Review this handler
    this.instructionRouter.addInstructionHandler('required', (params: string[]) => {
      this.handleRequiredInstruction(params);
    });
    // TODO Review this handler
    this.instructionRouter.addInstructionHandler('name', (params: string[]) => {
      const name = params[0];

      this.handleNameInstruction(name);
    });
  }

  private registerStreamingInstructionRoutes(router: InstructionRouter) {
    router.addInstructionHandler(Streaming.ack.opcode, Streaming.ack.parser(
      this.handleAckInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.argv.opcode, Streaming.argv.parser(
      this.handleArgvInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.audio.opcode, Streaming.audio.parser(
      this.handleAudioInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.blob.opcode, Streaming.blob.parser(
      this.handleBlobInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.clipboard.opcode, Streaming.clipboard.parser(
      this.handleClipboardInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.end.opcode, Streaming.end.parser(
      this.handleEndInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.file.opcode, Streaming.file.parser(
      this.handleFileInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.img.opcode, Streaming.img.parser(
      this.handleImgInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.nest.opcode, Streaming.nest.parser(
      this.handleNestInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.pipe.opcode, Streaming.pipe.parser(
      this.handlePipeInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.video.opcode, Streaming.video.parser(
      this.handleVideoInstruction.bind(this)
    ));
  }

  private registerObjectInstructionRoutes(router: InstructionRouter) {
    router.addInstructionHandler(ObjectInstruction.body.opcode, ObjectInstruction.body.parser(
      this.handleBodyInstruction.bind(this)
    ));
    router.addInstructionHandler(ObjectInstruction.filesystem.opcode, ObjectInstruction.filesystem.parser(
      this.handleFilesystemInstruction.bind(this)
    ));
    router.addInstructionHandler(ObjectInstruction.undefine.opcode, ObjectInstruction.undefine.parser(
      this.handleUndefineInstruction.bind(this)
    ));
  }

  private registerClientControlInstructionRoutes(router: InstructionRouter) {
    router.addInstructionHandler(ClientControl.disconnect.opcode, ClientControl.disconnect.parser(
      this.handleDisconnectInstruction.bind(this)
    ));
    router.addInstructionHandler(ClientControl.sync.opcode, ClientControl.sync.parser(
      this.handleSyncInstruction.bind(this)
    ));
  }

  private registerServerControlInstructionHandlers(router: InstructionRouter) {
    router.addInstructionHandler(ServerControl.mouse.opcode, ServerControl.mouse.handler(
      this.handleMouseInstruction.bind(this)
    ));
    router.addInstructionHandler(ServerControl.error.opcode, ServerControl.error.handler(
      this.handleErrorInstruction.bind(this)
    ));
  }

  private registerDrawingInstructionHandlers(router: InstructionRouter) {
    router.addInstructionHandler('arc', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);
      const x = parseInt(params[1], 10);
      const y = parseInt(params[2], 10);
      const radius = parseInt(params[3], 10);
      const startAngle = parseFloat(params[4]);
      const endAngle = parseFloat(params[5]);
      const negative = parseInt(params[6], 10);

      this.handleArcInstruction(layerIndex, x, y, radius, startAngle, endAngle, negative);
    });
    router.addInstructionHandler('cfill', (params: string[]) => {
      const channelMask = parseInt(params[0], 10);
      const layerIndex = parseInt(params[1], 10);
      const r = parseInt(params[2], 10);
      const g = parseInt(params[3], 10);
      const b = parseInt(params[4], 10);
      const a = parseInt(params[5], 10);

      this.handleCfillInstruction(layerIndex, channelMask, r, g, b, a);
    });
    router.addInstructionHandler('clip', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);

      this.handleClipInstruction(layerIndex);
    });
    router.addInstructionHandler('close', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);

      this.handleCloseInstruction(layerIndex);
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

      this.handleCopyInstruction(srcLayerIndex, dstLayerIndex, channelMask, srcX, srcY, srcWidth, srcHeight, dstX, dstY);
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

      this.handleCstrokeInstruction(layerIndex, channelMask, cap, join, thickness, r, g, b, a);
    });
    router.addInstructionHandler('cursor', (params: string[]) => {
      const cursorHotspotX = parseInt(params[0], 10);
      const cursorHotspotY = parseInt(params[1], 10);
      const srcLayerIndex = parseInt(params[2], 10);
      const srcX = parseInt(params[3], 10);
      const srcY = parseInt(params[4], 10);
      const srcWidth = parseInt(params[5], 10);
      const srcHeight = parseInt(params[6], 10);

      this.handleCursorInstruction(srcLayerIndex, cursorHotspotX, cursorHotspotY, srcX, srcY, srcWidth, srcHeight);
    });
    router.addInstructionHandler('curve', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);
      const cp1x = parseInt(params[1], 10);
      const cp1y = parseInt(params[2], 10);
      const cp2x = parseInt(params[3], 10);
      const cp2y = parseInt(params[4], 10);
      const x = parseInt(params[5], 10);
      const y = parseInt(params[6], 10);

      this.handleCurveInstruction(layerIndex, cp1x, cp1y, cp2x, cp2y, x, y);
    });
    router.addInstructionHandler('dispose', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);

      this.handleDisposeInstruction(layerIndex);
    });
    router.addInstructionHandler('distort', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);
      const a = parseFloat(params[1]);
      const b = parseFloat(params[2]);
      const c = parseFloat(params[3]);
      const d = parseFloat(params[4]);
      const e = parseFloat(params[5]);
      const f = parseFloat(params[6]);

      this.handleDistortInstruction(layerIndex, a, b, c, d, e, f);
    });
    router.addInstructionHandler('identity', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);

      this.handleIdentityInstruction(layerIndex);
    });
    router.addInstructionHandler('jpeg', (params: string[]) => {
      const channelMask = parseInt(params[0], 10);
      const layerIndex = parseInt(params[1], 10);
      const x = parseInt(params[2], 10);
      const y = parseInt(params[3], 10);
      const data = params[4];

      this.handleJpegInstruction(layerIndex, channelMask, x, y, data);
    });
    router.addInstructionHandler('lfill', (params: string[]) => {
      const channelMask = parseInt(params[0], 10);
      const layerIndex = parseInt(params[1], 10);
      const srcLayerIndex = parseInt(params[2], 10);

      this.handleLfillInstruction(layerIndex, channelMask, srcLayerIndex);
    });
    router.addInstructionHandler('line', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);
      const x = parseInt(params[1], 10);
      const y = parseInt(params[2], 10);

      this.handleLineInstruction(layerIndex, x, y);
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

      this.handleLstrokeInstruction(layerIndex, srcLayerIndex, channelMask, cap, join, thickness);
    });
    router.addInstructionHandler('move', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);
      const parentIndex = parseInt(params[1], 10);
      const x = parseInt(params[2], 10);
      const y = parseInt(params[3], 10);
      const z = parseInt(params[4], 10);

      this.handleMoveInstruction(layerIndex, parentIndex, x, y, z);
    });
    router.addInstructionHandler('png', (params: string[]) => {
      const channelMask = parseInt(params[0], 10);
      const layerIndex = parseInt(params[1], 10);
      const x = parseInt(params[2], 10);
      const y = parseInt(params[3], 10);
      const data = params[4];

      this.handlePngInstruction(layerIndex, channelMask, x, y, data);
    });
    router.addInstructionHandler('pop', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);

      this.handlePopInstruction(layerIndex);
    });
    router.addInstructionHandler('push', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);

      this.handlePushInstruction(layerIndex);
    });
    router.addInstructionHandler('rect', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);
      const x = parseInt(params[1], 10);
      const y = parseInt(params[2], 10);
      const w = parseInt(params[3], 10);
      const h = parseInt(params[4], 10);

      this.handleRectInstruction(layerIndex, x, y, w, h);
    });
    router.addInstructionHandler('reset', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);

      this.handleResetInstruction(layerIndex);
    });
    router.addInstructionHandler('set', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);
      const name = params[1];
      const value = params[2];

      this.handleSetInstruction(layerIndex, name, value);
    });
    router.addInstructionHandler('shade', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);
      const a = parseInt(params[1], 10);

      this.handleShadeInstruction(layerIndex, a);
    });
    router.addInstructionHandler('size', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);
      const width = parseInt(params[1], 10);
      const height = parseInt(params[2], 10);

      this.handleSizeInstruction(layerIndex, width, height);
    });
    router.addInstructionHandler('start', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);
      const x = parseInt(params[1], 10);
      const y = parseInt(params[2], 10);

      this.handleStartInstruction(layerIndex, x, y);
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

      this.handleTransferInstruction(srcLayerIndex, dstLayerIndex, functionIndex, srcX, srcY, srcWidth, srcHeight, dstX, dstY);
    });
    router.addInstructionHandler('transform', (params: string[]) => {
      const layerIndex = parseInt(params[0], 10);
      const a = parseFloat(params[1]);
      const b = parseFloat(params[2]);
      const c = parseFloat(params[3]);
      const d = parseFloat(params[4]);
      const e = parseFloat(params[5]);
      const f = parseFloat(params[6]);

      this.handleTransformInstruction(layerIndex, a, b, c, d, e, f);
    });
  }
}
