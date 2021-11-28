import Router from '@koa/router'
import { PermissionNodeMinerModel, PermissionNodeValidatorModel } from '../lib/db'
import { pick } from 'lodash'

const router = new Router({prefix: '/permission-tree'})

const MINER_PARAMS_TO_RETURN = ['parent', 'version_onboarded', 'has_tower', 'is_active']

router.get('/miner/:address', async ctx => {
  const address  = ctx.params.address.toLowerCase()
  console.log({address})
  const account = await PermissionNodeMinerModel.findOne({ address })
  if (!account) {
    ctx.status = 404
    return
  }
  const children = await PermissionNodeMinerModel.find({parent: address})
  ctx.body = {
    ...pick(account, MINER_PARAMS_TO_RETURN),
    children: children.map(child => pick(child, MINER_PARAMS_TO_RETURN))
  }
})

const VALIDATOR_PARAMS_TO_RETURN = ['parent', 'version_onboarded']

router.get('/validator/:address', async ctx => {
  const address  = ctx.params.address.toLowerCase()
  console.log({address})
  const account = await PermissionNodeValidatorModel.findOne({ address })
  if (!account) {
    ctx.status = 404
    return
  }
  const children = await PermissionNodeValidatorModel.find({parent: address})
  ctx.body = {
    ...pick(account, VALIDATOR_PARAMS_TO_RETURN),
    children: children.map(child => pick(child, VALIDATOR_PARAMS_TO_RETURN))
  }
})

router.get('/stats', async ctx => {
  const allAccountCount = await PermissionNodeMinerModel.count()
  const allMinerCount = await PermissionNodeMinerModel.count({has_tower: true})
  const activeMinerCount = await PermissionNodeMinerModel.count({is_active: true})

  ctx.body = {
    allAccountCount,
    allMinerCount,
    activeMinerCount
  }
})

export default router