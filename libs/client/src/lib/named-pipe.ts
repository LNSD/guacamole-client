import { Streaming } from '@guacamole-client/protocol';
import {
  InputStreamHandler,
  InputStreamResponseSender,
  InputStreamsManager,
  registerInputStreamHandlers
} from './streams/input';
import { ClientEventTargetMap } from './client-events';
import { InputStream, OutputStream, StreamError } from '@guacamole-client/io';
import { StatusCode } from './status';
import { InstructionRouter } from './instruction-router';
import {
  OutputStreamHandler,
  OutputStreamResponseSender,
  OutputStreamsManager,
  registerOutputStreamHandlers
} from './streams/output';

export interface PipeInstructionHandler {
  handlePipeInstruction(streamIndex: number, mimetype: string, name: string): void;
}

export interface NamedPipeStreamHandler extends PipeInstructionHandler, InputStreamHandler, OutputStreamHandler {
}

/**
 * Fired when a pipe stream is created. The stream provided to this event
 * handler will contain its own event handlers for received data;
 *
 * @param stream - The stream that will receive data from the server.
 * @param mimetype - The mimetype of the data which will be received.
 * @param name - The name of the pipe.
 */
export type OnPipeCallback = (stream: InputStream, mimetype: string, name: string) => void;

export class NamedPipeManager implements NamedPipeStreamHandler {
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
   * Opens a new pipe for writing, having the given name and mimetype. The
   * instruction necessary to create this stream will automatically be sent.
   *
   * @param mimetype - The mimetype of the data being sent.
   * @param name - The name of the pipe.
   *
   * @return The created file stream.
   */
  createPipeStream(mimetype: string, name: string): OutputStream {
    // Allocate and associate stream with pipe metadata
    const stream = this.outputStreams.createStream();
    this.sender.sendMessage(...Streaming.pipe(stream.index, mimetype, name));
    return stream;
  }

  //<editor-fold defaultstate="collapsed" desc="Instruction handlers">

  handlePipeInstruction(streamIndex: number, mimetype: string, name: string) {
    const listener = this.events.getEventListener('onpipe');
    if (!listener) {
      this.inputStreams.sendAck(streamIndex, new StreamError('Named pipes unsupported', StatusCode.UNSUPPORTED));
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

  handleAckInstruction(streamIndex: number, message: string, code: number): void {
    this.outputStreams.handleAckInstruction(streamIndex, message, code);
  }

  //</editor-fold>
}

export function registerNamedPipeStreamHandlers(router: InstructionRouter, handler: NamedPipeStreamHandler) {
  router.addInstructionHandler(Streaming.pipe.opcode, Streaming.pipe.parser(
    handler.handlePipeInstruction.bind(handler)  // TODO: Review this bind()
  ));
  registerInputStreamHandlers(router, handler);
  registerOutputStreamHandlers(router, handler);
}
