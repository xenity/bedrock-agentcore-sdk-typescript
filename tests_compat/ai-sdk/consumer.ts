/**
 * Type-level consumer of the packed bedrock-agentcore tarball.
 *
 * scripts/check-ai-sdk-compat.mjs installs the tarball produced by `npm pack`
 * into a throwaway project for each supported AI SDK major, copies this file
 * there, and compiles it with `tsc`. It is never run; it only has to compile.
 *
 * It passes the Vercel AI integrations' tools to the AI SDK entry points that
 * consumers use, so the published declarations are checked against each major.
 */
import { generateText, streamText, ToolLoopAgent, type LanguageModel } from 'ai'
import { BrowserTools } from 'bedrock-agentcore/browser/vercel-ai'
import { CodeInterpreterTools } from 'bedrock-agentcore/code-interpreter/vercel-ai'

declare const model: LanguageModel

const codeInterpreter = new CodeInterpreterTools({ region: 'us-west-2' })
const browser = new BrowserTools({ region: 'us-west-2' })

export async function useCodeInterpreterTools(): Promise<void> {
  await generateText({ model, tools: codeInterpreter.tools, prompt: 'Run some code' })
  streamText({ model, tools: codeInterpreter.tools, prompt: 'Run some code' })
  const agent = new ToolLoopAgent({ model, tools: codeInterpreter.tools })
  await agent.generate({ prompt: 'Run some code' })
}

export async function useBrowserTools(): Promise<void> {
  await generateText({ model, tools: browser.tools, prompt: 'Open a page' })
  streamText({ model, tools: browser.tools, prompt: 'Open a page' })
  const agent = new ToolLoopAgent({ model, tools: browser.tools })
  await agent.generate({ prompt: 'Open a page' })
}

export async function useBothTogether(): Promise<void> {
  const agent = new ToolLoopAgent({ model, tools: { ...codeInterpreter.tools, ...browser.tools } })
  await agent.generate({ prompt: 'Open a page and analyse it' })
}
