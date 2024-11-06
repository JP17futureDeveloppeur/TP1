import { Octokit } from "octokit";
import OpenAI from "openai";
const fetch = require("node-fetch");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  request: { fetch },
});

// Fonction simplifiée pour obtenir les informations du dépôt
const getRepoInfo = () => {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
  return {
    owner,
    repo,
    sha: process.env.GITHUB_SHA,
  };
};

// Fonction pour récupérer les fichiers modifiés dans le push
async function getChangedFiles() {
  const { owner, repo, sha } = getRepoInfo();

  try {
    const { data: commit } = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: sha,
    });
    return commit.files;
  } catch (error) {
    console.error("Erreur lors de la récupération des fichiers:", error);
    throw error;
  }
}

// Fonction pour analyser le code avec GPT
async function analyzeCode(codeContent, fileName) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Tu es un expert en développement qui analyse le code pour suggérer des améliorations.
                    Concentre-toi sur:
                    1. La lisibilité du code
                    2. Les bonnes pratiques
                    3. Les optimisations possibles
                    4. La sécurité
                    5. La maintenabilité
                    Donne des suggestions concrètes et constructives.`,
        },
        {
          role: "user",
          content: `Analyse ce code du fichier ${fileName} et suggère des améliorations:\n\n${codeContent}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Erreur lors de l'analyse avec GPT:", error);
    return `Erreur lors de l'analyse : ${error.message}`;
  }
}

// Fonction pour poster un commentaire sur le commit
async function postComment(suggestions) {
  const { owner, repo, sha } = getRepoInfo();

  try {
    await octokit.rest.repos.createCommitComment({
      owner,
      repo,
      commit_sha: sha,
      body: suggestions,
    });
  } catch (error) {
    console.error("Erreur lors de la publication du commentaire:", error);
    throw error;
  }
}

// Fonction pour lire le contenu d'un fichier
async function getFileContent(file) {
  const { owner, repo } = getRepoInfo();

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: file.filename,
      ref: process.env.GITHUB_SHA,
    });

    return Buffer.from(data.content, "base64").toString();
  } catch (error) {
    console.error("Erreur lors de la lecture du fichier:", error);
    return null;
  }
}

// Fonction principale
async function main() {
  try {
    const changedFiles = await getChangedFiles();

    let allSuggestions = "# 🤖 Analyse IA du Code - Revue de Commit\n\n";

    const validExtensions = [
      "js",
      "jsx",
      "ts",
      "tsx",
      "css",
      "html",
      "php",
      "py",
      "java",
    ];

    for (const file of changedFiles) {
      const extension = file.filename.split(".").pop().toLowerCase();

      if (validExtensions.includes(extension)) {
        const content = await getFileContent(file);

        if (content) {
          allSuggestions += `\n## 📝 Fichier: ${file.filename}\n`;
          const suggestions = await analyzeCode(content, file.filename);
          allSuggestions += `\n${suggestions}\n`;
        }
      }
    }

    allSuggestions +=
      "\n\n---\n*Cette analyse a été générée automatiquement par l'IA. " +
      "Prenez ces suggestions comme des recommandations à évaluer.*";

    await postComment(allSuggestions);
  } catch (error) {
    console.error("Erreur dans le processus principal:", error);
    process.exit(1);
  }
}

// Exécution du script
main().catch((error) => {
  console.error("Erreur fatale:", error);
  process.exit(1);
});
