import { Display } from '@guacamole-client/display';
import { Status, StatusCode } from './Status';
import { GuacamoleObject } from './object/GuacamoleObject';
import { OutputStream, StreamError } from '@guacamole-client/io';
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
import { InputStreamResponseSender, InputStreamsManager } from './streams/input';
import { OutputStreamResponseSender, OutputStreamsManager } from './streams/output';
import { ClientEventMap, ClientEventTarget, ClientEventTargetMap } from './client-events';
import { InstructionRouter } from './instruction-router';
import {
  DisplayManager,
  registerDrawingInstructionHandlers,
  registerImgStreamHandlers
} from './display';
import { AudioPlayerManager, registerAudioStreamHandlers } from './audio-player';
import { ClipboardManager, registerClipboardStreamHandlers } from './clipboard';

const PING_INTERVAL = 5000;

/**
 * Guacamole protocol client. Given a {@link Tunnel},
 * automatically handles incoming and outgoing Guacamole instructions via the
 * provided tunnel, updating its display using one or more canvas elements.
 */
export class Client implements InputStreamResponseSender, OutputStreamResponseSender, ClientEventTarget {

  private currentState: State = State.IDLE;

  private currentTimestamp = 0;
  private pingIntervalHandler?: number;

  private readonly events: ClientEventTargetMap = new ClientEventTargetMap();

  private readonly inputStreams: InputStreamsManager;
  private readonly outputStreams: OutputStreamsManager;

  private readonly display: DisplayManager;
  private readonly audioPlayer: AudioPlayerManager;
  private readonly clipboard: ClipboardManager;

  private readonly decoders: Map<number, Decoder> = new Map();

  /**
   * All current objects. The index of each object is dictated by the
   * Guacamole server.
   *
   * @private
   */
  private readonly objects: Map<number, GuacamoleObject> = new Map();

  private readonly instructionRouter: InstructionRouter;

  /**
   * @constructor
   *
   * @param tunnel - The tunnel to use to send and receive Guacamole instructions.
   * @param display - The underlying Guacamole display.
   */
  constructor(private readonly tunnel: Tunnel, display: Display) {
    this.display = new DisplayManager(display, this);
    this.audioPlayer = new AudioPlayerManager(this);
    this.clipboard = new ClipboardManager(this, this.events);

    this.instructionRouter = new InstructionRouter();
    this.registerInstructionRoutes();

    this.outputStreams = new OutputStreamsManager(this);
    this.inputStreams = new InputStreamsManager(this);

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

  public handleMouseInstruction(x: number, y: number) {
    // Display and move software cursor to received coordinates
    this.display.showCursor(true);
    this.display.moveCursor(x, y);
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

  private handleRequiredInstruction(parameters: string[]) {
    const listener = this.events.getEventListener('onrequired');
    if (listener) {
      listener(parameters);
    }
  }

  private handleSyncInstruction(timestamp: number) {
    // Flush display, send sync when done
    this.display.flush(() => {
      this.audioPlayer.sync();

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

  //<editor-fold defaultstate="collapsed" desc="OutputStreamHandler">
  //</editor-fold>

  private handleFileInstruction(streamIndex: number, mimetype: string, filename: string) {
    const listener = this.events.getEventListener('onfile');
    if (!listener) {
      this.sendAck(streamIndex, new StreamError('File transfer unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    const stream = this.inputStreams.createStream(streamIndex);
    listener(stream, mimetype, filename);
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

  private handleUndefineInstruction(objectIndex: number) {
    // Get object
    const object = this.objects.get(objectIndex);

    // Signal end of object definition
    if (object?.onundefine) {
      object.onundefine();
    }
  }

  //</editor-fold>

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

  private getDecoder(index: number) {
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

  private handleNestInstruction(parserIndex: number, packet: string) {
    const parser = this.getDecoder(parserIndex);
    parser.receive(packet);
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

    registerImgStreamHandlers(this.instructionRouter, this.display);
    registerDrawingInstructionHandlers(this.instructionRouter, this.display);
    registerAudioStreamHandlers(this.instructionRouter, this.audioPlayer);
    registerClipboardStreamHandlers(this.instructionRouter, this.clipboard);

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
    router.addInstructionHandler(Streaming.file.opcode, Streaming.file.parser(
      this.handleFileInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.nest.opcode, Streaming.nest.parser(
      this.handleNestInstruction.bind(this)
    ));
    router.addInstructionHandler(Streaming.pipe.opcode, Streaming.pipe.parser(
      this.handlePipeInstruction.bind(this)
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
    router.addInstructionHandler(ServerControl.mouse.opcode, ServerControl.mouse.parser(
      this.handleMouseInstruction.bind(this)
    ));
    router.addInstructionHandler(ServerControl.error.opcode, ServerControl.error.parser(
      this.handleErrorInstruction.bind(this)
    ));
  }
}
