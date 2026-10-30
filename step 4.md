*step 4*
1. Transcript Accumulation (Main Controller):
   - Maintain a running log of the full conversation (both Original and Translated texts) in the Main Controller state or a local variable during the recording.

2. Summarization Trigger:
   - When the user clicks the "Stop Recording" button, take the entire accumulated transcript and send it to the OpenAI API.
   - Use the `gpt-4o` model for high-quality summarization (it handles context better than the mini model).

3. Summarization Prompting:
   - Use the following System Prompt for the summarization task:
     "You are an expert executive assistant for a clean energy company. Your task is to summarize the provided meeting transcript. The meeting heavily involves clean energy, carbon capture, grid modernization, and ESG topics. 
     Format the output STRICTLY in Markdown with the following structure:
     # Meeting Summary
     **Date:** [Current Date]
     ## Core Topics Discussed
     - [Bullet points of main clean energy topics]
     ## Key Decisions
     - [Bullet points of decisions made]
     ## Action Items
     - [Bullet points of tasks to be done, who will do them if mentioned]"

4. Saving to Local Desktop (Electron Main Process):
   - Once the summary string is generated, send it via IPC from the renderer process to the Electron Main process (`main.js`).
   - In `main.js`, use Node.js `fs` (File System) and `path` modules to automatically save the Markdown string as a `.md` file.
   - Save the file to the user's Desktop directory (use `app.getPath('desktop')`).
   - The filename should be dynamic, for example: `CleanEnergy_Meeting_Summary_YYYY-MM-DD_HHMM.md`.

5. User Feedback UI:
   - Add a loading indicator in the Main Controller UI while the summary is being generated.
   - Show a success message (e.g., "Summary saved to Desktop!") once the file writing is complete.