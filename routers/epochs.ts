
import Router from '@koa/router'
import { MinerEpochStatsSchemaModel, EpochSchemaModel } from '../lib/db'

const router = new Router({ prefix: '/epochs' })

router.get('/', async ctx => {
  const epochs = await EpochSchemaModel.find().sort([['epoch', -1]])
  ctx.body = epochs.map(epoch => ({ epoch: epoch.epoch, height: epoch.height, timestamp: epoch.timestamp }))
})

router.get('/proofs/sum', async (ctx) => {
  const epochSumRes = await MinerEpochStatsSchemaModel.aggregate([{$group: {_id: '$epoch', count: { $sum: "$count"  }}}, {$sort: { _id: -1 }}])

  ctx.body = epochSumRes.map(agg => ({
    epoch: agg._id,
    count: agg.count
  }))
})

router.get('/proofs/sum/:epoch', async (ctx) => {
  const { epoch: epochString } = ctx.params
  const epoch = parseInt(epochString)
  const epochSumRes = await MinerEpochStatsSchemaModel.aggregate([{ $match: { epoch }}, {$group: {_id: '$epoch', count: { $sum: "$count"  }}}])
  if (epochSumRes.length === 0) {
    ctx.status = 404
    return
  }
  ctx.body = {
    epoch,
    count: epochSumRes[0].count
  }
})

router.get('/proofs/:address', async (ctx) => {
  const { address } = ctx.params
  const epochStats = await MinerEpochStatsSchemaModel.find({ address }).sort([['epoch', -1]])
  ctx.body = epochStats.map(epochStat => ({ epoch: epochStat.epoch, count: epochStat.count }))
})

export default router