import Router from '@koa/router'
import { MinerEpochStatsSchemaModel, EpochSchemaModel } from '../lib/db'

const router = new Router({ prefix: '/epochs' })

router.get('/', async (ctx) => {
  const epochs = await EpochSchemaModel.find().sort([['epoch', -1]])
  ctx.body = epochs.map((epoch) => ({
    epoch: epoch.epoch,
    height: epoch.height,
    timestamp: epoch.timestamp,
  }))
})

router.get('/proofs/sum', async (ctx) => {
  const epochSumRes = await MinerEpochStatsSchemaModel.aggregate([
    {
      $group: {
        _id: '$epoch',
        proofs: { $sum: '$count' },
        miners: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
  ])

  ctx.body = epochSumRes.map((agg) => ({
    epoch: agg._id,
    proofs: agg.proofs,
    miners: agg.miners,
  }))
})

router.get('/proofs/sum/:epoch', async (ctx) => {
  const { epoch: epochString } = ctx.params
  const epoch = parseInt(epochString)
  const epochSumRes = await MinerEpochStatsSchemaModel.aggregate([
    { $match: { epoch } },
    {
      $group: {
        _id: '$epoch',
        proofs: { $sum: '$count' },
        miners: { $sum: 1 },
      },
    },
  ])
  if (epochSumRes.length === 0) {
    ctx.status = 404
    return
  }
  ctx.body = {
    epoch,
    proofs: epochSumRes[0].proofs,
    miners: epochSumRes[0].miners,
  }
})

router.get('/proofs/histogram/:epoch', async (ctx) => {
  const { epoch: epochString } = ctx.params
  const epoch = parseInt(epochString)
  const boundaries = [ 0, 7, 15, 25, 35, 45, 55, 65, 73]
  const epochSumRes = await MinerEpochStatsSchemaModel.aggregate([
    { $match: { epoch } },
    {
      $bucket: {
          groupBy: "$count",
          boundaries,
          default: "invalid"
      }
    }
  ])
  if (epochSumRes.length === 0) {
    ctx.status = 404
    return
  }
  ctx.body = epochSumRes.map((boundary, i) => ({ min: boundaries[i], max: boundaries[i+1] - 1, count: boundary.count }))
})

router.get('/proofs/:address', async (ctx) => {
  const { address } = ctx.params
  const epochStats = await MinerEpochStatsSchemaModel.find({ address }).sort([
    ['epoch', -1],
  ])
  ctx.body = epochStats.map((epochStat) => ({
    epoch: epochStat.epoch,
    count: epochStat.count,
  }))
})

export default router
