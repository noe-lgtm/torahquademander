# Le Cours · Moadon

Site participatif du cours de Torah. Le public ouvre un lien, vote, envoie des questions et joue au quiz sur son téléphone. L’équipe ouvre les séances et le quiz depuis `/#admin`. L’écran de projection est accessible depuis l’onglet du quiz de l’équipe.

## Installation depuis le navigateur

1. **GitHub.** Créer un dépôt privé et initialiser le dépôt. Décompresser l’archive du projet. Dans le dépôt, choisir **Add file → Upload files** et déposer le contenu du dossier extrait pour placer `package.json`, `vercel.json`, `api/`, `lib/`, `public/` et `supabase/` directement à la racine. Enregistrer les fichiers sur la branche principale.
2. **Supabase.** Créer un projet dédié et ouvrir **SQL Editor**. Exécuter le contenu de `supabase/setup.sql`. Le script crée la table de l’application et le stockage audio privé. Relever l’URL du projet et sa clé secrète `sb_secret_…` dans **Settings → API Keys**.
3. **Vercel.** Ajouter un projet et importer le dépôt GitHub. Garder le dossier racine du dépôt et le preset **Other** si demandé. Renseigner les variables ci-dessous comme variables serveur avant de déployer. La configuration du dépôt définit le dossier statique et les fonctions.
4. **Premier cours.** Ouvrir l’adresse de production fournie par Vercel, cliquer sur **Équipe** et saisir le code choisi. Publier un vote et créer le quiz. Vérifier le parcours depuis un deuxième navigateur ou un smartphone avant de partager l’adresse de production.

| Variable Vercel | Valeur |
| --- | --- |
| `SUPABASE_URL` | URL du projet, du type `https://identifiant.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Clé secrète serveur du projet Supabase |
| `MOADON_ADMIN_SECRET` | Code administrateur aléatoire d’au moins 24 caractères |
| `OPENAI_API_KEY` | Clé d’un projet OpenAI API autorisé et facturé. Nécessaire pour transcrire et générer les ressources |
| `OPENAI_TRANSCRIBE_MODEL` | Facultatif. Valeur par défaut `gpt-transcribe` |
| `OPENAI_TEXT_MODEL` | Facultatif. Valeur par défaut `gpt-4.1-mini` |

Ne place aucune clé dans le dépôt ou dans du code chargé par le navigateur. En cas de changement de variable, redéploie le projet depuis Vercel.

## Préparer et animer un cours

- Crée la séance avec deux thèmes ou plus et une date limite pour chaque phase. Le délai du second tour s’ajoute à la clôture du premier tour. Quand plusieurs thèmes arrivent en tête, le second tour s’ouvre entre eux. Si le second tour donne une égalité ou qu’aucune personne ne vote, l’équipe choisit parmi les thèmes concernés.
- Les questions, les soutiens et les commentaires sont publics. Le back-office permet de masquer une contribution. Les idées et les retours sont réservés à l’équipe et à leur auteur. L’équipe peut rouvrir les fils et ouvrir le chat indépendamment.
- Enregistre le quiz en salle avant le cours. Ouvre la salle du quiz, puis lance les questions et ferme les réponses à ton rythme. L’onglet de projection affiche le nombre de réponses, puis les résultats et le classement. Chaque réponse est validée dès le choix du participant.
- Avec l’onglet **Audio et ressources** ouvert sur l’appareil de l’intervenant, autorise le micro et démarre l’enregistrement. Préviens les personnes susceptibles d’être enregistrées. Garde la page active. Après l’arrêt, le navigateur transfère les segments dans Supabase. Si le transfert s’interrompt, le bouton de reprise renvoie les segments conservés sur cet appareil.
- Lance la génération sur l’enregistrement voulu. L’audio est transcrit, puis utilisé pour préparer une fiche et un quiz de révision. Relis les citations, les termes techniques et les bonnes réponses. Publie uniquement une fois la relecture terminée. La transcription et le fichier audio restent internes.
- Archive le cours pour ouvrir le prochain vote. Les cours passés et les ressources publiées restent consultables.

## Comportement et vérifications

Le vote et l’espace personnel s’appuient sur un identifiant propre au navigateur. Effacer les cookies retire l’accès à cet historique sur l’appareil. Une navigation privée ou un autre navigateur représente un autre participant. Les choix de date du back-office utilisent l’heure de Paris.

Le mode `?demo=1` sur l’adresse du site utilise des données d’exemple stockées dans le navigateur. Il permet d’essayer l’interface et le back-office indépendamment de Supabase. La démonstration ne transcrit pas et ne crée pas de ressources à partir de l’audio. Les données créées dans la démo et les données de production sont distinctes.

Le chat et le quiz vérifient les changements toutes les 2,4 secondes quand l’onglet est visible. La version actuelle cible un groupe de cours. Tester avec la taille de salle prévue avant un événement. Les changements de phase sont calculés selon l’heure de clôture à chaque lecture ou action du site. Pour une première séance réelle, tester aussi le micro, les transferts et la génération sur le navigateur de l’animateur.

### Documentation des services

- [Vercel – Fonctions Node.js](https://vercel.com/docs/functions/runtimes/node-js)
- [Supabase – Clés d’API](https://supabase.com/docs/guides/getting-started/api-keys)
- [OpenAI – Transcription de fichiers](https://developers.openai.com/api/docs/guides/speech-to-text)
