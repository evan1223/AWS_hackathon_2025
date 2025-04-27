// amplify/backend/function/startTranscription/...

const AWS = require('aws-sdk');
const transcribe = new AWS.TranscribeService();
const uuid = require('uuid'); // To generate unique job names

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);
        const { bucketName, audioKey } = body;

        const transcriptionJobName = `transcription-${uuid.v4()}`;

        const params = {
            TranscriptionJobName: transcriptionJobName,
            LanguageCode: 'zh-TW', // Modify if needed
            MediaFormat: 'wav',    // Modify if your file is mp3, flac, etc
            Media: {
                MediaFileUri: `s3://${bucketName}/${audioKey}`
            },
            OutputBucketName: bucketName // Save result to same bucket
        };

        await transcribe.startTranscriptionJob(params).promise();

        return {
            statusCode: 200,
            body: JSON.stringify({ transcriptionJobName }),
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        };
    }
};
