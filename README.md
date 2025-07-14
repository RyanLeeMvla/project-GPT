# GPT AI Agent

A comprehensive voice-activated AI assistant inspired by JARVIS from Iron Man, designed to assist with project management, 3D modeling, fabrication control, and general computer operations.

## Features

- 🎤 Voice activation and control with "GPT" wake word
- 📝 Intelligent note-taking with trigger phrases ("GPT, log that instance...")
- 🖥️ Computer operation control (file management, app launching)
- 🔍 Error detection and optimization suggestions
- 🎯 3D modeling assistance (OnShape integration)
- 🖨️ Bambu Lab 3D printer control via API
- 📊 Project timeline and inventory management
- 🔄 Closed-loop communication with clarifying questions
- 🧮 Simulation capabilities (external API integration)
- 📈 Real-time predictive models and visualizations
- 🔐 Secure access management
- 📚 Automatic version control and project organization

## Architecture

- `src/core/` - Core AI agent functionality (OpenAI integration)
- `src/voice/` - Voice recognition and synthesis
- `src/computer/` - System operation modules
- `src/projects/` - Project tracking and database
- `src/fabrication/` - 3D printing and fabrication control
- `src/security/` - Access control and data protection
- `src/simulation/` - Simulation and modeling APIs
- `src/ui/` - Electron-based user interface
- `config/` - Configuration files
- `database/` - SQLite database for project management

## Technology Stack

- **Runtime**: Node.js
- **AI**: OpenAI GPT API
- **Voice**: Web Speech API / SpeechRecognition
- **Database**: SQLite3
- **UI**: Electron (for desktop app)
- **3D Printing**: Bambu Lab API integration
- **Security**: bcrypt, node-keytar for credential storage

## Prerequisites

- **Node.js** (v16 or higher)
- **OpenAI API Key** (required)
- **Windows 10/11** (current version optimized for Windows)
- **Microphone** (for voice control)
- **Bambu Lab 3D Printer** (optional, for fabrication features)

## Installation

### Quick Setup

1. **Clone or download** this repository
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Run the setup wizard**:
   ```bash
   npm run setup
   ```
4. **Start GPT**:
   ```bash
   npm start
   ```

### Manual Configuration

If you prefer to configure manually:

1. **Copy configuration template**:
   ```bash
   cp config/settings.json.example config/settings.json
   ```

2. **Edit `config/settings.json`** and add your OpenAI API key:
   ```json
   {
     "openai": {
       "apiKey": "your-openai-api-key-here"
     }
   }
   ```

3. **Configure Bambu Lab printer** (optional):
   Edit `config/fabrication.json` with your printer details

4. **Start GPT**:
   ```bash
   npm start
   ```

## Usage

### Voice Commands

- **"GPT"** - Wake word to activate GPT
- **"GPT, log that instance [description]"** - Quick note-taking with context

### Example Commands

- "GPT, create a new project for my 3D printed robot"
- "GPT, open OnShape for 3D modeling"
- "GPT, check my 3D printer status"
- "GPT, show me my current projects"
- "GPT, log that instance - found issue with motor alignment"

### Desktop Interface

- **System Tray**: GPT runs in the background with a system tray icon
- **Dashboard**: Overview of projects, tasks, and system status
- **Chat Interface**: Text-based interaction with JARVIS
- **Project Management**: Create, track, and manage multiple projects
- **3D Printing Control**: Monitor and control Bambu Lab printers
- **Notes & Documentation**: View and search your logged notes

## Configuration

### OpenAI Settings
```json
{
  "openai": {
    "apiKey": "your-api-key",
    "model": "gpt-4",
    "maxTokens": 1000,
    "temperature": 0.7
  }
}
```

### Voice Settings
```json
{
  "voice": {
    "enabled": true,
    "wakeWords": ["gpt"],
    "language": "en-US"
  }
}
```

### Bambu Lab Printer
```json
{
  "bambuLab": {
    "enabled": true,
    "printers": [{
      "id": "bambu_x1_01",
      "name": "Bambu Lab X1 Carbon",
      "ip": "192.168.1.100",
      "accessCode": "your-access-code",
      "serialNumber": "your-serial-number"
    }]
  }
}
```

## Security Features

- **Encrypted credential storage** using Windows Credential Manager
- **Action authorization system** with different permission levels
- **Audit logging** of all security events
- **Session management** with automatic expiration
- **Restricted file access** to protect system files

## Safety & Security

This agent is designed with security in mind:
- Only activates when explicitly called
- Asks clarifying questions before taking actions
- Maintains audit logs of all operations
- Secure credential management
- Administrative access is controlled and logged

## Development

### Running in Development Mode
```bash
npm run dev
```

### Project Structure
```
src/
  ├── main.js              # Electron main process
  ├── core/
  │   └── jarvis-core.js   # Core AI functionality
  ├── voice/
  │   └── voice-manager.js # Voice recognition/synthesis
  ├── computer/
  │   └── computer-controller.js # System operations
  ├── projects/
  │   └── project-manager.js # Project database
  ├── fabrication/
  │   └── fabrication-manager.js # 3D printer control
  ├── security/
  │   └── security-manager.js # Security & authentication
  └── ui/
      ├── index.html       # Main UI
      └── app.js          # UI JavaScript
```

### API Integration

GPT uses the OpenAI GPT-4 API for natural language processing. The system is designed to:
- Understand context and intent
- Ask clarifying questions when needed
- Provide detailed responses with actionable suggestions
- Learn from interaction patterns

## Troubleshooting

### Common Issues

1. **"OpenAI API key not configured"**
   - Run `npm run setup` or manually edit `config/settings.json`

2. **Voice recognition not working**
   - Check microphone permissions
   - Ensure Windows Speech Recognition is enabled
   - Try running as administrator

3. **3D printer not connecting**
   - Verify printer IP address and access code
   - Check network connectivity
   - Ensure printer is powered on and connected to network

4. **GPT not responding**
   - Check the system tray for status
   - Restart the application
   - Check logs in `logs/gpt.log`

### Debug Mode

Enable debug mode in `config/settings.json`:
```json
{
  "debug": true
}
```

This will provide detailed logging and open developer tools automatically.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Inspired by JARVIS from the Marvel Cinematic Universe
- Built with OpenAI's GPT technology
- Uses Electron for cross-platform desktop application
- Bambu Lab API integration for 3D printing control

## Roadmap

### Upcoming Features
- [ ] Linux and macOS support
- [ ] Additional 3D printer brand support
- [ ] Advanced simulation APIs
- [ ] Mobile companion app
- [ ] Cloud synchronization
- [ ] Plugin system for extensibility
- [ ] Advanced voice command customization
- [ ] Integration with more CAD software
- [ ] IoT device control
- [ ] Advanced project analytics

---

**Note**: This is a personal AI assistant designed to run locally on your computer. Your data stays on your machine, and all AI processing is done through the OpenAI API with your own API key.
