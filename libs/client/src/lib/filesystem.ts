import { InputStreamResponseSender } from './streams/input';
import { ClientEventTargetMap } from './client-events';
import {
  GuacamoleObjectManager,
  ObjectStreamHandler,
  registerObjectStreamHandlers
} from './object/manager';
import { OutputStreamResponseSender } from './streams/output';
import { InstructionRouter } from './instruction-router';
import { ObjectInstruction } from '@guacamole-client/protocol';

export interface FilesystemInstructionHandler {
  handleFilesystemInstruction(objectIndex: number, name: string): void;
}

export interface FilesystemStreamHandler extends FilesystemInstructionHandler, ObjectStreamHandler {
}

export class FilesystemManager implements FilesystemStreamHandler {
  private readonly objects: GuacamoleObjectManager;

  constructor(
    private readonly sender: InputStreamResponseSender & OutputStreamResponseSender,
    private readonly events: ClientEventTargetMap
  ) {
    this.objects = new GuacamoleObjectManager(sender);
  }

  handleFilesystemInstruction(index: number, name: string) {
    const listener = this.events.getEventListener('onfilesystem');
    if (!listener) {
      // If unsupported, simply ignore the availability of the filesystem
      return;
    }

    // Create object, if supported
    const object = this.objects.createObject(index);
    listener(object, name);
  }

  handleBodyInstruction(objectIndex: number, streamIndex: number, mimetype: string, name: string) {
    this.objects.handleBodyInstruction(objectIndex, streamIndex, mimetype, name);
  }

  handleUndefineInstruction(index: number) {
    this.objects.handleUndefineInstruction(index);
  }

  handleBlobInstruction(index: number, data: string): void {
    this.objects.handleBlobInstruction(index, data);
  }

  handleEndInstruction(index: number): void {
    this.objects.handleEndInstruction(index);
  }

  handleAckInstruction(streamIndex: number, message: string, code: number): void {
    this.objects.handleAckInstruction(streamIndex, message, code);
  }
}

export function registerFilesystemStreamHandlers(router: InstructionRouter, handler: FilesystemStreamHandler) {
  router.addInstructionHandler(ObjectInstruction.filesystem.opcode, ObjectInstruction.filesystem.parser(
    handler.handleFilesystemInstruction.bind(handler)  // TODO: Review this bind()
  ));

  registerObjectStreamHandlers(router, handler);
}

