export default class Encoder {

  public encode(opcode: string, ...parameters: any[]): string {
    // Initialized message with first element
    let instruction = this.encodeElement(opcode);

    // Append remaining elements
    for (const param of parameters) {
      instruction += "," + this.encodeElement(param);
    }

    // Final terminator
    instruction += ";";

    return instruction
  }

  /**
   * Converts the given value to a length/string pair for use as an
   * element in a Guacamole instruction.
   *
   * @param value - The value to convert.
   * @return The converted value.
   */
  private encodeElement(value: any): string {
    const str = String(value);
    return `${str.length}.${str}`;
  }
}
