import { Streaming } from '@guacamole-client/protocol';
import {
  InputStreamHandler,
  InputStreamResponseSender,
  InputStreamsManager,
  registerInputStreamHandlers
} from './streams/input';
import { AudioPlayer, getAudioPlayerInstance } from '@guacamole-client/media';
import { StreamError } from '@guacamole-client/io';
import { StatusCode } from './Status';
import { InstructionRouter } from './instruction-router';

export interface AudioInstructionHandler {
  handleAudioInstruction(streamIndex: number, mimetype: string): void;
}

export interface AudioPlayerStreamHandler extends AudioInstructionHandler, InputStreamHandler {
}

export class AudioPlayerManager implements AudioPlayerStreamHandler {

  private readonly inputStreams: InputStreamsManager;

  /**
   * All audio players currently in use by the client. Initially, this will
   * be empty, but audio players may be allocated by the server upon request.
   *
   * @private
   */
  private readonly audioPlayers: Map<number, AudioPlayer> = new Map();

  constructor(private readonly sender: InputStreamResponseSender) {
    this.inputStreams = new InputStreamsManager(sender);
  }

  // Synchronize all audio players
  sync(): void {
    for (const [_, audioPlayer] of this.audioPlayers) {
      if (!audioPlayer) {
        continue;
      }

      audioPlayer.sync();
    }
  }

  handleAudioInstruction(streamIndex: number, mimetype: string) {
    const stream = this.inputStreams.createStream(streamIndex);
    const audioPlayer = getAudioPlayerInstance(stream, mimetype);

    if (audioPlayer === null) {
      // Mimetype must be unsupported
      this.inputStreams.sendAck(streamIndex, new StreamError('BAD TYPE', StatusCode.CLIENT_BAD_TYPE));
      return;
    }

    // If we have successfully retrieved an audio player, send success response
    this.audioPlayers.set(streamIndex, audioPlayer);
    this.inputStreams.sendAck(streamIndex);
  }

  handleBlobInstruction(streamIndex: number, data: string) {
    this.inputStreams.handleBlobInstruction(streamIndex, data);
  }

  handleEndInstruction(streamIndex: number) {
    this.inputStreams.handleEndInstruction(streamIndex);
  }
}

export function registerAudioPlayerHandlers(router: InstructionRouter, handler: AudioPlayerStreamHandler) {
  router.addInstructionHandler(Streaming.audio.opcode, Streaming.audio.parser(
    handler.handleAudioInstruction.bind(handler)  // TODO: Review this bind()
  ));
  registerInputStreamHandlers(router, handler);
}
