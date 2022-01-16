import { InputStreamInstructionHandler, Streaming } from '@guacamole-client/protocol';
import { InputStreamResponseSender, InputStreamsManager } from './streams/input';
import { ClientEventTargetMap } from './client-events';
import { StreamError } from '@guacamole-client/io';
import { StatusCode } from './Status';
import { InstructionRouter } from './instruction-router';

export interface PipeInstructionHandler {
  handlePipeInstruction(streamIndex: number, mimetype: string, name: string): void;
}

export interface NamedPipeStreamHandler extends PipeInstructionHandler, InputStreamInstructionHandler {
}

export class NamedPipeManager implements NamedPipeStreamHandler {
  private readonly inputStreams: InputStreamsManager;

  constructor(
    private readonly sender: InputStreamResponseSender,
    private readonly events: ClientEventTargetMap
  ) {
    this.inputStreams = new InputStreamsManager(sender);
  }

  handlePipeInstruction(streamIndex: number, mimetype: string, name: string) {
    const listener = this.events.getEventListener('onpipe');
    if (!listener) {
      this.sender.sendAck(streamIndex, new StreamError('Named pipes unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    // Create stream
    const stream = this.inputStreams.createStream(streamIndex);
    listener(stream, mimetype, name);
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

export function registerNamedPipeStreamHandlers(router: InstructionRouter, handler: NamedPipeStreamHandler) {
  router.addInstructionHandler(Streaming.pipe.opcode, Streaming.pipe.parser(
    handler.handlePipeInstruction.bind(handler)  // TODO: Review this bind()
  ));
  router.addInstructionHandler(Streaming.blob.opcode, Streaming.blob.parser(
    handler.handleBlobInstruction.bind(handler) // TODO: Review this bind())
  ));
  router.addInstructionHandler(Streaming.end.opcode, Streaming.end.parser(
    handler.handleEndInstruction.bind(handler)  // TODO: Review this bind())
  ));
}
