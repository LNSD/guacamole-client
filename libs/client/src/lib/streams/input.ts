import { InputStream, StreamError } from '@guacamole-client/io';

export interface InputStreamResponseSender {
  sendAck(index: number, error?: StreamError): void;
}

export class InputStreamsManager {
  private readonly streams: Map<number, InputStream> = new Map();

  constructor(private readonly sender: InputStreamResponseSender) {}

  public createStream(index: number): InputStream {
    // Return new stream
    const stream = new InputStream(index);
    stream.sendack = (idx, message, code) => {
      let error = undefined;
      if (code >= 0x0100) {
        error = new StreamError(message, code);
      }

      this.sender.sendAck(idx, error);
    };

    this.streams.set(index, stream);
    return stream;
  }

  public getStream(index: number): InputStream | undefined {
    return this.streams.get(index);
  }

  public freeStream(index: number) {
    if (!this.streams.has(index)) {
      return;
    }

    this.streams.delete(index);
  }
}
