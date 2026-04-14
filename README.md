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
2. Completer les variables SMTP:

```env
PORT=3000
OWNER_EMAIL=boss@monsalon.com
MAIL_FROM=noreply@monsalon.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_user
SMTP_PASS=your_password
```

Si SMTP n'est pas configure, les e-mails seront seulement affiches dans les logs du serveur (mode dev).

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
