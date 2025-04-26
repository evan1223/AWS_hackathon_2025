import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Amplify, Predictions } from 'aws-amplify';
import { AmazonAIPredictionsProvider } from '@aws-amplify/predictions';
import awsconfig from '../aws-exports';

// Configure Amplify and register the Predictions provider
Amplify.configure(awsconfig);

// Only add the Predictions provider if not already added
let isPredictionsProviderAdded = false;
if (!isPredictionsProviderAdded) {
  Amplify.addPluggable(new AmazonAIPredictionsProvider());
  isPredictionsProviderAdded = true;
}

const AmplifyTranscriber = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState('Ready');
    const [partialTranscript, setPartialTranscript] = useState('');
    const [finalTranscript, setFinalTranscript] = useState('');
    const [error, setError] = useState(null);

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const streamRef = useRef(null);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();

            if (audioChunksRef.current.length > 0) {
                processAudioChunk([...audioChunksRef.current]);
                audioChunksRef.current = [];
            }

            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }

            setIsRecording(false);
            setStatus('Stopped');
        }
    }, [isRecording]);

    useEffect(() => {
        return () => {
            stopRecording();
        };
    }, [stopRecording]);

    const startRecording = async () => {
        try {
            console.log("Starting recording");
            setError(null);
            setStatus('Requesting microphone access...');

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Got user media:", stream);
            streamRef.current = stream;

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm' // or 'audio/wav' if preferred
            });

            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);

                    if (audioChunksRef.current.length >= 5) {
                        processAudioChunk([...audioChunksRef.current]);
                        audioChunksRef.current = [];
                    }
                }
            };

            mediaRecorder.start(1000); // record in 1-second chunks
            setIsRecording(true);
            setStatus('Recording...');
        } catch (err) {
            console.error("Recording error:", err);
            setError(`Failed to start recording: ${err.message}`);
            setStatus('Error');
        }
    };

    const processAudioChunk = async (chunks) => {
        try {
            console.log("Processing chunks:", chunks.length);
            setIsProcessing(true);
    
            const audioBlob = new Blob(chunks, { type: 'audio/webm' });
            console.log("Audio blob created:", audioBlob.size, "bytes");
    
            // Convert Blob to ArrayBuffer
            const arrayBuffer = await audioBlob.arrayBuffer();
    
            console.log("Sending to AWS Predictions...");
    
            const result = await Predictions.convert({
                transcription: {
                    source: {
                        bytes: arrayBuffer,  // <<=== Pass bytes, NOT file
                    },
                    language: 'zh-TW',
                }
            });
    
            console.log("Transcription result:", result);
    
            if (result.transcription && result.transcription.fullText) {
                setFinalTranscript(prev => prev + ' ' + result.transcription.fullText);
            }
    
            setIsProcessing(false);
        } catch (err) {
            console.error("Processing error:", err);
            setError(`Transcription failed: ${err.message}`);
            setIsProcessing(false);
        }
    };

    const clearTranscripts = () => {
        setPartialTranscript('');
        setFinalTranscript('');
    };

    return (
        <div className="transcriber-container">
            <h2>AWS Amplify Transcription</h2>

            <div className="control-panel">
                <button
                    onClick={isRecording ? stopRecording : startRecording}
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
                {isProcessing && <p>Processing audio... This may take a moment.</p>}
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
