import { Display } from '@guacamole-client/display';
import { Status, StatusCode } from './status';
import {
  ClientControl,
  ClientEvents,
  Decoder,
  ServerControl,
  Streaming
} from '@guacamole-client/protocol';
import { Tunnel } from '@guacamole-client/tunnel';
import { State } from './state';
import { MouseState } from '@guacamole-client/input';
import { InputStreamResponseSender } from './streams/input';
import { OutputStreamResponseSender } from './streams/output';
import { ClientEventMap, ClientEventTarget, ClientEventTargetMap } from './client-events';
import { InstructionRouter } from './instruction-router';
import {
  DisplayManager,
  registerDrawingInstructionHandlers,
  registerImgStreamHandlers
} from './display';
import { AudioPlayerManager, registerAudioPlayerHandlers } from './audio-player';
import { ClipboardManager, registerClipboardStreamHandlers } from './clipboard';
import { FileTransferManager, registerFileTransferStreamHandlers } from './file-transfer';
import { NamedPipeManager, registerNamedPipeStreamHandlers } from './named-pipe';
import { FilesystemManager, registerFilesystemStreamHandlers } from './filesystem';

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

  private readonly display: DisplayManager;
  private readonly audioPlayer: AudioPlayerManager;
  private readonly clipboard: ClipboardManager;
  private readonly fileTransfers: FileTransferManager;
  private readonly namedPipes: NamedPipeManager;
  private readonly filesystem: FilesystemManager;

  private readonly decoders: Map<number, Decoder> = new Map();

  private readonly instructionRouter: InstructionRouter;

  /**
   * @constructor
   *
   * @param tunnel - The tunnel to use to send and receive Guacamole instructions.
   * @param display - The underlying Guacamole display.
   */
  constructor(private readonly tunnel: Tunnel, display: Display) {
    this.instructionRouter = new InstructionRouter();
    this.tunnel.oninstruction = (opcode, params) => {
      this.instructionRouter.dispatchInstruction(opcode, params);
    };
    this.tunnel.onerror = (error) => {
      const listener = this.events.getEventListener('onerror');
      if (listener) {
        listener(new Status(StatusCode.fromTunnelError(error)));
      }
    };

    /* Display */
    this.display = new DisplayManager(display, this);
    registerImgStreamHandlers(this.instructionRouter, this.display);
    registerDrawingInstructionHandlers(this.instructionRouter, this.display);

    /* Audio player */
    this.audioPlayer = new AudioPlayerManager(this, this.events);
    registerAudioPlayerHandlers(this.instructionRouter, this.audioPlayer);

    /* Clipboard */
    this.clipboard = new ClipboardManager(this, this.events);
    registerClipboardStreamHandlers(this.instructionRouter, this.clipboard);

    /* File transfers */
    this.fileTransfers = new FileTransferManager(this, this.events);
    registerFileTransferStreamHandlers(this.instructionRouter, this.fileTransfers);

    /* Named pipes */
    this.namedPipes = new NamedPipeManager(this, this.events);
    registerNamedPipeStreamHandlers(this.instructionRouter, this.namedPipes);

    /* Filesystem */
    this.filesystem = new FilesystemManager(this, this.events);
    registerFilesystemStreamHandlers(this.instructionRouter, this.filesystem);

    this.registerClientSpecificInstructionRoutes(this.instructionRouter);
  }

  isConnected(): boolean {
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
  connect(data?: string) {
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
  disconnect() {
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
  sendSize(width: number, height: number) {
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
  sendKeyEvent(pressed: boolean, keysym: number) {
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
  sendMouseState(mouseState: MouseState) {
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

  sendMessage(...elements: any[]) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }

    this.tunnel.sendMessage(...elements);
  }

  addEventListener<K extends keyof ClientEventMap>(type: K, listener: ClientEventMap[K]): void {
    this.events.addEventListener(type, listener);
  }

  removeEventListener<K extends keyof ClientEventMap>(type: K): void {
    this.events.removeEventListener(type);
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

  private registerClientSpecificInstructionRoutes(router: InstructionRouter) {
    router.addInstructionHandler(Streaming.nest.opcode, Streaming.nest.parser(
      this.handleNestInstruction.bind(this)
    ));

    router.addInstructionHandler(ClientControl.disconnect.opcode, ClientControl.disconnect.parser(
      this.handleDisconnectInstruction.bind(this)
    ));
    router.addInstructionHandler(ClientControl.sync.opcode, ClientControl.sync.parser(
      this.handleSyncInstruction.bind(this)
    ));

    router.addInstructionHandler(ServerControl.mouse.opcode, ServerControl.mouse.parser(
      this.handleMouseInstruction.bind(this)
    ));
    router.addInstructionHandler(ServerControl.error.opcode, ServerControl.error.parser(
      this.handleErrorInstruction.bind(this)
    ));

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

  private handleMouseInstruction(x: number, y: number) {
    // Display and move software cursor to received coordinates
    this.display.showCursor(true);
    this.display.moveCursor(x, y);
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

  private getDecoder(index: number) {
    let decoder = this.decoders.get(index);

    // If parser not yet created, create it, and route the instructions through
    // the client's instruction router.
    if (decoder === undefined) {
      decoder = new Decoder();
      decoder.oninstruction = (opcode, params) => {
        this.instructionRouter.dispatchInstruction(opcode, params);
      };
    }

    this.decoders.set(index, decoder);
    return decoder;
  }

  private handleNestInstruction(parserIndex: number, packet: string) {
    const parser = this.getDecoder(parserIndex);
    parser.receive(packet);
  }
}
