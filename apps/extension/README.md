# Devly

Devly lives in the sidebar of VS Code and Cursor. You pick something you want to understand. Devly runs a real project on your computer, then opens a short lesson next to the files.

Shade is the guide in that sidebar.

## Start here

1. Click the Devly icon on the activity bar. Shade is waiting on **Today**.

![Devly sidebar. Shade says hello above Today's Picks.](https://raw.githubusercontent.com/devly-hq/devly/main/apps/extension/images/sidebar-today.png)

2. A card is either a GitHub repository or a topic. **Try Live** clones that repository and runs it. **Let's Build** asks Shade to write a small lesson for the topic.

![Today's cards. One button says Try Live and another says Let's Build.](https://raw.githubusercontent.com/devly-hq/devly/main/apps/extension/images/sidebar-choices.png)

3. Confirm once. Devly does the clone or the writing, then the install, the tests, and the start. You do not need a terminal.
4. When it finishes, the lesson opens beside the editor. A notification at the bottom right shows the local page address and **Open the app**.

The project is saved in its own folder under `DevlyLabs` and opens in a new window.

## What a finished lesson looks like

This is a lesson about caching API responses. The page stays empty until you click. Each button calls the app, which talks to Redis on your machine and prints the result.

![A Devly lesson page. The heading is What is this project. Three buttons call Redis and the result is shown below.](https://raw.githubusercontent.com/devly-hq/devly/main/apps/extension/images/finished-lesson.png)

- **Set and get** stores a value in Redis and reads it back.
- **Set with TTL** stores a value that Redis deletes after 20 seconds.
- **Cache-aside fetch** calls a slow stand-in API once, saves the response, and the next click reads the saved copy.

## Two ways to learn

**Try this repo.** Devly clones that exact GitHub repository and runs it. If the repository needs Docker, Devly starts Docker. You confirm before anything is downloaded.

**Let's build.** You pick a topic. Shade writes a small project, installs its dependencies in that folder, runs the tests, and starts a page on this computer. The lesson names the files that matter and what to click.

**Explore** is there when you want to search GitHub or Hugging Face yourself. A model can be set up locally after you confirm the download size. News cards stay links.

**Today** changes with the calendar day. Refresh shows another set of cards. Devly can also nudge you twice a day, once in the morning and once in the afternoon. Clicking a nudge opens Devly and starts that project.

## Before you start

- VS Code or Cursor 1.96 or newer
- Git, to run a GitHub repository
- Docker, only when that repository includes a Dockerfile or Compose file
- Cursor, Claude Code, or Codex, only when you want Shade to write a lesson. Running a repository does not need one.

Your preferences and projects stay on this computer. Devly does not send telemetry.

## License

MIT
