import { InputStreamInstructionHandler, Streaming } from '@guacamole-client/protocol';
import { InputStreamsManager, InputStreamResponseSender } from './streams/input';
import { AudioPlayer, getAudioPlayerInstance } from '@guacamole-client/media';
import { StreamError } from '@guacamole-client/io';
import { StatusCode } from './Status';
import { InstructionRouter } from './instruction-router';

export interface AudioInstructionHandler {
  handleAudioInstruction(streamIndex: number, mimetype: string): void;
}

export interface AudioStreamHandler extends AudioInstructionHandler, InputStreamInstructionHandler {
}

export class AudioPlayerManager implements AudioStreamHandler {

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
      this.sender.sendAck(streamIndex, new StreamError('BAD TYPE', StatusCode.CLIENT_BAD_TYPE));
      return;
    }

    // If we have successfully retrieved an audio player, send success response
    this.audioPlayers.set(streamIndex, audioPlayer);
    this.sender.sendAck(streamIndex);
  }

  handleBlobInstruction(streamIndex: number, data: string) {
    // Get stream
    const stream = this.inputStreams.getStream(streamIndex);
    if (!stream) {
      return;
    }

    // Write data
    if (stream.onblob !== null) {
      stream.onblob(data);
    }
  }

  handleEndInstruction(streamIndex: number) {
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

export function registerAudioStreamHandlers(router: InstructionRouter, handler: AudioStreamHandler) {
  router.addInstructionHandler(Streaming.audio.opcode, Streaming.audio.parser(
    handler.handleAudioInstruction.bind(handler)  // TODO: Review this bind()
  ));
  router.addInstructionHandler(Streaming.blob.opcode, Streaming.blob.parser(
    handler.handleBlobInstruction.bind(handler) // TODO: Review this bind())
  ));
  router.addInstructionHandler(Streaming.end.opcode, Streaming.end.parser(
    handler.handleEndInstruction.bind(handler)  // TODO: Review this bind())
  ));
}
