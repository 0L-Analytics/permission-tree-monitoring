
import Router from '@koa/router'
import { MinerEpochStatsSchemaModel, EpochSchemaModel } from '../lib/db'

const router = new Router({ prefix: '/epochs' })

router.get('/', async ctx => {
  const epochs = await EpochSchemaModel.find().sort([['epoch', -1]])
  ctx.body = epochs.map(epoch => ({ epoch: epoch.epoch, height: epoch.height, timestamp: epoch.timestamp }))
})

router.get('/proofs/:address', async (ctx) => {
  const { address } = ctx.params
  const epochStats = await MinerEpochStatsSchemaModel.find({ address }).sort([['epoch', -1]])
  ctx.body = epochStats.map(epochStat => ({ epoch: epochStat.epoch, count: epochStat.count }))
})

export default router