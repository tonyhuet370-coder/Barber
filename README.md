# Barber Shop - Site vitrine + prise de rendez-vous

Ce projet contient:
- une page vitrine avec galerie d'images
- un bouton et un formulaire de prise de rendez-vous
- un calendrier (date + creneaux disponibles)
- stockage des rendez-vous (email client inclus) dans SQLite
- envoi d'un email de confirmation au client
- envoi d'un email de notification au boss
- notification instantanee sur la page admin (/admin)

## Installation

1. Installer Node.js
2. Dans le dossier du projet:

```bash
npm.cmd install
```

## Configuration e-mail

1. Copier `.env.example` vers `.env`
2. Completer les variables SMTP Gmail:

```env
PORT=3000
OWNER_EMAIL=boss@monsalon.com
MAIL_FROM=votre_adresse_gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=votre_adresse_gmail
SMTP_PASS=votre_mot_de_passe_application_google
SMTP_FAMILY=4
```

Notes Gmail:
- `SMTP_PASS` doit etre un mot de passe d'application Google, pas ton mot de passe Gmail habituel.
- `MAIL_FROM` peut etre la meme adresse que `SMTP_USER` pour les tests.
- Sur Railway, `SMTP_FAMILY=4` aide a eviter les timeouts reseau avec Gmail.
- Utilise de preference `SMTP_PORT=465` avec Gmail sur Railway.
- Pense a verifier le dossier spam pendant les essais.

Si SMTP n'est pas configure, les e-mails ne partiront pas.

## Lancer le serveur

```bash
npm.cmd start
```

Le site client sera disponible sur:
- http://localhost:3000/

Le panneau du boss sera disponible sur:
- http://localhost:3000/admin

## Ajouter les images du salon

Place les fichiers suivants dans `public/images`:
- `salon-1.jpg`
- `salon-2.jpg`
- `salon-3.jpg`

## Base de donnees

La base SQLite est creee automatiquement dans le fichier `barber.db`.
