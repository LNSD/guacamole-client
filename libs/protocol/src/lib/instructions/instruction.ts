export type InstructionElements = any[];
export type InstructionParamsParser<H> = (params: string[], handler: H) => void;

// eslint-disable-next-line @typescript-eslint/ban-types
export function createInstruction<H>(opcode: string, creator: Function, parser: InstructionParamsParser<H>): any {
  function elementsCreator(...args: any[]) {
    const prepared = creator(...args);
    if (!prepared) {
      throw new Error('creator did not return an instruction elements array');
    }

    return [opcode, ...prepared];
  }

  return Object.assign(elementsCreator, {
    opcode,
    parser,
    toString: () => `${opcode}`
  });
}
