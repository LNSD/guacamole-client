import { InputStream } from '@guacamole-client/io';
import { Status } from './Status';
import { GuacamoleObject } from './object/GuacamoleObject';
import { AudioPlayer, VideoPlayer } from '@guacamole-client/media';
import { VisibleLayer } from '@guacamole-client/display';

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
export type OnAudioCallback = (stream: InputStream, mimetype: string) => AudioPlayer;

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
 * Fired when the current value of a connection parameter is being exposed
 * by the server.
 *
 * @param stream - The stream that will receive connection parameter data from the server.
 * @param mimetype - The mimetype of the data which will be received.
 * @param name - The name of the connection parameter whose value is being exposed.
 */
export type OnArgvCallback = (stream: InputStream, mimetype: string, name: string) => void;

/**
 * Fired when the clipboard of the remote client is changing.
 *
 * @param stream - The stream that will receive clipboard data from the server.
 * @param mimetype - The mimetype of the data which will be received.
 */
export type OnClipboardCallback = (stream: InputStream, mimetype: string) => void;

/**
 * Fired when a file stream is created. The stream provided to this event
 * handler will contain its own event handlers for received data.
 *
 * @param stream - The stream that will receive data from the server.
 * @param mimetype - The mimetype of the file received.
 * @param filename - The name of the file received.
 */
export type OnFileCallback = (stream: InputStream, mimetype: string, filename: string) => void;

/**
 * Fired when a filesystem object is created. The object provided to this
 * event handler will contain its own event handlers and functions for
 * requesting and handling data.
 *
 * @param object - The created filesystem object.
 * @param name - The name of the filesystem.
 */
export type OnFilesystemCallback = (object: GuacamoleObject, name: string) => void;

/**
 * Fired when a pipe stream is created. The stream provided to this event
 * handler will contain its own event handlers for received data;
 *
 * @param stream - The stream that will receive data from the server.
 * @param mimetype - The mimetype of the data which will be received.
 * @param name - The name of the pipe.
 */
export type OnPipeCallback = (stream: InputStream, mimetype: string, name: string) => void;

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
  // "onaudio"?: OnAudioCallback;
  // "onvideo"?: OnVideoCallback;
  "onargv"?: OnArgvCallback;
  "onclipboard"?: OnClipboardCallback;
  "onfile"?: OnFileCallback;
  "onfilesystem"?: OnFilesystemCallback;
  "onpipe"?: OnPipeCallback;
  "onrequired"?: OnRequiredCallback;
  "onsync"?: OnSyncCallback;
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


export interface ClientEventTarget {
  addEventListener<K extends keyof ClientEventMap>(type: K, listener: ClientEventMap[K]): void;

  removeEventListener<K extends keyof ClientEventMap>(type: K): void;
}
