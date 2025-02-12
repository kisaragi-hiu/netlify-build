import { NetlifyConfig } from '../../types/index.js'

export type Mode = 'buildbot' | 'cli' | 'require'

export type BuildCLIFlags = {
  cachedConfig: Record<string, unknown>
  /** Netlify Site ID */
  siteId: string
  /** Netlify API token for authentication */
  token: string
  /**
   * Run in dry mode, i.e. printing steps without executing them
   * @default false
   */
  dry: boolean
  debug?: unknown
  /** Build context */
  context: 'production' | string
  /** The invoking service of netlify build */
  mode: Mode
  telemetry: boolean
  /**
   * Buffer output instead of printing it
   * @default false
   */
  buffer?: boolean
  offline: boolean
  cwd?: string
  /** A list of all the feature flags passed to netlify/build */
  featureFlags: Record<string, boolean>
  /**
   * Print only essential/error output
   * @default false
   */
  quiet?: boolean
}

export type BuildResult = {
  success: boolean
  severityCode: SeverityCode
  netlifyConfig?: NetlifyConfig
  configMutations?: any
  logs?: string[]
}

export enum SeverityCode {
  success = 1,
  buildCancelled,
  userError,
  pluginError,
  systemError,
}

export type TestOptions = {
  errorMonitor?: any
}

export type ErrorParam = {
  errorMonitor: any
  mode: Mode
  logs: string[]
  debug: any
  testOpts?: TestOptions
  childEnv?: any
  netlifyConfig?: NetlifyConfig
}
