// --- APP STATE & CONFIG ---
let currentPage = 'intro';
let currentGoal = '';
let currentAnalysis = null;
let isTeacherView = false;
let allRecords = [];
let isRecording = false;
let speechRecognition;

// --- GOOGLE SCRIPT CONFIG ---
// The API_KEY is gone! This is now secure.
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjlxisLIq7Bf-Z4phiuRrjnS5KX04OHGwwetrO4k55K5dgO-o_RplQApkeiRyBdsqRkA/exec"; // <-- This is your Web App URL

// Rate limiting: 5 requests per minute (one every 12 seconds)
// This is now client-side throttling to avoid spamming your own script
const RATE_LIMIT_MS = 12000;
let lastApiCallTime = 0;


// --- SPEECH RECOGNITION (WEB SPEECH API) ---

function setupSpeechRecognition() {
	// Check for browser support
	const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
	if (!SpeechRecognition) {
		showMessage("Speech recognition not supported in this browser. Please type your transcription.", "warning");
		return;
	}

	speechRecognition = new SpeechRecognition();
	speechRecognition.continuous = false; // Stop after first pause
	speechRecognition.interimResults = false; // Get final results
	speechRecognition.lang = 'en-US';

	speechRecognition.onresult = (event) => {
		const transcript = event.results[event.results.length - 1][0].transcript;
        
		// Find the correct input box for the current page
		const inputId = (currentPage === 'custom') ? 'customTranscription' : 'transcription';
		const transcriptionInput = document.getElementById(inputId);
        
		if (transcriptionInput) {
			transcriptionInput.value = transcript;
		}
        
		// Turn off the recording UI
		const micBtnId = (currentPage === 'custom') ? 'customMicBtn' : 'micBtn';
		const micBtn = document.getElementById(micBtnId);
		if (micBtn) {
			micBtn.classList.remove('mic-pulse', 'bg-red-500', 'hover:bg-red-600');
			micBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
			micBtn.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewbox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1.2-9.1c0-.66.54-1.2 1.2-1.2s1.2.54 1.2 1.2v6.1c0 .66-.54 1.2-1.2 1.2s-1.2-.54-1.2-1.2V4.9zm6.7 6.1c0 3-2.54 5.1-5.5 5.1s-5.5-2.1-5.5-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-2.18c3.28-.49 6-3.31 6-6.72h-1.5z" /></svg>`;
		}
		isRecording = false;
	};

	speechRecognition.onerror = (event) => {
		if (event.error === 'no-speech') {
			showMessage("No speech detected. Please try again.", "warning");
		} else if (event.error === 'audio-capture') {
			showMessage("Microphone error. Please check your mic.", "error");
		} else if (event.error === 'not-allowed') {
			showMessage("Microphone permission denied. Please allow mic access in your browser settings.", "error");
		} else {
			showMessage(`Speech recognition error: ${event.error}`, "error");
		}
        
		// Reset button
		const micBtnId = (currentPage === 'custom') ? 'customMicBtn' : 'micBtn';
		const micBtn = document.getElementById(micBtnId);
		if (micBtn) {
			 micBtn.classList.remove('mic-pulse', 'bg-red-500', 'hover:bg-red-600');
			 micBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
			 micBtn.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewbox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1.2-9.1c0-.66.54-1.2 1.2-1.2s1.2.54 1.2 1.2v6.1c0 .66-.54 1.2-1.2 1.2s-1.2-.54-1.2-1.2V4.9zm6.7 6.1c0 3-2.54 5.1-5.5 5.1s-5.5-2.1-5.5-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-2.18c3.28-.49 6-3.31 6-6.72h-1.5z" /></svg>`;
		}
		isRecording = false;
	};

	speechRecognition.onstart = () => {
		 const micBtnId = (currentPage === 'custom') ? 'customMicBtn' : 'micBtn';
		 const micBtn = document.getElementById(micBtnId);
		 micBtn.classList.add('mic-pulse', 'bg-red-500', 'hover:bg-red-600');
		 micBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
		 micBtn.innerHTML = `<svg class="w-6 h-6" fill="currentColor" viewbox="0 0 24 24"><path d="M19 11h-1.7c0 3-2.54 5.1-5.5 5.1S6.3 14 6.3 11H4.6c0 3.41 2.72 6.23 6 6.72V21h2v-2.18c3.28-.49 6-3.31 6-6.72zM12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /></svg>`;
	};
}

function toggleRecording(buttonId) {
	if (!speechRecognition) {
		showMessage("Speech recognition is not set up.", "error");
		return;
	}

	if (isRecording) {
		speechRecognition.stop();
		isRecording = false;
	} else {
		try {
			speechRecognition.start();
			isRecording = true;
			showMessage("Listening...", "info", 2000);
		} catch(e) {
			if (e.name === 'InvalidStateError') {
				 // This can happen if start() is called too quickly after stop()
				 console.warn("Speech recognition is not ready, please wait a moment.");
			} else {
				 console.error("Could not start speech recognition: ", e);
				 showMessage("Could not start microphone.", "error");
			}
		}
	}
}

// A separate toggle for the custom page, so they don't interfere
function toggleCustomRecording(buttonId) {
	toggleRecording(buttonId);
}

// --- TTS (TEXT-TO-SPEECH) ---
    
// Helper: Convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64) {
	const binaryString = window.atob(base64);
	const len = binaryString.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

// Helper: Convert PCM data to WAV blob
function pcmToWav(pcmData, sampleRate) {
	const numSamples = pcmData.length;
	const numChannels = 1;
	const bitsPerSample = 16;
	const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
	const blockAlign = numChannels * (bitsPerSample / 8);
	const dataSize = numSamples * numChannels * (bitsPerSample / 8);
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	// RIFF header
	view.setUint32(0, 0x52494646, false); // "RIFF"
	view.setUint32(4, 36 + dataSize, true);
	view.setUint32(8, 0x57415645, false); // "WAVE"
	// "fmt " sub-chunk
	view.setUint32(12, 0x666D7420, false); // "fmt "
	view.setUint32(16, 16, true); // Sub-chunk size
	view.setUint16(20, 1, true); // Audio format (1 = PCM)
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitsPerSample, true);
	// "data" sub-chunk
	view.setUint32(36, 0x64617461, false); // "data"
	view.setUint32(40, dataSize, true);

	// Write PCM data
	let offset = 44;
	for (let i = 0; i < numSamples; i++, offset += 2) {
		view.setInt16(offset, pcmData[i], true);
	}

	return new Blob([view], { type: 'audio/wav' });
}

// Helper: Play the audio blob
function playAudio(blob) {
	const audioUrl = URL.createObjectURL(blob);
	const audio = new Audio(audioUrl);
	audio.play();
	audio.onended = () => {
		URL.revokeObjectURL(audioUrl);
	};
}
    
// Main TTS Function (Now calls our Google Script)
async function readQuestionAloud() {
	if (!currentGoal) {
		showMessage("No sentence selected to read.", "warning");
		return;
	}

	if (!GOOGLE_SCRIPT_URL) {
		showMessage("App is not configured. Missing Google Script URL.", "error");
		return;
	}
    
	showMessage("Generating audio...", "info");

	// Rate limit check
	const now = Date.now();
	const timeSinceLastCall = now - lastApiCallTime;
	if (timeSinceLastCall < RATE_LIMIT_MS) {
		const waitTime = RATE_LIMIT_MS - timeSinceLastCall;
		showMessage(`Rate limit: Please wait ${Math.ceil(waitTime / 1000)}s...`, 'info', 2000);
		await new Promise(resolve => setTimeout(resolve, waitTime));
	}
	lastApiCallTime = Date.now();

	const payload = {
		action: "getTTS",
		text: currentGoal
	};

	try {
		const response = await fetch(GOOGLE_SCRIPT_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			throw new Error(`Server error: ${response.status}`);
		}

		const result = await response.json();
        
		if (result.result === "error") {
			console.error("Server-side error (TTS):", result.message);
			showMessage(`Failed to generate audio: ${result.message}`, "error");
			return;
		}

		// The data is the full response from Gemini, passed through our script
		const geminiResponse = result.data;
		const part = geminiResponse?.candidates?.[0]?.content?.parts?.[0];
		const audioData = part?.inlineData?.data;
		const mimeType = part?.inlineData?.mimeType;

		if (audioData && mimeType && mimeType.startsWith("audio/")) {
			const sampleRateMatch = mimeType.match(/rate=(\d+)/);
			if (!sampleRateMatch) {
				 console.error("Could not find sample rate in mime type:", mimeType);
				 showMessage("Error processing audio: Unknown sample rate.", "error");
				 return;
			}
			const sampleRate = parseInt(sampleRateMatch[1], 10);
			const pcmData = base64ToArrayBuffer(audioData);
			const pcm16 = new Int16Array(pcmData);
			const wavBlob = pcmToWav(pcm16, sampleRate);
			playAudio(wavBlob);
			hideMessage(0); // Hide "Generating..." message
		} else {
			console.error("Invalid TTS response structure:", result);
			showMessage("Failed to process audio response.", "error");
		}
	} catch (error) {
		console.error("Error calling Google Script for TTS:", error);
		showMessage("Failed to connect to audio service.", "error");
	}
}


// --- AI ANALYSIS (GEMINI) ---
    
// Main analysis function (Now calls our Google Script)
async function analyzeSpeechWithGemini(goal, transcription) {
	if (!transcription) {
		showMessage("Please provide a transcription of your speech first.", "warning");
		return;
	}

	if (!GOOGLE_SCRIPT_URL) {
		showMessage("App is not configured. Missing Google Script URL.", "error");
		return;
	}

	showMessage("Analyzing speech with AI...", "info");
	document.getElementById("analysisContainer").classList.add("hidden");

	// Rate limit check
	const now = Date.now();
	const timeSinceLastCall = now - lastApiCallTime;
	if (timeSinceLastCall < RATE_LIMIT_MS) {
		const waitTime = RATE_LIMIT_MS - timeSinceLastCall;
		showMessage(`Rate limit: Please wait ${Math.ceil(waitTime / 1000)}s...`, 'info', 2000);
		await new Promise(resolve => setTimeout(resolve, waitTime));
	}
	lastApiCallTime = Date.now();

	const payload = {
		action: "analyzeSpeech",
		goal: goal,
		transcription: transcription
	};

	try {
		// Send as application/x-www-form-urlencoded to avoid browser preflight OPTIONS.
		const formBody = new URLSearchParams({ data: JSON.stringify(payload) });
		const response = await fetch(GOOGLE_SCRIPT_URL, {
			method: 'POST',
			body: formBody.toString()
		});

		if (!response.ok) {
			throw new Error(`Server error: ${response.status}`);
		}

		const result = await response.json();

		if (result.result === "error") {
			console.error("Server-side error (Analysis):", result.message);
			showMessage(`Analysis failed: ${result.message}`, "error");
			currentAnalysis = null;
			return;
		}

		// Parse the analysis results from the server
		const analysisResults = result.data;
		if (analysisResults && typeof analysisResults === 'object' && 
			'score' in analysisResults && 
			'feedback' in analysisResults && 
			'analysis' in analysisResults) {
			currentAnalysis = analysisResults; // Save for logging
			displayAnalysis(analysisResults);
			hideMessage(0); // Hide "Analyzing..."
		} else {
			console.error("Invalid response structure from server:", result);
			showMessage("Analysis failed: Could not parse AI response.", "error");
			currentAnalysis = null;
		}
	} catch (error) {
		console.error("Error calling Google Script for analysis:", error);
		showMessage("Analysis failed: Error processing AI feedback.", "error");
		currentAnalysis = null;
	}
}

// Display the results in the UI
function displayAnalysis(analysisResults) {
	document.getElementById("analysisContainer").classList.remove("hidden");
    
	const scoreEl = document.getElementById("score");
	const coloredTextEl = document.getElementById("coloredText");
	const feedbackDetails = document.getElementById("aiFeedbackDetails");

	scoreEl.textContent = `${analysisResults.score}%`;
	feedbackDetails.textContent = analysisResults.feedback;

	coloredTextEl.innerHTML = ''; // Clear previous results
	analysisResults.analysis.forEach(wordInfo => {
		const span = document.createElement('span');
		span.className = `word ${wordInfo.status}`;
		span.textContent = wordInfo.word;
		if (wordInfo.note) {
			span.title = wordInfo.note; // Show note on hover
		}
		coloredTextEl.appendChild(span);
		coloredTextEl.appendChild(document.createTextNode(' ')); // Add space
	});
}

// --- UI & PAGE NAVIGATION ---

function getIntroPage() {
	return `
			<h2 class="text-2xl font-bold text-gray-900 mb-4">📖 How to Use VocalPoint</h2>
			<div class="space-y-4 text-gray-700">
				<p>Welcome! This kiosk helps you practice your English pronunciation.</p>
				<ol class="list-decimal list-inside space-y-2">
					<li>Select a unit from the buttons above (e.g., "Unit 1: Welcome!").</li>
					<li>Choose a goal sentence you want to practice.</li>
					<li>Click the <strong>Read Goal Aloud</strong> button ( <svg class="inline h-5 w-5" fill="currentColor" viewbox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg> ) to hear the correct pronunciation.</li>
					<li>Click the <strong>Microphone</strong> button ( <svg class="inline h-5 w-5" fill="currentColor" viewbox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1.2-9.1c0-.66.54-1.2 1.2-1.2s1.2.54 1.2 1.2v6.1c0 .66-.54 1.2-1.2 1.2s-1.2-.54-1.2-1.2V4.9zm6.7 6.1c0 3-2.54 5.1-5.5 5.1s-5.5-2.1-5.5-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-2.18c3.28-.49 6-3.31 6-6.72h-1.5z"/></svg> ). Speak the sentence clearly.</li>
					<li>Your speech will be automatically transcribed into the text box. (You can also type it manually).</li>
					<li>Click <strong>Analyze Speech with AI</strong>.</li>
					<li>Review your score, see which words were correct, and read the AI's detailed feedback!</li>
				</ol>
				<p>If you're in a class, fill in your name and section. Then click <strong>Submit to Teacher Log</strong> to save your attempt.</p>
			</div>
		`;
}

function getUnitPage(unit) {
	currentAnalysis = null; // Clear analysis
	const sentences = unit.sentences;
	let sentenceButtons = sentences.map((s, index) => 
		// Fix apostrophe issue by escaping it for the string
		`<button class="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg" onclick="selectSentence('${s.replace(/'/g, "\\'")}', this)">
				${s}
			</button>`
	).join('');

	return `
			<h2 class="text-2xl font-bold text-gray-900 mb-4">${unit.title}</h2>
			<p class="text-gray-600 mb-4">Select a sentence to practice:</p>
			<div class="space-y-2 h-48 overflow-y-auto custom-scrollbar pr-2">${sentenceButtons}</div>
            
			<hr class="my-6">
            
			<div>
				<label class="block text-sm font-medium text-gray-700">Goal Sentence</label>
				<div class="mt-1 flex items-center gap-2">
					<input type="text" id="goalSentence" class="flex-1 block w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md shadow-sm text-gray-600" value="Please select a sentence" readonly>
					<button onclick="readQuestionAloud()" title="Read Goal Aloud" class="p-2 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors">
						<svg class="w-6 h-6" fill="currentColor" viewbox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
					</button>
				</div>
			</div>

			<div class="mt-4">
				<label for="transcription" class="block text-sm font-medium text-gray-700">Your Transcription (Speak or Type)</label>
				<div class="mt-1 flex items-center gap-2">
					<input type="text" id="transcription" class="flex-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" placeholder="Click the mic to speak...">
					<button id="micBtn" onclick="toggleRecording('micBtn')" title="Record Speech" class="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors">
						 <svg class="w-6 h-6" fill="currentColor" viewbox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1.2-9.1c0-.66.54-1.2 1.2-1.2s1.2.54 1.2 1.2v6.1c0 .66-.54 1.2-1.2 1.2s-1.2-.54-1.2-1.2V4.9zm6.7 6.1c0 3-2.54 5.1-5.5 5.1s-5.5-2.1-5.5-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-2.18c3.28-.49 6-3.31 6-6.72h-1.5z" /></svg>
					</button>
				</div>
			</div>
            
			<div class="mt-6 flex flex-col sm:flex-row gap-3">
				<button onclick="analyzeUnitSpeech()" class="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors">
					Analyze Speech with AI
				</button>
				<button onclick="submitAttempt()" class="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors">
					Submit to Teacher Log
				</button>
			</div>
		`;
}

function getCustomPage() {
	currentAnalysis = null; // Clear analysis
	currentGoal = ''; // Clear goal
    
	return `
			<h2 class="text-2xl font-bold text-gray-900 mb-4">✏️ Write Your Own</h2>
			<p class="text-gray-600 mb-4">Type a custom sentence to practice. The AI will analyze it.</p>
            
			<div>
				<label for="customGoalSentence" class="block text-sm font-medium text-gray-700">Your Custom Goal Sentence</label>
				<div class="mt-1 flex items-center gap-2">
					<input type="text" id="customGoalSentence" class="flex-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g., The quick brown fox jumps over the lazy dog" onchange="updateCustomGoal(this.value)">
					<button onclick="readQuestionAloud()" title="Read Goal Aloud" class="p-2 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors">
						<svg class="w-6 h-6" fill="currentColor" viewbox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
					</button>
				</div>
			</div>

			<div class="mt-4">
				<label for="customTranscription" class="block text-sm font-medium text-gray-700">Your Transcription (Speak or Type)</label>
				<div class="mt-1 flex items-center gap-2">
					<input type="text" id="customTranscription" class="flex-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" placeholder="Click the mic to speak...">
					<button id="customMicBtn" onclick="toggleCustomRecording('customMicBtn')" title="Record Speech" class="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors">
						 <svg class="w-6 h-6" fill="currentColor" viewbox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1.2-9.1c0-.66.54-1.2 1.2-1.2s1.2.54 1.2 1.2v6.1c0 .66-.54 1.2-1.2 1.2s-1.2-.54-1.2-1.2V4.9zm6.7 6.1c0 3-2.54 5.1-5.5 5.1s-5.5-2.1-5.5-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-2.18c3.28-.49 6-3.31 6-6.72h-1.5z" /></svg>
					</button>
				</div>
			</div>
            
			<div class="mt-6 flex flex-col sm:flex-row gap-3">
				<button onclick="analyzeCustomSpeech()" class="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors">
					Analyze Speech with AI
				</button>
				<button onclick="submitAttempt()" class="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors">
					Submit to Teacher Log
				</button>
			</div>
		`;
}

// Show specific page
function showPage(page, buttonElement) {
	currentPage = page;
	const content = document.getElementById('pageContent');
    
	// Update navigation active state
	document.querySelectorAll('.nav-btn').forEach(btn => {
		btn.classList.remove('ring-2', 'ring-indigo-500');
	});
	if (buttonElement) {
		buttonElement.classList.add('ring-2', 'ring-indigo-500');
	}
    
	if (page === 'intro') {
		content.innerHTML = getIntroPage();
	} else if (page === 'custom') {
		content.innerHTML = getCustomPage();
	} else {
		const unitData = UNITS[page];
		if (unitData) {
			content.innerHTML = getUnitPage(unitData);
		}
	}
	// Reset analysis display
	document.getElementById("analysisContainer").classList.add("hidden");
	document.getElementById("score").textContent = "...";
	document.getElementById("coloredText").innerHTML = "";
	document.getElementById("aiFeedbackDetails").textContent = "...";
	// NEW: Clear teacher feedback
	const teacherFeedbackEl = document.getElementById('teacherFeedback');
	if (teacherFeedbackEl) {
		teacherFeedbackEl.value = '';
	}
}

// Handle sentence selection
function selectSentence(sentence, buttonElement) {
	currentGoal = sentence;
	document.getElementById('goalSentence').value = sentence;
    
	// Highlight selected sentence
	document.querySelectorAll('#pageContent button').forEach(btn => {
		btn.classList.remove('bg-indigo-100', 'font-semibold');
	});
	buttonElement.classList.add('bg-indigo-100', 'font-semibold');
}
    
// Handle custom sentence update
function updateCustomGoal(sentence) {
	currentGoal = sentence;
}
    
// Trigger analysis for unit pages
function analyzeUnitSpeech() {
	const goal = document.getElementById('goalSentence').value;
	const transcription = document.getElementById('transcription').value;
    
	if (!goal || goal === "Please select a sentence") {
		showMessage("Please select a sentence to practice first.", "warning");
		return;
	}
	analyzeSpeechWithGemini(goal, transcription);
}
    
// Trigger analysis for custom page
function analyzeCustomSpeech() {
	const goal = document.getElementById('customGoalSentence').value;
	const transcription = document.getElementById('customTranscription').value;

	if (!goal) {
		showMessage("Please type in your custom goal sentence first.", "warning");
		return;
	}
	analyzeSpeechWithGemini(goal, transcription);
}
    
// Toggle teacher view
function toggleTeacherView() {
	isTeacherView = !isTeacherView;
	const teacherView = document.getElementById('teacherView');
	const mainGrid = document.getElementById('mainGrid');
	const toggleBtn = document.getElementById('teacherToggle');
    
	if (isTeacherView) {
		teacherView.style.display = 'block';
		mainGrid.classList.remove('lg:grid-cols-2');
		mainGrid.classList.add('lg:grid-cols-2'); // Keep 2 cols
		toggleBtn.classList.add('ring-2', 'ring-indigo-500');
		loadRecordsFromStorage(); // Refresh data
	} else {
		teacherView.style.display = 'none';
		mainGrid.classList.remove('lg:grid-cols-2'); // Go back to 1 col
		toggleBtn.classList.remove('ring-2', 'ring-indigo-500');
	}
}
    
// Show user messages
function showMessage(message, type = 'info', duration = 4000) {
	const msgBox = document.getElementById('messageBox');
	msgBox.textContent = message;
	msgBox.className = 'p-4 rounded-lg'; // Reset classes
    
	if (type === 'error') {
		msgBox.classList.add('bg-red-100', 'text-red-800');
	} else if (type === 'warning') {
		msgBox.classList.add('bg-yellow-100', 'text-yellow-800');
	} else { // info
		msgBox.classList.add('bg-blue-100', 'text-blue-800');
	}
    
	msgBox.classList.remove('hidden');
    
	if (duration > 0) {
		 setTimeout(() => {
			msgBox.classList.add('hidden');
		}, duration);
	}
}

// Hide message
function hideMessage(delay = 0) {
	setTimeout(() => {
		document.getElementById('messageBox').classList.add('hidden');
	}, delay);
}

// --- DATA STORAGE & TEACHER LOG ---

// Load records from localStorage
function loadRecordsFromStorage() {
	const recordsJSON = localStorage.getItem('vocalPointRecords');
	allRecords = recordsJSON ? JSON.parse(recordsJSON) : [];
	updateLog();
	updateAnalytics();
}

// Save records to localStorage
function saveRecordsToStorage() {
	localStorage.setItem('vocalPointRecords', JSON.stringify(allRecords));
	updateLog();
	updateAnalytics();
}
    
// Clear localStorage
function clearLocalStorage() {
	allRecords = [];
	localStorage.removeItem('vocalPointRecords');
	updateLog();
	updateAnalytics();
	showMessage("Local logs cleared successfully.", "info", 2000);
}

// Update the visual log
function updateLog() {
	const logEl = document.getElementById('log');
	if (!logEl) return;
    
	logEl.innerHTML = ''; // Clear log
	if (allRecords.length === 0) {
		logEl.innerHTML = '<p class="text-gray-500">No attempts logged yet.</p>';
		return;
	}

	// Show newest first
	[...allRecords].reverse().forEach(record => {
		const el = document.createElement('div');
		el.className = 'p-3 bg-gray-50 rounded-lg border border-gray-200';
		el.innerHTML = `
				<div class="flex justify-between items-start">
					<span class="font-medium text-gray-800">${record.unit_name}: <span class="font-normal text-gray-600">"${record.sentence_text}"</span></span>
					<span class="text-lg font-bold text-indigo-600">${record.pronunciation_score}%</span>
				</div>
				<div class="text-sm text-gray-500 mt-1">
					<span>${record.student_name} (${record.student_class})</span> |
					<span>${new Date(record.timestamp).toLocaleString()}</span>
				</div>
				<!-- NEW: Show teacher feedback -->
				${record.teacher_feedback ? `<div class="mt-2 p-2 bg-yellow-50 text-yellow-800 text-sm rounded-md"><strong>Note:</strong> ${record.teacher_feedback}</div>` : ''}
			`;
		logEl.appendChild(el);
	});
}
    
// Update the analytics panel
function updateAnalytics() {
	const totalAttemptsEl = document.getElementById('totalAttempts');
	const avgScoreEl = document.getElementById('avgScore');
	const commonMistakesEl = document.getElementById('commonMistakes');
	// NEW: Get new elements
	const unitsPracticedEl = document.getElementById('unitsPracticed');
	const recentPerformanceEl = document.getElementById('recentPerformance');


	if (!totalAttemptsEl) return; // In case view isn't open
    
	const numAttempts = allRecords.length;
	totalAttemptsEl.textContent = numAttempts;
    
	if (numAttempts === 0) {
		avgScoreEl.textContent = 'N/A';
		commonMistakesEl.innerHTML = '<p class="text-gray-500">No data.</p>';
		unitsPracticedEl.textContent = '0';
		recentPerformanceEl.innerHTML = '';
		return;
	}

	// Calculate Average Score
	const totalScore = allRecords.reduce((sum, rec) => sum + rec.pronunciation_score, 0);
	const avgScore = (totalScore / numAttempts).toFixed(1);
	avgScoreEl.textContent = `${avgScore}%`;
    
	// Find Common Mistakes
	const mistakeCounts = {};
	allRecords.forEach(record => {
		try {
			// Parse the JSON string
			const analysis = JSON.parse(record.word_analysis);
			analysis.forEach(word => {
				if (word.status === 'mispronounced' || word.status === 'omitted') {
					const w = word.word.toLowerCase().replace(/[^a-z]/g, ''); // Clean word
					if(w) {
					   mistakeCounts[w] = (mistakeCounts[w] || 0) + 1;
					}
				}
			});
		} catch(e) {
			console.warn("Could not parse word analysis for record:", record);
		}
	});
    
	const sortedMistakes = Object.entries(mistakeCounts)
		.sort(([,a],[,b]) => b - a)
		.slice(0, 5); // Top 5
            
	if (sortedMistakes.length > 0) {
		commonMistakesEl.innerHTML = sortedMistakes
			.map(([word, count]) => `<div>${word} <span class="text-gray-500">(${count} times)</span></div>`)
			.join('');
	} else {
		commonMistakesEl.innerHTML = '<p class="text-gray-500">No common mistakes found!</p>';
	}

	// NEW: Calculate Units Practiced
	const practicedUnits = new Set(allRecords.map(r => r.unit_name));
	unitsPracticedEl.textContent = practicedUnits.size;

	// NEW: Show Recent Performance (last 5)
	recentPerformanceEl.innerHTML = '';
	const recentRecords = allRecords.slice(-5);
	recentRecords.forEach(record => {
		const bar = document.createElement('div');
		bar.className = 'perf-bar';
		bar.title = `${record.unit_name}: ${record.pronunciation_score}%`;
        
		const fill = document.createElement('div');
		fill.className = 'perf-bar-fill';
		fill.style.height = `${record.pronunciation_score}%`;
        
		bar.appendChild(fill);
		recentPerformanceEl.appendChild(bar);
	});
}

// Submit an attempt to the log
async function submitAttempt() {
	const studentName = document.getElementById('studentName').value || 'Unknown Student';
	const studentClass = document.getElementById('studentClass').value || 'N/A';
	const unitTitle = UNITS[currentPage]?.title || "Custom Practice";
	// NEW: Get teacher feedback
	const teacherFeedback = document.getElementById('teacherFeedback')?.value || "";

	if (!currentGoal) {
		 showMessage("Please select a sentence first.", "warning");
		 return;
	}
    
	if (!currentAnalysis) {
		showMessage("Please analyze your speech first before submitting.", "warning");
		return;
	}
    
	const now = new Date();
	const record = {
		timestamp: now.toISOString(),
		student_name: studentName,
		student_class: studentClass,
		unit_name: unitTitle,
		sentence_text: currentGoal,
		pronunciation_score: currentAnalysis.score,
		word_analysis: JSON.stringify(currentAnalysis.analysis), // Store as JSON string
		teacher_feedback: teacherFeedback, // NEW: Add feedback
		session_date: now.toLocaleDateString()
	};
    
	// 1. Save to localStorage
	allRecords.push(record);
	saveRecordsToStorage();
	showMessage("Attempt saved to local log!", "info", 2000);
    
	// 2. Try to save to Google Sheet
	if (!GOOGLE_SCRIPT_URL) {
		console.warn("GOOGLE_SCRIPT_URL is not set. Skipping Google Sheet submission.");
		return;
	}

	const payload = {
		action: "submitAttempt",
		payload: record
	};

	try {
		showMessage("Submitting to Google Sheet...", "info");
		const response = await fetch(GOOGLE_SCRIPT_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			throw new Error(`Server error: ${response.status}`);
		}

		const result = await response.json();

		if (result.result === "success") {
			showMessage("Successfully submitted to Google Sheet!", "info", 3000);
		} else {
			throw new Error(result.message);
		}
        
	} catch (error) {
		console.error("Error submitting to Google Sheet:", error);
		showMessage(`Local log saved. Failed to submit to Google Sheet: ${error.message}`, "error");
	}
}


// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', (e) => {
	// Toggle teacher view with 'T'
	if (e.key === 't' && (e.metaKey || e.ctrlKey)) {
		e.preventDefault();
		toggleTeacherView();
	}
	// NEW: Advanced shortcuts
	else if (e.key === 'Enter' && !e.isComposing) {
		// Check if user is typing in an input
		const activeEl = document.activeElement;
		if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
			return; // Don't block typing
		}
		e.preventDefault();
		// Trigger analysis
		if (currentPage === 'custom') {
			analyzeCustomSpeech();
		} else if (currentPage.startsWith('unit')) {
			analyzeUnitSpeech();
		}
	}
	else if (e.key === 'f' || e.key === 'F') {
		 if (e.metaKey || e.ctrlKey) {
			e.preventDefault();
			document.getElementById('teacherFeedback')?.focus();
		 }
	}
});

// --- APP INITIALIZATION ---
    
// Unit data
const UNITS = {
	'unit1': { title: 'Unit 1: Welcome!', sentences: ['Hello!', 'How are you?', 'My name is...', 'What\'s your name?', 'Nice to meet you.'] },
	'unit2': { title: 'Unit 2: Every Day', sentences: ['I wake up at seven o\'clock.', 'She brushes her teeth.', 'They eat breakfast in the kitchen.', 'He goes to work by bus.', 'We watch TV in the evening.'] },
	'unit3': { title: 'Unit 3: Right Now', sentences: ['I am talking to you.', 'You are reading this sentence.', 'He is listening to music.', 'What are you doing?', 'It is raining outside.'] },
	'unit4': { title: 'Unit 4: Year In, Year Out', sentences: ['My birthday is in June.', 'What time is it?', 'It\'s a quarter past three.', 'Today is Wednesday.', 'I always visit my grandmother on Sundays.'] },
	'unit5': { title: 'Unit 5: My New House', sentences: ['There is a big sofa in the living room.', 'There are two bedrooms.', 'Is there a garden?', 'The kitchen is next to the dining room.', 'I don\'t have a garage.'] },
	'unit6': { title: 'Unit 6: Food, Please!', sentences: ['I would like a cheeseburger and fries.', 'Can I have a cup of coffee, please?', 'Do you have any vegetarian dishes?', 'I\'m allergic to peanuts.', 'The bill, please.'] },
	'unit7': { title: 'Unit 7: Out And About', sentences: ['Where is the nearest supermarket?', 'Go straight on, then turn left.', 'Excuse me, how do I get to the train station?', 'It\'s opposite the bank.', 'I\'m looking for the post office.'] },
	'unit8': { title: 'Unit 8: Yesterday', sentences: ['I went to the park yesterday.', 'We played football.', 'Did you see the movie?', 'She wasn\'t at home.', 'They didn\'t come to the party.'] },
	'unit9': { title: 'Unit 9: On Holiday', sentences: ['We are flying to Paris next week.', 'I\'m going to pack my suitcase.', 'Are you staying in a hotel?', 'She bought a lot of souvenirs.', 'I love traveling by train.'] },
	'unit10': { title: 'Unit 10: World Around Us', sentences: ['The elephant is bigger than the lion.', 'This is the most expensive car in the world.', 'A cheetah can run very fast.', 'The Pacific Ocean is the largest ocean.', 'What is the capital of Japan?'] }
};
    
// Run on page load
document.addEventListener('DOMContentLoaded', () => {
	// Load initial data
	loadRecordsFromStorage();
    
	// NEW: Setup Speech Recognition
	setupSpeechRecognition();

	// Find the intro button and call showPage with it
	const introButton = document.querySelector('.nav-btn[onclick*="\'intro\'"]');
	showPage('intro', introButton);
});