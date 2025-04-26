import React from 'react';
import AmplifyTranscriber from './components/AmplifyTranscriber';
import './App.css';

// Import the Amplify configuration (this ensures it's initialized)
import './utils/awsConfig';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>AWS Transcribe Amplify Demo</h1>
      </header>
      <main>
        <AmplifyTranscriber />
      </main>
      <footer>
        <p>Make sure your Cognito Identity Pool is configured correctly in awsConfig.js</p>
      </footer>
    </div>
  );
}

export default App;