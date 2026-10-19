import * as vscode from "vscode";
import { redactSecrets } from "@devly/core";

export class Logger {
  private channel: vscode.OutputChannel;

  constructor(name = "Devly") {
    this.channel = vscode.window.createOutputChannel(name);
  }

  info(message: string): void {
    this.channel.appendLine(`[DEVLY] ${redactSecrets(message)}`);
  }

  warn(message: string): void {
    this.channel.appendLine(`[DEVLY:WARN] ${redactSecrets(message)}`);
  }

  error(message: string): void {
    this.channel.appendLine(`[DEVLY:ERROR] ${redactSecrets(message)}`);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
