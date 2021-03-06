import { InputStream, OutputStream } from '@guacamole-client/io';

export type BodyCallback = (stream: InputStream, mimetype: string) => void;
export type OnUndefineCallback = () => void;

export type RequestInputStream = (index: number, name: string) => void;
export type CreateOutputStream = (
  index: number,
  mimetype: string,
  name: string,
) => OutputStream;

/**
 * The reserved name denoting the root stream of any object. The contents of
 * the root stream MUST be a JSON map of stream name to mimetype.
 *
 * @constant
 */
export const ROOT_STREAM = '/';

/**
 * The mimetype of a stream containing JSON which maps available stream names
 * to their corresponding mimetype. The root stream of a Object MUST
 * have this mimetype.
 *
 * @constant
 */
export const STREAM_INDEX_MIMETYPE =
  'application/vnd.glyptodon.stream-index+json';

/**
 * An object used by the Guacamole client to house arbitrarily-many named
 * input and output streams.
 */
export class GuacamoleObject {
  /**
   * The index of this object.
   */
  public readonly index: number;

  /**
   * Called when this object is being undefined. Once undefined, no further
   * communication involving this object may occur.
   */
  public onundefine: OnUndefineCallback | null = null;

  public requestObjectInputStream: RequestInputStream | null = null;
  public createObjectOutputStream: CreateOutputStream | null = null;

  /**
   * Map of stream name to corresponding queue of callbacks. The queue of
   * callbacks is guaranteed to be in order of request.
   *
   * @private
   */
  private bodyCallbacks: Map<string, BodyCallback[]> = new Map();

  /*
   * @constructor
   *
   * @param index - The index of this object.
   */
  constructor(index: number) {
    this.index = index;
  }

  /**
   * Called when this object receives the body of a requested input stream.
   * By default, all objects will invoke the callbacks provided to their
   * requestInputStream() functions based on the name of the stream
   * requested. This behavior can be overridden by specifying a different
   * handler here.
   *
   * @event
   * @param inputStream - The input stream of the received body.
   * @param mimetype - The mimetype of the data being received.
   * @param name - The name of the stream whose body has been received.
   */
  public onbody(inputStream: InputStream, mimetype: string, name: string) {
    const callback = this.dequeueBodyCallback(name);
    if (callback === null) {
      return;
    }

    // Call queued callback for the received body
    callback(inputStream, mimetype);
  }

  /**
   * Requests read access to the input stream having the given name. If
   * successful, a new input stream will be created.
   *
   * @param name - The name of the input stream to request.
   * @param callback - The callback to invoke when the body of the requested input stream
   *                   is received. This callback will be provided a InputStream
   *                   and its mimetype as its two only arguments. If the onbody handler of
   *                   this object is overridden, this callback will not be invoked.
   */
  public requestInputStream(name: string, callback: BodyCallback) {
    // Queue body callback if provided
    if (callback) {
      this.enqueueBodyCallback(name, callback);
    }

    // Send request for input stream
    if (!this.requestObjectInputStream) {
      throw new Error('RequestObjectInputStream callback not defined');
    }
    this.requestObjectInputStream(this.index, name);
  }

  /**
   * Creates a new output stream associated with this object and having the
   * given mimetype and name. The legality of a mimetype and name is dictated
   * by the object itself.
   *
   * @param mimetype - The mimetype of the data which will be sent to the output stream.
   * @param name - The defined name of an output stream within this object.
   *
   * @returns An output stream which will write blobs to the named output stream
   *          of this object.
   */
  public createOutputStream(mimetype: string, name: string): OutputStream {
    if (!this.createObjectOutputStream) {
      throw new Error('CreateObjectOutputStream callback not defined');
    }
    return this.createObjectOutputStream(this.index, mimetype, name);
  }

  /**
   * Removes and returns the callback at the head of the callback queue for
   * the stream having the given name. If no such callbacks exist, null is
   * returned.
   *
   * @private
   * @param name - The name of the stream to retrieve a callback for.
   *
   * @returns The next callback associated with the stream having the given name,
   *          or null if no such callback exists.
   */
  private dequeueBodyCallback(name: string): BodyCallback | null {
    // If no callbacks defined, simply return null
    const callbacks = this.bodyCallbacks.get(name);
    if (callbacks === undefined) {
      return null;
    }

    // Otherwise, pull off first callback, deleting the queue if empty
    const callback = callbacks.shift();
    if (callback === undefined) {
      return null;
    }

    if (callbacks.length === 0) {
      this.bodyCallbacks.delete(name);
    }

    // Return found callback
    return callback;
  }

  /**
   * Adds the given callback to the tail of the callback queue for the stream
   * having the given name.
   *
   * @private
   * @param name - The name of the stream to associate with the given callback.
   * @param callback - The callback to add to the queue of the stream with the given name.
   */
  private enqueueBodyCallback(name: string, callback: BodyCallback) {
    // Get callback queue by name, creating first if necessary
    let callbacks = this.bodyCallbacks.get(name);
    if (callbacks === undefined) {
      callbacks = [];
    }

    // Add callback to end of queue
    callbacks.push(callback);
    this.bodyCallbacks.set(name, callbacks);
  }
}
