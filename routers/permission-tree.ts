import Router from '@koa/router'
import {
  EpochSchemaModel,
  MinerEpochStatsSchemaModel,
  PermissionNodeMinerModel,
  PermissionNodeValidatorModel,
} from '../lib/db'
import { pick } from 'lodash'

const router = new Router({ prefix: '/permission-tree' })

const MINER_PARAMS_TO_RETURN = [
  'address',
  'parent',
  'epoch_onboarded',
  'version_onboarded',
  'generation',
]

router.get('/miner/:address', async (ctx) => {
  const address = ctx.params.address.toLowerCase()
  console.log({ address })
  const account = await PermissionNodeMinerModel.findOne({ address })
  if (!account) {
    ctx.status = 404
    return
  }
  const children = await PermissionNodeMinerModel.find({ parent: address })
  ctx.body = {
    ...pick(account, MINER_PARAMS_TO_RETURN),
    children: children.map((child) => pick(child, MINER_PARAMS_TO_RETURN)),
  }
})

const VALIDATOR_PARAMS_TO_RETURN = [
  'address',
  'operator_address',
  'parent',
  'epoch_onboarded',
  'version_onboarded',
  'generation',
]

router.get('/validators', async (ctx) => {
  const validators = await PermissionNodeValidatorModel.find()
  ctx.body = validators.map((validator) =>
    pick(validator, VALIDATOR_PARAMS_TO_RETURN)
  )
})

router.get('/validator/:address', async (ctx) => {
  const address = ctx.params.address.toLowerCase()
  console.log({ address })
  const account = await PermissionNodeValidatorModel.findOne({ address })
  if (!account) {
    ctx.status = 404
    return
  }
  const children = await PermissionNodeValidatorModel.find({ parent: address })
  ctx.body = {
    ...pick(account, VALIDATOR_PARAMS_TO_RETURN),
    children: children.map((child) => pick(child, VALIDATOR_PARAMS_TO_RETURN)),
  }
})

router.get('/stats', async (ctx) => {
  const allAccountCount = await PermissionNodeMinerModel.count()
  const allMinerCountRes = await MinerEpochStatsSchemaModel.distinct('address')
  const allMinerCount = allMinerCountRes.length

  let activeMinerCount = 0
  const latestEpochRes = await EpochSchemaModel.find({})
    .select(['epoch'])
    .sort({ epoch: -1 })
    .limit(1)
  console.log(latestEpochRes)
  if (latestEpochRes.length === 1) {
    const latestEpoch = latestEpochRes[0].epoch
    const activeMinersRes = await MinerEpochStatsSchemaModel.aggregate([
      {
        $match: {
          epoch: {
            $in: [latestEpoch, latestEpoch - 1],
          },
        },
      },
      { $group: { _id: '$address' } },
    ])
    activeMinerCount = activeMinersRes.length
  }

  ctx.body = {
    allAccountCount,
    allMinerCount,
    activeMinerCount,
  }
})

export default router
