# Élyssia — guide de mise en route

Cette archive est la version connectable d’Élyssia. Elle remplace la démo statique actuellement sur Netlify; elle ne met pas à jour le site publiée automatiquement.

Cette version est un MVP connecté : authentification par e-mail/mot de passe, profils enregistrés en base, photos, likes, matchs réciproques, messages et signalements. Il faut connecter TON projet Supabase pour qu'il fonctionne en ligne.

## Étape 1 — Créer la base de données

1. Va sur https://supabase.com et crée un compte, puis **New project**.
2. Choisis un nom comme `elyssia`, un mot de passe de base de données fort et une région proche de tes utilisateurs.
3. Quand le projet est prêt, ouvre **SQL Editor**.
4. Ouvre le fichier `supabase/schema.sql` fourni avec ce projet, copie tout son contenu et exécute-le dans SQL Editor.
5. Dans Supabase, ouvre **Project Settings / API** ou **Connect** et copie le Project URL et la clé **publishable** (`sb_publishable_...`, ou la clé `anon` legacy si c'est celle proposée par ton projet).

Ne partage jamais le mot de passe de la base, une clé `service_role` ou une clé secrète. Le site ne doit utiliser que l'URL et la clé publishable/anon.

## Étape 2 — Ajouter les clés au projet

À la racine du dossier, crée un fichier nommé `.env.local` (sans le publier) et mets :

```env
VITE_SUPABASE_URL=https://TON_PROJET.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TA_CLE
```

Remplace les deux valeurs par celles de TON projet Supabase.

## Étape 3 — Tester sur un ordinateur

Installe Node.js LTS depuis https://nodejs.org si nécessaire. Dans le dossier du projet, ouvre un terminal et exécute :

```bash
npm install
npm run dev
```

Ouvre l'adresse locale affichée par Vite. Teste la création d'un compte avec ton adresse e-mail. Selon la configuration Auth, il faudra confirmer l'adresse avant de se connecter.

## Étape 4 — Paramètres Supabase importants

Dans **Authentication → URL Configuration**, ajoute l'URL finale de Netlify dans **Redirect URLs**. Pour les tests locaux, ajoute aussi `http://localhost:5173/**`.

Dans **Authentication → Providers → Email**, choisis si tu veux exiger la confirmation d'e-mail. Pour un vrai service public, conserve la confirmation et configure des e-mails fiables. Configure aussi les limites anti-abus/captcha avant de lancer une campagne publique.

## Étape 5 — Publier sur Netlify

1. Mets le dossier du projet dans un dépôt GitHub privé (ne mets jamais `.env.local` dans Git).
2. Connecte-toi sur https://app.netlify.com et importe ce dépôt via **Add new site / Import an existing project**.
3. Paramètres de build : commande `npm run build`, dossier de publication `dist`.
4. Dans **Project configuration → Environment variables**, ajoute :
   - `VITE_SUPABASE_URL` = ton URL Supabase
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = ta clé publishable/anon
5. Lance un nouveau déploiement.
6. Copie l'adresse `https://....netlify.app` fournie et ajoute-la dans Supabase → Authentication → URL Configuration, comme URL de site et URL de redirection.

Tu peux aussi utiliser Netlify Drop si ton interface accepte le dossier du projet, mais le déploiement lié à Git est préférable pour mettre à jour le site facilement.

## Fonctionnalités incluses

- Inscription et connexion par e-mail/mot de passe.
- Profil avec nom affiché, âge (18+), ville, bio et photo.
- Découverte et filtres par ville/âge.
- Likes et match automatique si les deux personnes se likent.
- Messagerie accessible aux membres d'un match.
- Signalement d'un profil.
- Politiques de sécurité RLS sur les tables et sur les photos.

## Avant d'inviter le public

Ceci est une première version fonctionnelle, pas encore un service prêt à grande échelle. Fais tester par quelques adultes consentants. Ajoute ensuite : procédure de blocage et modération, politique de confidentialité, conditions d'utilisation, suppression de compte/données, contrôle anti-spam, vérification de sécurité et tests sur plusieurs comptes. Ne présente pas de profils fictifs comme de vrais membres. Le site ne doit être utilisé que par des adultes.
