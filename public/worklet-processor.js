class MicProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
    }
  
    process(inputs, outputs, parameters) {
      // Get the input audio data
      const input = inputs[0];
      if (input && input.length > 0 && input[0].length > 0) {
        // Send the audio data to the main thread
        this.port.postMessage(input[0]);
      }
      
      // Return true to keep the processor running
      return true;
    }
  }
  
  // Register the processor
  registerProcessor('mic-processor', MicProcessor);