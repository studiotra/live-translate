
1. Project Setup:
   - Use Electron with React (or Vite + Electron + React setup for fast building).
   - Use Tailwind CSS for styling.

2. Window Management (Crucial):
   - When the app launches, open a 'Main Controller' window. This window should have a simple UI with a "Start Recording" button, a "Stop Recording" button, and an "Open Translators" button.
   - When the user clicks "Open Translators", spawn two separate, independent borderless windows (frameless windows):
     - Window A: "Original Text Window" (To display the source language later).
     - Window B: "Translated Text Window" (To display the target language later).

3. Window Behaviors (for Window A and B):
   - Both Window A and Window B must be 'Always on Top'.
   - They should have a semi-transparent dark background (e.g., rgba(0, 0, 0, 0.7)) and white text color for high contrast.
   - Even though they are borderless, they must be draggable so the user can position them freely on the screen. Add a subtle top drag bar inside each window to allow this.
   - Put placeholder text inside them: "Waiting for speech..." in Window A, and "Waiting for translation..." in Window B.

4. Inter-Process Communication (IPC):
   - Set up the basic IPC structure. The Main Controller window needs to be able to send mock text messages to Window A and Window B. 
   - Add a "Test Send" button in the Main Controller that sends "Test Source" to Window A and "Test Translation" to Window B, updating their UI just to prove the communication works.

Please generate the necessary files (main.js, preload scripts, React components, package.json dependencies) and explain how to install and run the app.