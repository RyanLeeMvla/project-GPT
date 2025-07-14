const recorder = require('node-audio-recorder');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class VoiceManager {
    constructor() {
        this.isListening = false;
        this.isRecording = false;
        this.audioRecorder = null;
        this.voiceCallback = null;
        this.wakeWords = ['jarvis', 'gpt'];
        this.isInitialized = false;
        this.silenceThreshold = 500; // ms of silence before processing
        this.maxRecordingLength = 10000; // 10 seconds max
    }

    async initialize() {
        console.log('🎤 Initializing Voice Manager...');
        
        try {
            // Check if audio recording is available
            await this.checkAudioAvailability();
            
            // Initialize audio recorder
            this.setupAudioRecorder();
            
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

    setupAudioRecorder() {
        const options = {
            program: process.platform === 'win32' ? 'sox' : 'rec',
            device: null,
            bits: 16,
            channels: 1,
            encoding: 'signed-integer',
            format: 'S16_LE',
            rate: 16000,
            type: 'wav',
            silence: 2.0, // Silence threshold
            thresholdStart: 5,
            thresholdStop: 5,
            keepSilence: true
        };

        this.audioRecorder = recorder.record(options);
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
        
        console.log('🎤 Starting continuous voice listening...');
        
        // Start the listening loop
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

            // Start recording
            const fileStream = fs.createWriteStream(audioFile);
            this.audioRecorder.stream().pipe(fileStream);

            // Set timeout for max recording length
            const timeout = setTimeout(() => {
                this.audioRecorder.stop();
            }, this.maxRecordingLength);

            this.audioRecorder.on('end', async () => {
                clearTimeout(timeout);
                
                try {
                    // Check if audio file has content
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
                    resolve();
                    
                } catch (error) {
                    console.error('❌ Error processing audio:', error);
                    // Clean up on error
                    if (fs.existsSync(audioFile)) {
                        fs.unlinkSync(audioFile);
                    }
                    resolve(); // Continue listening despite error
                }
            });

            this.audioRecorder.on('error', (error) => {
                clearTimeout(timeout);
                console.error('❌ Audio recording error:', error);
                if (fs.existsSync(audioFile)) {
                    fs.unlinkSync(audioFile);
                }
                resolve(); // Continue listening despite error
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
        
        if (this.audioRecorder) {
            this.audioRecorder.stop();
        }
        
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
}

module.exports = VoiceManager;
