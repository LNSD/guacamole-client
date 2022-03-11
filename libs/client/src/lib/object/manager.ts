import { OutputStream, StreamError } from '@guacamole-client/io';
import { ObjectInstruction } from '@guacamole-client/protocol';

import { InstructionRouter } from '../instruction-router';
import { StatusCode } from '../status';
import {
  InputStreamHandler,
  InputStreamResponseSender,
  InputStreamsManager,
  registerInputStreamHandlers,
} from '../streams/input';
import {
  OutputStreamHandler,
  OutputStreamResponseSender,
  OutputStreamsManager,
  registerOutputStreamHandlers,
} from '../streams/output';
import { GuacamoleObject } from './GuacamoleObject';

export interface ObjectInstructionHandler {
  handleBodyInstruction(
    objectIndex: number,
    streamIndex: number,
    mimetype: string,
    name: string,
  ): void;

  handleUndefineInstruction(objectIndex: number): void;
}

export interface ObjectStreamHandler
  extends ObjectInstructionHandler,
    InputStreamHandler,
    OutputStreamHandler {}

export class GuacamoleObjectManager implements ObjectStreamHandler {
  private readonly inputStreams: InputStreamsManager;
  private readonly outputStreams: OutputStreamsManager;

  /**
   * All current objects. The index of each object is dictated by the
   * Guacamole server.
   *
   * @private
   */
  private readonly objects: Map<number, GuacamoleObject> = new Map();

  constructor(
    private readonly sender: InputStreamResponseSender &
      OutputStreamResponseSender,
  ) {
    this.inputStreams = new InputStreamsManager(sender);
    this.outputStreams = new OutputStreamsManager(sender);
  }

  public createObject(objectIndex: number): GuacamoleObject {
    const object = new GuacamoleObject(objectIndex);
    object.requestObjectInputStream = this.requestObjectInputStream.bind(this);
    object.createObjectOutputStream = this.createObjectOutputStream.bind(this);

    this.objects.set(objectIndex, object);
    return object;
  }

  //<editor-fold defaultstate="collapsed" desc="Instruction handlers">

  handleBodyInstruction(
    objectIndex: number,
    streamIndex: number,
    mimetype: string,
    name: string,
  ) {
    const object = this.objects.get(objectIndex);

    // Create stream only if handler is defined
    if (object === undefined) {
      this.inputStreams.sendAck(
        streamIndex,
        new StreamError('Receipt of body unsupported', StatusCode.UNSUPPORTED),
      );
      return;
    }

    const stream = this.inputStreams.createStream(streamIndex);
    object.onbody(stream, mimetype, name);
  }

  handleUndefineInstruction(objectIndex: number) {
    const object = this.objects.get(objectIndex);
    if (object === undefined || object.onundefine === null) {
      return;
    }

    // Signal end of object definition
    object.onundefine();
  }

  handleBlobInstruction(streamIndex: number, data: string): void {
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

  handleAckInstruction(
    streamIndex: number,
    message: string,
    code: number,
  ): void {
    this.outputStreams.handleAckInstruction(streamIndex, message, code);
  }

  //</editor-fold>

  /**
   * Requests read access to the input stream having the given name. If
   * successful, a new input stream will be created.
   *
   * @param index - The index of the object from which the input stream is being requested.
   * @param name - The name of the input stream to request.
   */
  private requestObjectInputStream(index: number, name: string) {
    this.sender.sendMessage(...ObjectInstruction.get(index, name));
  }

  /**
   * Creates a new output stream associated with the given object and having
   * the given mimetype and name. The legality of a mimetype and name is
   * dictated by the object itself. The instruction necessary to create this
   * stream will automatically be sent.
   *
   * @param index - The index of the object for which the output stream is being created.
   * @param mimetype - The mimetype of the data which will be sent to the output stream.
   * @param name - The defined name of an output stream within the given object.
   *
   * @returns An output stream which will write blobs to the named output stream
   *          of the given object.
   */
  private createObjectOutputStream(
    index: number,
    mimetype: string,
    name: string,
  ): OutputStream {
    // Allocate and associate stream with object metadata
    const stream = this.outputStreams.createStream();

    this.sender.sendMessage(
      ...ObjectInstruction.put(index, stream.index, mimetype, name),
    );
    return stream;
  }
}

export function registerObjectStreamHandlers(
  router: InstructionRouter,
  handler: ObjectStreamHandler,
) {
  router.addInstructionHandler(
    ObjectInstruction.body.opcode,
    ObjectInstruction.body.parser(
      handler.handleBodyInstruction.bind(handler), // TODO: Review this bind())
    ),
  );
  router.addInstructionHandler(
    ObjectInstruction.undefine.opcode,
    ObjectInstruction.undefine.parser(
      handler.handleUndefineInstruction.bind(handler), // TODO: Review this bind())
    ),
  );
  registerInputStreamHandlers(router, handler);
  registerOutputStreamHandlers(router, handler);
}
