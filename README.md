# TeachMe v5 — GitHub Pages + Firebase

Static GitHub Pages frontend. Firebase provides Authentication, Firestore, and Storage.

## Setup
1. Create a Firebase project.
2. Add a Web App.
3. Copy its config into `firebase-config.js`.
4. Enable Authentication -> Email/Password.
5. Create Firestore Database.
6. Create Storage.
7. Paste `firebase/firestore.rules` into Firestore Rules and publish.
8. Paste `firebase/storage.rules` into Storage Rules and publish.
9. Upload this folder to GitHub.
10. GitHub repository -> Settings -> Pages -> Deploy from branch -> main -> root.
11. Firebase Authentication -> Settings -> Authorized domains: add your `USERNAME.github.io`.

## Important
The included signup screen lets a user choose Student or Teacher for easy initial testing. Do not use that as a production teacher authorization system; production teacher accounts should be granted by an administrator.

Videos are uploaded directly from the browser to Firebase Storage, then the download URL is stored with the lesson in Firestore. Maximum configured video size is 500 MB.

The real-name login uses a deterministic email-shaped Firebase Auth identifier. No mailbox is required and no email is sent.

Never put Firebase service-account/private keys in the website.
