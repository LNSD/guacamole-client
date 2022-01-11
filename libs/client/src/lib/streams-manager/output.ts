import { IntegerPool } from '../utils/integer-pool';
import { OutputStream } from '@guacamole-client/io';

export interface OutputStreamHandlers {
  sendBlob(streamIndex: number, data: string): void;
  sendEnd(streamIndex: number): void;
}

export class OutputStreamsManager {
  private readonly indicesPool = new IntegerPool();

  private readonly streams: Map<number, OutputStream> = new Map();

  constructor(private readonly handlers: OutputStreamHandlers) {}

  public createStream(): OutputStream {
    const index = this.indicesPool.next();

    // Return new stream
    const stream = new OutputStream(index);
    stream.sendblob = (idx, data) => this.handlers.sendBlob(idx, data);
    stream.sendend = (idx) => this.handlers.sendEnd(idx);

    this.streams.set(index, stream);
    return stream;
  }

  public getStream(index: number): OutputStream | undefined {
    return this.streams.get(index);
  }

  public freeStream(index: number) {
    if (!this.streams.has(index)) {
      return;
    }

    this.streams.delete(index);
    this.indicesPool.free(index);
  }
}
