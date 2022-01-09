import {
  ChannelMask,
  DEFAULT_TRANSFER_FUNCTION,
  Display,
  Layer,
  LINE_CAP,
  LINE_JOIN,
  VisibleLayer
} from './display';
import IntegerPool from './IntegerPool';
import { Status, StatusCode } from './Status';
import GuacamoleObject from './GuacamoleObject';
import { InputStream, OutputStream } from '@guacamole-client/io';
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

export type ExportStateCallback = (state: Record<string, any>) => void;

const PING_INTERVAL = 5000;

/**
 * Guacamole protocol client. Given a {@link Tunnel},
 * automatically handles incoming and outgoing Guacamole instructions via the
 * provided tunnel, updating its display using one or more canvas elements.
 */
export default class Client {
  /**
   * Fired whenever the state of this Client changes.
   *
   * @event
   * @param state - The new state of the client.
   */
  public onstatechange: OnStateChangeCallback | null = null;

  /**
   * Fired when the remote client sends a name update.
   *
   * @event
   * @param name - The new name of this client.
   */
  public onname: OnNameCallback | null = null;

  /**
   * Fired when an error is reported by the remote client, and the connection
   * is being closed.
   *
   * @event
   * @param status - A status object which describes the error.
   */
  public onerror: OnErrorCallback | null = null;

  /**
   * Fired when a audio stream is created. The stream provided to this event
   * handler will contain its own event handlers for received data.
   *
   * @event
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
   * @event
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
   * @event
   * @param stream - The stream that will receive connection parameter data from the server.
   * @param mimetype - The mimetype of the data which will be received.
   * @param name - The name of the connection parameter whose value is being exposed.
   */
  public onargv: OnArgvCallback | null = null;

  /**
   * Fired when the clipboard of the remote client is changing.
   *
   * @event
   * @param stream - The stream that will receive clipboard data from the server.
   * @param mimetype - The mimetype of the data which will be received.
   */
  public onclipboard: OnClipboardCallback | null = null;

  /**
   * Fired when a file stream is created. The stream provided to this event
   * handler will contain its own event handlers for received data.
   *
   * @event
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
   * @event
   * @param object - The created filesystem object.
   * @param name - The name of the filesystem.
   */
  public onfilesystem: OnFilesystemCallback | null = null;

  /**
   * Fired when a pipe stream is created. The stream provided to this event
   * handler will contain its own event handlers for received data;
   *
   * @event
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
   * @event
   * @param parameters - The names of the connection parameters that are required to be
   *                     provided for the connection to continue.
   */
  public onrequired: OnRequiredCallback | null = null;

  /**
   * Fired whenever a sync instruction is received from the server, indicating
   * that the server is finished processing any input from the client and
   * has sent any results.
   *
   * @event
   * @param timestamp - The timestamp associated with the sync
   *                    instruction.
   */
  public onsync: OnSyncCallback | null = null;

  private currentState: State = State.IDLE;
  private currentTimestamp = 0;
  private pingIntervalHandler?: number;
  /**
   * The underlying Guacamole display.
   *
   * @private
   * @type {Display}
   */
  private readonly display: Display;
  // Pool of available stream indices
  private readonly streamIndices = new IntegerPool();
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
  // No initial parsers
  private readonly decoders: Map<number, Decoder> = new Map();
  // No initial streams
  private readonly streams: Map<number, InputStream> = new Map();
  /**
   * All current objects. The index of each object is dictated by the
   * Guacamole server.
   *
   * @private
   */
  private readonly objects: Map<number, GuacamoleObject> = new Map();
  // Array of allocated output streams by index
  private readonly outputStreams: Map<number, OutputStream> = new Map();

  /**
   * Handlers for all defined layer properties.
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
   * @private
   */
    // TODO Review the following lint suppression
    // eslint-disable-next-line @typescript-eslint/ban-types
  private readonly instructionHandlers: Record<string, Function> = {

    ack: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const reason = parameters[1];
      const code = parseInt(parameters[2], 10);

      // Get stream
      const stream = this.outputStreams.get(streamIndex);
      if (stream) {
        // Signal ack if handler defined
        if (stream.onack) {
          stream.onack(new Status(code, reason));
        }

        // If code is an error, invalidate stream if not already
        // invalidated by onack handler
        if (code >= 0x0100 && this.outputStreams.get(streamIndex) === stream) {
          this.streamIndices.free(streamIndex);
          this.outputStreams.delete(streamIndex);
        }
      }
    },

    arc: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));
      const x = parseInt(parameters[1], 10);
      const y = parseInt(parameters[2], 10);
      const radius = parseInt(parameters[3], 10);
      const startAngle = parseFloat(parameters[4]);
      const endAngle = parseFloat(parameters[5]);
      const negative = parseInt(parameters[6], 10);

      this.display.arc(layer, x, y, radius, startAngle, endAngle, negative !== 0);
    },

    argv: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const mimetype = parameters[1];
      const name = parameters[2];

      // Create stream
      if (this.onargv) {
        const stream = new InputStream(this, streamIndex);
        this.streams.set(streamIndex, stream);
        this.onargv(stream, mimetype, name);
      } else {
        // Otherwise, unsupported
        this.sendAck(streamIndex, 'Receiving argument values unsupported', StatusCode.UNSUPPORTED);
      }
    },

    audio: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const mimetype = parameters[1];

      // Create stream
      const stream = new InputStream(this, streamIndex);
      this.streams.set(streamIndex, stream);

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
        this.sendAck(streamIndex, 'OK', StatusCode.SUCCESS);
      } else {
        // Otherwise, mimetype must be unsupported
        this.sendAck(streamIndex, 'BAD TYPE', StatusCode.CLIENT_BAD_TYPE);
      }
    },

    blob: (parameters: string[]) => {
      // Get stream
      const streamIndex = parseInt(parameters[0], 10);
      const data = parameters[1];
      const stream = this.streams.get(streamIndex);

      // Write data
      if (stream?.onblob) {
        stream.onblob(data);
      }
    },

    body: (parameters: string[]) => {
      // Get object
      const objectIndex = parseInt(parameters[0], 10);
      const object = this.objects.get(objectIndex);

      const streamIndex = parseInt(parameters[1], 10);
      const mimetype = parameters[2];
      const name = parameters[3];

      // Create stream if handler defined
      if (object?.onbody) {
        const stream = new InputStream(this, streamIndex);
        this.streams.set(streamIndex, stream);
        object.onbody(stream, mimetype, name);
      } else {
        // Otherwise, unsupported
        this.sendAck(streamIndex, 'Receipt of body unsupported', StatusCode.UNSUPPORTED);
      }
    },

    cfill: (parameters: string[]) => {
      const channelMask = parseInt(parameters[0], 10);
      const layer = this.getLayer(parseInt(parameters[1], 10));
      const r = parseInt(parameters[2], 10);
      const g = parseInt(parameters[3], 10);
      const b = parseInt(parameters[4], 10);
      const a = parseInt(parameters[5], 10);

      this.display.setChannelMask(layer, channelMask);
      this.display.fillColor(layer, r, g, b, a);
    },

    clip: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));

      this.display.clip(layer);
    },

    clipboard: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const mimetype = parameters[1];

      // Create stream
      if (this.onclipboard) {
        const stream = new InputStream(this, streamIndex);
        this.streams.set(streamIndex, stream);
        this.onclipboard(stream, mimetype);
      } else {
        // Otherwise, unsupported
        this.sendAck(streamIndex, 'Clipboard unsupported', StatusCode.UNSUPPORTED);
      }
    },

    close: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));

      this.display.close(layer);
    },

    copy: (parameters: string[]) => {
      const srcL = this.getLayer(parseInt(parameters[0], 10));
      const srcX = parseInt(parameters[1], 10);
      const srcY = parseInt(parameters[2], 10);
      const srcWidth = parseInt(parameters[3], 10);
      const srcHeight = parseInt(parameters[4], 10);
      const channelMask = parseInt(parameters[5], 10);
      const dstL = this.getLayer(parseInt(parameters[6], 10));
      const dstX = parseInt(parameters[7], 10);
      const dstY = parseInt(parameters[8], 10);

      this.display.setChannelMask(dstL, channelMask);
      this.display.copy(srcL, srcX, srcY, srcWidth, srcHeight, dstL, dstX, dstY);
    },

    cstroke: (parameters: string[]) => {
      const channelMask = parseInt(parameters[0], 10);
      const layer = this.getLayer(parseInt(parameters[1], 10));
      const cap = LINE_CAP[parseInt(parameters[2], 10)];
      const join = LINE_JOIN[parseInt(parameters[3], 10)];
      const thickness = parseInt(parameters[4], 10);
      const r = parseInt(parameters[5], 10);
      const g = parseInt(parameters[6], 10);
      const b = parseInt(parameters[7], 10);
      const a = parseInt(parameters[8], 10);

      this.display.setChannelMask(layer, channelMask);
      this.display.strokeColor(layer, cap, join, thickness, r, g, b, a);
    },

    cursor: (parameters: string[]) => {
      const cursorHotspotX = parseInt(parameters[0], 10);
      const cursorHotspotY = parseInt(parameters[1], 10);
      const srcL = this.getLayer(parseInt(parameters[2], 10));
      const srcX = parseInt(parameters[3], 10);
      const srcY = parseInt(parameters[4], 10);
      const srcWidth = parseInt(parameters[5], 10);
      const srcHeight = parseInt(parameters[6], 10);

      this.display.setCursor(cursorHotspotX, cursorHotspotY, srcL, srcX, srcY, srcWidth, srcHeight);
    },

    curve: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));
      const cp1x = parseInt(parameters[1], 10);
      const cp1y = parseInt(parameters[2], 10);
      const cp2x = parseInt(parameters[3], 10);
      const cp2y = parseInt(parameters[4], 10);
      const x = parseInt(parameters[5], 10);
      const y = parseInt(parameters[6], 10);

      this.display.curveTo(layer, cp1x, cp1y, cp2x, cp2y, x, y);
    },

    disconnect: (_parameters: string[]) => {
      // Explicitly tear down connection
      this.disconnect();
    },

    dispose: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);

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
    },

    distort: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const a = parseFloat(parameters[1]);
      const b = parseFloat(parameters[2]);
      const c = parseFloat(parameters[3]);
      const d = parseFloat(parameters[4]);
      const e = parseFloat(parameters[5]);
      const f = parseFloat(parameters[6]);

      // Only valid for visible layers (not buffers)
      if (layerIndex >= 0) {
        const layer = this.getLayer(layerIndex);
        this.display.distort(layer, a, b, c, d, e, f);
      }
    },

    error: (parameters: string[]) => {
      const reason = parameters[0];
      const code = parseInt(parameters[1], 10);

      // Call handler if defined
      if (this.onerror) {
        this.onerror(new Status(code, reason));
      }

      this.disconnect();
    },

    end: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);

      // Get stream
      const stream = this.streams.get(streamIndex);
      if (stream) {
        // Signal end of stream if handler defined
        if (stream.onend) {
          stream.onend();
        }

        // Invalidate stream
        this.streams.delete(streamIndex);
      }
    },

    file: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const mimetype = parameters[1];
      const filename = parameters[2];

      // Create stream
      if (this.onfile) {
        const stream = new InputStream(this, streamIndex);
        this.streams.set(streamIndex, stream);
        this.onfile(stream, mimetype, filename);
      } else {
        // Otherwise, unsupported
        this.sendAck(streamIndex, 'File transfer unsupported', StatusCode.UNSUPPORTED);
      }
    },

    filesystem: (parameters: string[]) => {
      const objectIndex = parseInt(parameters[0], 10);
      const name = parameters[1];

      // Create object, if supported
      if (this.onfilesystem) {
        const object = new GuacamoleObject(this, objectIndex);
        this.objects.set(objectIndex, object);
        this.onfilesystem(object, name);
      }

      // If unsupported, simply ignore the availability of the filesystem
    },

    identity: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));

      this.display.setTransform(layer, 1, 0, 0, 1, 0, 0);
    },

    img: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const channelMask = parseInt(parameters[1], 10);
      const layer = this.getLayer(parseInt(parameters[2], 10));
      const mimetype = parameters[3];
      const x = parseInt(parameters[4], 10);
      const y = parseInt(parameters[5], 10);

      // Create stream
      const stream = new InputStream(this, streamIndex);
      this.streams.set(streamIndex, stream);

      // Draw received contents once decoded
      this.display.setChannelMask(layer, channelMask);
      this.display.drawStream(layer, x, y, stream, mimetype);
    },

    jpeg: (parameters: string[]) => {
      const channelMask = parseInt(parameters[0], 10);
      const layer = this.getLayer(parseInt(parameters[1], 10));
      const x = parseInt(parameters[2], 10);
      const y = parseInt(parameters[3], 10);
      const data = parameters[4];

      this.display.setChannelMask(layer, channelMask);
      this.display.draw(layer, x, y, `data:image/jpeg;base64,${data}`);
    },

    lfill: (parameters: string[]) => {
      const channelMask = parseInt(parameters[0], 10);
      const layer = this.getLayer(parseInt(parameters[1], 10));
      const srcLayer = this.getLayer(parseInt(parameters[2], 10));

      this.display.setChannelMask(layer, channelMask);
      this.display.fillLayer(layer, srcLayer);
    },

    line: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));
      const x = parseInt(parameters[1], 10);
      const y = parseInt(parameters[2], 10);

      this.display.lineTo(layer, x, y);
    },

    // TODO Review this
    // lstroke: (parameters: string[]) => {
    //   const channelMask = parseInt(parameters[0], 10);
    //   const layer = this.getLayer(parseInt(parameters[1], 10));
    //   const srcLayer = this.getLayer(parseInt(parameters[2], 10));
    //
    //   this.display.setChannelMask(layer, channelMask);
    //   this.display.strokeLayer(layer, srcLayer);
    // },

    mouse: (parameters: string[]) => {
      const x = parseInt(parameters[0], 10);
      const y = parseInt(parameters[1], 10);

      // Display and move software cursor to received coordinates
      this.display.showCursor(true);
      this.display.moveCursor(x, y);
    },

    move: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const parentIndex = parseInt(parameters[1], 10);
      const x = parseInt(parameters[2], 10);
      const y = parseInt(parameters[3], 10);
      const z = parseInt(parameters[4], 10);

      // Only valid for non-default layers
      if (layerIndex > 0 && parentIndex >= 0) {
        const layer = this.getLayer(layerIndex);
        const parent = this.getLayer(parentIndex);
        this.display.move(layer, parent, x, y, z);
      }
    },

    name: (parameters: string[]) => {
      if (this.onname) {
        this.onname(parameters[0]);
      }
    },

    nest: (parameters: string[]) => {
      const parser = this.getParser(parseInt(parameters[0], 10));
      parser.receive(parameters[1]);
    },

    pipe: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const mimetype = parameters[1];
      const name = parameters[2];

      // Create stream
      if (this.onpipe) {
        const stream = new InputStream(this, streamIndex);
        this.streams.set(streamIndex, stream);
        this.onpipe(stream, mimetype, name);
      } else {
        // Otherwise, unsupported
        this.sendAck(streamIndex, 'Named pipes unsupported', StatusCode.UNSUPPORTED);
      }
    },

    png: (parameters: string[]) => {
      const channelMask = parseInt(parameters[0], 10);
      const layer = this.getLayer(parseInt(parameters[1], 10));
      const x = parseInt(parameters[2], 10);
      const y = parseInt(parameters[3], 10);
      const data = parameters[4];

      this.display.setChannelMask(layer, channelMask);
      this.display.draw(layer, x, y, `data:image/png;base64,${data}`);
    },

    pop: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));

      this.display.pop(layer);
    },

    push: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));

      this.display.push(layer);
    },

    rect: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));
      const x = parseInt(parameters[1], 10);
      const y = parseInt(parameters[2], 10);
      const w = parseInt(parameters[3], 10);
      const h = parseInt(parameters[4], 10);

      this.display.rect(layer, x, y, w, h);
    },

    required: (parameters: string[]) => {
      if (this.onrequired !== null) {
        this.onrequired(parameters);
      }
    },

    reset: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));

      this.display.reset(layer);
    },

    set: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));
      const name = parameters[1];
      const value = parameters[2];

      // Call property handler if defined
      const handler = this.layerPropertyHandlers.get(name);
      if (handler) {
        handler(layer, value);
      }
    },

    shade: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const a = parseInt(parameters[1], 10);

      // Only valid for visible layers (not buffers)
      if (layerIndex >= 0) {
        const layer = this.getLayer(layerIndex);
        this.display.shade(layer, a);
      }
    },

    size: (parameters: string[]) => {
      const layerIndex = parseInt(parameters[0], 10);
      const layer = this.getLayer(layerIndex);
      const width = parseInt(parameters[1], 10);
      const height = parseInt(parameters[2], 10);

      this.display.resize(layer, width, height);
    },

    start: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));
      const x = parseInt(parameters[1], 10);
      const y = parseInt(parameters[2], 10);

      this.display.moveTo(layer, x, y);
    },

    sync: (parameters: string[]) => {
      const timestamp = parseInt(parameters[0], 10);

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
      if (this.onsync) {
        this.onsync(timestamp);
      }
    },

    transfer: (parameters: string[]) => {
      const srcL = this.getLayer(parseInt(parameters[0], 10));
      const srcX = parseInt(parameters[1], 10);
      const srcY = parseInt(parameters[2], 10);
      const srcWidth = parseInt(parameters[3], 10);
      const srcHeight = parseInt(parameters[4], 10);
      const functionIndex = parseInt(parameters[5], 10);
      const dstL = this.getLayer(parseInt(parameters[6], 10));
      const dstX = parseInt(parameters[7], 10);
      const dstY = parseInt(parameters[8], 10);

      /* SRC */
      if (functionIndex === 0x3) {
        this.display.put(srcL, srcX, srcY, srcWidth, srcHeight, dstL, dstX, dstY);
      } else if (functionIndex !== 0x5) {
        /* Anything else that isn't a NO-OP */
        this.display.transfer(srcL, srcX, srcY, srcWidth, srcHeight, dstL, dstX, dstY, DEFAULT_TRANSFER_FUNCTION[functionIndex]);
      }
    },

    transform: (parameters: string[]) => {
      const layer = this.getLayer(parseInt(parameters[0], 10));
      const a = parseFloat(parameters[1]);
      const b = parseFloat(parameters[2]);
      const c = parseFloat(parameters[3]);
      const d = parseFloat(parameters[4]);
      const e = parseFloat(parameters[5]);
      const f = parseFloat(parameters[6]);

      this.display.transform(layer, a, b, c, d, e, f);
    },

    undefine: (parameters: string[]) => {
      // Get object
      const objectIndex = parseInt(parameters[0], 10);
      const object = this.objects.get(objectIndex);

      // Signal end of object definition
      if (object?.onundefine) {
        object.onundefine();
      }
    },

    video: (parameters: string[]) => {
      const streamIndex = parseInt(parameters[0], 10);
      const layer = this.getLayer(parseInt(parameters[1], 10));
      const mimetype = parameters[2];

      // Create stream
      const stream = new InputStream(this, streamIndex);
      this.streams.set(streamIndex, stream);

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
        this.sendAck(streamIndex, 'OK', StatusCode.SUCCESS);
      } else {
        // Otherwise, mimetype must be unsupported
        this.sendAck(streamIndex, 'BAD TYPE', StatusCode.CLIENT_BAD_TYPE);
      }
    }

  };

  /*
   * @constructor
   * @param {Tunnel} tunnel
   *    The tunnel to use to send and receive Guacamole instructions.
   */
  constructor(private readonly tunnel: Tunnel) {
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
   * Produces an opaque representation of Client state which can be
   * later imported through a call to importState(). This object is
   * effectively an independent, compressed snapshot of protocol and display
   * state. Invoking this function implicitly flushes the display.
   *
   * @param callback -  Callback which should be invoked once the state object
   *     is ready. The state object will be passed to the callback as the sole
   *     parameter. This callback may be invoked immediately, or later as the
   *     display finishes rendering and becomes ready.
   */
  public exportState(callback: ExportStateCallback) {
    // Start with empty state
    const state = {
      currentState: this.currentState,
      currentTimestamp: this.currentTimestamp,
      // TODO Review the following lint suppression
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      layers: {} as Record<string, any>
    };

    const layersSnapshot: Record<number, VisibleLayer> = {};

    // Make a copy of all current layers (protocol state)
    for (const [key, layer] of this.layers) {
      layersSnapshot[key] = layer;
    }

    // Populate layers once data is available (display state, requires flush)
    this.display.flush(() => {
      // Export each defined layer/buffer
      for (const key in layersSnapshot) {
        const index = parseInt(key, 10);
        const layer = layersSnapshot[key];
        const canvas = layer.toCanvas();

        // Store layer/buffer dimensions
        const exportLayer: Record<string, any> = {
          width: layer.width,
          height: layer.height
        };

        // Store layer/buffer image data, if it can be generated
        if (layer.width && layer.height) {
          exportLayer.url = canvas.toDataURL('image/png');
        }

        // Add layer properties if not a buffer nor the default layer
        if (index > 0) {
          exportLayer.x = layer.x;
          exportLayer.y = layer.y;
          exportLayer.z = layer.z;
          exportLayer.alpha = layer.alpha;
          exportLayer.matrix = layer.matrix;
          exportLayer.parent = this.getLayerIndex(layer.parent);
        }

        // Store exported layer
        state.layers[key] = exportLayer;
      }

      // Invoke callback now that the state is ready
      callback(state);
    });
  }

  /**
   * Restores Client protocol and display state based on an opaque
   * object from a prior call to exportState(). The Client instance
   * used to export that state need not be the same as this instance.
   *
   * @param state - An opaque representation of Client state from a prior call
   *                to exportState().
   *
   * @param callback - The function to invoke when state has finished being
   *                   imported. This may happen immediately, or later as
   *                   images within the provided state object are loaded.
   */
  public importState(state: any, callback: () => void) {
    let index;

    this.currentState = state.currentState;
    this.currentTimestamp = state.currentTimestamp;

    // Dispose of all layers
    for (const [index, layer] of this.layers) {
      if (index > 0) {
        this.display.dispose(layer);
      }
    }

    this.layers.clear();

    // Import state of each layer/buffer
    for (const key in state.layers) {
      index = parseInt(key, 10);

      const importLayer = state.layers[key];
      const layer = this.getLayer(index);

      // Reset layer size
      this.display.resize(layer, importLayer.width, importLayer.height);

      // Initialize new layer if it has associated data
      this.display.setChannelMask(layer, ChannelMask.SRC);
      if (importLayer.url) {
        this.display.draw(layer, 0, 0, importLayer.url);
      }

      // Set layer-specific properties if not a buffer nor the default layer
      if (index > 0 && importLayer.parent >= 0) {
        // Apply layer position and set parent
        const parent = this.getLayer(importLayer.parent);
        this.display.move(layer, parent, importLayer.x, importLayer.y, importLayer.z);

        // Set layer transparency
        this.display.shade(layer, importLayer.alpha);

        // Apply matrix transform
        const { matrix } = importLayer;
        this.display.distort(layer,
          matrix[0],
          matrix[1],
          matrix[2],
          matrix[3],
          matrix[4],
          matrix[5]);
      }
    }

    // Flush changes to display
    this.display.flush(callback);
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
   * Allocates an available stream index and creates a new
   * OutputStream using that index, associating the resulting
   * stream with this Client. Note that this stream will not yet
   * exist as far as the other end of the Guacamole connection is concerned.
   * Streams exist within the Guacamole protocol only when referenced by an
   * instruction which creates the stream, such as a "clipboard", "file", or
   * "pipe" instruction.
   *
   * @returns A new OutputStream with a newly-allocated index and
   *          associated with this Client.
   */
  public createOutputStream(): OutputStream {
    // Allocate index
    const index = this.streamIndices.next();

    // Return new stream
    const stream = new OutputStream(this, index);
    this.outputStreams.set(index, stream);
    return stream;
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
    const stream = this.createOutputStream();
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
    const stream = this.createOutputStream();
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
    const stream = this.createOutputStream();
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
    const stream = this.createOutputStream();
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
    const stream = this.createOutputStream();
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
    const stream = this.createOutputStream();
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
   * @param index - The index of the stream associated with the
   *                received blob.
   * @param message - A human-readable message describing the error
   *                  or status.
   * @param code - The error code, if any, or 0 for success.
   */
  public sendAck(index: number, message: string, code: number) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }

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
  public endStream(index: number) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }

    // Explicitly close stream by sending "end" instruction
    this.tunnel.sendMessage(...Streaming.end(index));

    // Free associated index and stream if they exist
    if (this.outputStreams.get(index)) {
      this.streamIndices.free(index);
      this.outputStreams.delete(index);
    }
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
    } catch (status: unknown) {
      this.setState(State.IDLE);
      throw status;
    }

    // Ping every 5 seconds (ensure connection alive)
    this.pingIntervalHandler = window.setInterval(() => {
      this.tunnel.sendMessage(...ClientControl.nop());
    }, PING_INTERVAL);

    this.setState(State.WAITING);
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
