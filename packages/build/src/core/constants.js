import { relative, normalize } from 'path'

import { getCacheDir } from '@netlify/cache-utils'
import mapObj from 'map-obj'
import { pathExists } from 'path-exists'

import { ROOT_PACKAGE_JSON } from '../utils/json.js'

// Retrieve constants passed to plugins
export const getConstants = async function ({
  configPath,
  buildDir,
  functionsDistDir,
  edgeFunctionsDistDir,
  cacheDir,
  netlifyConfig,
  siteInfo: { id: siteId },
  apiHost,
  token,
  mode,
}) {
  const isLocal = mode !== 'buildbot'
  const normalizedCacheDir = getCacheDir({ cacheDir, cwd: buildDir })
  const constants = {
    // Path to the Netlify configuration file
    CONFIG_PATH: configPath,
    // The directory where built serverless functions are placed before deployment
    FUNCTIONS_DIST: functionsDistDir,
    // The directory where built Edge Functions are placed before deployment
    EDGE_FUNCTIONS_DIST: edgeFunctionsDistDir,
    // Path to the Netlify build cache folder
    CACHE_DIR: normalizedCacheDir,
    // Boolean indicating whether the build was run locally (Netlify CLI) or in the production CI
    IS_LOCAL: isLocal,
    // The version of Netlify Build
    NETLIFY_BUILD_VERSION: ROOT_PACKAGE_JSON.version,
    // The Netlify Site ID
    SITE_ID: siteId,
    // The Netlify API access token
    NETLIFY_API_TOKEN: token,
    // The Netlify API host
    NETLIFY_API_HOST: apiHost,
    // The directory where internal functions (i.e. generated programmatically
    // via plugins or others) live
    INTERNAL_FUNCTIONS_SRC: `${buildDir}/${INTERNAL_FUNCTIONS_SRC}`,
    // The directory where internal Edge Functions (i.e. generated programmatically
    // via plugins or others) live
    INTERNAL_EDGE_FUNCTIONS_SRC: `${buildDir}/${INTERNAL_EDGE_FUNCTIONS_SRC}`,
  }
  const constantsA = await addMutableConstants({ constants, buildDir, netlifyConfig })
  return constantsA
}

const INTERNAL_EDGE_FUNCTIONS_SRC = '.netlify/edge-functions'
const INTERNAL_FUNCTIONS_SRC = '.netlify/functions-internal'

// Retrieve constants which might change during the build if a plugin modifies
// `netlifyConfig` or creates some default directories.
// Unlike readonly constants, this is called again before each build step.
export const addMutableConstants = async function ({
  constants,
  buildDir,
  netlifyConfig: {
    build: { publish, edge_functions: edgeFunctions },
    functionsDirectory,
  },
}) {
  const constantsA = {
    ...constants,
    // Directory that contains the deploy-ready HTML files and assets generated by the build
    PUBLISH_DIR: publish,
    // The directory where function source code lives
    FUNCTIONS_SRC: functionsDirectory,
    // The directory where Edge Functions source code lives
    EDGE_FUNCTIONS_SRC: edgeFunctions,
  }
  const constantsB = await addDefaultConstants(constantsA, buildDir)
  const constantsC = normalizeConstantsPaths(constantsB, buildDir)
  return constantsC
}

// Some `constants` have a default value when a specific file exists.
// Those default values are assigned by `@netlify/config`. However, the build
// command or plugins might create those specific files, in which case, the
// related `constant` should be updated, unless the user has explicitly
// configured it.
const addDefaultConstants = async function (constants, buildDir) {
  const newConstants = await Promise.all(
    DEFAULT_PATHS.map(({ constantName, defaultPath }) =>
      addDefaultConstant({ constants, constantName, defaultPath, buildDir }),
    ),
  )
  return Object.assign({}, constants, ...newConstants)
}

// The current directory is the build directory, which is correct, so we don't
// need to resolve paths
const DEFAULT_PATHS = [
  // @todo Remove once we drop support for the legacy default functions directory.
  { constantName: 'FUNCTIONS_SRC', defaultPath: 'netlify-automatic-functions' },
  { constantName: 'FUNCTIONS_SRC', defaultPath: 'netlify/functions' },
  { constantName: 'EDGE_FUNCTIONS_SRC', defaultPath: 'netlify/edge-functions' },
]

const addDefaultConstant = async function ({ constants, constantName, defaultPath, buildDir }) {
  // Configuration paths are relative to the build directory.
  if (!isEmptyValue(constants[constantName]) || !(await pathExists(`${buildDir}/${defaultPath}`))) {
    return {}
  }

  // However, the plugin child process' current directory is the build directory,
  // so we can pass the relative path instead of the resolved absolute path.
  return { [constantName]: defaultPath }
}

const normalizeConstantsPaths = function (constants, buildDir) {
  return mapObj(constants, (key, path) => [key, normalizePath(path, buildDir, key)])
}

// The current directory is `buildDir`. Most constants are inside this `buildDir`.
// Instead of passing absolute paths, we pass paths relative to `buildDir`, so
// that logs are less verbose.
const normalizePath = function (path, buildDir, key) {
  if (isEmptyValue(path) || !CONSTANT_PATHS.has(key)) {
    return path
  }

  const pathA = normalize(path)

  if (pathA === buildDir) {
    return '.'
  }

  if (pathA.startsWith(buildDir)) {
    return relative(buildDir, pathA)
  }

  return pathA
}

const isEmptyValue = function (path) {
  return path === undefined || path === ''
}

const CONSTANT_PATHS = new Set([
  'CONFIG_PATH',
  'PUBLISH_DIR',
  'FUNCTIONS_SRC',
  'FUNCTIONS_DIST',
  'INTERNAL_EDGE_FUNCTIONS_SRC',
  'INTERNAL_FUNCTIONS_SRC',
  'EDGE_FUNCTIONS_DIST',
  'EDGE_FUNCTIONS_SRC',
  'CACHE_DIR',
])
