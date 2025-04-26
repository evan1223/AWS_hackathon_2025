import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Amplify, Predictions } from 'aws-amplify';
import { AmazonAIPredictionsProvider } from '@aws-amplify/predictions';
import awsconfig from '../aws-exports';

// Configure Amplify once
Amplify.configure(awsconfig);
let isPredictionsProviderAdded = false;
if (!isPredictionsProviderAdded) {
  Amplify.addPluggable(new AmazonAIPredictionsProvider());
  isPredictionsProviderAdded = true;
}

// Convert Float32 [-1,1] samples to 16-bit PCM
function convertFloat32ToInt16(buffer) {
    let l = buffer.length;
    const result = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        let s = Math.max(-1, Math.min(1, buffer[i]));
        result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return result.buffer;
}

// Merge multiple ArrayBuffers into one
function mergeBuffers(buffers) {
    let totalLength = buffers.reduce((acc, b) => acc + b.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    buffers.forEach(buffer => {
        result.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    });
    return result.buffer;
}


const AmplifyTranscriber = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState('Ready');
    const [finalTranscript, setFinalTranscript] = useState('');
    const [error, setError] = useState(null);

    const audioContextRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const scriptProcessorRef = useRef(null);
    const audioChunksRef = useRef([]);

    const stopRecording = useCallback(() => {
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        setIsRecording(false);
        setStatus('Stopped');
    }, []);

    useEffect(() => {
        return () => {
            stopRecording();
        };
    }, [stopRecording]);

    const startRecording = async () => {
        try {
            console.log("Starting PCM recording...");
            setError(null);
            setStatus('Requesting microphone access...');

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 }); // force 16kHz!
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

            scriptProcessor.onaudioprocess = (event) => {
                const inputBuffer = event.inputBuffer.getChannelData(0);
                const pcmData = convertFloat32ToInt16(inputBuffer);
                audioChunksRef.current.push(pcmData);

                // For debug
                console.log(`Captured PCM chunk: ${pcmData.byteLength} bytes`);
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination);
            scriptProcessorRef.current = scriptProcessor;

            setIsRecording(true);
            setStatus('Recording...');
        } catch (err) {
            console.error("Error starting recording:", err);
            setError(`Recording error: ${err.message}`);
            setStatus('Error');
        }
    };

    const processAudioChunk = async () => {
        try {
            console.log("Processing PCM chunks...");
            setIsProcessing(true);

            // Merge all chunks
            const mergedBuffer = mergeBuffers(audioChunksRef.current);

            console.log(`Total merged PCM size: ${mergedBuffer.byteLength} bytes`);

            // Send to AWS
            const result = await Predictions.convert({
                transcription: {
                    source: {
                        bytes: mergedBuffer,
                    },
                    language: 'zh-TW',
                }
            });

            console.log("AWS Transcription result:", result);

            if (result.transcription && result.transcription.fullText) {
                setFinalTranscript(prev => prev + ' ' + result.transcription.fullText);
            } else {
                console.warn("Empty transcription result.");
            }

            setIsProcessing(false);
        } catch (err) {
            console.error("Processing error:", err);
            setError(`Transcription failed: ${err.message}`);
            setIsProcessing(false);
        }
    };

    const clearTranscripts = () => {
        setFinalTranscript('');
    };

    const handleRecordButton = async () => {
        if (isRecording) {
            stopRecording();
            await processAudioChunk();
        } else {
            audioChunksRef.current = [];
            startRecording();
        }
    };

    return (
        <div className="transcriber-container">
            <h2>AWS Amplify Transcription (Live PCM)</h2>

            <div className="control-panel">
                <button
                    onClick={handleRecordButton}
                    className={isRecording ? 'stop-button' : 'start-button'}
                    disabled={isProcessing}
                >
                    {isRecording ? 'Stop Recording' : 'Start Recording'}
                </button>

                <button
                    onClick={clearTranscripts}
                    className="clear-button"
                    disabled={isRecording || isProcessing}
                >
                    Clear Transcripts
                </button>
            </div>

            <div className="status-panel">
                <p>Status: <span className="status-text">{status}</span></p>
                {isProcessing && <p>Processing audio... Please wait...</p>}
                {error && <p className="error-message">Error: {error}</p>}
            </div>

            <div className="transcript-panel">
                <div className="transcript-container">
                    <h3>Final Transcript:</h3>
                    <div className="final-transcript">{finalTranscript}</div>
                </div>
            </div>
        </div>
    );
};

export default AmplifyTranscriber;
