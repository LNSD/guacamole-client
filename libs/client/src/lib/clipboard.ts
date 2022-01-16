import { Streaming } from '@guacamole-client/protocol';
import {
  InputStreamHandler,
  InputStreamResponseSender,
  InputStreamsManager,
  registerInputStreamHandlers
} from './streams/input';
import { ClientEventTargetMap } from './client-events';
import { InputStream, OutputStream, StreamError } from '@guacamole-client/io';
import { StatusCode } from './Status';
import { InstructionRouter } from './instruction-router';
import {
  OutputStreamHandler,
  OutputStreamResponseSender,
  OutputStreamsManager,
  registerOutputStreamHandlers
} from './streams/output';

export interface ClipboardInstructionHandler {
  handleClipboardInstruction(streamIndex: number, mimetype: string): void;
}

export interface ClipboardStreamHandler extends ClipboardInstructionHandler, InputStreamHandler, OutputStreamHandler {
}

/**
 * Fired when the clipboard of the remote client is changing.
 *
 * @param stream - The stream that will receive clipboard data from the server.
 * @param mimetype - The mimetype of the data which will be received.
 */
export type OnClipboardCallback = (stream: InputStream, mimetype: string) => void;

export class ClipboardManager implements ClipboardStreamHandler {

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
   * Opens a new clipboard object for writing, having the given mimetype. The
   * instruction necessary to create this stream will automatically be sent.
   *
   * @param mimetype - The mimetype of the data being sent.
   *
   * @return The created clipboard output stream.
   */
  createClipboardStream(mimetype: string): OutputStream {
    // Allocate and associate stream with clipboard metadata
    const stream = this.outputStreams.createStream();
    this.sender.sendMessage(...Streaming.clipboard(stream.index, mimetype));
    return stream;
  }

  //<editor-fold defaultstate="collapsed" desc="Instruction handlers">

  handleClipboardInstruction(streamIndex: number, mimetype: string) {
    const listener = this.events.getEventListener('onclipboard');
    if (!listener) {
      this.inputStreams.sendAck(streamIndex, new StreamError('Clipboard unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    const stream = this.inputStreams.createStream(streamIndex);
    listener(stream, mimetype);
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

export function registerClipboardStreamHandlers(router: InstructionRouter, handler: ClipboardStreamHandler) {
  router.addInstructionHandler(Streaming.clipboard.opcode, Streaming.clipboard.parser(
    handler.handleClipboardInstruction.bind(handler)  // TODO: Review this bind()
  ));
  registerInputStreamHandlers(router, handler);
  registerOutputStreamHandlers(router, handler);
}
