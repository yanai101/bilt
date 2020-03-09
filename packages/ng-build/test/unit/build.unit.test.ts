import {inspect} from 'util'
import {describe, it} from 'mocha'
import {expect} from 'chai'
import {PackageInfo, PackageInfos, RelativeDirectoryPath} from '@bilt/ng-packages'

import {calculateBuildOrder, build, BuildPackageSuccessResult} from '../../src/ng-build'

inspect.defaultOptions.depth = 1000

describe('build (unit)', function() {
  const ePackage: PackageInfo = {directory: 'edir', name: 'epackage', dependencies: []}
  const fPackage: PackageInfo = {directory: 'fdir', name: 'fpackage', dependencies: []}
  const cPackage: PackageInfo = {
    directory: 'cdir',
    name: 'cpackage',
    dependencies: [ePackage],
  }
  const dPackage: PackageInfo = {
    directory: 'ddir',
    name: 'dpackage',
    dependencies: [cPackage, ePackage],
  }
  const bPackage: PackageInfo = {
    directory: 'packages/bdir',
    name: 'bpackage',
    dependencies: [dPackage],
  }
  const aPackage: PackageInfo = {
    directory: 'adir',
    name: 'apackage',
    dependencies: [bPackage, cPackage],
  }
  const packageInfos: PackageInfos = {
    [aPackage.directory as string]: aPackage,
    [bPackage.directory as string]: bPackage,
    [cPackage.directory as string]: cPackage,
    [dPackage.directory as string]: dPackage,
    [ePackage.directory as string]: ePackage,
    [fPackage.directory as string]: fPackage,
  }

  it('should build in the correct order', async () => {
    const buildOrder = calculateBuildOrder({packageInfos})

    const packagesBuilt: RelativeDirectoryPath[] = []

    async function buildPackageFunc({
      packageInfo,
    }: {
      packageInfo: PackageInfo
    }): Promise<BuildPackageSuccessResult> {
      expect(packageInfo).to.eql(packageInfos[packageInfo.directory as string])

      packagesBuilt.push(packageInfo.directory)

      return 'success'
    }

    for await (const buildResult of build({packageInfos, buildOrder, buildPackageFunc})) {
      expect(buildResult).to.eql({
        package: {directory: packagesBuilt[packagesBuilt.length - 1]},
        buildResult: 'success',
      })
    }

    expect(packagesBuilt).to.eql(['edir', 'cdir', 'ddir', 'packages/bdir', 'adir', 'fdir'])
  })

  it('should fail to build correctly', async () => {
    const buildOrder = calculateBuildOrder({packageInfos})

    const packagesBuilt: RelativeDirectoryPath[] = []

    async function buildPackageFunc({
      packageInfo,
    }: {
      packageInfo: PackageInfo
    }): Promise<BuildPackageSuccessResult> {
      packagesBuilt.push(packageInfo.directory)

      return packageInfo.name === 'cpackage' ? 'failure' : 'success'
    }

    let countFailures = 0
    let countSuccesses = 0
    let countNotBuilt = 0
    for await (const buildResult of build({packageInfos, buildOrder, buildPackageFunc})) {
      const shouldBeSuccesful = ['edir', 'fdir'].includes(buildResult.package.directory as string)
      const shouldFail = ['cdir'].includes(buildResult.package.directory as string)

      if (buildResult.buildResult === 'success') {
        countSuccesses++
      } else if (buildResult.buildResult === 'failure') {
        countFailures++
      } else {
        countNotBuilt++
      }
      expect(buildResult.buildResult).to.eql(
        shouldBeSuccesful ? 'success' : shouldFail ? 'failure' : 'not-built',
      )
    }

    expect(packagesBuilt).to.eql(['edir', 'cdir', 'fdir'])
    expect(countSuccesses).to.eql(2)
    expect(countFailures).to.eql(1)
    expect(countNotBuilt).to.eql(3)
  })
})