Keyboard Typer – Olivier Michalski ✨

A typing trainer app that adapts to each user. It tracks your typing sessions, builds a personal profile of your weak letter combos (bigrams), and picks new texts to help you improve. There's also an admin panel to view users, stats, and manage difficulty.

Up & Running 🏃‍➡️

Everything runs locally in Docker.

1. Setup

Everything runs inside docker

Copy the .env.template file and rename it to .env

Inside it, set ADMIN_PASSWORD=admin123

Then run:

docker compose up --build


Open the app at

http://localhost:3000

2. Admin login

Go to /admin.html

Enter the password: admin123

You can now load users, change difficulty, view charts, and delete users.

Features ✅

Register / Login with secure passwords

Tracks every keystroke (backspaces, timing, etc.)

Calculates WPM, accuracy, and weak bigrams

Stores everything in PostgreSQL (per user)

Picks new texts based on your weak points

Admin dashboard with live charts (WPM, accuracy, bigrams)

Easy / Normal / Hard training modes

Sources 🗃️
Tutorials & Articles

Typing Speed Calculation – GeeksForGeeks
→ Used to calculate WPM & accuracy
https://www.geeksforgeeks.org/design-a-typing-speed-test-game-using-javascript/

Recording key events in JS – StackOverflow
→ Used to log typing events in app.js
https://stackoverflow.com/questions/18893390/how-to-efficiently-record-user-typing-using-javascript

ChatGPT (OpenAI)

Used throughout the project for debugging, fixes, and writing some backend logic (like WPM calculation and text selection based on bigrams)

Share link: chatgpt session is too long so i wont be able to share the link.

Ill provide relevant pictures instead

Olivier Michalski
Development V