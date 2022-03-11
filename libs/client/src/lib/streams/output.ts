import { OutputStream, StreamError } from '@guacamole-client/io';
import { Streaming } from '@guacamole-client/protocol';

import { InstructionRouter } from '../instruction-router';
import { IntegerPool } from '../utils/integer-pool';

export interface OutputStreamHandler {
  handleAckInstruction(
    streamIndex: number,
    message: string,
    code: number,
  ): void;
}

export interface OutputStreamResponseSender {
  sendMessage(...elements: any[]): void;
}

export class OutputStreamsManager implements OutputStreamHandler {
  private readonly indicesPool = new IntegerPool();

  private readonly streams: Map<number, OutputStream> = new Map();

  constructor(private readonly sender: OutputStreamResponseSender) {}

  createStream(): OutputStream {
    const index = this.indicesPool.next();

    // Return new stream
    const stream = new OutputStream(index);
    stream.sendblob = this.sendBlob.bind(this);
    stream.sendend = this.sendEnd.bind(this);

    this.streams.set(index, stream);
    return stream;
  }

  getStream(index: number): OutputStream | undefined {
    return this.streams.get(index);
  }

  freeStream(index: number) {
    if (!this.streams.has(index)) {
      return;
    }

    this.streams.delete(index);
    this.indicesPool.free(index);
  }

  /**
   * Given the index of a file, writes a blob of data to that file.
   *
   * @param index - The index of the file to write to.
   * @param data - Base64-encoded data to write to the file.
   */
  sendBlob(index: number, data: string) {
    this.sender.sendMessage(...Streaming.blob(index, data));
  }

  /**
   * Marks a currently-open stream as complete. The other end of the
   * Guacamole connection will be notified via an "end" instruction that the
   * stream is closed, and the index will be made available for reuse in
   * future streams.
   *
   * @param index - The index of the stream to end.
   */
  sendEnd(index: number) {
    // Explicitly close stream by sending "end" instruction
    this.sender.sendMessage(...Streaming.end(index));

    // Free associated index and stream if they exist
    this.freeStream(index);
  }

  //<editor-fold defaultstate="collapsed" desc="Instruction handlers">

  handleAckInstruction(streamIndex: number, message: string, code: number) {
    const stream = this.getStream(streamIndex);
    if (!stream) {
      return;
    }

    // Signal ack if handler defined
    if (stream.onack) {
      let error = undefined;
      if (code >= 0x0100) {
        error = new StreamError(message, code);
      }

      stream.onack(error);
    }

    // If code is an error, invalidate stream if not already
    // invalidated by onack handler
    if (code >= 0x0100) {
      this.freeStream(streamIndex);
    }
  }

  //</editor-fold>
}

export function registerOutputStreamHandlers(
  router: InstructionRouter,
  handler: OutputStreamHandler,
) {
  router.addInstructionHandler(
    Streaming.ack.opcode,
    Streaming.ack.parser(handler.handleAckInstruction.bind(handler)),
  );
}
