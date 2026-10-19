import { describe, expect, it } from "vitest";
import { parseGithubTrendingHtml } from "@devly/core";

const html = `
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/login?return_to=%2Fowner%2Falpha">Star</a>
    <a href="/owner/alpha">owner / alpha</a>
  </h2>
  <p class="col-9 color-fg-muted my-1">A tool that shipped today.</p>
  <span itemprop="programmingLanguage">TypeScript</span>
  <a href="/owner/alpha/stargazers">1,383</a>
  <a href="/owner/alpha/forks">42</a>
</article>
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/other/beta">other / beta</a>
  </h2>
  <p class="col-9 color-fg-muted my-1">Second on the daily list.</p>
  <span itemprop="programmingLanguage">Python</span>
  <a href="/other/beta/stargazers">88</a>
</article>
`;

describe("daily GitHub trending", () => {
  it("keeps the page order instead of ranking by all-time stars", () => {
    const repos = parseGithubTrendingHtml(html);
    expect(repos.map((repo) => repo.fullName)).toEqual(["owner/alpha", "other/beta"]);
    expect(repos[0]).toMatchObject({
      language: "TypeScript",
      stars: 1383,
      forks: 42,
      source: "github-trending",
    });
    expect(repos[0]!.description).toContain("shipped today");
    expect(repos[0]!.popularity).toBeGreaterThan(repos[1]!.popularity);
  });
});
