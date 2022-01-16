import { InputStream } from '@guacamole-client/io';
import { Status } from './status';
import { VideoPlayer } from '@guacamole-client/media';
import { VisibleLayer } from '@guacamole-client/display';
import { OnArgvCallback } from './extension/argv';
import { OnClipboardCallback } from './extension/clipboard';
import { OnFileCallback } from './extension/file-transfer';
import { OnFilesystemCallback } from './extension/filesystem';
import { OnPipeCallback } from './extension/named-pipe';
import { OnAudioCallback } from './extension/audio-player';

/**
 * Fired whenever the state of this Client changes.
 *
 * @param state - The new state of the client.
 */
export type OnStateChangeCallback = (state: number) => void;

/**
 * Fired when the remote client sends a name update.
 *
 * @param name - The new name of this client.
 */
export type OnNameCallback = (name: string) => void;

/**
 * Fired when an error is reported by the remote client, and the connection
 * is being closed.
 *
 * @param status - A status object which describes the error.
 */
export type OnErrorCallback = (error: Status) => void;

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
export type OnVideoCallback = (stream: InputStream, layer: VisibleLayer, mimetype: string) => VideoPlayer;

/**
 * Fired when a "required" instruction is received. A required instruction
 * indicates that additional parameters are required for the connection to
 * continue, such as user credentials.
 *
 * @param parameters - The names of the connection parameters that are required to be
 *                     provided for the connection to continue.
 */
export type OnRequiredCallback = (parameters: string[]) => void;

/**
 * Fired whenever a sync instruction is received from the server, indicating
 * that the server is finished processing any input from the client and
 * has sent any results.
 *
 * @param timestamp - The timestamp associated with the sync
 *                    instruction.
 */
export type OnSyncCallback = (timeout: number) => void;

export interface ClientEventMap {
  "onstatechange"?: OnStateChangeCallback;
  "onname"?: OnNameCallback;
  "onerror"?: OnErrorCallback;
  "onaudio"?: OnAudioCallback;
  // "onvideo"?: OnVideoCallback;
  "onargv"?: OnArgvCallback;
  "onclipboard"?: OnClipboardCallback;
  "onfile"?: OnFileCallback;
  "onfilesystem"?: OnFilesystemCallback;
  "onpipe"?: OnPipeCallback;
  "onrequired"?: OnRequiredCallback;
  "onsync"?: OnSyncCallback;
}

export interface ClientEventTarget {
  addEventListener<K extends keyof ClientEventMap>(type: K, listener: ClientEventMap[K]): void;

  removeEventListener<K extends keyof ClientEventMap>(type: K): void;
}

export class ClientEventTargetMap implements ClientEventTarget {

  private readonly listeners: Map<keyof ClientEventMap, any> = new Map();

  addEventListener<K extends keyof ClientEventMap>(type: K, listener: ClientEventMap[K]): void {
    this.listeners.set(type, listener);
  }

  getEventListener<K extends keyof ClientEventMap>(type: K): ClientEventMap[K] | undefined {
    return this.listeners.get(type);
  }

  removeEventListener<K extends keyof ClientEventMap>(type: K): void {
    this.listeners.delete(type);
  }
}
