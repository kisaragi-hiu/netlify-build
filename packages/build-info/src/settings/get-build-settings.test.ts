import { join, posix } from 'path'

import { beforeEach, expect, test, describe, TestContext } from 'vitest'

import { createFixture, createWebFixture } from '../../tests/helpers.js'
import { mockFileSystem } from '../../tests/mock-file-system.js'
import { GithubProvider, WebFS } from '../browser/file-system.js'
import { Bazel } from '../build-systems/bazel.js'
import { NodeFS } from '../node/file-system.js'
import { NoopLogger } from '../node/get-build-info.js'
import { Project } from '../project.js'

beforeEach((ctx) => {
  ctx.fs = new NodeFS()
  ctx.fs.logger = new NoopLogger()
})

test('get the settings for a next project', async (ctx) => {
  const fixture = await createFixture('next-project', ctx)
  const project = new Project(ctx.fs, fixture.cwd)
  const settings = await project.getBuildSettings()

  expect(settings).toEqual([
    expect.objectContaining({
      buildCommand: 'next build',
      devCommand: 'next',
      dist: '.next',
      env: {},
      frameworkPort: 3000,
      plugins: [],
      pollingStrategies: ['TCP'],
    }),
  ])
})

test('get the settings for a next project if a build system has no commands and overrides', async (ctx) => {
  const fixture = await createFixture('next-project', ctx)
  const project = new Project(ctx.fs, fixture.cwd)
  project.buildSystems = [new Bazel(project)]
  const settings = await project.getBuildSettings()

  expect(settings).toEqual([
    expect.objectContaining({
      buildCommand: 'next build',
      devCommand: 'next',
      dist: '.next',
      env: {},
      frameworkPort: 3000,
      plugins: [],
      pollingStrategies: ['TCP'],
    }),
  ])
})

test('retrieve Nx specific dist and commands for a framework', async (ctx) => {
  const fixture = await createFixture('nx-integrated', ctx)
  const project = new Project(ctx.fs, fixture.cwd)
  const settings = await project.getBuildSettings()

  expect(settings).toEqual([
    expect.objectContaining({
      baseDirectory: '', // nx needs to be run from the root
      buildCommand: 'nx run website:build',
      devCommand: 'nx run website:serve',
      dist: join('dist/packages/website/.next'),
      frameworkPort: 3000,
    }),
    expect.objectContaining({
      baseDirectory: '', // nx needs to be run from the root
      buildCommand: 'nx run astro:build',
      devCommand: 'nx run astro:dev',
      dist: join('dist/packages/astro/public'),
      frameworkPort: 3000,
    }),
  ])
})

test('get dev command from npm scripts if defined', async ({ fs }) => {
  const cwd = mockFileSystem({
    'package.json': JSON.stringify({
      scripts: { 'site:build': 'rollup -c', 'site:start': 'sirv public', 'site:dev': 'rollup -c -w' },
      devDependencies: { svelte: '^3.0.0' },
    }),
  })
  fs.cwd = cwd
  const project = new Project(fs, cwd)
  const settings = await project.getBuildSettings()
  expect(settings).toEqual([
    expect.objectContaining({
      devCommand: 'npm run site:dev',
    }),
  ])
})

test('get dev command from npm scripts if defined inside a workspace setup', async ({ fs }) => {
  const cwd = mockFileSystem({
    'package.json': JSON.stringify({
      workspaces: ['apps/*'],
    }),
    'apps/next/package.json': JSON.stringify({
      name: 'next-app',
      devDependencies: { next: '*' },
    }),
    'apps/svelte/package.json': JSON.stringify({
      name: 'svelte-app',
      scripts: { 'site:build': 'rollup -c', 'site:start': 'sirv public', 'site:dev': 'rollup -c -w' },
      devDependencies: { svelte: '^3.0.0' },
    }),
  })
  fs.cwd = cwd
  const project = new Project(fs, cwd)
  const settings = await project.getBuildSettings()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const sorted = settings.sort((a, b) => a.packagePath!.localeCompare(b.packagePath!))
  expect(sorted).toEqual([
    expect.objectContaining({
      baseDirectory: join('apps/next'), // not executed via npm run so we need to have a base directory
      buildCommand: 'next build',
      devCommand: 'next',
      dist: join('apps/next/.next'),
    }),
    expect.objectContaining({
      baseDirectory: '', // executed via npm run so no base directory needed we can run from the root
      buildCommand: 'npm run site:build --workspace svelte-app',
      devCommand: 'npm run site:start --workspace svelte-app',
      dist: join('apps/svelte/static'),
    }),
  ])
})

describe.each([
  {
    describeName: 'WebFS',
    setup: async (ctx: TestContext, fixtureName: string) => {
      const fs = new WebFS(new GithubProvider('netlify/test', 'main'))
      fs.logger = new NoopLogger()
      const fixture = await createWebFixture(fixtureName)
      ctx.fs = fs
      ctx.fs.cwd = fixture.cwd
      ctx.cwd = fixture.cwd
    },
    platformJoin: posix.join,
  },
  {
    describeName: 'NodeFS',
    setup: async (ctx: TestContext, fixtureName: string) => {
      const fs = new NodeFS()
      fs.logger = new NoopLogger()
      const fixture = await createFixture(fixtureName, ctx)
      ctx.fs = fs
      ctx.fs.cwd = fixture.cwd
      ctx.cwd = fixture.cwd
    },
    platformJoin: join,
  },
])('$describeName', ({ setup, platformJoin }) => {
  describe('npm-workspace', () => {
    beforeEach(async (ctx) => {
      await setup(ctx, 'npm-workspace')
    })

    test(`should get the settings from the root of the project`, async ({ fs, cwd }) => {
      const project = new Project(fs, cwd)
      const settings = await project.getBuildSettings()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const sorted = settings.sort((a, b) => a.packagePath!.localeCompare(b.packagePath!))
      expect(sorted).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('packages/blog'),
          buildCommand: 'npm run build --workspace @evilcorp/blog',
          devCommand: 'npm run dev --workspace @evilcorp/blog',
          dist: platformJoin('packages/blog/public'),
        }),
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('packages/website'),
          buildCommand: 'npm run build --workspace @evilcorp/website',
          devCommand: 'npm run dev --workspace @evilcorp/website',
          dist: platformJoin('packages/website/.next'),
        }),
      ])
    })

    test(`should get the settings from a package sub path`, async ({ fs, cwd }) => {
      const project = new Project(fs, fs.join(cwd, 'packages/blog'), cwd)
      const settings = await project.getBuildSettings()

      expect(settings).toHaveLength(1)
      expect(settings).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          buildCommand: 'npm run build --workspace @evilcorp/blog',
          devCommand: 'npm run dev --workspace @evilcorp/blog',
          dist: platformJoin('packages/blog/public'),
          packagePath: platformJoin('packages/blog'),
        }),
      ])
    })
  })

  describe('pnpm-workspace', () => {
    beforeEach(async (ctx) => {
      await setup(ctx, 'pnpm-workspace')
    })

    test(`should get the settings from the root of the project`, async ({ fs, cwd }) => {
      const project = new Project(fs, cwd)
      const settings = await project.getBuildSettings()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const sorted = settings.sort((a, b) => a.packagePath!.localeCompare(b.packagePath!))

      expect(sorted).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('packages/blog'),
          buildCommand: 'pnpm run build --filter @evilcorp/blog',
          devCommand: 'pnpm run dev --filter @evilcorp/blog',
          dist: platformJoin('packages/blog/public'),
        }),
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('packages/website'),
          buildCommand: 'pnpm run build --filter @evilcorp/website',
          devCommand: 'pnpm run dev --filter @evilcorp/website',
          dist: platformJoin('packages/website/.next'),
        }),
      ])
    })

    test(`should get the settings from a package sub path`, async ({ fs, cwd }) => {
      const project = new Project(fs, fs.join(cwd, 'packages/blog'), cwd)
      const settings = await project.getBuildSettings()

      expect(settings).toHaveLength(1)
      expect(settings).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          buildCommand: 'pnpm run build --filter @evilcorp/blog',
          devCommand: 'pnpm run dev --filter @evilcorp/blog',
          dist: platformJoin('packages/blog/public'),
          packagePath: platformJoin('packages/blog'),
        }),
      ])
    })
  })

  describe('yarn-berry-workspace', () => {
    beforeEach(async (ctx) => {
      await setup(ctx, 'yarn-berry-workspace')
    })

    test(`should get the settings from the root of the project`, async ({ fs, cwd }) => {
      const project = new Project(fs, cwd)
      const settings = await project.getBuildSettings()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const sorted = settings.sort((a, b) => a.packagePath!.localeCompare(b.packagePath!))

      expect(sorted).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('packages/blog'),
          buildCommand: 'yarn workspace @evilcorp/blog build',
          devCommand: 'yarn workspace @evilcorp/blog dev',
          dist: platformJoin('packages/blog/public'),
        }),
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('packages/website'),
          buildCommand: 'yarn workspace @evilcorp/website build',
          devCommand: 'yarn workspace @evilcorp/website dev',
          dist: platformJoin('packages/website/.next'),
        }),
      ])
    })

    test(`should get the settings from a package sub path`, async ({ fs, cwd }) => {
      const project = new Project(fs, fs.join(cwd, 'packages/website'), cwd)
      const settings = await project.getBuildSettings()

      expect(settings).toHaveLength(1)
      expect(settings).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('packages/website'),
          buildCommand: 'yarn workspace @evilcorp/website build',
          devCommand: 'yarn workspace @evilcorp/website dev',
          dist: platformJoin('packages/website/.next'),
        }),
      ])
    })
  })

  describe('turborepo', () => {
    beforeEach(async (ctx) => {
      await setup(ctx, 'turborepo')
    })

    test(`should get the settings from the root of the project`, async ({ fs, cwd }) => {
      const project = new Project(fs, cwd)
      const settings = await project.getBuildSettings()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const sorted = settings.sort((a, b) => a.packagePath!.localeCompare(b.packagePath!))

      expect(sorted).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('apps/docs'),
          buildCommand: 'turbo run build --scope docs',
          devCommand: 'turbo run dev --scope docs',
          dist: platformJoin('apps/docs/.next'),
        }),
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('apps/web'),
          buildCommand: 'turbo run build --scope web',
          devCommand: 'turbo run dev --scope web',
          dist: platformJoin('apps/web/.next'),
        }),
      ])
    })

    test(`should get the settings from a package sub path`, async ({ fs, cwd }) => {
      const project = new Project(fs, fs.join(cwd, 'apps/web'), cwd)
      const settings = await project.getBuildSettings()

      expect(settings).toHaveLength(1)
      expect(settings).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('apps/web'),
          buildCommand: 'turbo run build --scope web',
          devCommand: 'turbo run dev --scope web',
          dist: platformJoin('apps/web/.next'),
        }),
      ])
    })
  })

  describe('nx-integrated', () => {
    beforeEach(async (ctx) => {
      await setup(ctx, 'nx-integrated')
    })

    test(`should get the settings from the root of the project`, async ({ fs, cwd }) => {
      const project = new Project(fs, cwd)
      const settings = await project.getBuildSettings()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const sorted = settings.sort((a, b) => a.packagePath!.localeCompare(b.packagePath!))

      expect(sorted).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('packages/astro'),
          buildCommand: 'nx run astro:build',
          devCommand: 'nx run astro:dev',
          dist: platformJoin('dist/packages/astro/public'),
        }),
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('packages/website'),
          buildCommand: 'nx run website:build',
          devCommand: 'nx run website:serve',
          dist: platformJoin('dist/packages/website/.next'),
        }),
      ])
    })

    test(`should get the settings from a package sub path`, async ({ fs, cwd }) => {
      const project = new Project(fs, fs.join(cwd, 'packages/website'), cwd)
      const settings = await project.getBuildSettings()

      expect(settings).toHaveLength(1)
      expect(settings).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('packages/website'),
          buildCommand: 'nx run website:build',
          devCommand: 'nx run website:serve',
          dist: platformJoin('dist/packages/website/.next'),
        }),
      ])
    })
  })

  describe('nx-package-based', () => {
    beforeEach(async (ctx) => {
      await setup(ctx, 'nx-package-based')
    })

    test(`should get the settings from the root of the project`, async ({ fs, cwd }) => {
      const project = new Project(fs, cwd)
      const settings = await project.getBuildSettings()
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const sorted = settings.sort((a, b) => a.packagePath!.localeCompare(b.packagePath!))

      expect(sorted).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('apps/nuxt-app'),
          buildCommand: 'nx run nuxt-app:build',
          devCommand: 'nx run nuxt-app:dev',
          dist: platformJoin('apps/nuxt-app/dist'),
        }),
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('apps/svelte-app'),
          buildCommand: 'nx run svelte-app:build',
          devCommand: 'nx run svelte-app:dev',
          dist: platformJoin('apps/svelte-app/static'),
        }),
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('packages/ui-components'),
          buildCommand: 'nx run @my-org/ui-components:build',
          devCommand: 'nx run @my-org/ui-components:start',
          dist: platformJoin('packages/ui-components/www'),
        }),
      ])
    })

    test(`should get the settings from a package sub path`, async ({ fs, cwd }) => {
      const project = new Project(fs, fs.join(cwd, 'apps/nuxt-app'), cwd)
      const settings = await project.getBuildSettings()

      expect(settings).toHaveLength(1)
      expect(settings).toEqual([
        expect.objectContaining({
          baseDirectory: '',
          packagePath: platformJoin('apps/nuxt-app'),
          buildCommand: 'nx run nuxt-app:build',
          devCommand: 'nx run nuxt-app:dev',
          dist: platformJoin('apps/nuxt-app/dist'),
        }),
      ])
    })
  })
})
