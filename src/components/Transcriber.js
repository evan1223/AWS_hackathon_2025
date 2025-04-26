import React, { useState, useEffect, useRef } from 'react';
import AWS from 'aws-sdk';
import { AWS_CONFIG } from '../utils/awsConfig';

const Transcriber = () => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState(null);
  
  const audioInputRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const webSocketRef = useRef(null);
  
  // Initialize AWS credentials
  const initializeAWS = async () => {
    try {
      AWS.config.region = AWS_CONFIG.REGION;
      AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: AWS_CONFIG.IDENTITY_POOL_ID
      });
      
      await new Promise((resolve, reject) => {
        AWS.config.credentials.get(err => {
          if (err) {
            setError(`Error getting AWS credentials: ${err.message}`);
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      return true;
    } catch (error) {
      setError(`Failed to initialize AWS: ${error.message}`);
      return false;
    }
  };
  
  // Get pre-signed URL for WebSocket connection
  const getTranscribeUrl = async () => {
    try {
      const transcribeService = new AWS.TranscribeStreamingService();
      const response = await transcribeService.getWebSocketUrl({
        LanguageCode: AWS_CONFIG.LANGUAGE_CODE,
        MediaEncoding: 'pcm',
        MediaSampleRateHertz: AWS_CONFIG.SAMPLE_RATE
      }).promise();
      
      return response.WebSocketUrl;
    } catch (error) {
      setError(`Failed to get WebSocket URL: ${error.message}`);
      throw error;
    }
  };
  
  // Convert Float32Array to Int16Array (required format for Transcribe)
  const convertAudioFormat = (float32Array) => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      int16Array[i] = Math.min(1, Math.max(-1, float32Array[i])) * 0x7FFF;
    }
    return int16Array;
  };
  
  // Convert ArrayBuffer to base64 string
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };
  
  // Set up WebSocket handlers
  const setupWebSocket = (socketUrl) => {
    webSocketRef.current = new WebSocket(socketUrl);
    
    webSocketRef.current.onopen = () => {
      setStatus('Connected! You can speak now.');
    };
    
    webSocketRef.current.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data);
        
        if (data.Errors && data.Errors.length > 0) {
          const errorMessage = data.Errors.map(e => e.Message).join(', ');
          setError(`Transcribe error: ${errorMessage}`);
          stopTranscription();
          return;
        }
        
        if (data.TranscriptEvent) {
          const results = data.TranscriptEvent.Transcript.Results;
          
          if (results.length > 0) {
            const result = results[0];
            
            if (result.Alternatives && result.Alternatives.length > 0) {
              const transcript = result.Alternatives[0].Transcript;
              
              if (result.IsPartial) {
                setPartialTranscript(transcript);
              } else {
                setPartialTranscript('');
                setFinalTranscript(prev => prev + transcript + ' ');
              }
            }
          }
        }
      } catch (error) {
        setError(`Error parsing message: ${error.message}`);
      }
    };
    
    webSocketRef.current.onerror = (event) => {
      setError(`WebSocket error: ${event.message || 'Unknown error'}`);
    };
    
    webSocketRef.current.onclose = (event) => {
      setStatus(`Connection closed: ${event.reason || 'Connection closed'}`);
    };
  };
  
  // Create audio processor to convert microphone input to correct format
  const createAudioProcessor = () => {
    try {
      if (!audioContextRef.current) {
        return null;
      }
      
      const processor = audioContextRef.current.createScriptProcessor(1024, 1, 1);
      
      processor.onaudioprocess = (event) => {
        if (!isTranscribing || !webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
          return;
        }
        
        // Get raw audio data and convert to correct format
        const inputData = event.inputBuffer.getChannelData(0);
        const audioData = convertAudioFormat(inputData);
        
        // Create message payload for Transcribe
        const audioEvent = {
          AudioEvent: {
            AudioChunk: arrayBufferToBase64(audioData.buffer)
          }
        };
        
        // Send audio data over WebSocket
        if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
          webSocketRef.current.send(JSON.stringify(audioEvent));
        }
      };
      
      return processor;
    } catch (error) {
      setError(`Error creating audio processor: ${error.message}`);
      return null;
    }
  };
  
  // Start transcription
  const startTranscription = async () => {
    try {
      setStatus('Initializing...');
      setError(null);
      
      // Initialize AWS SDK
      const initialized = await initializeAWS();
      if (!initialized) return;
      
      // Get WebSocket URL
      setStatus('Getting WebSocket URL...');
      const socketUrl = await getTranscribeUrl();
      
      // Request microphone access
      setStatus('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      // Set up audio context
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext();
      audioInputRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      // Create audio processor
      processorRef.current = createAudioProcessor();
      if (processorRef.current) {
        audioInputRef.current.connect(processorRef.current);
        processorRef.current.connect(audioContextRef.current.destination);
      }
      
      // Connect to WebSocket
      setupWebSocket(socketUrl);
      
      setIsTranscribing(true);
    } catch (error) {
      setError(`Failed to start transcription: ${error.message}`);
      cleanupResources();
    }
  };
  
  // Stop transcription and cleanup resources
  const stopTranscription = () => {
    // Cleanup WebSocket
    if (webSocketRef.current) {
      webSocketRef.current.close();
      webSocketRef.current = null;
    }
    
    cleanupResources();
    setIsTranscribing(false);
    setStatus('Transcription stopped');
  };
  
  // Clean up audio resources
  const cleanupResources = () => {
    // Disconnect audio processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    // Disconnect audio input
    if (audioInputRef.current) {
      audioInputRef.current.disconnect();
      audioInputRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    
    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };
  
  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      cleanupResources();
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
    };
  }, []);
  
  // Clear transcripts
  const clearTranscripts = () => {
    setPartialTranscript('');
    setFinalTranscript('');
  };
  
  return (
    <div className="transcriber-container">
      <h2>AWS Real-Time Transcription</h2>
      
      <div className="control-panel">
        <button 
          onClick={isTranscribing ? stopTranscription : startTranscription}
          className={isTranscribing ? 'stop-button' : 'start-button'}
        >
          {isTranscribing ? 'Stop Transcription' : 'Start Transcription'}
        </button>
        
        <button 
          onClick={clearTranscripts}
          className="clear-button"
          disabled={isTranscribing}
        >
          Clear Transcripts
        </button>
      </div>
      
      <div className="status-panel">
        <p>Status: <span className="status-text">{status}</span></p>
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

export default Transcriber;