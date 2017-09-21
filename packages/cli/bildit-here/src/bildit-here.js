'use strict'

const path = require('path')
const fs = require('fs')
const {promisify: p} = require('util')
const debug = require('debug')('bildit:bildit-here')
const pluginImport = require('plugin-import')
const cosmiConfig = require('cosmiconfig')

const {
  readLastBuildInfo,
  findChangesInCurrentRepo,
  calculateFilesChangedSinceLastBuild,
  saveLastBuildInfo,
} = require('./last-build-info')

module.exports = async function(repository, configFile) {
  const isRemoteRepo =
    repository.startsWith('http:') || repository.startsWith('ssh:') || repository.startsWith('git@')

  const directoryToBuild = isRemoteRepo ? undefined : path.resolve(repository)
  const finalRepository = isRemoteRepo ? repository : directoryToBuild

  const pimport = createPimport(isRemoteRepo, directoryToBuild, configFile)
  try {
    await configureEventsToOutputEventToStdout(pimport)

    const jobDispatcher = await pimport('jobDispatcher')

    const {filesChangedSinceLastBuild} = !isRemoteRepo
      ? await figureOutFilesChangedSinceLastBuild(directoryToBuild)
      : {}

    const jobsToWaitFor = await runJobs(
      finalRepository,
      isRemoteRepo,
      jobDispatcher,
      filesChangedSinceLastBuild,
    )

    await waitForJobs(pimport, jobsToWaitFor)

    if (!isRemoteRepo) {
      await saveLastBuildInfo(directoryToBuild, await findChangesInCurrentRepo(directoryToBuild))
    }
  } finally {
    debug('finalizing plugins')
    await pimport.finalize()
  }
}

async function createPimport(isRemoteRepo, directoryToBuild, configFile) {
  const buildConfig = (await cosmiConfig('bildit', {
    configPath: isRemoteRepo ? configFile : undefined,
  })).load(isRemoteRepo ? undefined : directoryToBuild)

  const defaultBilditConfig = await JSON.parse(
    await p(fs.readFile)(path.join(__dirname, 'default-bilditrc.json')),
  )

  return pluginImport([defaultBilditConfig.plugins, buildConfig.plugins], {
    baseDirectory: isRemoteRepo ? path.dirname(path.resolve(configFile)) : directoryToBuild,
    appConfigs: [defaultBilditConfig.config, buildConfig.config],
  })
}

async function configureEventsToOutputEventToStdout(pimport) {
  const events = await pimport('events')

  await events.subscribe('START_JOB', ({job}) => {
    if (job.kind === 'repository') return

    console.log('####### Building', job.artifactPath || job.directory)
  })
}

async function figureOutFilesChangedSinceLastBuild(directory) {
  const lastBuildInfo = await readLastBuildInfo(directory)

  const fileChangesInCurrentRepo = await findChangesInCurrentRepo(directory)

  const filesChangedSinceLastBuild = lastBuildInfo
    ? await calculateFilesChangedSinceLastBuild(directory, lastBuildInfo, fileChangesInCurrentRepo)
    : undefined

  return {filesChangedSinceLastBuild, fileChangesInCurrentRepo}
}

async function runJobs(repository, isRemoteRepo, jobDispatcher, filesChangedSinceLastBuild) {
  if (isRemoteRepo || !await jobDispatcher.hasAbortedJobs()) {
    if (filesChangedSinceLastBuild && filesChangedSinceLastBuild.length === 0) {
      console.error('Nothing to build')
      return
    }

    debug('building folder %s, with file changes %o', repository, filesChangedSinceLastBuild)
    return [
      await jobDispatcher.dispatchJob({
        kind: 'repository',
        repository,
        linkDependencies: true,
        filesChangedSinceLastBuild,
      }),
    ]
  } else {
    debug('continuing previous build')
    return await jobDispatcher.rerunAbortedJobs()
  }
}

async function waitForJobs(pimport, jobs) {
  debug('waiting for jobs %o', (jobs || []).map(job => job.id))
  const events = await pimport('events')
  const jobsThatAreStillWorking = new Set((jobs || []).map(job => job.id))

  await new Promise(async resolve => {
    await events.subscribe('END_JOB', ({job}) => {
      debug('job %s ended', job.id)
      jobsThatAreStillWorking.delete(job.id)

      if (jobsThatAreStillWorking.size === 0) {
        resolve()
      }
    })
  })
}
