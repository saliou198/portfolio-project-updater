

import { Command } from "commander";
import matter from "gray-matter";
import { writeFile } from "node:fs/promises";

const program = new Command();

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  fork: boolean;
}

interface PortfolioProject {
  title: string;
  description: string;
  technologies: string[];
  repository: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "portfolio-projects",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} (${url})`
    );
  }

  return response.json() as Promise<T>;
}

async function getRepositories(
  username: string
): Promise<GitHubRepo[]> {
  const repositories: GitHubRepo[] = [];

  for (let page = 1; ; page++) {
    const repos = await fetchJson<GitHubRepo[]>(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&type=owner`
    );

    repositories.push(...repos);

    if (repos.length < 100) {
      break;
    }
  }

  return repositories;
}

async function getPortfolioFile(
  repo: GitHubRepo
): Promise<string | null> {
  const url =
    `https://api.github.com/repos/${repo.full_name}/contents/portfolio.md`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "portfolio-projects",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Cannot read ${repo.full_name}: ${response.status}`
    );
  }

  return response.text();
}

async function sync(username: string) {
  const repositories = await getRepositories(username);
  const projects: PortfolioProject[] = [];

  for (const repo of repositories) {
    if (repo.fork) continue;

    const markdown = await getPortfolioFile(repo);

    if (!markdown) continue;

    const { data, content } = matter(markdown.trimStart());

    if (typeof data.title !== "string") {
      console.warn(`Skipping ${repo.name}: missing title`);
      continue;
    }

    projects.push({
      title: data.title,
      description:
        typeof data.description === "string"
          ? data.description
          : content.trim(),
      technologies: Array.isArray(data.technologies)
        ? data.technologies.filter(
            (item: unknown): item is string =>
              typeof item === "string"
          )
        : [],
      repository: repo.html_url,
    });

    console.log(`Found: ${repo.name}`);
  }

  await writeFile(
    "projects.json",
    JSON.stringify(projects, null, 2) + "\n",
    "utf8"
  );

  console.log(`Synced ${projects.length} projects.`);
}

program
  .name("portfolio-projects")
  .description("Generate a portfolio from GitHub repositories");

program
  .command("sync")
  .argument("<username>", "GitHub username")
  .action(async (username: string) => {
    try {
      await sync(username);
    } catch (error) {
      console.error("Sync failed:", error);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
