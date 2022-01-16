import { InputStreamInstructionHandler, Streaming } from '@guacamole-client/protocol';
import { InputStreamResponseSender, InputStreamsManager } from './streams/input';
import { ClientEventTargetMap } from './client-events';
import { StreamError } from '@guacamole-client/io';
import { StatusCode } from './Status';
import { InstructionRouter } from './instruction-router';
import { AudioStreamHandler } from './audio-player';

export interface ClipboardInstructionHandler {
  handleClipboardInstruction(streamIndex: number, mimetype: string): void;
}

export interface ClipboardStreamHandler extends ClipboardInstructionHandler, InputStreamInstructionHandler {
}

export class ClipboardManager implements ClipboardStreamHandler {

  private readonly inputStreams: InputStreamsManager;

  constructor(
    private readonly sender: InputStreamResponseSender,
    private readonly events: ClientEventTargetMap
  ) {
    this.inputStreams = new InputStreamsManager(sender);
  }

  handleClipboardInstruction(streamIndex: number, mimetype: string) {
    const listener = this.events.getEventListener('onclipboard');
    if (!listener) {
      this.sender.sendAck(streamIndex, new StreamError('Clipboard unsupported', StatusCode.UNSUPPORTED));
      return;
    }

    const stream = this.inputStreams.createStream(streamIndex);
    listener(stream, mimetype);
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

export function registerClipboardStreamHandlers(router: InstructionRouter, handler: ClipboardStreamHandler) {
  router.addInstructionHandler(Streaming.clipboard.opcode, Streaming.clipboard.parser(
    handler.handleClipboardInstruction.bind(handler)  // TODO: Review this bind()
  ));
  router.addInstructionHandler(Streaming.blob.opcode, Streaming.blob.parser(
    handler.handleBlobInstruction.bind(handler) // TODO: Review this bind())
  ));
  router.addInstructionHandler(Streaming.end.opcode, Streaming.end.parser(
    handler.handleEndInstruction.bind(handler)  // TODO: Review this bind())
  ));
}

