export type OnInstructionCallback = (opcode: string, parameters: any[]) => void;

const MAX_BUFFER_LENGTH = 4096;

/**
 * Simple Guacamole protocol parser that invokes an oninstruction event when
 * full instructions are available from data received via receive().
 */
export default class Decoder {
  /**
   * Fired once for every complete Guacamole instruction received, in order.
   *
   * @event
   * @param opcode - The Guacamole instruction opcode.
   * @param parameters - The parameters provided for the instruction, if any.
   */
  public oninstruction: OnInstructionCallback | null = null;

  private onInstructionListeners: Map<string, OnInstructionCallback> =
    new Map();

  /**
   * Current buffer of received data. This buffer grows until a full
   * element is available. After a full element is available, that element
   * is flushed into the element buffer.
   */
  private buffer = '';

  /**
   * Buffer of all received, complete elements. After an entire instruction
   * is read, this buffer is flushed, and a new instruction begins.
   */
  private elementBuffer: string[] = [];

  // The location of the last element's terminator
  private elementEnd = -1;

  // Where to start the next length search or the next element
  private startIndex = 0;

  public get bufferLength(): number {
    return this.buffer.length;
  }

  /**
   * Appends the given instruction data packet to the internal buffer of
   * this Parser, executing all completed instructions at
   * the beginning of this buffer, if any.
   *
   * @param packet - The instruction data to receive.
   */
  public receive(packet: string) {
    // Truncate buffer as necessary
    if (
      this.startIndex > MAX_BUFFER_LENGTH &&
      this.elementEnd >= this.startIndex
    ) {
      this.buffer = this.buffer.substring(this.startIndex);

      // Reset parse relative to truncation
      this.elementEnd -= this.startIndex;
      this.startIndex = 0;
    }

    // Append data to buffer
    this.buffer += packet;

    // While search is within currently received data
    while (this.elementEnd < this.buffer.length) {
      // If we are waiting for element data
      if (this.elementEnd >= this.startIndex) {
        // We now have enough data for the element. Parse.
        const element = this.buffer.slice(this.startIndex, this.elementEnd);
        const terminator = this.buffer.slice(
          this.elementEnd,
          this.elementEnd + 1,
        );

        // Add element to array
        this.elementBuffer.push(element);

        // If last element, handle instruction
        if (terminator === ';') {
          // Get opcode
          const opcode = this.elementBuffer.shift();

          if (opcode === undefined) {
            throw new Error('Opcode not found');
          }

          // Call instruction handlers
          if (this.oninstruction !== null) {
            this.oninstruction(opcode, [...this.elementBuffer]);
          }

          const opcodeListener = this.onInstructionListeners.get(opcode);
          if (opcodeListener !== undefined) {
            opcodeListener(opcode, [...this.elementBuffer]);
          }

          // Clear elements
          this.elementBuffer.length = 0;

          // Remove from buffer
          this.buffer = this.buffer.slice(this.elementEnd + 1);

          // Reset parse relative to truncation
          this.elementEnd = -1;
          this.startIndex = 0;
        } else if (terminator !== ',') {
          throw new Error('Illegal terminator.');
        }

        // Start searching for length at character after
        // element terminator
        this.startIndex = this.elementEnd + 1;
      }

      // Search for end of length
      const lengthEnd = this.buffer.indexOf('.', this.startIndex);
      if (lengthEnd === -1) {
        // If no period yet, continue search when more data is received
        this.startIndex = this.buffer.length;
        break;
      }

      // Parse length
      const length = parseInt(
        this.buffer.substring(this.elementEnd + 1, lengthEnd),
        10,
      );
      if (isNaN(length)) {
        throw new Error('Non-numeric character in element length.');
      }

      // Calculate start of element
      this.startIndex = lengthEnd + 1;

      // Calculate location of element terminator
      this.elementEnd = this.startIndex + length;
    }
  }

  public addInstructionListener(
    opcode: string,
    listener: OnInstructionCallback,
  ): void {
    this.onInstructionListeners.set(opcode, listener);
  }

  public removeInstructionListener(opcode: string): void {
    this.onInstructionListeners.delete(opcode);
  }
}
