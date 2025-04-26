class MicProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0 && input[0].length > 0) {
            this.port.postMessage(input[0]); // input[0] is the Float32Array for mono audio
        }
        return true;
    }
}

registerProcessor('mic-processor', MicProcessor);
