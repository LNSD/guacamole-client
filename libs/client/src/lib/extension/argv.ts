import {
  InputStreamHandler,
  InputStreamResponseSender,
  InputStreamsManager,
  registerInputStreamHandlers
} from '../streams/input';
import {
  OutputStreamHandler,
  OutputStreamResponseSender,
  OutputStreamsManager,
  registerOutputStreamHandlers
} from '../streams/output';
import { ClientEventTargetMap } from '../client-events';
import { InputStream, OutputStream, StreamError } from '@guacamole-client/io';
import { Streaming } from '@guacamole-client/protocol';
import { StatusCode } from '../status';
import { InstructionRouter } from '../instruction-router';

export interface ArgvInstructionHandler {
  handleArgvInstruction(streamIndex: number, mimetype: string, name: string): void;
}

export interface ArgvStreamHandler extends ArgvInstructionHandler, InputStreamHandler, OutputStreamHandler {
}

/**
 * Fired when the current value of a connection parameter is being exposed by the server.
 *
 * @param stream - The stream that will receive connection parameter data from the server.
 * @param mimetype - The mimetype of the data which will be received.
 * @param name - The name of the connection parameter whose value is being exposed.
 */
export type OnArgvCallback = (stream: InputStream, mimetype: string, name: string) => void;

export class ArgvManager implements ArgvStreamHandler {
  private readonly inputStreams: InputStreamsManager;
  private readonly outputStreams: OutputStreamsManager;

  constructor(
    private readonly sender: InputStreamResponseSender & OutputStreamResponseSender,
    private readonly events: ClientEventTargetMap
  ) {
    this.inputStreams = new InputStreamsManager(sender);
    this.outputStreams = new OutputStreamsManager(sender);
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
  createArgumentValueStream(mimetype: string, name: string): OutputStream {
    // Allocate and associate stream with argument value metadata
    const stream = this.outputStreams.createStream();
    this.sender.sendMessage(...Streaming.argv(stream.index, mimetype, name));
    return stream;
  }

  //<editor-fold defaultstate="collapsed" desc="Instruction handlers">

  handleArgvInstruction(streamIndex: number, mimetype: string, name: string) {
    const listener = this.events.getEventListener('onargv');
    if (!listener) {
      this.inputStreams.sendAck(streamIndex, new StreamError('Receiving argument values unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);
    listener(stream, mimetype, name);
  }

  handleBlobInstruction(streamIndex: number, data: string): void {
    this.inputStreams.handleBlobInstruction(streamIndex, data);
  }

  handleEndInstruction(streamIndex: number): void {
    this.inputStreams.handleEndInstruction(streamIndex);
  }

  handleAckInstruction(streamIndex: number, message: string, code: number) {
    this.outputStreams.handleAckInstruction(streamIndex, message, code);
  }

  //</editor-fold>
}

export function registerInstructionHandlers(router: InstructionRouter, handler: ArgvStreamHandler) {
  router.addInstructionHandler(Streaming.argv.opcode, Streaming.argv.parser(
    handler.handleArgvInstruction.bind(handler)
  ));
  registerInputStreamHandlers(router, handler);
  registerOutputStreamHandlers(router, handler);
}
