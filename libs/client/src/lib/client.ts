import {
  DEFAULT_TRANSFER_FUNCTION,
  Display,
  Layer,
  LINE_CAP,
  LINE_JOIN,
  VisibleLayer
} from './display';
import { Status, StatusCode } from './Status';
import GuacamoleObject from './GuacamoleObject';
import { InputStream, OutputStream, StreamError } from '@guacamole-client/io';
import { AudioPlayer, getAudioPlayerInstance, VideoPlayer } from '@guacamole-client/media';
import {
  ClientControl,
  ClientEvents,
  Decoder,
  ObjectInstruction,
  Streaming
} from '@guacamole-client/protocol';
import { Tunnel } from '@guacamole-client/tunnel';
import { State } from './state';
import { MouseState } from '@guacamole-client/input';
import { InputStreamHandlers, InputStreamsManager } from './streams-manager/input';
import { OutputStreamHandlers, OutputStreamsManager } from './streams-manager/output';

export type OnStateChangeCallback = (state: number) => void;
export type OnNameCallback = (name: string) => void;
export type OnErrorCallback = (error: Status) => void;
export type OnAudioCallback = (stream: InputStream, mimetype: string) => AudioPlayer;
export type OnVideoCallback = (stream: InputStream, layer: VisibleLayer, mimetype: string) => VideoPlayer;
export type OnArgvCallback = (stream: InputStream, mimetype: string, name: string) => void;
export type OnClipboardCallback = (stream: InputStream, mimetype: string) => void;
export type OnFileCallback = (stream: InputStream, mimetype: string, filename: string) => void;
export type OnFilesystemCallback = (object: GuacamoleObject, name: string) => void;
export type OnPipeCallback = (stream: InputStream, mimetype: string, name: string) => void;
export type OnRequiredCallback = (parameters: string[]) => void;
export type OnSyncCallback = (timeout: number) => void;

const PING_INTERVAL = 5000;

/**
 * Guacamole protocol client. Given a {@link Tunnel},
 * automatically handles incoming and outgoing Guacamole instructions via the
 * provided tunnel, updating its display using one or more canvas elements.
 */
export default class Client implements InputStreamHandlers, OutputStreamHandlers {
  //<editor-fold defaultstate="collapsed" desc="Client events" >

  /**
   * Fired whenever the state of this Client changes.
   *
   * @param state - The new state of the client.
   */
  public onstatechange: OnStateChangeCallback | null = null;

  /**
   * Fired when the remote client sends a name update.
   *
   * @param name - The new name of this client.
   */
  public onname: OnNameCallback | null = null;

  /**
   * Fired when an error is reported by the remote client, and the connection
   * is being closed.
   *
   * @param status - A status object which describes the error.
   */
  public onerror: OnErrorCallback | null = null;

  /**
   * Fired when a audio stream is created. The stream provided to this event
   * handler will contain its own event handlers for received data.
   *
   * @param stream - The stream that will receive audio data from the server.
   * @param mimetype - The mimetype of the audio data which will be received.
   *
   * @return An object which implements the AudioPlayer interface and
   *     has been initialized to play the data in the provided stream, or null
   *     if the built-in audio players of the Guacamole client should be
   *     used.
   */
  public onaudio: OnAudioCallback | null = null;

  /**
   * Fired when a video stream is created. The stream provided to this event
   * handler will contain its own event handlers for received data.
   *
   * @param stream - The stream that will receive video data from the server.
   * @param layer - The destination layer on which the received video data should be
   *     played. It is the responsibility of the VideoPlayer
   *     implementation to play the received data within this layer.
   * @param mimetype - The mimetype of the video data which will be received.
   *
   * @return An object which implements the VideoPlayer interface and
   *     has been initialized to play the data in the provided stream, or null
   *     if the built-in video players of the Guacamole client should be
   *     used.
   */
  public onvideo: OnVideoCallback | null = null;

  /**
   * Fired when the current value of a connection parameter is being exposed
   * by the server.
   *
   * @param stream - The stream that will receive connection parameter data from the server.
   * @param mimetype - The mimetype of the data which will be received.
   * @param name - The name of the connection parameter whose value is being exposed.
   */
  public onargv: OnArgvCallback | null = null;

  /**
   * Fired when the clipboard of the remote client is changing.
   *
   * @param stream - The stream that will receive clipboard data from the server.
   * @param mimetype - The mimetype of the data which will be received.
   */
  public onclipboard: OnClipboardCallback | null = null;

  /**
   * Fired when a file stream is created. The stream provided to this event
   * handler will contain its own event handlers for received data.
   *
   * @param stream - The stream that will receive data from the server.
   * @param mimetype - The mimetype of the file received.
   * @param filename - The name of the file received.
   */
  public onfile: OnFileCallback | null = null;

  /**
   * Fired when a filesystem object is created. The object provided to this
   * event handler will contain its own event handlers and functions for
   * requesting and handling data.
   *
   * @param object - The created filesystem object.
   * @param name - The name of the filesystem.
   */
  public onfilesystem: OnFilesystemCallback | null = null;

  /**
   * Fired when a pipe stream is created. The stream provided to this event
   * handler will contain its own event handlers for received data;
   *
   * @param stream - The stream that will receive data from the server.
   * @param mimetype - The mimetype of the data which will be received.
   * @param name - The name of the pipe.
   */
  public onpipe: OnPipeCallback | null = null;

  /**
   * Fired when a "required" instruction is received. A required instruction
   * indicates that additional parameters are required for the connection to
   * continue, such as user credentials.
   *
   * @param parameters - The names of the connection parameters that are required to be
   *                     provided for the connection to continue.
   */
  public onrequired: OnRequiredCallback | null = null;

  /**
   * Fired whenever a sync instruction is received from the server, indicating
   * that the server is finished processing any input from the client and
   * has sent any results.
   *
   * @param timestamp - The timestamp associated with the sync
   *                    instruction.
   */
  public onsync: OnSyncCallback | null = null;

  //</editor-fold>

  private currentState: State = State.IDLE;
  private currentTimestamp = 0;
  private pingIntervalHandler?: number;

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

  /**
   * Handlers for all instruction opcodes receivable by a Guacamole protocol
   * client.
   *
   * @private
   */
    // TODO Review the following lint suppression
    // eslint-disable-next-line @typescript-eslint/ban-types
  private readonly instructionHandlers: Record<string, Function> = {

    ack: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const reason = parameters[1];
      const code = parseInt(parameters[2], 10);

      this.handleAckInstruction(streamIndex, code, reason);
    },

    arc: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const x = parseInt(parameters[1], 10);
      const y = parseInt(parameters[2], 10);
      const radius = parseInt(parameters[3], 10);
      const startAngle = parseFloat(parameters[4]);
      const endAngle = parseFloat(parameters[5]);
      const negative = parseInt(parameters[6], 10);

      this.handleArcInstruction(layerIndex, x, y, radius, startAngle, endAngle, negative);
    },

    argv: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const mimetype = parameters[1];
      const name = parameters[2];

      this.handleArgvInstruction(streamIndex, mimetype, name);
    },

    audio: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const mimetype = parameters[1];

      this.handleAudioInstruction(streamIndex, mimetype);
    },

    blob: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const data = parameters[1];

      this.handleBlobInstruction(streamIndex, data);
    },

    body: (parameters: string[]) => {
      const objectIndex = parseInt(parameters[0], 10);
      const streamIndex = parseInt(parameters[1], 10);
      const mimetype = parameters[2];
      const name = parameters[3];

      this.handleBodyInstruction(objectIndex, streamIndex, mimetype, name);
    },

    cfill: (parameters: string[]) => {
      const channelMask = parseInt(parameters[0], 10);
      const layerIndex = parseInt(parameters[1], 10);
      const r = parseInt(parameters[2], 10);
      const g = parseInt(parameters[3], 10);
      const b = parseInt(parameters[4], 10);
      const a = parseInt(parameters[5], 10);

      this.handleCfillInstruction(layerIndex, channelMask, r, g, b, a);
    },

    clip: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);

      this.handleClipInstruction(layerIndex);
    },

    clipboard: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const mimetype = parameters[1];

      this.handleClipboardInstruction(streamIndex, mimetype);
    },

    close: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);

      this.handleCloseInstruction(layerIndex);
    },

    copy: (parameters: string[]) => {
      const srcLayerIndex = parseInt(parameters[0], 10);
      const srcX = parseInt(parameters[1], 10);
      const srcY = parseInt(parameters[2], 10);
      const srcWidth = parseInt(parameters[3], 10);
      const srcHeight = parseInt(parameters[4], 10);
      const channelMask = parseInt(parameters[5], 10);
      const dstLayerIndex = parseInt(parameters[6], 10);
      const dstX = parseInt(parameters[7], 10);
      const dstY = parseInt(parameters[8], 10);

      this.handleCopyInstruction(srcLayerIndex, dstLayerIndex, channelMask, srcX, srcY, srcWidth, srcHeight, dstX, dstY);
    },

    cstroke: (parameters: string[]) => {
      const channelMask = parseInt(parameters[0], 10);
      const layerIndex = parseInt(parameters[1], 10);
      const cap = LINE_CAP[parseInt(parameters[2], 10)];
      const join = LINE_JOIN[parseInt(parameters[3], 10)];
      const thickness = parseInt(parameters[4], 10);
      const r = parseInt(parameters[5], 10);
      const g = parseInt(parameters[6], 10);
      const b = parseInt(parameters[7], 10);
      const a = parseInt(parameters[8], 10);

      this.handleCstrokeInstruction(layerIndex, channelMask, cap, join, thickness, r, g, b, a);
    },

    cursor: (parameters: string[]) => {
      const cursorHotspotX = parseInt(parameters[0], 10);
      const cursorHotspotY = parseInt(parameters[1], 10);
      const srcLayerIndex = parseInt(parameters[2], 10);
      const srcX = parseInt(parameters[3], 10);
      const srcY = parseInt(parameters[4], 10);
      const srcWidth = parseInt(parameters[5], 10);
      const srcHeight = parseInt(parameters[6], 10);

      this.handleCursorInstruction(srcLayerIndex, cursorHotspotX, cursorHotspotY, srcX, srcY, srcWidth, srcHeight);
    },

    curve: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const cp1x = parseInt(parameters[1], 10);
      const cp1y = parseInt(parameters[2], 10);
      const cp2x = parseInt(parameters[3], 10);
      const cp2y = parseInt(parameters[4], 10);
      const x = parseInt(parameters[5], 10);
      const y = parseInt(parameters[6], 10);

      this.handleCurveInstruction(layerIndex, cp1x, cp1y, cp2x, cp2y, x, y);
    },

    disconnect: () => {
      this.handleDisconnectInstruction();
    },

    dispose: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);

      this.handleDisposeInstruction(layerIndex);
    },

    distort: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const a = parseFloat(parameters[1]);
      const b = parseFloat(parameters[2]);
      const c = parseFloat(parameters[3]);
      const d = parseFloat(parameters[4]);
      const e = parseFloat(parameters[5]);
      const f = parseFloat(parameters[6]);

      this.handleDistortInstruction(layerIndex, a, b, c, d, e, f);
    },

    error: (parameters: string[]) => {
      const reason = parameters[0];
      const code = parseInt(parameters[1], 10);

      this.handleErrorInstruction(code, reason);
    },

    end: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);

      this.handleEndInstruction(streamIndex);
    },

    file: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const mimetype = parameters[1];
      const filename = parameters[2];

      this.handleFileInstruction(streamIndex, mimetype, filename);
    },

    filesystem: (parameters: string[]) => {
      const objectIndex = parseInt(parameters[0], 10);
      const name = parameters[1];

      this.handleFilesystemInstruction(objectIndex, name);
    },

    identity: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);

      this.handleIdentityInstruction(layerIndex);
    },

    img: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const channelMask = parseInt(parameters[1], 10);
      const layerIndex = parseInt(parameters[2], 10);
      const mimetype = parameters[3];
      const x = parseInt(parameters[4], 10);
      const y = parseInt(parameters[5], 10);

      this.handleImgInstruction(streamIndex, layerIndex, channelMask, x, y, mimetype);
    },

    jpeg: (parameters: string[]) => {
      const channelMask = parseInt(parameters[0], 10);
      const layerIndex = parseInt(parameters[1], 10);
      const x = parseInt(parameters[2], 10);
      const y = parseInt(parameters[3], 10);
      const data = parameters[4];

      this.handleJpegInstruction(layerIndex, channelMask, x, y, data);
    },

    lfill: (parameters: string[]) => {
      const channelMask = parseInt(parameters[0], 10);
      const layerIndex = parseInt(parameters[1], 10);
      const srcLayerIndex = parseInt(parameters[2], 10);

      this.handleLfillInstruction(layerIndex, channelMask, srcLayerIndex);
    },

    line: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const x = parseInt(parameters[1], 10);
      const y = parseInt(parameters[2], 10);

      this.handleLineInstruction(layerIndex, x, y);
    },

    lstroke: (parameters: string[]) => {
      const channelMask = parseInt(parameters[0], 10);
      const layerIndex = parseInt(parameters[1], 10);
      const capIndex = parseInt(parameters[2], 10);
      const joinIndex = parseInt(parameters[3], 10);
      const thickness = parseInt(parameters[4], 10);
      const srcLayerIndex = parseInt(parameters[5], 10);

      const cap = LINE_CAP[capIndex];
      const join = LINE_JOIN[joinIndex];

      this.handleLstrokeInstruction(layerIndex, srcLayerIndex, channelMask, cap, join, thickness);
    },

    mouse: (parameters: string[]) => {
      const x = parseInt(parameters[0], 10);
      const y = parseInt(parameters[1], 10);

      this.handleMouseInstruction(x, y);
    },

    move: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const parentIndex = parseInt(parameters[1], 10);
      const x = parseInt(parameters[2], 10);
      const y = parseInt(parameters[3], 10);
      const z = parseInt(parameters[4], 10);

      this.handleMoveInstruction(layerIndex, parentIndex, x, y, z);
    },

    name: (parameters: string[]) => {
      this.handleNameInstruction(parameters);
    },

    nest: (parameters: string[]) => {
      const parserIndex = parseInt(parameters[0], 10);

      this.handleNestInstruction(parserIndex, parameters);
    },

    pipe: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const mimetype = parameters[1];
      const name = parameters[2];

      this.handlePipeInstruction(streamIndex, mimetype, name);
    },

    png: (parameters: string[]) => {
      const channelMask = parseInt(parameters[0], 10);
      const layerIndex = parseInt(parameters[1], 10);
      const x = parseInt(parameters[2], 10);
      const y = parseInt(parameters[3], 10);
      const data = parameters[4];

      this.handlePngInstruction(layerIndex, channelMask, x, y, data);
    },

    pop: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);

      this.handlePopInstruction(layerIndex);
    },

    push: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);

      this.handlePushInstruction(layerIndex);
    },

    rect: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const x = parseInt(parameters[1], 10);
      const y = parseInt(parameters[2], 10);
      const w = parseInt(parameters[3], 10);
      const h = parseInt(parameters[4], 10);

      this.handleRectInstruction(layerIndex, x, y, w, h);
    },

    required: (parameters: string[]) => {
      this.handleRequiredInstruction(parameters);
    },

    reset: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);

      this.handleResetInstruction(layerIndex);
    },

    set: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const name = parameters[1];
      const value = parameters[2];

      this.handleSetInstruction(layerIndex, name, value);
    },

    shade: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const a = parseInt(parameters[1], 10);

      this.handleShadeInstruction(layerIndex, a);
    },

    size: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const width = parseInt(parameters[1], 10);
      const height = parseInt(parameters[2], 10);

      this.handleSizeInstruction(layerIndex, width, height);
    },

    start: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const x = parseInt(parameters[1], 10);
      const y = parseInt(parameters[2], 10);

      this.handleStartInstruction(layerIndex, x, y);
    },

    sync: (parameters: string[]) => {
      const timestamp = parseInt(parameters[0], 10);

      this.handleSyncInstruction(timestamp);
    },

    transfer: (parameters: string[]) => {
      const srcLayerIndex = parseInt(parameters[0], 10);
      const srcX = parseInt(parameters[1], 10);
      const srcY = parseInt(parameters[2], 10);
      const srcWidth = parseInt(parameters[3], 10);
      const srcHeight = parseInt(parameters[4], 10);
      const functionIndex = parseInt(parameters[5], 10);
      const dstLayerIndex = parseInt(parameters[6], 10);
      const dstX = parseInt(parameters[7], 10);
      const dstY = parseInt(parameters[8], 10);

      this.handleTransferInstruction(srcLayerIndex, dstLayerIndex, functionIndex, srcX, srcY, srcWidth, srcHeight, dstX, dstY);
    },

    transform: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const a = parseFloat(parameters[1]);
      const b = parseFloat(parameters[2]);
      const c = parseFloat(parameters[3]);
      const d = parseFloat(parameters[4]);
      const e = parseFloat(parameters[5]);
      const f = parseFloat(parameters[6]);

      this.handleTransformInstruction(layerIndex, a, b, c, d, e, f);
    },

    undefine: (parameters: string[]) => {
      const objectIndex = parseInt(parameters[0], 10);

      this.handleUndefineInstruction(objectIndex);
    },

    video: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const layerIndex = parseInt(parameters[1], 10);
      const mimetype = parameters[2];

      this.handleVideoInstruction(streamIndex, layerIndex, mimetype);
    }
  };

  /**
   * @constructor
   *
   * @param tunnel - The tunnel to use to send and receive Guacamole instructions.
   */
  constructor(private readonly tunnel: Tunnel) {
    this.outputStreams = new OutputStreamsManager(this);
    this.inputStreams = new InputStreamsManager(this);

    this.display = new Display();

    this.tunnel.oninstruction = (opcode, parameters) => {
      const handler = this.instructionHandlers[opcode];
      if (handler) {
        handler(parameters);
      }
    };
    this.tunnel.onerror = (error) => {
      if (this.onerror !== null) {
        this.onerror(new Status(StatusCode.fromTunnelError(error)));
      }
    };
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
    // Call handler if set
    if (this.onerror !== null) {
      this.onerror(new Status(code, reason));
    }

    this.disconnect();
  }

  private handleNameInstruction(parameters: string[]) {
    if (this.onname !== null) {
      this.onname(parameters[0]);
    }
  }

  private handleNestInstruction(parserIndex: number, parameters: string[]) {
    const parser = this.getParser(parserIndex);
    parser.receive(parameters[1]);
  }

  private handleRequiredInstruction(parameters: string[]) {
    if (this.onrequired !== null) {
      this.onrequired(parameters);
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
    if (this.onsync !== null) {
      this.onsync(timestamp);
    }
  }

  //<editor-fold defaultstate="collapsed" desc="InputStreamHandler">

  private handleArgvInstruction(streamIndex: number, mimetype: string, name: string) {
    if (this.onargv === null) {
      this.sendAck(streamIndex, new StreamError('Receiving argument values unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);
    this.onargv(stream, mimetype, name);
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
    if (this.onaudio) {
      audioPlayer = this.onaudio(stream, mimetype);
    }

    // If unsuccessful, try to use a default implementation
    if (!audioPlayer) {
      audioPlayer = getAudioPlayerInstance(stream, mimetype);
    }

    // If we have successfully retrieved an audio player, send success response
    if (audioPlayer) {
      this.audioPlayers.set(streamIndex, audioPlayer);
      this.sendAck(streamIndex);
    } else {
      // Otherwise, mimetype must be unsupported
      this.sendAck(streamIndex, new StreamError('BAD TYPE', StatusCode.CLIENT_BAD_TYPE));
    }
  }

  private handleVideoInstruction(streamIndex: number, layerIndex: number, mimetype: string) {
    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);

    // Get layer
    const layer = this.getLayer(layerIndex);

    // Get player instance via callback
    let videoPlayer: VideoPlayer | null = null;
    if (this.onvideo) {
      videoPlayer = this.onvideo(stream, layer, mimetype);
    }

    // If unsuccessful, try to use a default implementation
    if (!videoPlayer) {
      videoPlayer = VideoPlayer.getInstance(stream, layer, mimetype);
    }

    // If we have successfully retrieved an video player, send success response
    if (videoPlayer) {
      this.videoPlayers.set(streamIndex, videoPlayer);
      this.sendAck(streamIndex);
    } else {
      // Otherwise, mimetype must be unsupported
      this.sendAck(streamIndex, new StreamError('BAD TYPE', StatusCode.CLIENT_BAD_TYPE));
    }
  }

  private handleClipboardInstruction(streamIndex: number, mimetype: string) {
    if (this.onclipboard === null) {
      this.sendAck(streamIndex, new StreamError('Clipboard unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);

    this.onclipboard(stream, mimetype);
  }

  private handleFileInstruction(streamIndex: number, mimetype: string, filename: string) {
    if (this.onfile === null) {
      this.sendAck(streamIndex, new StreamError('File transfer unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);
    this.onfile(stream, mimetype, filename);
  }

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
    if (this.onpipe === null) {
      this.sendAck(streamIndex, new StreamError('Named pipes unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);
    this.onpipe(stream, mimetype, name);
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

  //</editor-fold>
  //<editor-fold defaultstate="collapsed" desc="OutputStreamHandler">

  private handleAckInstruction(streamIndex: number, code: number, reason: string) {
    // Get stream
    const stream = this.outputStreams.getStream(streamIndex);
    if (!stream) {
      return;
    }

    // Signal ack if handler defined
    if (stream.onack) {
      let error = undefined;
      if (code >= 0x0100) {
        error = new StreamError(reason, code);
      }

      stream.onack(error);
    }

    // If code is an error, invalidate stream if not already
    // invalidated by onack handler
    if (code >= 0x0100) {
      this.outputStreams.freeStream(streamIndex);
    }
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

  //</editor-fold>
  //<editor-fold defaultstate="collapsed" desc="ObjectHandler">

  private handleFilesystemInstruction(objectIndex: number, name: string) {
    if (this.onfilesystem === null) {
      // If unsupported, simply ignore the availability of the filesystem
      return;
    }

    // Create object, if supported
    const object = new GuacamoleObject(this, objectIndex);

    this.objects.set(objectIndex, object);
    this.onfilesystem(object, name);
  }

  private handleUndefineInstruction(objectIndex: number) {
    // Get object
    const object = this.objects.get(objectIndex);

    // Signal end of object definition
    if (object?.onundefine) {
      object.onundefine();
    }
  }

  //</editor-fold>
  //<editor-fold defaultstate="collapsed" desc="DisplayHandler">

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

  private handleTransformInstruction(layerIndex: number, a: number, b: number, c: number, d: number, e: number, f: number) {
    const layer = this.getLayer(layerIndex);
    this.display.transform(layer, a, b, c, d, e, f);
  }

  //</editor-fold>

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

  private setState(state: State) {
    if (this.currentState === state) {
      return;
    }

    this.currentState = state;
    if (this.onstatechange !== null) {
      this.onstatechange(state);
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
}
