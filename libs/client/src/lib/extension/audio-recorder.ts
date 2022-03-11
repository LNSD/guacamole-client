import { OutputStream } from '@guacamole-client/io';
import { AudioRecorder } from '@guacamole-client/media';
import { Streaming } from '@guacamole-client/protocol';

import { InstructionRouter } from '../instruction-router';
import {
  OutputStreamHandler,
  OutputStreamResponseSender,
  OutputStreamsManager,
  registerOutputStreamHandlers,
} from '../streams/output';

export type AudioRecorderStreamHandler = OutputStreamHandler;

export class AudioRecorderManager implements AudioRecorderStreamHandler {
  private readonly outputStreams: OutputStreamsManager;

  /**
   * All audio players currently in use by the client. Initially, this will
   * be empty, but audio players may be allocated by the server upon request.
   *
   * @private
   */
  private readonly audioRecorders: Map<number, AudioRecorder> = new Map();

  constructor(private readonly sender: OutputStreamResponseSender) {
    this.outputStreams = new OutputStreamsManager(sender);
  }

  /**
   * Opens a new audio stream for writing, where audio data having the give
   * mimetype will be sent along the returned stream. The instruction
   * necessary to create this stream will automatically be sent.
   *
   * @param mimetype - The mimetype of the audio data that will be sent along
   *                   the returned stream.
   *
   * @return The created audio stream.
   */
  createAudioStream(mimetype: string): OutputStream {
    // Allocate and associate stream with audio metadata
    const stream = this.outputStreams.createStream();
    this.sender.sendMessage(...Streaming.audio(stream.index, mimetype));
    return stream;
  }

  //<editor-fold defaultstate="collapsed" desc="Instruction handlers">

  handleAckInstruction(
    streamIndex: number,
    message: string,
    code: number,
  ): void {
    this.outputStreams.handleAckInstruction(streamIndex, message, code);
  }

  //</editor-fold>
}

export function registerAudioRecorderHandlers(
  router: InstructionRouter,
  handler: AudioRecorderStreamHandler,
) {
  registerOutputStreamHandlers(router, handler);
}
