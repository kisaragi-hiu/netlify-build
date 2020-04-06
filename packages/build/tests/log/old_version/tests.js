const test = require('ava')
const isCI = require('is-ci')

const { runFixture } = require('../../helpers/main')

test('Print a warning when using an old version through Netlify CLI', async t => {
  // In GitHub actions, `update-notifier` is never enabled
  if (isCI) {
    return t.pass()
  }

  // We need to unset some environment variables which would otherwise disable `update-notifier`
  await runFixture(t, 'error', { env: { NETLIFY_BUILD_TEST_CLI: '1', NODE_ENV: '' } })
})
