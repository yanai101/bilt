'use strict'

const path = require('path')
const {describe, it} = require('mocha')
const {expect} = require('chai')
const {exec} = require('child_process')
const {promisify: p} = require('util')
const {fileContents} = require('../utils/file-utils')
const {setupBuildDir} = require('../utils/setup')

const cli = path.resolve(__dirname, '../../scripts/run-bilt-cli.js')
const testRepoSrc = path.resolve(__dirname, 'test-repo-no-publish')

describe('local directory use-case (e2e)', () => {
  it('should build the directory with all its packages and then say there is nothing to rebuild', async () => {
    const buildDir = await setupBuildDir(testRepoSrc)

    console.log(await p(exec)(`${process.argv0} ${cli} ${buildDir} --no-ci`))

    expect(await fileContents(buildDir, 'a/postinstalled.txt')).to.equal('')
    expect(await fileContents(buildDir, 'b/postinstalled.txt')).to.equal('')
    expect(await fileContents(buildDir, 'b/built.txt')).to.equal('')
    expect(await fileContents(buildDir, 'b/tested.txt')).to.equal('')

    const {stdout} = await p(exec)(`${process.argv0} ${cli} ${buildDir} --no-ci`)
    expect(stdout).to.contain('Nothing to build')
  })
})