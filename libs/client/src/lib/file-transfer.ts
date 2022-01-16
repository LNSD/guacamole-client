import { InputStreamInstructionHandler, Streaming } from '@guacamole-client/protocol';
import { InputStreamResponseSender, InputStreamsManager } from './streams/input';
import { ClientEventTargetMap } from './client-events';
import { StreamError } from '@guacamole-client/io';
import { StatusCode } from './Status';
import { InstructionRouter } from './instruction-router';

export interface FileInstructionHandler {
  handleFileInstruction(streamIndex: number, mimetype: string, filename: string): void;
}

export interface FileTransferStreamHandler extends FileInstructionHandler, InputStreamInstructionHandler {
}

export class FileTransferManager implements FileTransferStreamHandler {
  private readonly inputStreams: InputStreamsManager;

  constructor(
    private readonly sender: InputStreamResponseSender,
    private readonly events: ClientEventTargetMap
  ) {
    this.inputStreams = new InputStreamsManager(sender);
  }

  handleFileInstruction(streamIndex: number, mimetype: string, filename: string) {
    const listener = this.events.getEventListener('onfile');
    if (!listener) {
      this.sender.sendAck(streamIndex, new StreamError('File transfer unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    const stream = this.inputStreams.createStream(streamIndex);
    listener(stream, mimetype, filename);
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
    // Get stream
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
}

export function registerFileTransferStreamHandlers(router: InstructionRouter, handler: FileTransferStreamHandler) {
  router.addInstructionHandler(Streaming.file.opcode, Streaming.file.parser(
    handler.handleFileInstruction.bind(handler)  // TODO: Review this bind()
  ));
  router.addInstructionHandler(Streaming.blob.opcode, Streaming.blob.parser(
    handler.handleBlobInstruction.bind(handler) // TODO: Review this bind())
  ));
  router.addInstructionHandler(Streaming.end.opcode, Streaming.end.parser(
    handler.handleEndInstruction.bind(handler)  // TODO: Review this bind())
  ));
}
