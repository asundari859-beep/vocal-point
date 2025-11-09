/*
  Paste this code into the Apps Script editor (Extensions > Apps Script)
  for your Google Sheet.
*/

// This is the sheet name it will write to. 
const SHEET_NAME = "Sheet1";

// These models will be used for the API calls
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

/**
 * Retrieves the stored Gemini API key from Script Properties.
 * This is the secure way to store secrets.
 */
function getGeminiApiKey() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
}

/**
 * This function runs when your Web App URL receives a POST request.
 * It now acts as a router, checking the 'action' property.
 */
function doPost(e) {
  // Robust POST handler: parse body and route to the appropriate action handler.
  try {
    var body = null;
    if (e && e.postData && e.postData.contents) {
      body = e.postData.contents;
    } else if (e && e.parameter && e.parameter.data) {
      // Accept 'data' parameter as fallback for testing, but prefer POST body.
      body = e.parameter.data;
    }

    if (!body) {
      return createJsonResponse({ "result": "error", "message": "Missing request body. Ensure the client sends a POST with a JSON body and that the web app is deployed to allow anonymous POSTs." });
    }

    var data;
    try {
      data = JSON.parse(body);
    } catch (err) {
      return createJsonResponse({ "result": "error", "message": "Invalid JSON payload: " + err.message });
    }

    try {
      switch (data.action) {
        case "submitAttempt":
          return createJsonResponse(handleSubmitAttempt(data));
        case "analyzeSpeech":
          return createJsonResponse(handleAnalyzeSpeech(data));
        case "getTTS":
          return createJsonResponse(handleGetTTS(data));
        default:
          return createJsonResponse({ "result": "error", "message": "Invalid action." });
      }
    } catch (err) {
      return createJsonResponse({ "result": "error", "message": "Server error: " + err.message });
    }
  } catch (error) {
    return createJsonResponse({ "result": "error", "message": "Server error: " + error.message });
  }
}

/**
 * Creates a JSON response to send back to the client.
 */
function createJsonResponse(data) {
  // Always return JSON and allow cross-origin requests from the client.
  const jsonString = JSON.stringify(data);
  return ContentService
    .createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*');
}

// --- ACTION HANDLERS ---

/**
 * Handles saving a new attempt to the Google Sheet.
 */
function handleSubmitAttempt(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const doc = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = doc.getSheetByName(SHEET_NAME);
    
    // The 'payload' property contains the record
    const record = data.payload; 
    
    const newRow = [
      record.timestamp,
      record.student_name,
      record.student_class,
      record.unit_name,
      record.sentence_text,
      record.pronunciation_score,
      record.word_analysis, // This will be stored as a JSON string
      record.teacher_feedback,
      record.session_date
    ];
    
    sheet.appendRow(newRow);
    
    // Return a plain object; the wrapper will convert to JSON/JSONP
    return { "result": "success", "action": "submitAttempt" };

  } catch (error) {
    return { "result": "error", "message": error.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handles calling the Gemini API for speech analysis.
 */
function handleAnalyzeSpeech(data) {
  const API_KEY = getGeminiApiKey();
  if (!API_KEY) {
    return { "result": "error", "message": "API key not set on server." };
  }

  const { goal, transcription } = data;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
  
  const systemPrompt = getSystemPrompt(); // Using the helper function below
  const userQuery = `
      Goal Sentence: "${goal}"
      Student's Transcription: "${transcription}"
  `;

  const payload = {
    contents: [{ role: "user", parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          "score": { "type": "NUMBER" },
          "feedback": { "type": "STRING" },
          "analysis": {
            "type": "ARRAY",
            "items": {
              "type": "OBJECT",
              "properties": {
                "word": { "type": "STRING" },
                "status": { "type": "STRING" },
                "note": { "type": "STRING" }
              },
              "required": ["word", "status"]
            }
          }
        },
        "required": ["score", "feedback", "analysis"]
      }
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // IMPORTANT: to catch errors
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  if (responseCode === 200) {
    try {
      const geminiResponse = JSON.parse(responseBody);
      if (!geminiResponse.candidates || !geminiResponse.candidates[0]?.content?.parts[0]?.text) {
        throw new Error("Invalid response structure from Gemini API");
      }
      const jsonText = geminiResponse.candidates[0].content.parts[0].text;
      // Parse the JSON response from Gemini and validate it
      const parsedAnalysis = JSON.parse(jsonText);
      if (!parsedAnalysis.score || !parsedAnalysis.feedback || !parsedAnalysis.analysis) {
        throw new Error("Missing required fields in AI response");
      }
      // Return a plain object; wrapper will create JSON/JSONP
      return { "result": "success", "action": "analyzeSpeech", "data": parsedAnalysis };
    } catch (error) {
      return { "result": "error", "message": "Error processing AI feedback: " + error.message };
    }
  } else {
    // Pass the error message back to the client
    return { "result": "error", "message": `Gemini API Error ${responseCode}: ${responseBody}` };
  }
}

/**
 * Handles calling the Gemini TTS API.
 */
function handleGetTTS(data) {
  const API_KEY = getGeminiApiKey();
  if (!API_KEY) {
    return { "result": "error", "message": "API key not set on server." };
  }

  const { text } = data;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${API_KEY}`;

  const payload = {
    contents: [{
      parts: [{ text: `Say in a clear, friendly, American-English voice: ${text}` }]
    }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
      }
    },
    model: TTS_MODEL
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();
  
  if (responseCode === 200) {
     // Pass the full Gemini response back as a plain object
    return { "result": "success", "action": "getTTS", "data": JSON.parse(responseBody) };
  } else {
    return { "result": "error", "message": `Gemini TTS Error ${responseCode}: ${responseBody}` };
  }
}

/**
 * Helper function: Returns the system prompt.
 */
function getSystemPrompt() {
  return `
      You are an expert English Language (ESL) pronunciation coach.
      A student is practicing speaking a "goal sentence".
      The student will provide their "transcription" (what they said).
      Your task is to:
      1.  Compare the student's "transcription" to the "goal sentence".
      2.  Analyze it for accuracy, omitted words, and mispronounced words.
      3.  Provide a pronunciation score from 0 to 100. (e.g., 95)
      4.  Provide detailed, constructive, and friendly feedback in a single paragraph. Focus on the *most important* areas for improvement.
      5.  Return a JSON object with:
          - "score": (Number) The pronunciation score.
          - "feedback": (String) The detailed feedback paragraph.
          - "analysis": (Array) An array of objects, one for each word in the *goal sentence*.
              - "word": (String) The word from the goal sentence.
              - "status": (String) One of three values:
                  - "correct": The word was pronounced correctly.
                  - "mispronounced": The word was in the transcription but likely mispronounced or incorrect.
                  - "omitted": The word was missing from the transcription.
              - "note": (String) A brief note *only* for "mispronounced" or "omitted" words.
      Rules:
      - Be encouraging and supportive.
      - If the transcription is perfect, give a 100 score and positive feedback.
      - If the transcription is wildly different, give a low score and gentle feedback.
      - Keep the feedback concise and focused on 1-2 key points.
  `;
}