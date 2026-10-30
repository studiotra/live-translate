Now that the multi-window architecture and IPC are set up, let's implement real-time Speech-to-Text (STT) using Deepgram. Please update the application based on the following requirements:

1. Dependencies & Environment:
   - Install the Deepgram SDK (`@deepgram/sdk`) or use raw WebSockets for the live streaming connection.
   - Read the Deepgram API key from a `.env` file (e.g., `VITE_DEEPGRAM_API_KEY`). 

2. Microphone Capture (Main Controller):
   - When the user clicks the "Start Recording" button in the Main Controller, request microphone permissions and capture the audio stream using `navigator.mediaDevices.getUserMedia({ audio: true })`.
   - Make sure to handle potential errors (e.g., microphone not found, permission denied).

3. Deepgram Live Streaming API:
   - Send the captured audio stream to Deepgram's real-time WebSocket API.
   - Configure the Deepgram connection parameters for a meeting environment: use the `nova-2` model, enable `punctuate: true`, `interim_results: true`, and configure it to handle English/Korean (use auto-language detection if applicable, or set a default).

4. Real-time IPC Updates to Window A:
   - As Deepgram returns transcription events (both interim and final transcripts), immediately send this text data via IPC from the Main Controller to "Window A" (Original Text Window).
   - Differentiate between 'interim' (still talking) and 'final' (completed sentence) results so the UI can render them smoothly.

5. Window A UI (Live Captions):
   - Update Window A's React component to receive the live transcript stream.
   - Display the text like live closed captions. It should auto-scroll to the bottom as new sentences are added. 
   - Style interim results slightly transparent (e.g., gray) and final results solid white.

6. Stop Recording:
   - When "Stop Recording" is clicked, cleanly stop the microphone audio tracks, close the Deepgram WebSocket connection, and add a visual indicator in Window A that recording has stopped.

   Now that the real-time STT is working and Window A is displaying the transcript, let's implement the real-time translation pipeline using OpenAI. Please update the application based on the following requirements:

   ------------------------------------------------------------------------------------------------
   *3단계*
1. Dependencies & Environment:
   - Install the OpenAI SDK (`openai`).
   - Read the OpenAI API key from the `.env` file (e.g., `VITE_OPENAI_API_KEY`).

2. LLM Integration & Prompting (Main Controller):
   - Whenever the STT service returns a **final** transcript sentence, send that specific text to the OpenAI API asynchronously.
   - Use the `gpt-4o-mini` model for fast, low-latency responses.
   - Use the following System Prompt strictly to ensure domain-specific accuracy:
     "You are an expert simultaneous interpreter specializing in the clean energy and renewable sector. Accurately translate terms related to carbon capture, hydrogen fuel cells, grid modernization, and ESG policies. Maintain a professional meeting tone. If the input is in Korean, translate it to English. If the input is in English, translate it to Korean. Output ONLY the translated text without any conversational filler, quotes, or explanations."

3. Real-time IPC Updates to Window B:
   - Once the translation response is received from OpenAI, send it immediately via IPC to "Window B" (Translated Text Window).
   - Crucial: Ensure non-blocking asynchronous calls. The Main Controller must continue processing the STT stream seamlessly while waiting for OpenAI's response.

4. Window B UI (Translated Captions):
   - Update Window B's React component to receive and display the incoming translated text.
   - It should function like live closed captions, auto-scrolling to the bottom as new translations arrive.
   - Add some visual spacing (margin/padding) between sentences so the translated blocks are easy to read at a glance.