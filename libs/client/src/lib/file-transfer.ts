import { Streaming } from '@guacamole-client/protocol';
import {
  InputStreamHandler,
  InputStreamResponseSender,
  InputStreamsManager,
  registerInputStreamHandlers
} from './streams/input';
import { ClientEventTargetMap } from './client-events';
import { OutputStream, StreamError } from '@guacamole-client/io';
import { StatusCode } from './Status';
import { InstructionRouter } from './instruction-router';
import {
  OutputStreamHandler,
  OutputStreamResponseSender,
  OutputStreamsManager,
  registerOutputStreamHandlers
} from './streams/output';

export interface FileInstructionHandler {
  handleFileInstruction(streamIndex: number, mimetype: string, filename: string): void;
}

export interface FileTransferStreamHandler extends FileInstructionHandler, InputStreamHandler, OutputStreamHandler {
}

export class FileTransferManager implements FileTransferStreamHandler {
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
   * Opens a new file for writing, having the given index, mimetype and
   * filename. The instruction necessary to create this stream will
   * automatically be sent.
   *
   * @param mimetype - The mimetype of the file being sent.
   * @param filename - The filename of the file being sent.
   *
   * @return The created file stream.
   */
  createFileStream(mimetype: string, filename: string): OutputStream {
    // Allocate and associate stream with file metadata
    const stream = this.outputStreams.createStream();
    this.sender.sendMessage(...Streaming.file(stream.index, mimetype, filename));
    return stream;
  }

  //<editor-fold defaultstate="collapsed" desc="Instruction handlers">

  handleFileInstruction(streamIndex: number, mimetype: string, filename: string) {
    const listener = this.events.getEventListener('onfile');
    if (!listener) {
      this.inputStreams.sendAck(streamIndex, new StreamError('File transfer unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    const stream = this.inputStreams.createStream(streamIndex);
    listener(stream, mimetype, filename);
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

export function registerFileTransferStreamHandlers(router: InstructionRouter, handler: FileTransferStreamHandler) {
  router.addInstructionHandler(Streaming.file.opcode, Streaming.file.parser(
    handler.handleFileInstruction.bind(handler)  // TODO: Review this bind()
  ));
  registerInputStreamHandlers(router, handler);
  registerOutputStreamHandlers(router, handler);
}
