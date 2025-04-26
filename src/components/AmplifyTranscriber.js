import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Predictions } from 'aws-amplify';

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

            // Process any remaining audio
            if (audioChunksRef.current.length > 0) {
                processAudioChunk([...audioChunksRef.current]);
                audioChunksRef.current = [];
            }

            // Clean up media stream
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }

            setIsRecording(false);
            setStatus('Stopped');
        }
    }, [isRecording]); // Include isRecording in the dependencies



    // Clean up resources when component unmounts
    useEffect(() => {
        return () => {
            stopRecording();
        };
    }, [stopRecording]);

    // Start recording audio
    const startRecording = async () => {
        try {
            console.log("Starting recording");
            setError(null);
            setStatus('Requesting microphone access...');

            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("\nGot user media:", stream);
            streamRef.current = stream;
            
            // Set up MediaRecorder
            const mediaRecorder = new MediaRecorder(stream,{
                mimeType: 'audio/webm'
            });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            // Set up data collection
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);

                    // For longer recordings, process chunks periodically
                    if (audioChunksRef.current.length >= 5) {
                        processAudioChunk([...audioChunksRef.current]);
                        audioChunksRef.current = [];
                    }
                }
            };
            console.log("\nMediaRecorder created:", mediaRecorderRef.current);

            // Start recording
            mediaRecorder.start(1000); // Collect data every second
            setIsRecording(true);
            setStatus('Recording...');
        } catch (err) {
            console.error("\nRecording error:", error);
            setError(`Failed to start recording: ${err.message}`);
            setStatus('Error');
        }
    };

    // Process audio chunks for transcription
    const processAudioChunk = async (chunks) => {
        try {
            console.log("Processing chunks:", chunks.length);
            setIsProcessing(true);

            // Create blob from audio chunks
            const audioBlob = new Blob(chunks, { type: 'audio/webm' });
            console.log("\nAudio blob created:", audioBlob.size, "bytes");
            const audioFile = new File([audioBlob], 'recording.webm');

            console.log("\nSending to AWS Predictions...");
            // Send to AWS Transcribe via Amplify
            const result = await Predictions.convert({
                transcription: {
                    source: {
                        file: audioFile,
                    }
                }
            });
            console.log("\nTranscription result:", result);

            // Update transcript
            if (result.transcription.fullText) {
                setFinalTranscript(prev => prev + ' ' + result.transcription.fullText);
            }

            setIsProcessing(false);
        } catch (err) {
            console.error("\nProcessing error:", error);
            console.error('Transcription error:', err);
            // Don't set error here to avoid interrupting recording
        }
    };

    // Clear transcripts
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
                    <h3>Partial Transcript:</h3>
                    <div className="partial-transcript">{partialTranscript}</div>
                </div>

                <div className="transcript-container">
                    <h3>Final Transcript:</h3>
                    <div className="final-transcript">{finalTranscript}</div>
                </div>
            </div>
        </div>
    );
};

export default AmplifyTranscriber;