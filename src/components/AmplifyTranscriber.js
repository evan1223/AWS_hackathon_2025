import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Amplify } from 'aws-amplify';
import { Predictions } from '@aws-amplify/predictions';
import awsconfig from '../aws-exports';

// Configure Amplify
Amplify.configure(awsconfig);

const AmplifyTranscriber = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState('Ready');
    const [finalTranscript, setFinalTranscript] = useState('');
    const [error, setError] = useState(null);
    const [testMode, setTestMode] = useState(false); // 🎯 是否啟用「上傳測試檔模式」

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
            console.log("Microphone tracks:", stream.getAudioTracks());

            const audioElement = new Audio();
            audioElement.srcObject = stream;
            audioElement.play();
            mediaStreamRef.current = stream;

            const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            console.log("Requested sample rate: 16000");
            console.log("Actual AudioContext sample rate:", audioContext.sampleRate);
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);

            await audioContext.audioWorklet.addModule('/worklet-processor.js');

            const micProcessor = new AudioWorkletNode(audioContext, 'mic-processor');

            micProcessor.port.onmessage = (event) => {
                const inputBuffer = event.data;
                const pcmData = convertFloat32ToInt16(inputBuffer);
                audioChunksRef.current.push(pcmData);
                console.log(`Captured PCM chunk: ${pcmData.byteLength} bytes`);
            };

            source.connect(micProcessor);
            scriptProcessorRef.current = micProcessor;

            setIsRecording(true);
            setStatus('Recording...');
        } catch (err) {
            console.error("Error starting recording:", err);
            setError(`Recording error: ${err.message}`);
            setStatus('Error');
        }
    };

    const processRecordedAudio = async () => {
        try {
            console.log("Processing recorded mic PCM chunks...");
            setIsProcessing(true);

            const mergedBuffer = mergeBuffers(audioChunksRef.current);
            console.log(`Total merged PCM size: ${mergedBuffer.byteLength} bytes`);

            savePCMToWav(mergedBuffer);

            const result = await Predictions.convert({
                transcription: {
                    source: { bytes: mergedBuffer },
                    language: 'zh-TW',
                }
            });

            console.log("AWS Transcription result from recorded mic:", result);

            if (result.transcription?.fullText) {
                setFinalTranscript(prev => prev + ' ' + result.transcription.fullText);
            } else {
                console.warn("Empty transcription result from recorded mic.");
            }

            setIsProcessing(false);
        } catch (err) {
            console.error("Error processing recorded mic audio:", err);
            setError(`Recorded audio transcription failed: ${err.message}`);
            setIsProcessing(false);
        }
    };

    const processUploadedTestAudio = async () => {
        try {
            console.log("Debug mode: loading hardcoded test.wav file...");
            setIsProcessing(true);

            const response = await fetch('/test.wav');
            const arrayBuffer = await response.arrayBuffer();
            console.log("Loaded hardcoded WAV file. Size:", arrayBuffer.byteLength, "bytes");
            console.log("the WAV file: ",arrayBuffer);
            const result = await Predictions.convert({
                transcription: {
                    source: { bytes: arrayBuffer },
                    language: 'zh-TW',
                }
            });

            console.log("AWS Transcription result from uploaded file:", result);

            if (result.transcription?.fullText) {
                setFinalTranscript(prev => prev + ' ' + result.transcription.fullText);
            } else {
                console.warn("Empty transcription result from uploaded file.");
            }

            setIsProcessing(false);
        } catch (err) {
            console.error("Error processing uploaded file:", err);
            setError(`Uploaded file transcription failed: ${err.message}`);
            setIsProcessing(false);
        }
    };

    const clearTranscripts = () => {
        setFinalTranscript('');
    };

    const handleRecordButton = async () => {
        if (isRecording) {
            stopRecording();
            if (testMode) {
                await processUploadedTestAudio();
            } else {
                await processRecordedAudio();
            }
        } else {
            audioChunksRef.current = [];
            startRecording();
        }
    };

    const toggleTestMode = () => {
        setTestMode(prev => !prev);
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
                    {isRecording ? 'Stop & Transcribe' : 'Start Recording'}
                </button>

                <button
                    onClick={clearTranscripts}
                    className="clear-button"
                    disabled={isRecording || isProcessing}
                >
                    Clear Transcripts
                </button>

                <button
                    onClick={toggleTestMode}
                    className="mode-button"
                    disabled={isRecording || isProcessing}
                >
                    {testMode ? 'Switch to Mic Mode' : 'Switch to Upload Mode'}
                </button>
            </div>

            <div className="status-panel">
                <p>Status: <span className="status-text">{status}</span></p>
                {isProcessing && <p>Processing audio... Please wait...</p>}
                {error && <p className="error-message">Error: {error}</p>}
                <p>Mode: {testMode ? 'Upload test.wav' : 'Live Microphone'}</p>
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

// === Helper Functions ===

function convertFloat32ToInt16(buffer) {
    let l = buffer.length;
    const result = new Int16Array(l);
    let max = 0;
    for (let i = 0; i < l; i++) {
        max = Math.max(max, Math.abs(buffer[i]));
    }
    const scale = max > 0 ? 1 / max : 1;

    for (let i = 0; i < l; i++) {
        let s = buffer[i] * scale;
        result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return result.buffer;
}

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

function savePCMToWav(pcmArrayBuffer, sampleRate = 16000) {
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);

    const length = pcmArrayBuffer.byteLength;
    const totalLength = length + 44 - 8;

    view.setUint32(0, 0x52494646, false); // 'RIFF'
    view.setUint32(4, totalLength, true);
    view.setUint32(8, 0x57415645, false); // 'WAVE'
    view.setUint32(12, 0x666d7420, false); // 'fmt '
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // Audio format PCM = 1
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false); // 'data'
    view.setUint32(40, length, true);

    const wavBlob = new Blob([wavHeader, pcmArrayBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(wavBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recorded_audio.wav';
    link.click();
}
