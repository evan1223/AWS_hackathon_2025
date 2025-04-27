// src/AmplifyTranscriber.js
import React, { useState } from 'react';
import { Storage, API } from 'aws-amplify';
import awsconfig from './aws-exports';

import { Amplify } from 'aws-amplify';

// Always make sure Amplify is configured
Amplify.configure(awsconfig);

const AmplifyTranscriber = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadStatus, setUploadStatus] = useState('');
    const [transcriptionStatus, setTranscriptionStatus] = useState('');
    const [error, setError] = useState(null);

    const uploadAudioAndStartTranscription = async () => {
        if (!selectedFile) {
            setError('Please select a file first.');
            return;
        }

        try {
            setUploadStatus('Uploading audio...');
            const fileName = `${Date.now()}-${selectedFile.name}`;

            // 1. Upload to S3
            await Storage.put(fileName, selectedFile, {
                contentType: selectedFile.type
            });

            setUploadStatus('Upload complete.');

            // 2. Start transcription by calling your API
            setTranscriptionStatus('Starting transcription...');

            const bucketName = "YOUR_BUCKET_NAME"; // (Optional) or fetch it dynamically
            const audioKey = fileName;

            const response = await API.post('YOUR_API_NAME', '/startTranscription', {
                body: { bucketName, audioKey }
            });

            setTranscriptionStatus(`Transcription started: ${response.transcriptionJobName}`);
        } catch (err) {
            console.error('Error:', err);
            setError(err.message || 'An unknown error occurred.');
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1>🎙️ AWS Amplify Transcriber</h1>
            <input
                type="file"
                accept="audio/*"
                onChange={(e) => setSelectedFile(e.target.files[0])}
            />
            <button
                onClick={uploadAudioAndStartTranscription}
                style={{ marginTop: '10px' }}
            >
                Upload and Transcribe
            </button>

            {uploadStatus && <p>{uploadStatus}</p>}
            {transcriptionStatus && <p>{transcriptionStatus}</p>}
            {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
    );
};

export default AmplifyTranscriber;
