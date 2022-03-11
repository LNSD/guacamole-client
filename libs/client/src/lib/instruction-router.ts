export type OnInstructionCallback = (params: string[]) => void;

export class InstructionRouter {
  private readonly opcodeHandlersMap: Map<string, Set<OnInstructionCallback>> =
    new Map();

  addInstructionHandler(opcode: string, handler: OnInstructionCallback): void {
    let handlers = this.opcodeHandlersMap.get(opcode);
    if (handlers === undefined) {
      handlers = new Set();
    }

    handlers.add(handler);

    this.opcodeHandlersMap.set(opcode, handlers);
  }

  removeInstructionHandlers(opcode: string): void {
    this.opcodeHandlersMap.delete(opcode);
  }

  dispatchInstruction(opcode: string, params: string[]): void {
    const handlers = this.opcodeHandlersMap.get(opcode);
    if (handlers === undefined || handlers.size === 0) {
      return;
    }

    handlers.forEach((handler) => handler(params));
  }
}
