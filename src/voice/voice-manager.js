const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class VoiceManager {
    constructor(mainWindow = null) {
        this.isListening = false;
        this.isRecording = false;
        this.voiceCallback = null;
        this.wakeWords = ['gpt', 'hey gpt'];
        this.isInitialized = false;
        this.silenceThreshold = 500; // ms of silence before processing
        this.maxRecordingLength = 10000; // 10 seconds max
        this.recorder = null;
        this.currentRecording = null;
        this.currentRecognition = null; // For Web Speech API
        this.mainWindow = mainWindow; // Reference to main window for IPC
    }

    async initialize() {
        console.log('🎤 Initializing Voice Manager...');
        
        try {
            // Check if audio recording is available
            await this.checkAudioAvailability();
            
            this.isInitialized = true;
            console.log('✅ Voice Manager initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Voice Manager:', error);
            // Continue without voice for now - can be enabled later
            this.isInitialized = false;
        }
    }

    async checkAudioAvailability() {
        // Check if microphone access is available
        if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                return true;
            } catch (error) {
                throw new Error('Microphone access denied or unavailable');
            }
        }
        
        // For Node.js environment, check system audio
        return new Promise((resolve, reject) => {
            const testRecord = spawn('powershell', [
                '-Command',
                'Get-WmiObject -Class Win32_SoundDevice | Where-Object {$_.Status -eq "OK"}'
            ]);
            
            testRecord.on('close', (code) => {
                if (code === 0) {
                    resolve(true);
                } else {
                    reject(new Error('No audio devices available'));
                }
            });
        });
    }

    async startListening(callback) {
        if (!this.isInitialized) {
            throw new Error('Voice Manager not initialized');
        }

        if (this.isListening) {
            console.log('⚠️ Already listening for voice commands');
            return;
        }

        this.voiceCallback = callback;
        this.isListening = true;
        
        console.log('🎤 Starting voice listening...');
        
        // Try Web Speech API first (works better in Electron renderer)
        if (typeof window !== 'undefined') {
            const webSpeechStarted = this.startWebSpeechRecognition(callback);
            if (webSpeechStarted) {
                console.log('✅ Using Web Speech API for voice recognition');
                return;
            }
        }
        
        // Fallback to Node.js recording method
        console.log('🎤 Falling back to Node.js recording method...');
        this.startListeningLoop();
    }

    async startListeningLoop() {
        while (this.isListening) {
            try {
                await this.recordAndProcess();
                // Small delay between recordings
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('❌ Error in listening loop:', error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async recordAndProcess() {
        return new Promise((resolve, reject) => {
            if (!this.isListening) {
                resolve();
                return;
            }

            const audioFile = path.join(__dirname, `../temp/audio_${Date.now()}.wav`);
            
            // Ensure temp directory exists
            const tempDir = path.dirname(audioFile);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Use Windows-compatible recording with SoX or PowerShell
            this.recordAudioWindows(audioFile)
                .then(async () => {
                    try {
                        // Check if audio file has content
                        if (fs.existsSync(audioFile)) {
                            const stats = fs.statSync(audioFile);
                            if (stats.size > 1000) { // Minimum file size check
                                const transcription = await this.transcribeAudio(audioFile);
                                
                                if (transcription && this.containsWakeWord(transcription)) {
                                    console.log(`🎤 Transcription: "${transcription}"`);
                                    
                                    if (this.voiceCallback) {
                                        this.voiceCallback(transcription);
                                    }
                                }
                            }
                            
                            // Clean up audio file
                            fs.unlinkSync(audioFile);
                        }
                        resolve();
                        
                    } catch (error) {
                        console.error('Error processing audio:', error);
                        resolve();
                    }
                })
                .catch(error => {
                    console.error('Error recording audio:', error);
                    resolve();
                });
        });
    }

    async recordAudioWindows(outputFile) {
        return new Promise((resolve, reject) => {
            // Use PowerShell to record audio on Windows
            const recordScript = `
                Add-Type -AssemblyName System.Windows.Forms
                Add-Type -AssemblyName System.Drawing
                
                # Try to use Windows Media Format SDK or fallback to SoundRecorder
                try {
                    $recorder = New-Object -ComObject "WMFSDKSample.WMRecorder"
                    $recorder.SetProfile("Audio")
                    $recorder.SetOutputFilename("${outputFile.replace(/\\/g, '\\\\')}")
                    $recorder.Start()
                    Start-Sleep -Seconds 3
                    $recorder.Stop()
                } catch {
                    # Fallback: Use SoX if available, or create a dummy file
                    if (Get-Command sox -ErrorAction SilentlyContinue) {
                        & sox -t waveaudio default "${outputFile}" trim 0 3
                    } else {
                        # Create a minimal WAV file as fallback
                        [byte[]]$wavHeader = @(0x52,0x49,0x46,0x46,0x24,0x08,0x00,0x00,0x57,0x41,0x56,0x45,0x66,0x6D,0x74,0x20,0x10,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x44,0xAC,0x00,0x00,0x88,0x58,0x01,0x00,0x02,0x00,0x10,0x00,0x64,0x61,0x74,0x61,0x00,0x08,0x00,0x00)
                        [System.IO.File]::WriteAllBytes("${outputFile.replace(/\\/g, '\\\\')}", $wavHeader)
                    }
                }
            `;

            const powershell = spawn('powershell.exe', [
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-Command', recordScript
            ]);

            let timeout = setTimeout(() => {
                powershell.kill();
                resolve();
            }, this.maxRecordingLength);

            powershell.on('close', (code) => {
                clearTimeout(timeout);
                resolve();
            });

            powershell.on('error', (error) => {
                clearTimeout(timeout);
                console.error('PowerShell recording error:', error);
                resolve(); // Don't reject, just continue
            });
        });
    }

    containsWakeWord(text) {
        const lowerText = text.toLowerCase();
        return this.wakeWords.some(word => lowerText.includes(word)) ||
               lowerText.includes('gpt, log that instance');
    }

    async transcribeAudio(audioFile) {
        try {
            // Use OpenAI Whisper API for transcription
            const fs = require('fs');
            const OpenAI = require('openai');
            const config = require('../../config/settings.json');
            
            const openai = new OpenAI({
                apiKey: config.openai.apiKey
            });

            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(audioFile),
                model: 'whisper-1',
                language: 'en'
            });

            return transcription.text;
            
        } catch (error) {
            console.error('❌ Transcription error:', error);
            
            // Fallback: Use Windows Speech Recognition
            if (process.platform === 'win32') {
                return await this.windowsSpeechRecognition(audioFile);
            }
            
            return null;
        }
    }

    async windowsSpeechRecognition(audioFile) {
        // Fallback speech recognition using Windows Speech API
        return new Promise((resolve) => {
            const powershell = spawn('powershell', [
                '-Command',
                `Add-Type -AssemblyName System.Speech; 
                 $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine; 
                 $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar)); 
                 $recognizer.SetInputToWaveFile('${audioFile}'); 
                 $result = $recognizer.Recognize(); 
                 if ($result) { $result.Text } else { '' }`
            ]);

            let output = '';
            powershell.stdout.on('data', (data) => {
                output += data.toString();
            });

            powershell.on('close', () => {
                resolve(output.trim() || null);
            });

            powershell.on('error', () => {
                resolve(null);
            });
        });
    }

    async speak(text, options = {}) {
        try {
            const { voice = 'default', rate = 1.0, volume = 1.0 } = options;
            
            if (process.platform === 'win32') {
                // Use Windows Speech API
                const powershell = spawn('powershell', [
                    '-Command',
                    `Add-Type -AssemblyName System.Speech; 
                     $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; 
                     $synth.Rate = ${Math.round(rate * 10 - 10)}; 
                     $synth.Volume = ${Math.round(volume * 100)}; 
                     $synth.Speak('${text.replace(/'/g, "''")}');`
                ]);

                return new Promise((resolve) => {
                    powershell.on('close', () => resolve());
                    powershell.on('error', () => resolve());
                });
            } else {
                // Use espeak or similar for other platforms
                const espeak = spawn('espeak', [text]);
                return new Promise((resolve) => {
                    espeak.on('close', () => resolve());
                    espeak.on('error', () => resolve());
                });
            }
            
        } catch (error) {
            console.error('❌ Text-to-speech error:', error);
        }
    }

    async stopListening() {
        if (!this.isListening) {
            return;
        }

        this.isListening = false;
        
        // Stop Web Speech API if it's running
        this.stopWebSpeechRecognition();
        
        console.log('🔇 Voice listening stopped');
    }

    isCurrentlyListening() {
        return this.isListening;
    }

    addWakeWord(word) {
        if (!this.wakeWords.includes(word.toLowerCase())) {
            this.wakeWords.push(word.toLowerCase());
            console.log(`➕ Added wake word: "${word}"`);
        }
    }

    removeWakeWord(word) {
        const index = this.wakeWords.indexOf(word.toLowerCase());
        if (index > -1) {
            this.wakeWords.splice(index, 1);
            console.log(`➖ Removed wake word: "${word}"`);
        }
    }

    getWakeWords() {
        return [...this.wakeWords];
    }

    // Simple Web Speech API method for browser/renderer process
    startWebSpeechRecognition(callback) {
        if (typeof window === 'undefined' || !window.webkitSpeechRecognition && !window.SpeechRecognition) {
            console.error('Web Speech API not available');
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        recognition.onstart = () => {
            console.log('🎤 Voice recognition started');
        };
        
        recognition.onresult = (event) => {
            let finalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                }
            }
            
            if (finalTranscript.trim()) {
                console.log(`🎤 Recognized: "${finalTranscript}"`);
                
                // Send transcript to renderer process via IPC
                if (this.mainWindow && this.mainWindow.webContents) {
                    this.mainWindow.webContents.send('voice-transcript', {
                        transcript: finalTranscript,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Also call the original callback if provided for backwards compatibility
                if (callback) {
                    callback(finalTranscript);
                }
                
                // Stop listening after successful recognition
                this.stopListening();
            }
        };
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            // Send error to renderer process via IPC
            if (this.mainWindow && this.mainWindow.webContents) {
                this.mainWindow.webContents.send('voice-error', {
                    error: event.error,
                    message: `Speech recognition failed: ${event.error}`,
                    timestamp: new Date().toISOString()
                });
            }
        };
        
        recognition.onend = () => {
            console.log('🎤 Voice recognition ended');
            // Restart if still listening
            if (this.isListening) {
                setTimeout(() => recognition.start(), 1000);
            }
        };
        
        try {
            recognition.start();
            this.currentRecognition = recognition;
            return true;
        } catch (error) {
            console.error('Failed to start speech recognition:', error);
            return false;
        }
    }

    stopWebSpeechRecognition() {
        if (this.currentRecognition) {
            this.currentRecognition.stop();
            this.currentRecognition = null;
        }
    }
}

module.exports = VoiceManager;
