export type OnInstructionCallback = (params: string[]) => void;

export class InstructionRouter {
  private readonly handlers: Map<string, OnInstructionCallback> = new Map();

  addInstructionHandler(opcode: string, handler: OnInstructionCallback): void {
    this.handlers.set(opcode, handler);
  }

  removeInstructionHandler(opcode: string): void {
    this.handlers.delete(opcode);
  }

  dispatchInstruction(opcode: string, params: string[]): void {
    const handler = this.handlers.get(opcode);
    if (handler) {
      handler(params);
    }
  }
}
