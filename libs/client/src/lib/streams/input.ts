import { InputStream, StreamError } from '@guacamole-client/io';
import { InstructionRouter } from '../instruction-router';
import { Streaming } from '@guacamole-client/protocol';
import { StatusCode } from '../Status';

export interface InputStreamHandler {
  handleBlobInstruction(streamIndex: number, data: string): void;

  handleEndInstruction(streamIndex: number): void;
}

export interface InputStreamResponseSender {
  sendMessage(...elements: any[]): void;
}

export class InputStreamsManager implements InputStreamHandler {
  private readonly streams: Map<number, InputStream> = new Map();

  constructor(private readonly sender: InputStreamResponseSender) {
  }

  createStream(index: number): InputStream {
    // Return new stream
    const stream = new InputStream(index);
    stream.sendack = (idx, message, code) => {
      let error = undefined;
      if (code >= 0x0100) {
        error = new StreamError(message, code);
      }

      this.sendAck(idx, error);
    };

    this.streams.set(index, stream);
    return stream;
  }

  getStream(index: number): InputStream | undefined {
    return this.streams.get(index);
  }

  freeStream(index: number) {
    if (!this.streams.has(index)) {
      return;
    }

    this.streams.delete(index);
  }

  /**
   * Acknowledge receipt of a blob on the stream with the given index.
   *
   * @param index - The index of the stream associated with the received blob.
   * @param error - A human-readable message describing the error or status.
   *                The error code, if any, or 0 for success.
   */
  sendAck(index: number, error?: StreamError) {
    const message = error?.message ?? 'OK';
    const code = error?.code ?? StatusCode.SUCCESS;

    this.sender.sendMessage(...Streaming.ack(index, message, code));
  }

  //<editor-fold defaultstate="collapsed" desc="Instruction handlers">

  handleBlobInstruction(streamIndex: number, data: string) {
    const stream = this.getStream(streamIndex);
    if (!stream) {
      return;
    }

    // Write data
    if (stream.onblob !== null) {
      stream.onblob(data);
    }
  }

  handleEndInstruction(streamIndex: number) {
    const stream = this.getStream(streamIndex);
    if (!stream) {
      return;
    }

    // Signal end of stream if handler defined
    if (stream.onend !== null) {
      stream.onend();
    }

    // Invalidate stream
    this.freeStream(streamIndex);
  }

  //</editor-fold>
}

export function registerInputStreamHandlers(router: InstructionRouter, handler: InputStreamHandler) {
  router.addInstructionHandler(Streaming.blob.opcode, Streaming.blob.parser(
    handler.handleBlobInstruction.bind(handler) // TODO: Review this bind())
  ));
  router.addInstructionHandler(Streaming.end.opcode, Streaming.end.parser(
    handler.handleEndInstruction.bind(handler)  // TODO: Review this bind())
  ));
}
