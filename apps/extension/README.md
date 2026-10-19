# Devly

A home for curious developers. Learn something new, run a real project, and understand the files — with Shade.

## What you can do

- **Today.** Four picks that change each calendar day: trending GitHub repositories, a discovery topic, and a seed lesson.
- **Try Live.** Clone that exact GitHub repository and run it on your computer. Docker starts when the project needs it. Shade then opens a lesson: what the project does, how it was started, and the important files.
- **Explore.** Search GitHub and Hugging Face live. A model can be set up locally with one confirmation. News cards stay links.
- **Let's Build.** Shade builds a small lab for a topic, runs it, and writes the lesson.
- **Daily nudge.** Up to two reminders a day, in the morning and the afternoon.

## How lists stay current

- GitHub Trending is read from the public daily page. A new calendar day always fetches again. Within the same day, Refresh pulls a new copy after 15 minutes.
- Discovery (news and topics) refreshes on a new day, and within the day after 30 minutes.
- Search calls GitHub and Hugging Face when you type. It does not reuse yesterday's results.

## Privacy

Preferences, labs, and caches stay on your machine. Devly does not send telemetry. Optional API keys stay in VS Code secret storage or a local `.env` that is not packaged.

Try Live runs third-party code only after you confirm. Docker may ask for your system password once, through the normal Docker installer.

## Requirements

- VS Code or Cursor 1.96 or newer
- Git, for Try Live
- Docker, only for projects that ship a Compose file or Dockerfile
- Python 3, only for local Hugging Face model pages
- An optional coding agent (Claude Code, Codex, or Cursor) for Let's Build and for repairing a failed run

## License

MIT
