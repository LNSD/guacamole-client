import Encoder from "./encoder";
import data from "./__tests__/encoder.json";


describe("Protocol encoder", () => {
  it.each(data)("encode instruction", ({ instruction: { opcode, parameters }, packet }) => {
    // Given
    const encoder = new Encoder();

    // When
    const encoded = encoder.encode(opcode, ...parameters);

    // Then
    expect(encoded).toStrictEqual(packet);
  });
});
